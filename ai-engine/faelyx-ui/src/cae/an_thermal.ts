// Thermal (steady / transient, convection, radiation), thermal stress, DC conduction with Joule heating,
// electrostatics and magnetostatics, all on the voxel grid with the scalar multigrid solver.

import { addMeshAndSolver, bodyTable, dispScaleFor, numP, strP, boolP } from './an_static';
import { baseResult, fmt, structPost, maxima, reactions, type Env } from './base';
import { ElasticModel, nodalAverage } from './fem';
import { buildStructLoads, faceNodesOf, requireSupports, type AppliedInfo } from './loads';
import { kGlobal, type Axis, type Material } from './materials';
import { MGOperator } from './mg';
import { makeField, type CaseInput, type CaeBody, type FieldDef, type Frame, type Result } from './model';
import { prepare, type Prep } from './prepare';
import { ScalarModel, faceNodeAreas, type ScalarMaterial } from './scalar';
import { nNodes, nodeXYZ, type SurfFace } from './voxel';
import { amax } from './util';

const SIGMA_SB = 5.670374419e-14;      // W/(mm²·K⁴)
const MU0 = 4e-7 * Math.PI;            // T·m/A
const EPS0 = 8.8541878128e-15;         // F/mm

export interface ThermalBC {
  fixed: Uint8Array; value: Float64Array; diag: Float64Array; rhs: Float64Array; srcElem: Float64Array;
  conv: { faces: SurfFace[]; h: number; Tinf: number; name: string }[];
  rad: { faces: SurfFace[]; eps: number; Ts: number; name: string }[];
  Pin: number; info: AppliedInfo[]; warnings: string[]; sink: boolean;
  bodyPower: { body: CaeBody; mi: number; W: number }[];
}

export const thermalMats = (P: Prep): ScalarMaterial[] => P.mats.map((m, i) => { const k = kGlobal(m, P.fibre[i] as Axis); return { kx: k[0] / 1000, ky: k[1] / 1000, kz: k[2] / 1000, rhoC: m.rho * m.cp * 1e-9 }; });

export function buildThermalBC(P: Prep, _sm: ScalarModel): ThermalBC {
  const g = P.g, nn = nNodes(g);
  const bc: ThermalBC = { fixed: new Uint8Array(nn), value: new Float64Array(nn), diag: new Float64Array(nn), rhs: new Float64Array(nn), srcElem: new Float64Array(g.nElem), conv: [], rad: [], Pin: 0, info: [], warnings: [], sink: false, bodyPower: [] };
  const volOf = (mi: number) => { let n = 0; for (let e = 0; e < g.nElem; e++) if (g.mat[g.elem[e]] === mi + 1) n++; return n * g.h ** 3; };
  const addBodyPower = (b: CaeBody, W: number, label: string) => {
    const mi = P.matOf.get(b.id); if (mi === undefined || W === 0) return;
    const q = W / Math.max(volOf(mi), 1e-12);
    for (let e = 0; e < g.nElem; e++) if (g.mat[g.elem[e]] === mi + 1) bc.srcElem[e] += q;
    bc.Pin += W; bc.bodyPower.push({ body: b, mi, W });
    bc.info.push({ label, text: `${fmt(W)} W dissipated in ${b.name}` });
  };
  for (const b of P.input.bodies) if (b.power > 0 && b.role === 'solid') addBodyPower(b, b.power, `Power: ${b.name}`);
  for (const l of P.input.loads) {
    if (!l.on) continue;
    const nm = l.name || l.type, p = l.p;
    const isBody = l.region.startsWith('body:');
    if (l.type === 'temperature') {
      const nodes = P.targetNodes(l.region);
      let c = 0; for (let i = 0; i < nodes.length; i++) if (nodes[i]) { bc.fixed[i] = 1; bc.value[i] = p.t ?? 0; c++; }
      if (!c) bc.warnings.push(`"${nm}": no mesh nodes in the selection.`); else { bc.sink = true; bc.info.push({ label: nm, text: `Temperature ${p.t} °C on ${c} nodes` }); }
    } else if (l.type === 'heatflux') {
      const faces = P.faces(l.region); if (!faces.length) { bc.warnings.push(`"${nm}": no faces in the selection.`); continue; }
      const q = (p.q ?? 0) * 1e-6;
      faceNodeAreas(g, faces).forEach((a, nd) => { bc.rhs[nd] += q * a; bc.Pin += q * a; });
      bc.info.push({ label: nm, text: `Heat flux ${p.q} W/m² on ${(faces.length * g.h * g.h).toFixed(0)} mm²` });
    } else if (l.type === 'heatpower' && P.isNodeRegion(l.region)) {
      const nodes = P.nodesOf(l.region); if (!nodes.length) { bc.warnings.push(`"${nm}": the picked edge or point is not on the mesh.`); continue; }
      for (const nd of nodes) bc.rhs[nd] += (p.w ?? 0) / nodes.length;
      bc.Pin += p.w ?? 0; bc.info.push({ label: nm, text: `${fmt(p.w ?? 0)} W at ${nodes.length} node${nodes.length === 1 ? '' : 's'}` });
    } else if (l.type === 'heatpower') {
      if (isBody) { const b = P.input.bodies.find((x) => x.id === l.region.slice(5)); if (b) addBodyPower(b, p.w ?? 0, nm); }
      else {
        const faces = P.faces(l.region); if (!faces.length) { bc.warnings.push(`"${nm}": no faces in the selection.`); continue; }
        const area = faces.length * g.h * g.h;
        faceNodeAreas(g, faces).forEach((a, nd) => { bc.rhs[nd] += ((p.w ?? 0) * a) / area; });
        bc.Pin += p.w ?? 0; bc.info.push({ label: nm, text: `${fmt(p.w ?? 0)} W over ${area.toFixed(0)} mm²` });
      }
    } else if (l.type === 'convection') {
      const faces = P.faces(l.region); if (!faces.length) { bc.warnings.push(`"${nm}": no faces in the selection.`); continue; }
      const h = (p.h ?? 0) * 1e-6;
      faceNodeAreas(g, faces).forEach((a, nd) => { bc.diag[nd] += h * a; bc.rhs[nd] += h * a * (p.tinf ?? 22); });
      bc.conv.push({ faces, h, Tinf: p.tinf ?? 22, name: nm }); bc.sink = true;
      bc.info.push({ label: nm, text: `Convection h = ${p.h} W/m²K, T∞ = ${p.tinf} °C on ${(faces.length * g.h * g.h).toFixed(0)} mm²` });
    } else if (l.type === 'radiation') {
      const faces = P.faces(l.region); if (!faces.length) { bc.warnings.push(`"${nm}": no faces in the selection.`); continue; }
      bc.rad.push({ faces, eps: p.eps ?? 0.8, Ts: p.tinf ?? 22, name: nm }); bc.sink = true;
      bc.info.push({ label: nm, text: `Radiation ε = ${p.eps}, surroundings ${p.tinf} °C on ${(faces.length * g.h * g.h).toFixed(0)} mm²` });
    }
  }
  return bc;
}

function radiationTerms(P: Prep, bc: ThermalBC, T: Float64Array | null, diag: Float64Array, rhs: Float64Array) {
  for (const r of bc.rad) {
    const Ts = r.Ts + 273.15;
    faceNodeAreas(P.g, r.faces).forEach((a, nd) => {
      const Tk = (T ? T[nd] : r.Ts) + 273.15;
      const hr = r.eps * SIGMA_SB * (Tk * Tk + Ts * Ts) * (Tk + Ts);
      diag[nd] += hr * a; rhs[nd] += hr * a * r.Ts;
    });
  }
}

export interface ThermalSolver { P: Prep; sm: ScalarModel; bc: ThermalBC; src: Float64Array }

export function thermalSetup(P: Prep, extraSrc?: Float64Array | null): ThermalSolver {
  const sm = new ScalarModel(P.g, thermalMats(P));
  const bc = buildThermalBC(P, sm);
  const src = sm.sourceLoad((e) => bc.srcElem[e]);
  if (extraSrc) for (let i = 0; i < src.length; i++) src[i] += extraSrc[i];
  return { P, sm, bc, src };
}

export function steadyThermal(ts: ThermalSolver, env: Env, tag = ''): { T: Float64Array; iterations: number; ms: number; imbalance: number } {
  const { P, sm, bc, src } = ts, nn = nNodes(P.g);
  if (!bc.sink && !bc.fixed.some((v) => v)) throw new Error('The thermal model has no way to lose heat: add a Temperature, Convection or Radiation condition.');
  let T: Float64Array | null = null, its = 0, ms = 0;
  const nIter = bc.rad.length ? 14 : 1;
  for (let k = 0; k < nIter; k++) {
    const diag = Float64Array.from(bc.diag), rhs = Float64Array.from(bc.rhs);
    for (let i = 0; i < nn; i++) rhs[i] += src[i];
    radiationTerms(P, bc, T, diag, rhs);
    sm.build(bc.fixed, diag);
    const t1 = Date.now();
    const s = sm.solve(rhs, bc.fixed, bc.value, T, 1e-9, 500, (it, res) => env.progress(0.3 + 0.4 * Math.min(1, -Math.log10(Math.max(res, 1e-12)) / 9), `${tag}Thermal solve: iteration ${it}`));
    ms += Date.now() - t1; its += s.info.iterations;
    let dmax = 0;
    if (T) for (let i = 0; i < nn; i++) dmax = Math.max(dmax, Math.abs(s.u[i] - T[i]));
    T = s.u;
    if (bc.rad.length) env.progress(0.3 + 0.4 * (k / nIter), `${tag}Radiation iteration ${k + 1}`);
    if (!bc.rad.length || (k > 0 && dmax < 0.02)) break;
  }
  // heat balance
  const out = heatOut(ts, T!);
  const imb = bc.Pin > 0 ? Math.abs(out - bc.Pin) / bc.Pin : 0;
  return { T: T!, iterations: its, ms, imbalance: imb };
}

/** Heat leaving the model through convection, radiation and fixed-temperature faces (W) */
export function heatOut(ts: ThermalSolver, T: Float64Array): number {
  const { P, sm, bc, src } = ts, nn = nNodes(P.g);
  let q = 0;
  for (const c of bc.conv) faceNodeAreas(P.g, c.faces).forEach((a, nd) => { q += c.h * a * (T[nd] - c.Tinf); });
  for (const r of bc.rad) faceNodeAreas(P.g, r.faces).forEach((a, nd) => { const Tk = T[nd] + 273.15, Ts = r.Ts + 273.15; q += r.eps * SIGMA_SB * (Tk ** 4 - Ts ** 4) * a; });
  // Dirichlet reaction
  if (bc.fixed.some((v) => v)) {
    const diag = Float64Array.from(bc.diag), rhs = Float64Array.from(bc.rhs);
    for (let i = 0; i < nn; i++) rhs[i] += src[i];
    const mg = sm.build(bc.fixed, new Float64Array(nn));
    const KT = new Float64Array(nn); mg.applyFull(T, KT);
    for (let i = 0; i < nn; i++) if (bc.fixed[i] && mg.active[i]) q -= KT[i] + diag[i] * T[i] - rhs[i];
  }
  return q;
}

function fluxField(ts: ThermalSolver, T: Float64Array): Float32Array {
  const { P, sm } = ts, g = P.g, gr = sm.gradient(T), el = new Float32Array(g.nElem);
  for (let e = 0; e < g.nElem; e++) { const m = sm.mats[g.mat[g.elem[e]] - 1]; el[e] = Math.hypot(m.kx * gr[3 * e], m.ky * gr[3 * e + 1], m.kz * gr[3 * e + 2]) * 1e6; }
  return nodalAverage(g, el, 1);
}

function tempStats(P: Prep, T: Float64Array) {
  const g = P.g, nn = nNodes(g), act = new Uint8Array(nn);
  const sm = new ScalarModel(g, [{ kx: 1, ky: 1, kz: 1 }]);
  for (let e = 0; e < g.nElem; e++) for (let a = 0; a < 8; a++) act[sm.base[e] + sm.off[a]] = 1;
  let mx = -Infinity, mn = Infinity, imx = 0, imn = 0;
  for (let i = 0; i < nn; i++) if (act[i]) { if (T[i] > mx) { mx = T[i]; imx = i; } if (T[i] < mn) { mn = T[i]; imn = i; } }
  return { mx, mn, imx, imn, act };
}

function bodyTemps(P: Prep, T: Float64Array) {
  const g = P.g, n = P.mats.length, mx = new Float64Array(n).fill(-Infinity), sum = new Float64Array(n), cnt = new Float64Array(n);
  const sm = new ScalarModel(g, [{ kx: 1, ky: 1, kz: 1 }]);
  for (let e = 0; e < g.nElem; e++) {
    const mi = g.mat[g.elem[e]] - 1;
    for (let a = 0; a < 8; a++) { const v = T[sm.base[e] + sm.off[a]]; if (v > mx[mi]) mx[mi] = v; sum[mi] += v; cnt[mi]++; }
  }
  return { mx, mean: Array.from(sum, (s, i) => (cnt[i] ? s / cnt[i] : 0)) };
}

export function thermalFields(ts: ThermalSolver, T: Float64Array): FieldDef[] {
  const { P } = ts;
  const f32 = Float32Array.from(T);
  return [makeField('temp', 'Temperature', '°C', 'node', f32), makeField('flux', 'Heat-flux magnitude', 'W/m²', 'node', fluxField(ts, T))].map((f) => { void P; return f; });
}

function hotspotsT(P: Prep, T: Float64Array): { x: number; y: number; z: number; value: number; label: string; fieldId: string }[] {
  const st = tempStats(P, T), a = nodeXYZ(P.g, st.imx), b = nodeXYZ(P.g, st.imn);
  return [{ x: a[0], y: a[1], z: a[2], value: st.mx, label: 'Hottest point', fieldId: 'temp' }, { x: b[0], y: b[1], z: b[2], value: st.mn, label: 'Coldest point', fieldId: 'temp' }];
}

// ---------------------------------------------------------------------------------------------

export function transientThermal(ts: ThermalSolver, T0: number, tend: number, env: Env, onStep: (k: number, t: number, T: Float64Array) => void): { ms: number; steps: number } {
  const { P, sm, bc, src } = ts, nn = nNodes(P.g);
  const C = sm.nodalCapacity();
  let T: Float64Array = new Float64Array(nn).fill(T0);
  for (let i = 0; i < nn; i++) if (bc.fixed[i]) T[i] = bc.value[i];
  onStep(0, 0, T);
  const edges = [0]; for (let p = 1; p <= 6; p++) edges.push(tend * Math.pow(3, p - 6));
  edges[edges.length - 1] = tend;
  edges.sort((a, b) => a - b);
  let t = 0, k = 0, ms = 0;
  const per = 10;
  for (let p = 0; p < 6; p++) {
    const dt = (edges[p + 1] - edges[p]) / per;
    const build = (Tref: Float64Array | null) => {
      const diag = new Float64Array(nn), rhsR = new Float64Array(nn);
      for (let i = 0; i < nn; i++) diag[i] = C[i] / dt + bc.diag[i];
      radiationTerms(P, bc, Tref, diag, rhsR);
      sm.build(bc.fixed, diag);
      return rhsR;
    };
    let rhsR = build(T);
    for (let s = 0; s < per; s++) {
      if (bc.rad.length && s > 0 && s % 5 === 0) rhsR = build(T);
      const b = new Float64Array(nn);
      for (let i = 0; i < nn; i++) b[i] = bc.rhs[i] + src[i] + rhsR[i] + (C[i] / dt) * T[i];
      const t1 = Date.now();
      const r = sm.solve(b, bc.fixed, bc.value, T, 1e-9, 300);
      ms += Date.now() - t1;
      T = r.u; t += dt; k++;
      onStep(k, t, T);
    }
    env.progress(0.2 + 0.6 * ((p + 1) / 6), `Transient thermal: t = ${fmt(t)} s`);
  }
  return { ms, steps: k };
}

export function runThermal(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  env.progress(0.03, 'Voxelising the model');
  const P = prepare(input);
  const ts = thermalSetup(P);
  const mode = strP(input, 'mode', 'steady'), tlimit = numP(input, 'tlimit', 85), Tamb = numP(input, 'Tamb', 22);
  const r = baseResult(P, 'thermal', 'Trilinear hexahedral (heat conduction)', t0);
  r.mesh.dof = r.mesh.nodes;
  for (const w of ts.bc.warnings) r.notes.push(w);
  let T: Float64Array, sol = { iterations: 0, ms: 0 };
  const frames: Frame[] = [];
  const hist: { t: number; mx: number; mn: number; avg: number; bodies: number[] }[] = [];
  if (mode === 'steady') {
    env.progress(0.15, `Solving (${P.g.nElem.toLocaleString()} elements)`);
    const s = steadyThermal(ts, env);
    T = s.T; sol = { iterations: s.iterations, ms: s.ms };
    r.checks.push({ name: 'Heat balance (power in vs. out)', value: `${(100 * s.imbalance).toFixed(3)} % error`, limit: '< 1 %', ok: s.imbalance < 0.01 });
  } else {
    const T0 = numP(input, 'T0', 22), tend = numP(input, 'tend', 300);
    const stats: number[] = [];
    let last: Float64Array = new Float64Array(0);
    const cap = 24, every = 60 / cap;
    const res = transientThermal(ts, T0, tend, env, (k, t, Tn) => {
      const st = tempStats(P, Tn), bt = bodyTemps(P, Tn);
      hist.push({ t, mx: st.mx, mn: st.mn, avg: 0, bodies: Array.from(bt.mx) });
      if (k % every < 1 || k === 60) frames.push({ label: `t = ${fmt(t)} s`, t, fields: { temp: Float32Array.from(Tn) } });
      last = Tn; void stats;
    });
    T = last; sol = { iterations: res.steps, ms: res.ms };
    r.curves.push({ id: 'tt', title: 'Temperature history', xlabel: 'Time (s)', ylabel: 'Temperature (°C)', logx: false, series: [{ name: 'Maximum', x: hist.map((h) => h.t), y: hist.map((h) => h.mx) }, { name: 'Minimum', x: hist.map((h) => h.t), y: hist.map((h) => h.mn) }] });
    const bodiesWithP = ts.bc.bodyPower;
    if (bodiesWithP.length) r.curves[0].series.push(...bodiesWithP.slice(0, 6).map((bp) => ({ name: bp.body.name, x: hist.map((h) => h.t), y: hist.map((h) => h.bodies[bp.mi]) })));
    r.frames = frames;
    // time to reach the limit
    const hit = hist.find((h) => h.mx >= tlimit);
    r.kv.push({ label: 'Time to reach the limit', value: hit ? `${fmt(hit.t)} s` : 'not reached', status: hit ? 'warn' : 'ok' });
  }
  r.fields = thermalFields(ts, T); r.defaultField = 'temp';
  r.solver = { name: 'Multigrid PCG (backward Euler for transients)', iterations: sol.iterations, time: Date.now() - t0, log: [`${sol.iterations} solver iterations in ${(sol.ms / 1000).toFixed(2)} s`] };
  r.mesh.time = Date.now() - t0;
  const st = tempStats(P, T);
  r.hotspots = hotspotsT(P, T);
  r.kv.push({ label: 'Maximum temperature', value: `${fmt(st.mx)} °C`, status: st.mx <= tlimit ? 'ok' : 'fail' });
  r.kv.push({ label: 'Minimum temperature', value: `${fmt(st.mn)} °C` });
  r.kv.push({ label: 'Total heat input', value: `${fmt(ts.bc.Pin)} W` });
  if (ts.bc.Pin > 0 && ts.bc.conv.length) { let q = 0; for (const c of ts.bc.conv) faceNodeAreas(P.g, c.faces).forEach((a, nd) => { q += c.h * a * (T[nd] - c.Tinf); }); r.kv.push({ label: 'Heat removed by convection', value: `${fmt(q)} W` }); }
  r.checks.push({ name: 'Temperature limit', value: `${fmt(st.mx)} °C`, limit: `≤ ${tlimit} °C`, ok: st.mx <= tlimit });
  // component table
  const bt = bodyTemps(P, T);
  const rows: (string | number)[][] = [];
  let tjMax = -Infinity, tjOk = true;
  P.mats.forEach((m, i) => {
    if (P.bodyOf[i] < 0) return;
    const b = P.input.bodies[P.bodyOf[i]], pw = ts.bc.bodyPower.filter((q) => q.mi === i).reduce((s, q) => s + q.W, 0);
    const tj = pw > 0 && b.rjc > 0 ? bt.mx[i] + pw * b.rjc : NaN;
    if (Number.isFinite(tj)) { tjMax = Math.max(tjMax, tj); if (tj > tlimit) tjOk = false; }
    rows.push([b.name, m.name, fmt(pw), fmt(bt.mean[i], 4), fmt(bt.mx[i], 4), Number.isFinite(tj) ? fmt(tj, 4) : '—']);
  });
  r.tables.push({ id: 'comp', title: 'Temperatures by body', cols: ['Body', 'Material', 'Power (W)', 'Mean T (°C)', 'Max T (°C)', 'Junction T (°C)'], rows });
  if (Number.isFinite(tjMax)) { r.kv.push({ label: 'Highest junction temperature', value: `${fmt(tjMax)} °C`, status: tjOk ? 'ok' : 'fail' }); r.checks.push({ name: 'Junction temperature (case + P·Rθjc)', value: `${fmt(tjMax)} °C`, limit: `≤ ${tlimit} °C`, ok: tjOk }); }
  const rise = st.mx - Tamb;
  r.kv.push({ label: 'Rise above ambient', value: `${fmt(rise)} K` });
  const ok = st.mx <= tlimit && tjOk;
  r.verdict = { pass: ok, text: ok ? `PASS: the maximum temperature ${fmt(st.mx)} °C stays below the limit of ${tlimit} °C.` : `FAIL: ${st.mx > tlimit ? `maximum temperature ${fmt(st.mx)} °C exceeds ${tlimit} °C` : `junction temperature ${fmt(tjMax)} °C exceeds ${tlimit} °C`}.` };
  describeThermal(r, ts);
  return r;
}

function describeThermal(r: Result, ts: ThermalSolver) {
  r.inputs.push({ label: 'Bodies', value: ts.P.input.bodies.map((b) => `${b.name}: ${b.mat.name}`).join('; ') });
  for (const i of ts.bc.info) r.inputs.push({ label: i.label, value: i.text });
}

// ---------------------------------------------------------------------------------------------
// Thermal stress

export function runThermoStress(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  env.progress(0.03, 'Voxelising the model');
  const P = prepare(input, { maxElems: 80000 });
  const mode = strP(input, 'mode', 'steady'), T0 = numP(input, 'T0', 20), target = numP(input, 'fosTarget', 1.5), crit = strP(input, 'criterion', 'auto');
  const ts = thermalSetup(P);
  const model = new ElasticModel(P.g, P.mats, { tet: strP(input, 'elem') === 'tet', fibre: P.fibre as Axis[] });
  const sl = buildStructLoads(P, model, {});
  requireSupports(sl, 'The thermal-stress analysis');
  model.build(sl.bc);
  const nn = nNodes(P.g);
  const r = baseResult(P, 'thermostress', 'Hexahedral 8-node (stress) + trilinear hexahedral (heat)', t0);
  r.mesh.dof = 3 * r.mesh.nodes;
  const solveStress = (T: Float64Array) => {
    const dT = new Float64Array(nn); for (let i = 0; i < nn; i++) dT[i] = T[i] - T0;
    const th = model.thermalLoad(dT);
    const { u, info } = model.solveStatic(sl.bc, th, 1e-7, 500);
    const sig = model.elementStress(u, dT);
    return { u, sig, dT, info };
  };
  let Tfinal: Float64Array;
  const snaps: { t: number; T: Float64Array }[] = [];
  const curve: { t: number[]; vm: number[]; dTmax: number[]; grad: number[] } = { t: [], vm: [], dTmax: [], grad: [] };
  let best: { t: number; T: Float64Array; res: ReturnType<typeof solveStress>; post: ReturnType<typeof structPost> } | null = null;
  let iters = 0;
  if (mode === 'steady') {
    const s = steadyThermal(ts, env, 'Thermal: ');
    Tfinal = s.T;
    env.progress(0.75, 'Solving the thermal-stress problem');
    const res = solveStress(Tfinal);
    iters = res.info.iterations;
    best = { t: 0, T: Tfinal, res, post: structPost(P, model, res.u, res.sig, crit, res.dT) };
  } else {
    const tend = numP(input, 'tend', 60);
    const keep = new Set([6, 12, 18, 24, 30, 36, 42, 48, 54, 60]);
    let lastT: Float64Array = new Float64Array(0);
    transientThermal(ts, T0, tend, env, (k, t, T) => { if (keep.has(k)) snaps.push({ t, T: Float64Array.from(T) }); lastT = T; });
    Tfinal = lastT;
    let bi = -1, bv = -1;
    const results: { post: ReturnType<typeof structPost>; res: ReturnType<typeof solveStress> }[] = [];
    snaps.forEach((sn, i) => {
      env.progress(0.5 + 0.4 * (i / snaps.length), `Stress at t = ${fmt(sn.t)} s`);
      const res = solveStress(sn.T), post = structPost(P, model, res.u, res.sig, crit, res.dT);
      iters += res.info.iterations;
      results.push({ post, res });
      curve.t.push(sn.t); curve.vm.push(post.maxVm);
      const st = tempStats(P, sn.T); curve.dTmax.push(st.mx - st.mn);
      if (post.maxVm > bv) { bv = post.maxVm; bi = i; }
    });
    best = { t: snaps[bi].t, T: snaps[bi].T, res: results[bi].res, post: results[bi].post };
    r.curves.push({ id: 'shock', title: 'Thermal shock: peak stress and temperature difference', xlabel: 'Time (s)', ylabel: 'Peak von Mises stress (MPa)', series: [{ name: 'Peak σ_vm', x: curve.t, y: curve.vm }] });
    r.curves.push({ id: 'dT', title: 'Temperature difference across the part', xlabel: 'Time (s)', ylabel: 'Tmax − Tmin (K)', series: [{ name: 'ΔT', x: curve.t, y: curve.dTmax }] });
    r.notes.push(`The critical instant is t = ${fmt(best.t)} s, when the temperature difference across the part is ${fmt(curve.dTmax[bi])} K.`);
    r.frames = snaps.map((sn) => ({ label: `t = ${fmt(sn.t)} s`, t: sn.t, fields: { temp: Float32Array.from(sn.T) } }));
  }
  const { post, res } = best!;
  const tf = thermalFields(ts, best!.T);
  r.fields = [...post.fields, ...tf.filter((f) => f.id === 'temp')];
  r.defaultField = 'vm';
  r.disp = Float32Array.from(res.u); r.dispScale = dispScaleFor(P, post.maxDisp);
  r.hotspots = [...post.hotspots, ...hotspotsT(P, best!.T).slice(0, 1)];
  const st = tempStats(P, best!.T);
  r.solver = { name: 'Heat conduction → thermal-strain load → multigrid PCG', iterations: iters, time: Date.now() - t0, log: [`Temperature range ${fmt(st.mn)} … ${fmt(st.mx)} °C, stress-free at ${T0} °C`] };
  r.mesh.time = Date.now() - t0;
  r.kv.push({ label: 'Temperature range', value: `${fmt(st.mn)} … ${fmt(st.mx)} °C`, status: 'info' });
  r.kv.push({ label: 'Maximum von Mises stress', value: `${fmt(post.maxVm)} MPa` });
  r.kv.push({ label: 'Maximum displacement (thermal growth)', value: `${fmt(post.maxDisp)} mm` });
  r.kv.push({ label: 'Minimum factor of safety', value: fmt(post.minFos, 3), status: post.minFos >= target ? 'ok' : 'fail' });
  r.checks.push({ name: 'Factor of safety', value: fmt(post.minFos, 3), limit: `≥ ${target}`, ok: post.minFos >= target });
  r.tables.push(bodyTable(P, { post, model }));
  r.verdict = { pass: post.minFos >= target, text: post.minFos >= target ? `PASS: minimum factor of safety ${fmt(post.minFos, 3)}${mode === 'shock' ? ` at the worst instant (t = ${fmt(best!.t)} s)` : ''}.` : `FAIL: minimum factor of safety ${fmt(post.minFos, 3)} < ${target}${mode === 'shock' ? ` at t = ${fmt(best!.t)} s` : ''}: thermal stress exceeds the strength.` };
  void Tfinal; void reactions;
  r.inputs.push({ label: 'Bodies', value: P.input.bodies.map((b) => `${b.name}: ${b.mat.name}`).join('; ') });
  for (const i of [...sl.info, ...ts.bc.info]) r.inputs.push({ label: i.label, value: i.text });
  void addMeshAndSolver;
  return r;
}

// ---------------------------------------------------------------------------------------------
// DC conduction and Joule heating

const TCR = 0.0039;     // temperature coefficient of resistivity of copper / aluminium, 1/K

export function runJoule(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  env.progress(0.03, 'Voxelising the model');
  const P = prepare(input);
  const g = P.g, nn = nNodes(g);
  const coupled = boolP(input, 'coupled'), tdep = boolP(input, 'tempdep'), tlimit = numP(input, 'tlimit', 105);
  const sig0 = P.mats.map((m) => (m.sigma ?? 0) / 1000);           // S/mm
  const sMax = amax(sig0, 1e-12);
  const floor = sMax * 1e-9;
  const volts = P.input.loads.filter((l) => l.on && l.type === 'voltage'), inj = P.input.loads.filter((l) => l.on && l.type === 'currentin');
  if (!volts.length) throw new Error('Add at least one Voltage terminal (use 0 V for the return terminal).');
  const fixed = new Uint8Array(nn), value = new Float64Array(nn);
  const info: AppliedInfo[] = [];
  for (const l of volts) { const nd = P.targetNodes(l.region); let c = 0; for (let i = 0; i < nn; i++) if (nd[i]) { fixed[i] = 1; value[i] = l.p.v ?? 0; c++; } info.push({ label: l.name || 'Voltage', text: `${l.p.v} V on ${c} nodes` }); }
  const rhs = new Float64Array(nn);
  let Iin = 0;
  for (const l of inj) {
    if (P.isNodeRegion(l.region)) {
      const nodes = P.nodesOf(l.region), cur = l.p.i ?? 0; if (!nodes.length) continue;
      for (const nd of nodes) rhs[nd] += cur / nodes.length; Iin += cur;
      info.push({ label: l.name || 'Current', text: `${cur} A injected at ${nodes.length} node${nodes.length === 1 ? '' : 's'}` });
      continue;
    }
    const faces = P.faces(l.region); if (!faces.length) continue;
    const area = faces.length * g.h * g.h, cur = l.p.i ?? 0;
    faceNodeAreas(g, faces).forEach((a, nd) => { rhs[nd] += (cur * a) / area; }); Iin += cur;
    info.push({ label: l.name || 'Current', text: `${cur} A injected through ${area.toFixed(0)} mm²` });
  }
  const ts = coupled ? thermalSetup(P) : null;
  let coupled2 = coupled, noteThermal = '';
  if (ts) for (const w of ts.bc.warnings) void w;
  let V: Float64Array = new Float64Array(nn), its = 0, ms = 0, Tsol: Float64Array | null = null, sigNow: number[] = sig0;
  const elemS = new Float64Array(g.nElem);
  const rounds = coupled && tdep ? 5 : 1;
  for (let round = 0; round < rounds; round++) {
    const mats: ScalarMaterial[] = sig0.map((s) => ({ kx: Math.max(s, floor), ky: Math.max(s, floor), kz: Math.max(s, floor) }));
    if (round > 0 && Tsol && tdep) {
      // resistivity rises with temperature: scale each metallic material by its mean temperature
      const probe = new ScalarModel(g, mats), sum = new Float64Array(mats.length), cnt = new Float64Array(mats.length);
      for (let e = 0; e < g.nElem; e++) { const mi = g.mat[g.elem[e]] - 1; let t = 0; for (let a = 0; a < 8; a++) t += Tsol[probe.base[e] + probe.off[a]]; sum[mi] += t / 8; cnt[mi]++; }
      mats.forEach((m, i) => { if (cnt[i] && (P.mats[i].sigma ?? 0) > 1e5) { const f = 1 / (1 + TCR * (sum[i] / cnt[i] - 20)); m.kx *= f; m.ky *= f; m.kz *= f; } });
    }
    sigNow = mats.map((m) => m.kx);
    const em = new ScalarModel(g, mats);
    const reg = new Float64Array(nn);
    for (let i = 0; i < nn; i++) reg[i] = 1e-12 * sMax * g.h;
    em.build(fixed, reg);
    const t1 = Date.now();
    const s = em.solve(rhs, fixed, value, V, 1e-9, 600, (it, res) => env.progress(0.2 + 0.4 * Math.min(1, -Math.log10(Math.max(res, 1e-12)) / 9), `Current flow: iteration ${it}`));
    ms += Date.now() - t1; its += s.info.iterations; V = s.u;
    // element power density
    const gr = em.gradient(V);
    for (let e = 0; e < g.nElem; e++) { const m = em.mats[g.mat[g.elem[e]] - 1]; elemS[e] = m.kx * (gr[3 * e] ** 2 + gr[3 * e + 1] ** 2 + gr[3 * e + 2] ** 2); }   // W/mm³ (σ|E|²)
    if (coupled && ts) {
      const src = ts.sm.sourceLoad((e) => elemS[e]);
      const ts2 = { ...ts, src: ts.src.map((v, i) => v + src[i]) } as typeof ts;
      env.progress(0.65 + 0.25 * (round / rounds), `Thermal solve ${round + 1}/${rounds}`);
      try { Tsol = steadyThermal(ts2, env, 'Joule: ').T; } catch (err) { coupled2 = false; noteThermal = (err as Error).message; break; }
    }
  }
  // currents and resistance
  const em0 = new ScalarModel(g, sigNow.map((s) => ({ kx: Math.max(s, floor), ky: Math.max(s, floor), kz: Math.max(s, floor) })));
  const gr = em0.gradient(V);
  let Pj = 0;
  const Jel = new Float32Array(g.nElem), pel = new Float32Array(g.nElem);
  for (let e = 0; e < g.nElem; e++) {
    const s = sigNow[g.mat[g.elem[e]] - 1] || floor;
    const j = s * Math.hypot(gr[3 * e], gr[3 * e + 1], gr[3 * e + 2]);
    Jel[e] = j; pel[e] = elemS[e] * 1e3;                                 // A/mm², mW/mm³
    Pj += elemS[e] * g.h ** 3;
  }
  const vmax = Math.max(...volts.map((l) => l.p.v ?? 0)), vmin = Math.min(...volts.map((l) => l.p.v ?? 0));
  let Itot = Math.abs(Iin);
  if (!inj.length) {
    // reaction at the highest-potential terminal
    const em = new ScalarModel(g, sigNow.map((s) => ({ kx: Math.max(s, floor), ky: Math.max(s, floor), kz: Math.max(s, floor) })));
    const mg = em.build(fixed, null);
    const KV = new Float64Array(nn); mg.applyFull(V, KV);
    let q = 0;
    for (const l of volts) if ((l.p.v ?? 0) === vmax) { const nd = P.targetNodes(l.region); for (let i = 0; i < nn; i++) if (nd[i] && mg.active[i]) q += KV[i]; }
    Itot = Math.abs(q);
  }
  const dV = vmax - vmin, R = Itot > 0 ? (inj.length ? Math.abs(dV || 0) / Itot : dV / Itot) : NaN;
  const r = baseResult(P, 'joule', 'Trilinear hexahedral (DC conduction)', t0);
  r.mesh.dof = r.mesh.nodes;
  r.fields = [makeField('V', 'Electric potential', 'V', 'node', Float32Array.from(V)), makeField('J', 'Current density', 'A/mm²', 'node', nodalAverage(g, Jel, 1)), makeField('pd', 'Joule heating density', 'mW/mm³', 'node', nodalAverage(g, pel, 1))];
  r.defaultField = 'J';
  if (Tsol) r.fields.push(makeField('temp', 'Temperature', '°C', 'node', Float32Array.from(Tsol)));
  if (Tsol) r.defaultField = 'temp';
  const jf = r.fields.find((f) => f.id === 'J')!;
  r.kv.push({ label: 'Current', value: `${fmt(Itot)} A`, status: 'info' });
  r.kv.push({ label: 'Voltage across the terminals', value: `${fmt(dV)} V` });
  if (Number.isFinite(R) && R > 0) r.kv.push({ label: 'Resistance', value: `${fmt(R * 1e3)} mΩ` });
  r.kv.push({ label: 'Joule power', value: `${fmt(Pj)} W` });
  r.kv.push({ label: 'Peak current density', value: `${fmt(jf.max)} A/mm²` });
  const checks: boolean[] = [];
  if (Tsol) {
    const st = tempStats(P, Tsol);
    r.kv.push({ label: 'Maximum temperature', value: `${fmt(st.mx)} °C`, status: st.mx <= tlimit ? 'ok' : 'fail' });
    r.checks.push({ name: 'Temperature limit', value: `${fmt(st.mx)} °C`, limit: `≤ ${tlimit} °C`, ok: st.mx <= tlimit }); checks.push(st.mx <= tlimit);
    r.hotspots = hotspotsT(P, Tsol).slice(0, 1);
  } else if (coupled) r.notes.push(`No thermal result: ${noteThermal || 'add a Convection or Temperature condition for the thermal coupling.'}`);
  void coupled2;
  r.checks.push({ name: 'Current density (bus-bar guideline 1.5 – 5 A/mm²)', value: `${fmt(jf.max)} A/mm²`, limit: '≤ 5 A/mm² peak', ok: jf.max <= 5, note: 'Local peaks at terminals and sharp corners are normal; judge the average over the cross-section.' });
  r.checks.push({ name: 'Power balance (I·V vs. ∫σE²)', value: `${(100 * Math.abs(Itot * dV - Pj) / Math.max(Pj, 1e-12)).toFixed(2)} % difference`, limit: '< 3 %', ok: Math.abs(Itot * dV - Pj) / Math.max(Pj, 1e-12) < 0.03 });
  const pass = checks.every(Boolean);
  r.verdict = { pass: checks.length ? pass : null, text: checks.length ? (pass ? `PASS: temperature rise stays below ${tlimit} °C.` : `FAIL: temperature exceeds ${tlimit} °C.`) : `Resistance ${Number.isFinite(R) ? fmt(R * 1e3) + ' mΩ' : 'n/a'}, Joule power ${fmt(Pj)} W.` };
  r.solver = { name: 'Multigrid PCG (potential), multigrid PCG (temperature)', iterations: its, time: Date.now() - t0, log: [`${its} iterations in ${(ms / 1000).toFixed(2)} s over ${rounds} coupling round(s)`] };
  r.mesh.time = Date.now() - t0;
  r.inputs.push({ label: 'Bodies', value: P.input.bodies.map((b) => `${b.name}: ${b.mat.name}`).join('; ') });
  for (const i of [...info, ...(ts?.bc.info ?? [])]) r.inputs.push({ label: i.label, value: i.text });
  if (!P.mats.some((m) => (m.sigma ?? 0) > 1e4)) r.notes.push('None of the bodies has a metallic electrical conductivity: check the material assignment.');
  return r;
}

// ---------------------------------------------------------------------------------------------
// Electrostatics

export function runElectrostatic(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const margin = numP(input, 'margin', 0.6), Eb = numP(input, 'Ebreak', 3) * 1000;     // V/mm
  env.progress(0.03, 'Voxelising the model and the air box');
  const P = prepare(input, { airMargin: margin, maxCells: 1_400_000 });
  const g = P.g, nn = nNodes(g);
  const fixed = new Uint8Array(nn), value = new Float64Array(nn);
  const info: AppliedInfo[] = [];
  const conductors: { name: string; v: number }[] = [];
  for (const b of P.input.bodies) if (b.potential !== null && b.role === 'solid') { const nd = P.bodyNodes(b.id); for (let i = 0; i < nn; i++) if (nd[i]) { fixed[i] = 1; value[i] = b.potential; } conductors.push({ name: b.name, v: b.potential }); info.push({ label: b.name, text: `Conductor at ${b.potential} V` }); }
  for (const l of P.input.loads) if (l.on && l.type === 'voltage') { const nd = P.targetNodes(l.region); for (let i = 0; i < nn; i++) if (nd[i]) { fixed[i] = 1; value[i] = l.p.v ?? 0; } conductors.push({ name: l.name || 'Terminal', v: l.p.v ?? 0 }); info.push({ label: l.name || 'Voltage', text: `${l.p.v} V` }); }
  if (!conductors.length) throw new Error('Set a potential on at least one conductor body (Bodies → Electrical potential) or add a Voltage condition.');
  // grounded outer boundary
  const sx = g.nx + 1, sy = g.ny + 1;
  for (let k = 0; k <= g.nz; k++) for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) if (i === 0 || j === 0 || k === 0 || i === g.nx || j === g.ny || k === g.nz) { const n = i + sx * (j + sy * k); if (!fixed[n]) { fixed[n] = 1; value[n] = 0; } }
  const mats: ScalarMaterial[] = P.mats.map((m, i) => { const e = i === P.air ? 1 : m.sigma && m.sigma > 1e4 ? 1 : (m.epsr ?? 1); return { kx: e, ky: e, kz: e }; });
  const em = new ScalarModel(g, mats);
  env.progress(0.15, `Solving the potential (${g.nElem.toLocaleString()} cells)`);
  em.build(fixed, null);
  const s = em.solve(new Float64Array(nn), fixed, value, null, 1e-9, 600, (it, res) => env.progress(0.2 + 0.6 * Math.min(1, -Math.log10(Math.max(res, 1e-12)) / 9), `Potential solve: iteration ${it}`));
  const V = s.u, gr = em.gradient(V);
  const Eel = new Float32Array(g.nElem);
  let W = 0, Emax = 0, emaxE = 0;
  for (let e = 0; e < g.nElem; e++) {
    const mi = g.mat[g.elem[e]] - 1, ep = mats[mi].kx;
    const E = Math.hypot(gr[3 * e], gr[3 * e + 1], gr[3 * e + 2]);
    Eel[e] = E; W += 0.5 * EPS0 * ep * E * E * g.h ** 3;
    const isAir = mi === P.air || ep >= 1 && (P.mats[mi].sigma ?? 0) <= 1e4;
    if (isAir && E > Emax) { Emax = E; emaxE = e; }
  }
  const vals = conductors.map((c) => c.v), dV = Math.max(...vals) - Math.min(...vals);
  const Cap = dV > 0 ? (2 * W) / (dV * dV) : NaN;
  const r = baseResult(P, 'electrostatic', 'Trilinear hexahedral (Laplace / Poisson)', t0);
  r.mesh.dof = r.mesh.nodes;
  const Ef = nodalAverage(g, Eel, 1);
  // E-field inside conductors is zero: blank it so the surface of the conductor shows the surface field from the air side
  r.fields = [makeField('V', 'Electric potential', 'V', 'node', Float32Array.from(V), { domain: 'fluid' }), makeField('E', 'Electric field magnitude', 'V/mm', 'node', Ef, { domain: 'fluid' })];
  r.defaultField = 'E';
  const vv = g.elem[emaxE], k = Math.floor(vv / (g.nx * g.ny)), rr = vv - k * g.nx * g.ny, j = Math.floor(rr / g.nx), i = rr - j * g.nx;
  r.hotspots = [{ x: g.ox + (i + 0.5) * g.h, y: g.oy + (j + 0.5) * g.h, z: g.oz + (k + 0.5) * g.h, value: Emax, label: 'Strongest field', fieldId: 'E' }];
  r.kv.push({ label: 'Maximum field in the medium', value: `${fmt(Emax / 1000)} kV/mm`, status: Emax <= Eb ? 'ok' : 'fail' });
  r.kv.push({ label: 'Potential difference', value: `${fmt(dV)} V` });
  r.kv.push({ label: 'Stored energy', value: `${fmt(W * 1e3)} mJ` });
  if (Number.isFinite(Cap)) r.kv.push({ label: 'Capacitance (2W/ΔV², outer box grounded)', value: `${fmt(Cap * 1e12)} pF` });
  r.checks.push({ name: 'Field strength vs. breakdown', value: `${fmt(Emax / 1000)} kV/mm`, limit: `≤ ${fmt(Eb / 1000)} kV/mm`, ok: Emax <= Eb, note: 'The grid resolves sharp edges poorly: the real edge field is higher than the grid value.' });
  r.verdict = { pass: Emax <= Eb, text: Emax <= Eb ? `PASS: the highest field ${fmt(Emax / 1000)} kV/mm is below the breakdown value ${fmt(Eb / 1000)} kV/mm.` : `FAIL: the field ${fmt(Emax / 1000)} kV/mm exceeds the breakdown value ${fmt(Eb / 1000)} kV/mm (discharge likely).` };
  r.solver = { name: 'Multigrid PCG (Laplace equation)', iterations: s.info.iterations, residual: s.info.residual, time: Date.now() - t0, log: [`${s.info.iterations} iterations, residual ${s.info.residual.toExponential(1)}`] };
  r.mesh.time = Date.now() - t0;
  r.inputs.push({ label: 'Bodies', value: P.input.bodies.map((b) => `${b.name}: ${b.mat.name}`).join('; ') });
  for (const x of info) r.inputs.push({ label: x.label, value: x.text });
  r.notes.push(`Air margin ${margin} × the part size on every side, outer boundary grounded.`);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Magnetostatics (reduced scalar potential)

const CORN: [number, number, number][] = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];

function biotSavart(coils: { c: [number, number, number]; ax: [number, number, number]; r: number; ni: number }[], x: number, y: number, z: number): [number, number, number] {
  let hx = 0, hy = 0, hz = 0;
  for (const cl of coils) {
    const a = cl.ax, ref = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = a[1] * ref[2] - a[2] * ref[1], uy = a[2] * ref[0] - a[0] * ref[2], uz = a[0] * ref[1] - a[1] * ref[0];
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = a[1] * uz - a[2] * uy, vy = a[2] * ux - a[0] * uz, vz = a[0] * uy - a[1] * ux;
    const seg = 72;
    for (let s = 0; s < seg; s++) {
      const t0 = (2 * Math.PI * s) / seg, t1 = (2 * Math.PI * (s + 1)) / seg, tm = 0.5 * (t0 + t1);
      const p0 = [cl.c[0] + cl.r * (Math.cos(t0) * ux + Math.sin(t0) * vx), cl.c[1] + cl.r * (Math.cos(t0) * uy + Math.sin(t0) * vy), cl.c[2] + cl.r * (Math.cos(t0) * uz + Math.sin(t0) * vz)];
      const p1 = [cl.c[0] + cl.r * (Math.cos(t1) * ux + Math.sin(t1) * vx), cl.c[1] + cl.r * (Math.cos(t1) * uy + Math.sin(t1) * vy), cl.c[2] + cl.r * (Math.cos(t1) * uz + Math.sin(t1) * vz)];
      const pm = [cl.c[0] + cl.r * (Math.cos(tm) * ux + Math.sin(tm) * vx), cl.c[1] + cl.r * (Math.cos(tm) * uy + Math.sin(tm) * vy), cl.c[2] + cl.r * (Math.cos(tm) * uz + Math.sin(tm) * vz)];
      const dl = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const R = [x - pm[0], y - pm[1], z - pm[2]];
      const R3 = Math.pow(Math.hypot(R[0], R[1], R[2]) + 1e-9 * cl.r, 3);
      // dl × (r − r')... H = I/(4π) ∮ dl × R / R³ with R = r − r'
      const cx = dl[1] * R[2] - dl[2] * R[1], cy = dl[2] * R[0] - dl[0] * R[2], cz = dl[0] * R[1] - dl[1] * R[0];
      const k = cl.ni / (4 * Math.PI * R3);
      hx += k * cx; hy += k * cy; hz += k * cz;
    }
  }
  return [hx, hy, hz];                      // A/mm
}

export function runMagnetostatic(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const margin = numP(input, 'margin', 1);
  env.progress(0.03, 'Voxelising the model and the air box');
  const P = prepare(input, { airMargin: margin, maxCells: 1_400_000 });
  const g = P.g, nn = nNodes(g);
  const coils = P.input.loads.filter((l) => l.on && l.type === 'coil').map((l) => { const a = [l.p.ax ?? 0, l.p.ay ?? 0, l.p.az ?? 1], n = Math.hypot(a[0], a[1], a[2]) || 1; return { c: [l.p.cx ?? 0, l.p.cy ?? 0, l.p.cz ?? 0] as [number, number, number], ax: [a[0] / n, a[1] / n, a[2] / n] as [number, number, number], r: l.p.r ?? 20, ni: l.p.ni ?? 0 }; });
  const magnets = P.input.bodies.filter((b) => b.magnet && b.role === 'solid');
  if (!coils.length && !magnets.length) throw new Error('Add a Coil load or mark a body as a permanent magnet.');
  const mur = P.mats.map((m, i) => (i === P.air ? 1 : m.mur ?? 1));
  const mats: ScalarMaterial[] = mur.map((u) => ({ kx: u, ky: u, kz: u }));
  const em = new ScalarModel(g, mats);
  const fixed = new Uint8Array(nn), value = new Float64Array(nn);
  const sx = g.nx + 1, sy = g.ny + 1;
  for (let k = 0; k <= g.nz; k++) for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) if (i === 0 || j === 0 || k === 0 || i === g.nx || j === g.ny || k === g.nz) fixed[i + sx * (j + sy * k)] = 1;
  // source vector b_a = Σ_e V_e ((μ−1) Hs + M)·∇N_a
  env.progress(0.1, 'Evaluating the coil field (Biot–Savart)');
  const b = new Float64Array(nn), Hs = new Float32Array(3 * g.nElem), Mv = new Float32Array(3 * g.nElem);
  const magOf = new Map<number, { dir: [number, number, number]; Br: number }>();
  for (const bd of magnets) { const mi = P.matOf.get(bd.id); if (mi !== undefined) magOf.set(mi, { dir: bd.magnet!, Br: P.mats[mi].Br ?? 1.2 }); }
  const nxy = g.nx * g.ny, V = g.h ** 3, base = em.base, off = em.off;
  for (let e = 0; e < g.nElem; e++) {
    const v = g.elem[e], k = Math.floor(v / nxy), rr = v - k * nxy, j = Math.floor(rr / g.nx), i = rr - j * g.nx;
    const h = coils.length ? biotSavart(coils, g.ox + (i + 0.5) * g.h, g.oy + (j + 0.5) * g.h, g.oz + (k + 0.5) * g.h) : [0, 0, 0];
    Hs[3 * e] = h[0]; Hs[3 * e + 1] = h[1]; Hs[3 * e + 2] = h[2];
    const mi = g.mat[v] - 1, u = mur[mi], mg = magOf.get(mi);
    const M = mg ? [mg.dir[0] * mg.Br / (MU0 * 1000), mg.dir[1] * mg.Br / (MU0 * 1000), mg.dir[2] * mg.Br / (MU0 * 1000)] : [0, 0, 0];     // A/mm
    Mv[3 * e] = M[0]; Mv[3 * e + 1] = M[1]; Mv[3 * e + 2] = M[2];
    const sx2 = (u - 1) * h[0] + M[0], sy2 = (u - 1) * h[1] + M[1], sz2 = (u - 1) * h[2] + M[2];       // ∇·Hs = 0, so only (μ−1)Hs and M act as sources
    for (let a = 0; a < 8; a++) b[base[e] + off[a]] += V * (sx2 * CORN[a][0] + sy2 * CORN[a][1] + sz2 * CORN[a][2]) / (4 * g.h);
  }
  em.build(fixed, null);
  const s = em.solve(b, fixed, value, null, 1e-9, 600, (it, res) => env.progress(0.3 + 0.5 * Math.min(1, -Math.log10(Math.max(res, 1e-12)) / 9), `Scalar potential: iteration ${it}`));
  const gr = em.gradient(s.u);
  const Bel = new Float32Array(g.nElem), Bx = new Float32Array(g.nElem), By = new Float32Array(g.nElem), Bz = new Float32Array(g.nElem);
  let Wm = 0, Bmax = 0, bIron = 0, eb = 0;
  for (let e = 0; e < g.nElem; e++) {
    const mi = g.mat[g.elem[e]] - 1, u = mur[mi];
    const hx = Hs[3 * e] - gr[3 * e], hy = Hs[3 * e + 1] - gr[3 * e + 1], hz = Hs[3 * e + 2] - gr[3 * e + 2];
    const bx = MU0 * 1000 * (u * hx + Mv[3 * e]), by = MU0 * 1000 * (u * hy + Mv[3 * e + 1]), bz = MU0 * 1000 * (u * hz + Mv[3 * e + 2]);
    Bx[e] = bx; By[e] = by; Bz[e] = bz;
    const bm = Math.hypot(bx, by, bz); Bel[e] = bm;
    Wm += 0.5 * (bm * bm) / (MU0 * u) * 1e-9 * V;                            // J  (B²/2μ · V[m³])
    if (mi !== P.air && bm > Bmax) { Bmax = bm; eb = e; }
    if (u > 100 && bm > bIron) bIron = bm;
  }
  const eOf = new Int32Array(g.nx * g.ny * g.nz).fill(-1);
  for (let e = 0; e < g.nElem; e++) eOf[g.elem[e]] = e;
  const centreB = coils.map((c) => { const i = Math.floor((c.c[0] - g.ox) / g.h), j = Math.floor((c.c[1] - g.oy) / g.h), k = Math.floor((c.c[2] - g.oz) / g.h); const e = i >= 0 && j >= 0 && k >= 0 && i < g.nx && j < g.ny && k < g.nz ? eOf[(k * g.ny + j) * g.nx + i] : -1; return e >= 0 ? Bel[e] : NaN; });
  if (Bmax === 0) for (let e = 0; e < g.nElem; e++) if (Bel[e] > Bmax) { Bmax = Bel[e]; eb = e; }
  const Itot = coils.reduce((sum, c) => sum + c.ni, 0);
  const L = Itot ? (2 * Wm) / (Itot * Itot) : NaN;
  const r = baseResult(P, 'magnetostatic', 'Trilinear hexahedral (reduced scalar potential)', t0);
  r.mesh.dof = r.mesh.nodes;
  r.fields = [makeField('B', 'Flux density magnitude', 'T', 'node', nodalAverage(g, Bel, 1), { domain: 'fluid' }), makeField('Bx', 'Flux density X', 'T', 'node', nodalAverage(g, Bx, 1), { domain: 'fluid', diverging: true }), makeField('By', 'Flux density Y', 'T', 'node', nodalAverage(g, By, 1), { domain: 'fluid', diverging: true }), makeField('Bz', 'Flux density Z', 'T', 'node', nodalAverage(g, Bz, 1), { domain: 'fluid', diverging: true })];
  r.defaultField = 'B';
  const vv = g.elem[eb], k = Math.floor(vv / (g.nx * g.ny)), rr = vv - k * g.nx * g.ny, j = Math.floor(rr / g.nx), i = rr - j * g.nx;
  r.hotspots = [{ x: g.ox + (i + 0.5) * g.h, y: g.oy + (j + 0.5) * g.h, z: g.oz + (k + 0.5) * g.h, value: Bmax, label: 'Strongest field', fieldId: 'B' }];
  r.kv.push({ label: 'Maximum flux density in the bodies', value: `${fmt(Bmax)} T`, status: 'info' });
  centreB.forEach((b2, n) => { if (Number.isFinite(b2)) r.kv.push({ label: `Flux density at the centre of coil ${n + 1}`, value: `${fmt(b2)} T` }); });
  if (bIron > 0) r.kv.push({ label: 'Maximum flux density in iron', value: `${fmt(bIron)} T`, status: bIron > 1.6 ? 'fail' : 'ok' });
  r.kv.push({ label: 'Magnetic energy', value: `${fmt(Wm * 1e3)} mJ` });
  if (Number.isFinite(L)) r.kv.push({ label: 'Inductance', value: `${fmt(L * 1e6)} µH` });
  if (boolP(input, 'sat') && bIron > 0) {
    r.checks.push({ name: 'Iron saturation (linear model)', value: `${fmt(bIron)} T`, limit: '≤ 1.6 T', ok: bIron <= 1.6, note: 'Above about 1.6 T the linear permeability overestimates the flux.' });
    r.verdict = { pass: bIron <= 1.6, text: bIron <= 1.6 ? `PASS: flux density in the iron stays below the saturation level (${fmt(bIron)} T).` : `FAIL: iron operates at ${fmt(bIron)} T; saturation limits the real flux and the linear result is optimistic.` };
  } else r.verdict = { pass: null, text: `Peak flux density ${fmt(Bmax)} T.` };
  r.solver = { name: 'Multigrid PCG (reduced scalar potential)', iterations: s.info.iterations, residual: s.info.residual, time: Date.now() - t0, log: [`${s.info.iterations} iterations; ${coils.length} coil(s), ${magnets.length} magnet(s)`] };
  r.mesh.time = Date.now() - t0;
  r.inputs.push({ label: 'Bodies', value: P.input.bodies.map((b) => `${b.name}: ${b.mat.name}`).join('; ') });
  coils.forEach((c, n) => r.inputs.push({ label: `Coil ${n + 1}`, value: `${c.ni} A·turn, radius ${c.r} mm at (${c.c.join(', ')})` }));
  void maxima; void MGOperator; void faceNodesOf; void requireSupports;
  return r;
}

export { tempStats };
export type { Material };
