// Civil and infrastructure analyses: seismic response (spectrum and ground-motion history), bridges (dead, traffic and wind) and retaining walls.

import { addMeshAndSolver, bodyTable, describeInputs, dispScaleFor, numP, strP } from './an_static';
import { effMass, magnitude, modalCore, modalForce, sampleNodes, setupStruct, superpose, unitDisp, type Modal } from './an_modal';
import { baseResult, critOf, fmt, structPost, type Env } from './base';
import { G_ACC, ElasticModel, addPressure, newBC, type StructBC } from './fem';
import { buildStructLoads, faceNodesOf, requireSupports } from './loads';
import { failureIndex, invariants, type Axis } from './materials';
import { makeField, type CaseInput, type Result, type Series } from './model';
import { faceCenter, prepare, boxSize, type Prep } from './prepare';
import { FACE_NORMAL, nNodes, nodeXYZ, solidBox, type SurfFace } from './voxel';
import { amax, amin } from './util';

const TWO_PI = 2 * Math.PI;
const G = 9806.65;                      // mm/s²

const axisOf = (s: string): 0 | 1 | 2 => (s === 'y' ? 1 : s === 'z' ? 2 : 0);

// ---------------------------------------------------------------------------------------------
// Seismic input

interface SiteClass { S: number; TB: number; TC: number; TD: number; wg: number }
const SITES: Record<string, SiteClass> = {
  A: { S: 1.0, TB: 0.15, TC: 0.4, TD: 2.0, wg: 30 }, B: { S: 1.2, TB: 0.15, TC: 0.5, TD: 2.0, wg: 24 }, C: { S: 1.15, TB: 0.2, TC: 0.6, TD: 2.0, wg: 18 },
  D: { S: 1.35, TB: 0.2, TC: 0.8, TD: 2.0, wg: 14 }, E: { S: 1.4, TB: 0.15, TC: 0.5, TD: 2.0, wg: 9 },
};

/** Elastic response spectrum Sa(T) in g (generic EC8 type 1 shape scaled to the PGA), with the damping correction. */
export function spectrumSa(T: number, pga: number, site: string, zeta: number): number {
  const s = SITES[site] ?? SITES.C, eta = Math.max(0.55, Math.sqrt(10 / (5 + 100 * zeta)));
  const ag = pga;
  if (T <= s.TB) return ag * s.S * (1 + (T / s.TB) * (2.5 * eta - 1));
  if (T <= s.TC) return ag * s.S * eta * 2.5;
  if (T <= s.TD) return ag * s.S * eta * 2.5 * (s.TC / T);
  return ag * s.S * eta * 2.5 * ((s.TC * s.TD) / (T * T));
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Synthetic accelerogram (g): Kanai–Tajimi spectrum, random phases, Jennings envelope, scaled to the PGA. */
export function accelerogram(pga: number, site: string, dur: number, dt: number, seed: number): Float64Array {
  const s = SITES[site] ?? SITES.C, rnd = mulberry(seed), n = Math.ceil(dur / dt) + 1;
  const wg = s.wg, zg = 0.6, nc = 360, w0 = TWO_PI * 0.4, w1 = TWO_PI * 40, dw = (w1 - w0) / nc;
  const amp = new Float64Array(nc), ph = new Float64Array(nc), ws = new Float64Array(nc);
  for (let k = 0; k < nc; k++) {
    const w = w0 + (k + 0.5) * dw, num = wg ** 4 + 4 * zg * zg * wg * wg * w * w, den = (wg * wg - w * w) ** 2 + 4 * zg * zg * wg * wg * w * w;
    // high-pass filter removes the very low frequencies
    const hp = (w * w * w * w) / ((w * w - (TWO_PI * 0.3) ** 2) ** 2 + (w * w * 2) ** 2 + 1e-9);
    amp[k] = Math.sqrt(2 * (num / den) * Math.min(1, hp) * dw); ph[k] = rnd() * TWO_PI; ws[k] = w;
  }
  const a = new Float64Array(n), t1 = 0.12 * dur, t2 = 0.55 * dur, c = Math.log(20) / (dur - t2);
  let pk = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt, env = t < t1 ? (t / t1) ** 2 : t < t2 ? 1 : Math.exp(-c * (t - t2));
    let v = 0; for (let k = 0; k < nc; k++) v += amp[k] * Math.cos(ws[k] * t + ph[k]);
    a[i] = v * env; if (Math.abs(a[i]) > pk) pk = Math.abs(a[i]);
  }
  const sc = pk > 0 ? pga / pk : 0;
  for (let i = 0; i < n; i++) a[i] *= sc;
  return a;
}

/** Peak SDOF displacement (Newmark average acceleration) under base acceleration a (g) */
function sdofPeak(a: Float64Array, dt: number, T: number, zeta: number): number {
  const w = TWO_PI / T, c = 2 * zeta * w, w2 = w * w;
  let q = 0, v = 0, ac = -a[0] * G, pk = 0;
  for (let i = 1; i < a.length; i++) {
    const p = -a[i] * G;
    const rhs = p - c * (v + 0.5 * dt * ac) - w2 * (q + dt * v + 0.25 * dt * dt * ac);
    const an = rhs / (1 + 0.5 * dt * c + 0.25 * dt * dt * w2);
    const vn = v + 0.5 * dt * (ac + an), qn = q + dt * v + 0.25 * dt * dt * (ac + an);
    ac = an; v = vn; q = qn; if (Math.abs(q) > pk) pk = Math.abs(q);
  }
  return pk;
}

const cqcRho = (wi: number, wj: number, z: number): number => {
  const r = wj / wi;
  return (8 * z * z * (1 + r) * Math.pow(r, 1.5)) / ((1 - r * r) ** 2 + 4 * z * z * r * (1 + r) ** 2);
};

// ---------------------------------------------------------------------------------------------

export function runSeismic(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const nModes = Math.round(numP(input, 'nModes', 12)), zeta = numP(input, 'zeta', 0.05), pga = numP(input, 'pga', 0.3), Rf = numP(input, 'R', 1), site = strP(input, 'soil', 'C'), target = numP(input, 'fosTarget', 1.5);
  const dirAx = axisOf(strP(input, 'dir', 'x')), method = strP(input, 'method', 'spectrum');
  const { P, model, sl } = setupStruct(input, env, { skip: ['force', 'torque', 'pressure', 'gravity', 'centrifugal'], needSupport: true, what: 'A seismic analysis', maxElems: 20000 });
  env.progress(0.08, `Building the solver (${P.g.nElem.toLocaleString()} elements)`);
  const md = modalCore(P, model, sl, nModes, env);
  if (!md.f.length) throw new Error('No modes were found.');
  const nm = md.f.length, nn = md.nn, g = P.g, mass = model.totalMass();
  const r = baseResult(P, 'seismic', strP(input, 'elem') === 'tet' ? 'Tetrahedral (split voxels)' : 'Hexahedral 8-node', t0);
  r.mesh.dof = 3 * r.mesh.nodes;
  r.solver = { name: 'Modal analysis + ' + (method === 'spectrum' ? 'response spectrum (CQC)' : 'time history'), iterations: md.iterations, time: Date.now() - t0, log: [`${nm} modes, f₁ = ${fmt(md.f[0], 5)} Hz … f_n = ${fmt(md.f[nm - 1], 5)} Hz`] };
  // participation in the ground-motion direction
  const gam = new Float64Array(nm), meff = new Float64Array(nm);
  for (let i = 0; i < nm; i++) { let s = 0; for (let n = 0; n < nn; n++) s += md.M[3 * n + dirAx] * md.phi[i][3 * n + dirAx]; gam[i] = s; meff[i] = s * s; }
  const cum = meff.reduce((a, b) => a + b, 0) / mass;
  const per = md.f.map((f) => 1 / f);
  const spec = (T: number) => spectrumSa(T, pga, site, zeta) / Math.max(1, Rf);
  let u: Float64Array, sig: Float32Array, tableRows: (string | number)[][] = [], base = 0, extraKv: { label: string; value: string; status?: 'ok' | 'warn' | 'fail' | 'info' }[] = [];
  const Wt = mass * G;      // weight (N)
  if (method === 'spectrum') {
    env.progress(0.82, 'Combining the modal responses (CQC)');
    const ud: Float64Array[] = [], Sd: number[] = [], Sa: number[] = [];
    for (let i = 0; i < nm; i++) {
      const sa = spec(per[i]) * G, w2 = md.w2[i];
      Sa.push(sa / G); Sd.push(sa / w2);
      ud.push(md.phi[i].map((x) => x * gam[i] * (sa / w2)) as Float64Array);
    }
    const rho: number[][] = md.f.map((fi, i) => md.f.map((fj, j) => (i === j ? 1 : cqcRho(TWO_PI * fi, TWO_PI * fj, zeta))));
    const nU = 3 * nn;
    u = new Float64Array(nU);
    for (let k = 0; k < nU; k++) { let s = 0; for (let i = 0; i < nm; i++) { const a = ud[i][k]; if (a === 0) continue; for (let j = 0; j < nm; j++) s += rho[i][j] * a * ud[j][k]; } u[k] = Math.sqrt(Math.max(0, s)); }
    // stresses: CQC of the signed per-mode stress components
    const sm = ud.map((d) => model.elementStress(d));
    const ne = g.nElem;
    sig = new Float32Array(6 * ne);
    for (let k = 0; k < 6 * ne; k++) { let s = 0; for (let i = 0; i < nm; i++) { const a = sm[i][k]; if (a === 0) continue; for (let j = 0; j < nm; j++) s += rho[i][j] * a * sm[j][k]; } sig[k] = Math.sqrt(Math.max(0, s)); }
    // base shear
    const Vi = meff.map((m, i) => m * Sa[i] * G);
    let v2 = 0; for (let i = 0; i < nm; i++) for (let j = 0; j < nm; j++) v2 += rho[i][j] * Vi[i] * Vi[j];
    base = Math.sqrt(v2);
    tableRows = md.f.map((f, i) => [i + 1, fmt(f, 4), fmt(per[i], 4), fmt(Sa[i], 3), fmt(gam[i], 3), (100 * meff[i] / mass).toFixed(1), fmt(Vi[i] / 1000, 3), fmt(Sd[i], 3)]);
    const curveT: number[] = [], curveS: number[] = [], curveD: number[] = [];
    for (let k = 0; k < 120; k++) { const T = 0.02 * Math.pow(4 / 0.02, k / 119); curveT.push(T); curveS.push(spectrumSa(T, pga, site, zeta)); curveD.push(spec(T)); }
    r.curves.push({ id: 'spec', title: 'Response spectrum (5 % generic shape scaled to the PGA)', xlabel: 'Period (s)', ylabel: 'Spectral acceleration (g)', logx: true, series: [{ name: 'Elastic', x: curveT, y: curveS }, ...(Rf > 1 ? [{ name: `Design (R = ${Rf})`, x: curveT, y: curveD }] : [])], marks: per.map((T, i) => ({ x: T, label: `${i + 1}` })) });
    extraKv = [{ label: 'Base shear (CQC)', value: `${fmt(base / 1000)} kN (${(100 * base / Wt).toFixed(1)} % of weight)`, status: 'info' }];
    r.tables.push({ id: 'modes', title: 'Modal response-spectrum analysis', cols: ['Mode', 'f (Hz)', 'T (s)', 'Sa (g)', 'Γ', 'Eff. mass (%)', 'Base shear (kN)', 'Sd (mm)'], rows: tableRows });
  } else {
    // time history through modal superposition
    const dur = numP(input, 'dur', 20), seed = Math.round(numP(input, 'seed', 1));
    const dt = 0.005;
    env.progress(0.82, 'Generating the ground motion');
    const ag = accelerogram(pga / Math.max(1, Rf) * 1, site, dur, dt, seed);
    const steps = ag.length - 1;
    const q = Array.from({ length: nm }, () => new Float64Array(steps + 1));
    for (let i = 0; i < nm; i++) {
      const w = Math.sqrt(md.w2[i]), c = 2 * zeta * w, w2 = md.w2[i];
      let x = 0, v = 0, a = -gam[i] * ag[0] * G;
      for (let s = 0; s < steps; s++) {
        const pn = -gam[i] * ag[s + 1] * G;
        const rhs = pn - c * (v + 0.5 * dt * a) - w2 * (x + dt * v + 0.25 * dt * dt * a);
        const an = rhs / (1 + 0.5 * dt * c + 0.25 * dt * dt * w2);
        const vn = v + 0.5 * dt * (a + an), xn = x + dt * v + 0.25 * dt * dt * (a + an);
        a = an; v = vn; x = xn; q[i][s + 1] = x;
      }
    }
    const samp = sampleNodes(md, 900);
    let best = 0, bestS = 0;
    const hist: number[] = [], th: number[] = [];
    const every = Math.max(1, Math.floor(steps / 1000));
    for (let s = 0; s <= steps; s += 1) {
      let m = 0;
      for (const n of samp) { let sq = 0; for (let c = 0; c < 3; c++) { let uu = 0; for (let i = 0; i < nm; i++) uu += md.phi[i][3 * n + c] * q[i][s]; sq += uu * uu; } if (sq > m) m = sq; }
      const val = Math.sqrt(m);
      if (s % every === 0) { th.push(s * dt); hist.push(val); }
      if (val > best) { best = val; bestS = s; }
    }
    const qb = Float64Array.from({ length: nm }, (_, i) => q[i][bestS]);
    u = superpose(md, qb);
    sig = model.elementStress(u);
    // base shear history from the effective modal mass
    let vmax = 0;
    for (let s = 0; s <= steps; s += 2) { let acc = 0; for (let i = 0; i < nm; i++) acc += gam[i] * (-md.w2[i] * q[i][s]) ; vmax = Math.max(vmax, Math.abs(acc)); }
    base = vmax;
    r.curves.push({ id: 'ag', title: 'Synthetic ground acceleration', xlabel: 'Time (s)', ylabel: 'Acceleration (g)', series: [{ name: 'a(t)', x: Array.from({ length: Math.min(steps + 1, 1000) }, (_, k) => +(k * (steps / Math.min(steps, 999)) * dt).toFixed(4)), y: Array.from({ length: Math.min(steps + 1, 1000) }, (_, k) => ag[Math.round(k * (steps / Math.min(steps, 999)))]) }] });
    r.curves.push({ id: 'resp', title: 'Peak displacement history', xlabel: 'Time (s)', ylabel: 'Displacement (mm)', series: [{ name: 'Peak nodal displacement', x: th, y: hist }], marks: [{ x: bestS * dt, label: 'peak' }] });
    // response spectrum of the record against the target
    const Ts: number[] = [], rs: number[] = [], tg: number[] = [];
    for (let k = 0; k < 28; k++) { const T = 0.05 * Math.pow(3 / 0.05, k / 27); Ts.push(T); rs.push(sdofPeak(ag, dt, T, zeta) * Math.pow(TWO_PI / T, 2) / G); tg.push(spec(T)); }
    r.curves.push({ id: 'rs', title: 'Record spectrum against the target spectrum', xlabel: 'Period (s)', ylabel: 'Spectral acceleration (g)', logx: true, series: [{ name: 'Synthetic record', x: Ts, y: rs }, { name: 'Target', x: Ts, y: tg }] });
    // animation
    const nF = Math.min(24, Math.max(8, Math.floor(2e7 / (12 * nn))));
    const i0 = Math.max(0, bestS - Math.floor(1.2 / dt)), i1 = Math.min(steps, bestS + Math.floor(0.6 / dt));
    for (let k = 0; k < nF; k++) {
      const s = Math.round(i0 + ((i1 - i0) * k) / (nF - 1));
      const d = superpose(md, Float64Array.from({ length: nm }, (_, i) => q[i][s]));
      r.frames.push({ label: `t = ${(s * dt).toFixed(2)} s`, t: s * dt, disp: Float32Array.from(d) });
    }
    extraKv = [{ label: 'Peak base shear (history)', value: `${fmt(base / 1000)} kN (${(100 * base / Wt).toFixed(1)} % of weight)`, status: 'info' }, { label: 'Time of peak response', value: `${(bestS * dt).toFixed(2)} s` }];
    r.tables.push({ id: 'modes', title: 'Modes used', cols: ['Mode', 'f (Hz)', 'T (s)', 'Γ', 'Eff. mass (%)'], rows: md.f.map((f, i) => [i + 1, fmt(f, 4), fmt(per[i], 4), fmt(gam[i], 3), (100 * meff[i] / mass).toFixed(1)]) });
    r.notes.push('Stresses and displacements are shown at the instant of peak displacement.');
  }
  const post = structPost(P, model, u, sig, strP(input, 'criterion', 'auto'));
  r.fields = post.fields.filter((f) => f.id !== 'strain' && f.id !== 'sed');
  r.defaultField = 'vm';
  r.disp = method === 'spectrum' ? null : Float32Array.from(u);
  r.dispScale = dispScaleFor(P, post.maxDisp);
  r.hotspots = post.hotspots;
  r.modes = md.f.slice(0, 8).map((f, i) => ({ label: `Mode ${i + 1}: ${fmt(f, 4)} Hz (${(100 * meff[i] / mass).toFixed(0)} % mass)`, freq: f, disp: unitDisp(md.phi[i]) }));
  if (method === 'spectrum') r.notes.push('Response-spectrum results are maxima combined by CQC: displacement and stress fields are unsigned envelopes and do not occur together at one instant; the deformed shape is therefore not animated (see the mode shapes).');
  r.kv.push({ label: 'Fundamental frequency', value: `${fmt(md.f[0], 4)} Hz (T = ${fmt(per[0], 3)} s)`, status: 'info' });
  r.kv.push({ label: 'Peak ground acceleration', value: `${pga} g, site class ${site}, R = ${Rf}` });
  for (const k of extraKv) r.kv.push(k);
  r.kv.push({ label: 'Maximum displacement', value: `${fmt(post.maxDisp)} mm`, status: 'info' });
  r.kv.push({ label: 'Maximum von Mises stress', value: `${fmt(post.maxVm)} MPa` });
  r.kv.push({ label: 'Minimum factor of safety', value: fmt(post.minFos, 3), status: post.minFos >= target ? 'ok' : post.minFos >= 1 ? 'warn' : 'fail' });
  r.kv.push({ label: 'Effective mass captured', value: `${(100 * cum).toFixed(0)} % in direction ${'XYZ'[dirAx]}`, status: cum >= 0.9 ? 'ok' : 'warn' });
  r.checks.push({ name: 'Factor of safety under the seismic action', value: fmt(post.minFos, 3), limit: `≥ ${target}`, ok: post.minFos >= target });
  r.checks.push({ name: 'Mass participation (≥ 90 %)', value: `${(100 * cum).toFixed(0)} %`, limit: '≥ 90 %', ok: cum >= 0.9, note: cum < 0.9 ? 'Increase the number of modes so that at least 90 % of the mass participates; results may be non-conservative.' : undefined });
  r.tables.push(bodyTable(P, { post, model }));
  describeInputs(r, P, sl);
  r.verdict = { pass: post.minFos >= target, text: post.minFos >= target ? `PASS: minimum safety factor ${fmt(post.minFos, 3)} under ${pga} g (${method === 'spectrum' ? 'response spectrum' : 'time history'}).` : `FAIL: minimum safety factor ${fmt(post.minFos, 3)} is below ${target} under ${pga} g.` };
  r.solver.time = Date.now() - t0;
  return r;
}

// ---------------------------------------------------------------------------------------------
// Bridge

/** A face is exposed to the wind if nothing solid lies upwind of it (the ray along -dir hits no solid cell). */
function exposedFace(P: Prep, f: SurfFace, axis: 0 | 1): boolean {
  const g = P.g, nxy = g.nx * g.ny, k = Math.floor(f.vox / nxy), r = f.vox - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
  let a = i, b = j;
  const step = -1;                                   // wind comes from -axis, blowing toward +axis
  for (;;) {
    if (axis === 0) a += step; else b += step;
    if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) return true;
    if (g.mat[(k * g.ny + b) * g.nx + a]) return false;
  }
}

export function runBridge(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const spanAx = axisOf(strP(input, 'span', 'x')), deadf = numP(input, 'deadf', 1), Pk = numP(input, 'P', 100) * 1000, speed = (numP(input, 'speed', 80) * 1e6) / 3600;
  const wind = numP(input, 'wind', 30), Cd = numP(input, 'Cd', 1.3), wAx = strP(input, 'winddir', 'y') === 'x' ? 0 : 1, zeta = numP(input, 'zeta', 0.02), limit = numP(input, 'limit', 800), target = numP(input, 'fosTarget', 1.5);
  const { P, model, sl } = setupStruct(input, env, { skip: ['gravity'], needSupport: true, what: 'A bridge analysis', maxElems: 20000 });
  const g = P.g, nn = nNodes(g);
  env.progress(0.08, `Building the solver (${g.nElem.toLocaleString()} elements)`);
  const md = modalCore(P, model, sl, 10, env);
  if (!md.f.length) throw new Error('No modes were found.');
  const nm = md.f.length;
  // dead load
  const Fdead = Float64Array.from(sl.bc.force);                    // user loads
  const tmp = new Float64Array(3 * nn); model.addAcceleration(tmp, [0, 0, -G_ACC * deadf]);
  for (let i = 0; i < Fdead.length; i++) Fdead[i] += tmp[i];
  // wind
  const q = 0.5 * 1.225 * wind * wind * Cd;                         // Pa
  const Fwind = new Float64Array(3 * nn);
  const wfaces = P.allFaces().filter((f) => f.dir === (wAx === 0 ? 0 : 2) && exposedFace(P, f, wAx));
  if (q > 0 && wfaces.length) addPressure(g, Fwind, wfaces, q * 1e-6);
  const area = wfaces.length * g.h * g.h;
  env.progress(0.82, 'Static solutions (dead, user and wind loads)');
  const bc1: StructBC = { ...sl.bc, force: Fdead }, bc2: StructBC = { ...sl.bc, force: Fwind };
  const u1 = model.solveStatic(bc1, null, 1e-7, 400).u;
  const u2 = q > 0 && wfaces.length ? model.solveStatic(bc2, null, 1e-7, 400).u : new Float64Array(3 * nn);
  // traffic lane
  env.progress(0.88, 'Moving axle (modal superposition)');
  const laneRegion = input.regions.find((r) => /lane|traffic|deck|road/i.test(r.name));
  let lane: SurfFace[] = laneRegion ? P.faces(laneRegion.id).filter((f) => f.dir === 5) : [];
  let laneNote = '';
  if (!lane.length) {
    const top = P.box.max[2];
    lane = P.allFaces().filter((f) => f.dir === 5 && faceCenter(g, f)[2] >= top - 1.5 * g.h);
    laneNote = Pk > 0 ? 'No "Traffic lane" region was found: the axle travels across all top surfaces of the structure.' : '';
  }
  const r = baseResult(P, 'bridge', strP(input, 'elem') === 'tet' ? 'Tetrahedral (split voxels)' : 'Hexahedral 8-node', t0);
  r.mesh.dof = 3 * r.mesh.nodes;
  r.solver = { name: 'Multigrid PCG statics + modal superposition', iterations: md.iterations, time: Date.now() - t0, log: [`${nm} modes, f₁ = ${fmt(md.f[0], 5)} Hz`] };
  const samp = sampleNodes(md, 1200);
  let u3: Float64Array = new Float64Array(3 * nn), daf = 0, dynPeak = 0, quasiPeak = 0, tPeak = 0;
  const modalMat: Float64Array[] = [];
  if (Pk > 0 && lane.length) {
    const laneC = lane.map((f) => faceCenter(g, f)[spanAx]), s0 = amin(laneC), s1 = amax(laneC);
    const nSt = Math.max(2, Math.round((s1 - s0) / g.h) + 1);
    const st: { faces: SurfFace[] }[] = Array.from({ length: nSt }, () => ({ faces: [] }));
    for (const f of lane) { const k = Math.max(0, Math.min(nSt - 1, Math.round((faceCenter(g, f)[spanAx] - s0) / g.h))); st[k].faces.push(f); }
    const stationForce: Float64Array[] = st.map((s) => {
      const out = new Float64Array(nm);
      if (!s.faces.length) return out;
      const per = -Pk / (s.faces.length * 4);
      for (const f of s.faces) for (const nd of faceNodesOf(P, f)) for (let i = 0; i < nm; i++) out[i] += per * md.phi[i][3 * nd + 2];
      return out;
    });
    const Lln = (nSt - 1) * g.h, tCross = Lln / Math.max(speed, 1e-6), T1 = 1 / md.f[0];
    let dt = Math.min(0.35 * g.h / Math.max(speed, 1e-6), 1 / (10 * md.f[nm - 1]) * 4);
    const tEnd = tCross + 1.5 * T1;
    let steps = Math.ceil(tEnd / dt);
    if (steps > 30000) { steps = 30000; dt = tEnd / steps; }
    const pAt = (t: number): Float64Array => {
      const x = (speed * t) / g.h;
      const out = new Float64Array(nm);
      if (x < 0 || x > nSt - 1) return out;
      const a = Math.min(nSt - 2, Math.floor(x)), w = x - a;
      for (let i = 0; i < nm; i++) out[i] = (1 - w) * stationForce[a][i] + w * stationForce[a + 1][i];
      return out;
    };
    const qd = new Float64Array(nm), vd = new Float64Array(nm), ad = new Float64Array(nm);
    let p0 = pAt(0);
    for (let i = 0; i < nm; i++) ad[i] = p0[i];
    const th: number[] = [], yd: number[] = [], ys: number[] = [];
    const every = Math.max(1, Math.floor(steps / 800));
    let bestQ = new Float64Array(nm);
    const sampIdx = Array.from(samp);
    const dispAt = (qv: ArrayLike<number>): number => { let m = 0; for (const n of sampIdx) { let uz = 0; for (let i = 0; i < nm; i++) uz += md.phi[i][3 * n + 2] * qv[i]; if (-uz > m) m = -uz; } return m; };
    const qs = new Float64Array(nm);
    for (let s = 0; s <= steps; s++) {
      const t = s * dt, pn = pAt(t);
      if (s > 0) {
        for (let i = 0; i < nm; i++) {
          const w2 = md.w2[i], w = Math.sqrt(w2), c = 2 * zeta * w;
          const rhs = pn[i] - c * (vd[i] + 0.5 * dt * ad[i]) - w2 * (qd[i] + dt * vd[i] + 0.25 * dt * dt * ad[i]);
          const an = rhs / (1 + 0.5 * dt * c + 0.25 * dt * dt * w2);
          const vn = vd[i] + 0.5 * dt * (ad[i] + an), qn = qd[i] + dt * vd[i] + 0.25 * dt * dt * (ad[i] + an);
          ad[i] = an; vd[i] = vn; qd[i] = qn;
        }
      }
      for (let i = 0; i < nm; i++) qs[i] = pn[i] / md.w2[i];
      if (s % every === 0 || s === steps) {
        const d = dispAt(qd), st1 = dispAt(qs);
        th.push(t); yd.push(d); ys.push(st1);
        if (d > dynPeak) { dynPeak = d; tPeak = t; bestQ = Float64Array.from(qd); }
        if (st1 > quasiPeak) quasiPeak = st1;
      }
      if (s % 2000 === 0) env.progress(0.88 + 0.06 * (s / steps), `Moving axle: ${Math.round((100 * s) / steps)} %`);
    }
    u3 = superpose(md, bestQ);
    daf = quasiPeak > 0 ? dynPeak / quasiPeak : 1;
    r.curves.push({ id: 'traffic', title: 'Deflection under the moving axle (largest of the sampled nodes)', xlabel: 'Time (s)', ylabel: 'Downward deflection (mm)', series: [{ name: 'Dynamic', x: th, y: yd }, { name: 'Quasi-static', x: th, y: ys }] });
    void modalMat;
    // animation of the crossing
    const nF = Math.min(20, Math.max(8, Math.floor(2e7 / (12 * nn))));
    const dtF = tEnd / nF;
    // re-integrate to capture frames
    const q2 = new Float64Array(nm), v2 = new Float64Array(nm), a2 = new Float64Array(nm);
    p0 = pAt(0); for (let i = 0; i < nm; i++) a2[i] = p0[i];
    let nextF = 0;
    for (let s = 0; s <= steps; s++) {
      const t = s * dt, pn = pAt(t);
      if (s > 0) for (let i = 0; i < nm; i++) {
        const w2 = md.w2[i], w = Math.sqrt(w2), c = 2 * zeta * w;
        const rhs = pn[i] - c * (v2[i] + 0.5 * dt * a2[i]) - w2 * (q2[i] + dt * v2[i] + 0.25 * dt * dt * a2[i]);
        const an = rhs / (1 + 0.5 * dt * c + 0.25 * dt * dt * w2);
        const vn = v2[i] + 0.5 * dt * (a2[i] + an), qn = q2[i] + dt * v2[i] + 0.25 * dt * dt * (a2[i] + an);
        a2[i] = an; v2[i] = vn; q2[i] = qn;
      }
      if (t >= nextF * dtF && r.frames.length < nF) { const d = superpose(md, q2); r.frames.push({ label: `t = ${t.toFixed(2)} s, axle at ${(100 * Math.min(1, speed * t / Lln)).toFixed(0)} %`, t, disp: Float32Array.from(d) }); nextF++; }
    }
  }
  // total response at the critical instant
  const u = new Float64Array(3 * nn);
  for (let i = 0; i < u.length; i++) u[i] = u1[i] + u2[i] + u3[i];
  const sig = model.elementStress(u);
  const post = structPost(P, model, u, sig, strP(input, 'criterion', 'auto'));
  r.fields = post.fields.filter((f) => f.id !== 'strain' && f.id !== 'sed');
  const mag = (v: Float64Array) => { const m = new Float32Array(nn); for (let n = 0; n < nn; n++) m[n] = Math.hypot(v[3 * n], v[3 * n + 1], v[3 * n + 2]); return m; };
  r.fields.push(makeField('u_dead', 'Displacement: dead and user loads', 'mm', 'node', mag(u1)));
  if (q > 0 && wfaces.length) r.fields.push(makeField('u_wind', 'Displacement: wind', 'mm', 'node', mag(u2)));
  if (Pk > 0) r.fields.push(makeField('u_live', 'Displacement: moving axle (at the critical instant)', 'mm', 'node', mag(u3)));
  r.defaultField = 'vm';
  r.disp = Float32Array.from(u); r.dispScale = dispScaleFor(P, post.maxDisp);
  r.hotspots = post.hotspots;
  r.modes = md.f.slice(0, 6).map((f, i) => ({ label: `Mode ${i + 1}: ${fmt(f, 4)} Hz`, freq: f, disp: unitDisp(md.phi[i]) }));
  const span = boxSize(P.box)[spanAx];
  let dMax = 0; for (let n = 0; n < nn; n++) { const uz = -u[3 * n + 2]; if (uz > dMax) dMax = uz; }
  const allow = span / limit;
  let latMax = 0; for (let n = 0; n < nn; n++) latMax = Math.max(latMax, Math.abs(u2[3 * n + wAx]));
  r.kv.push({ label: 'Maximum downward deflection', value: `${fmt(dMax)} mm (span/${dMax > 0 ? Math.round(span / dMax) : '∞'})`, status: dMax <= allow ? 'ok' : 'fail' });
  r.kv.push({ label: 'Allowable deflection', value: `${fmt(allow)} mm (span/${limit})` });
  if (Pk > 0) { r.kv.push({ label: 'Traffic: dynamic amplification factor', value: fmt(daf, 3), status: 'info' }); r.kv.push({ label: 'Traffic: peak at', value: `${fmt(tPeak, 3)} s after entry` }); }
  if (q > 0) { r.kv.push({ label: 'Wind: dynamic pressure q = ½ρU²Cd', value: `${fmt(q)} Pa on ${fmt(area / 1e6)} m²`, status: 'info' }); r.kv.push({ label: 'Wind: maximum lateral displacement', value: `${fmt(latMax)} mm` }); }
  r.kv.push({ label: 'Fundamental frequency', value: `${fmt(md.f[0], 4)} Hz`, status: 'info' });
  r.kv.push({ label: 'Maximum von Mises stress', value: `${fmt(post.maxVm)} MPa` });
  r.kv.push({ label: 'Minimum factor of safety', value: fmt(post.minFos, 3), status: post.minFos >= target ? 'ok' : post.minFos >= 1 ? 'warn' : 'fail' });
  r.checks.push({ name: 'Deflection limit', value: `${fmt(dMax)} mm`, limit: `≤ span/${limit} = ${fmt(allow)} mm`, ok: dMax <= allow });
  r.checks.push({ name: 'Factor of safety (dead + live + wind)', value: fmt(post.minFos, 3), limit: `≥ ${target}`, ok: post.minFos >= target });
  r.tables.push({ id: 'cases', title: 'Load cases', cols: ['Case', 'Maximum displacement (mm)', 'Description'], rows: [
    ['Dead and user loads', fmt(amax(mag(u1))), `self-weight ×${deadf} plus applied loads`],
    ...(q > 0 ? [['Wind', fmt(amax(mag(u2))), `${wind} m/s, Cd ${Cd}, from −${'XY'[wAx]}`]] : []),
    ...(Pk > 0 ? [['Moving axle', fmt(amax(mag(u3))), `${numP(input, 'P', 100)} kN at ${numP(input, 'speed', 80)} km/h (critical instant)`]] : []),
  ] });
  r.tables.push(bodyTable(P, { post, model }));
  describeInputs(r, P, sl);
  if (laneNote) r.notes.push(laneNote);
  r.notes.push('The total response combines the dead and applied loads, the wind pressure and the moving axle at the instant of its largest deflection.');
  const ok = dMax <= allow && post.minFos >= target;
  r.verdict = { pass: ok, text: ok ? `PASS: deflection ${fmt(dMax)} mm within span/${limit} and safety factor ${fmt(post.minFos, 3)} ≥ ${target}.` : `FAIL: ${dMax > allow ? `deflection ${fmt(dMax)} mm exceeds span/${limit} (${fmt(allow)} mm)` : ''}${dMax > allow && post.minFos < target ? '; ' : ''}${post.minFos < target ? `safety factor ${fmt(post.minFos, 3)} is below ${target}` : ''}.` };
  r.solver.time = Date.now() - t0;
  return r;
}

// ---------------------------------------------------------------------------------------------
// Retaining wall and soil-structure interaction

/** Coulomb active earth-pressure coefficient for a vertical wall (φ, δ, β in degrees). */
export function coulombKa(phiDeg: number, deltaDeg: number, betaDeg: number): number {
  const p = (phiDeg * Math.PI) / 180, d = (deltaDeg * Math.PI) / 180, b = (betaDeg * Math.PI) / 180;
  const inner = (Math.sin(p + d) * Math.sin(p - b)) / (Math.cos(d) * Math.cos(b));
  return (Math.cos(p) ** 2) / (Math.cos(d) * (1 + Math.sqrt(Math.max(0, inner))) ** 2);
}

export function runRetaining(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const phi = numP(input, 'phi', 32), gammaS = numP(input, 'gammaS', 19), qS = numP(input, 'q', 10), delta = Math.min(numP(input, 'delta', 20), phi), beta = numP(input, 'beta', 0), gw = numP(input, 'gw', 0), mu = numP(input, 'mu', 0.5), qa = numP(input, 'qa', 200), target = numP(input, 'fosTarget', 1.5);
  env.progress(0.03, 'Voxelising the wall and the soil');
  const P = prepare(input, { maxElems: 60000 });
  const g = P.g;
  const isSoil = P.mats.map((m) => m.cat === 'Soil & rock');
  if (!isSoil.some(Boolean)) throw new Error('No soil body found. Give the backfill and foundation bodies a material from the "Soil & rock" group.');
  if (isSoil.every(Boolean)) throw new Error('No wall body found. Add a wall (concrete, masonry or steel) next to the soil.');
  // geometry from the voxel model
  const nxy = g.nx * g.ny;
  const sw = [0, 0, 0], ss = [0, 0, 0]; let nw = 0, ns = 0, wzMin = Infinity, wzMax = -Infinity, szMax = -Infinity;
  const wmin = [Infinity, Infinity], wmax = [-Infinity, -Infinity];
  for (let e = 0; e < g.nElem; e++) {
    const v = g.elem[e], mi = g.mat[v] - 1, k = Math.floor(v / nxy), rr = v - k * nxy, j = Math.floor(rr / g.nx), i = rr - j * g.nx;
    const x = g.ox + (i + 0.5) * g.h, y = g.oy + (j + 0.5) * g.h, z = g.oz + (k + 0.5) * g.h;
    if (isSoil[mi]) { ss[0] += x; ss[1] += y; ss[2] += z; ns++; if (z > szMax) szMax = z; }
    else { sw[0] += x; sw[1] += y; sw[2] += z; nw++; if (z < wzMin) wzMin = z; if (z > wzMax) wzMax = z; if (x < wmin[0]) wmin[0] = x; if (x > wmax[0]) wmax[0] = x; if (y < wmin[1]) wmin[1] = y; if (y > wmax[1]) wmax[1] = y; }
  }
  const cw = sw.map((v) => v / nw), cs = ss.map((v) => v / ns);
  const ax: 0 | 1 = Math.abs(cs[0] - cw[0]) >= Math.abs(cs[1] - cw[1]) ? 0 : 1, sgn = cs[ax] >= cw[ax] ? 1 : -1, lat: 0 | 1 = ax === 0 ? 1 : 0;
  const B = wmax[ax] - wmin[ax] + g.h, Lw = wmax[lat] - wmin[lat] + g.h, Hwall = wzMax - wzMin + g.h;
  const toe = sgn > 0 ? wmin[ax] - g.h / 2 : wmax[ax] + g.h / 2;
  const base = wzMin - g.h / 2;
  const Hp = numP(input, 'H', 0) > 0 ? numP(input, 'H', 0) : Math.max(Hwall, Math.min(szMax + g.h / 2 - base, 1e9));
  // wall weight and soil on the heel
  let Ww = 0, Ws = 0, MwRes = 0, MsRes = 0;
  const cellW = (mi: number) => P.mats[mi].rho * 1e-9 * g.h ** 3 * 9.80665;      // N (rho kg/m³ → kg/mm³ ×1e-9)
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x = [g.ox + (i + 0.5) * g.h, g.oy + (j + 0.5) * g.h][ax], arm = sgn > 0 ? x - toe : toe - x;
    let onWall = false;
    for (let k = 0; k < g.nz; k++) {
      const m1 = g.mat[(k * g.ny + j) * g.nx + i];
      if (!m1) { onWall = false; continue; }
      const mi = m1 - 1;
      if (!isSoil[mi]) { Ww += cellW(mi); MwRes += cellW(mi) * arm; onWall = true; }
      else if (onWall) { Ws += cellW(mi); MsRes += cellW(mi) * arm; }
    }
  }
  const perLen = 1 / Lw;
  const W = Ww * perLen, Wsoil = Ws * perLen, xw = Ww > 0 ? MwRes / Ww : B / 2, xs = Ws > 0 ? MsRes / Ws : B;
  // earth pressure distribution (N/mm² on N/mm length)
  const Ka = coulombKa(phi, delta, beta), gam = gammaS * 1e-6, gw9 = 9.81e-6, dw = Math.max(0, Hp - gw), cd = Math.cos((delta * Math.PI) / 180), sd = Math.sin((delta * Math.PI) / 180);
  const nz = 200, dz = Hp / nz, zs: number[] = [], ph: number[] = [], pv: number[] = [];
  let Ph = 0, Pvert = 0, Mo = 0, Pa = 0, Pw = 0;
  for (let k = 0; k < nz; k++) {
    const z = (k + 0.5) * dz, d = Hp - z;
    const sv = qS * 1e-3 + gam * Math.min(d, dw) + Math.max(0, gam - gw9) * Math.max(0, d - dw);
    const u = gw9 * Math.max(0, d - dw);
    const sh = Ka * cd * sv + u, tv = Ka * sd * sv;
    zs.push(z); ph.push(sh * 1000); pv.push(tv * 1000);
    Ph += sh * dz; Pvert += tv * dz; Mo += sh * dz * z; Pa += Ka * sv * dz; Pw += u * dz;
  }
  const Mres = W * xw + Wsoil * xs + Pvert * B;
  const N = W + Wsoil + Pvert;
  const FSs = Ph > 0 ? (mu * N) / Ph : Infinity, FSo = Mo > 0 ? Mres / Mo : Infinity;
  const xbar = N > 0 ? (Mres - Mo) / N : 0, ecc = B / 2 - xbar;
  const qmax = ecc <= B / 6 ? (N / B) * (1 + (6 * ecc) / B) : (2 * N) / (3 * Math.max(xbar, 1e-6)), qmin = ecc <= B / 6 ? (N / B) * (1 - (6 * ecc) / B) : 0;
  const qmaxKpa = qmax * 1e3, qminKpa = qmin * 1e3;
  // 3-D elastic model
  env.progress(0.12, `Building the soil–structure model (${g.nElem.toLocaleString()} elements)`);
  const model = new ElasticModel(g, P.mats, { tet: strP(input, 'elem') === 'tet', fibre: P.fibre as Axis[] });
  const sl = buildStructLoads(P, model, { selfweight: true });
  let autoSupport = false;
  if (!sl.hasSupport) {
    autoSupport = true;
    const box = solidBox(g), tol = g.h * 0.51;
    const act = new Uint8Array(nn(g));
    for (let e = 0; e < g.nElem; e++) for (let a = 0; a < 8; a++) act[model.base[e] + model.off[a]] = 1;
    for (let n = 0; n < act.length; n++) {
      if (!act[n]) continue;
      const [x, y, z] = nodeXYZ(g, n);
      if (Math.abs(z - box.min[2]) < tol) { sl.bc.fixed[3 * n] = sl.bc.fixed[3 * n + 1] = sl.bc.fixed[3 * n + 2] = 1; continue; }
      if (Math.abs(x - box.min[0]) < tol || Math.abs(x - box.max[0]) < tol) sl.bc.fixed[3 * n] = 1;
      if (Math.abs(y - box.min[1]) < tol || Math.abs(y - box.max[1]) < tol) sl.bc.fixed[3 * n + 1] = 1;
    }
    sl.hasSupport = true; sl.supportNodes = 1;
    sl.info.push({ label: 'Supports (automatic)', text: 'Base fixed; the vertical sides of the model are rollers (normal movement blocked)' });
  }
  requireSupports(sl, 'The soil–structure model');
  // surcharge on the top surface of the soil
  if (qS > 0) {
    const top = P.allFaces().filter((f) => f.dir === 5 && isSoil[g.mat[f.vox] - 1] && faceCenter(g, f)[2] >= szMax - 0.6 * g.h);
    if (top.length) { addPressure(g, sl.bc.force, top, qS * 1e-3); sl.info.push({ label: 'Surcharge', text: `${qS} kPa on ${top.length} faces of the soil surface` }); }
  }
  model.build(sl.bc);
  env.progress(0.2, 'Solving');
  const { u, info } = model.solveStatic(sl.bc, null, 1e-7, 500, (it, res) => env.progress(0.2 + 0.55 * Math.min(1, Math.log10(1 / Math.max(res, 1e-12)) / 7), `Solving: iteration ${it}, residual ${res.toExponential(1)}`));
  env.progress(0.8, 'Recovering stresses');
  const sig = model.elementStress(u);
  const post = structPost(P, model, u, sig, 'auto');
  // separate minimum safety of the wall and of the soil
  let idxWall = 0, idxSoil = 0, soilN = 0, soilFail = 0;
  for (let e = 0; e < g.nElem; e++) { const mi = g.mat[g.elem[e]] - 1; if (isSoil[mi]) { idxSoil = Math.max(idxSoil, post.idxElem[e]); soilN++; if (post.idxElem[e] > 1) soilFail++; } else idxWall = Math.max(idxWall, post.idxElem[e]); }
  const soilFrac = soilN ? soilFail / soilN : 0;
  const fosWall = idxWall > 0 ? 1 / idxWall : Infinity;
  const r = baseResult(P, 'retaining', strP(input, 'elem') === 'tet' ? 'Tetrahedral (split voxels)' : 'Hexahedral 8-node', t0);
  r.mesh.dof = 3 * r.mesh.nodes;
  r.solver = { name: 'Multigrid PCG (soil–structure) + classical limit equilibrium', iterations: info.iterations, residual: info.residual, time: Date.now() - t0, log: [`Multigrid-preconditioned CG, ${info.iterations} iterations, residual ${info.residual.toExponential(2)}`] };
  r.fields = post.fields.filter((f) => f.id !== 'strain' && f.id !== 'sed');
  r.fields.push(makeField('mc', 'Soil mobilisation (Mohr–Coulomb index, 1 = failure)', '', 'node', r.fields.find((f) => f.id === 'idx')!.data, {}));
  r.defaultField = 'fos';
  r.disp = Float32Array.from(u); r.dispScale = dispScaleFor(P, post.maxDisp);
  r.hotspots = post.hotspots;
  const kpa = (v: number) => fmt(v * 1e3);
  r.kv.push({ label: 'Active pressure coefficient Ka (Coulomb)', value: fmt(Ka, 4), status: 'info' });
  r.kv.push({ label: 'Horizontal thrust (per metre of wall)', value: `${fmt(Ph * 1000 / 1000)} kN/m`, status: 'info' });
  r.kv.push({ label: 'Wall weight (per metre)', value: `${fmt(W)} kN/m` });
  r.kv.push({ label: 'Sliding safety factor', value: fmt(FSs, 3), status: FSs >= target ? 'ok' : 'fail' });
  r.kv.push({ label: 'Overturning safety factor', value: fmt(FSo, 3), status: FSo >= 2 ? 'ok' : 'fail' });
  r.kv.push({ label: 'Base pressure max / min', value: `${fmt(qmaxKpa)} / ${fmt(qminKpa)} kPa`, status: qmaxKpa <= qa ? 'ok' : 'fail' });
  r.kv.push({ label: 'Eccentricity of the resultant', value: `${fmt(ecc)} mm (B/6 = ${fmt(B / 6)} mm)`, status: ecc <= B / 6 ? 'ok' : 'warn' });
  r.kv.push({ label: '3-D model: peak wall displacement', value: `${fmt(post.maxDisp)} mm` });
  r.kv.push({ label: '3-D model: lowest wall safety factor', value: Number.isFinite(fosWall) ? fmt(fosWall, 3) : '∞' });
  r.kv.push({ label: '3-D model: soil beyond Mohr–Coulomb failure', value: `${(100 * soilFrac).toFixed(1)} % of the soil volume (peak index ${fmt(idxSoil, 3)})`, status: soilFrac < 0.25 ? 'ok' : 'warn' });
  r.checks.push({ name: 'Sliding', value: fmt(FSs, 3), limit: `≥ ${target}`, ok: FSs >= target });
  r.checks.push({ name: 'Overturning', value: fmt(FSo, 3), limit: '≥ 2.0', ok: FSo >= 2 });
  r.checks.push({ name: 'Bearing pressure', value: `${fmt(qmaxKpa)} kPa`, limit: `≤ ${qa} kPa`, ok: qmaxKpa <= qa });
  r.checks.push({ name: 'Resultant within the middle third', value: `e = ${fmt(ecc)} mm`, limit: `≤ ${fmt(B / 6)} mm`, ok: ecc <= B / 6 });
  r.checks.push({ name: 'Wall strength (3-D model)', value: Number.isFinite(fosWall) ? fmt(fosWall, 3) : '∞', limit: `≥ ${target}`, ok: fosWall >= target });
  r.checks.push({ name: 'Soil volume beyond Mohr–Coulomb failure (3-D elastic indication)', value: `${(100 * soilFrac).toFixed(1)} %`, limit: '< 25 %', ok: soilFrac < 0.25, note: 'The elastic soil cannot carry tension and has no stress redistribution, so isolated elements near the wall heel and toe exceed the criterion; the volume fraction is the meaningful measure.' });
  r.curves.push({ id: 'ep', title: 'Lateral earth pressure on the wall', xlabel: 'Pressure (kPa)', ylabel: 'Height above the base (mm)', series: [{ name: 'Horizontal (effective + water)', x: ph, y: zs }, { name: 'Wall friction (vertical shear)', x: pv, y: zs }] });
  r.tables.push({ id: 'stab', title: 'Stability summary (per metre of wall)', cols: ['Item', 'Value', 'Unit'], rows: [
    ['Retained height H', fmt(Hp), 'mm'], ['Base width B', fmt(B), 'mm'], ['Active thrust Pa (effective)', fmt(Pa), 'kN/m'], ['Water thrust', fmt(Pw), 'kN/m'], ['Horizontal force Ph', fmt(Ph), 'kN/m'], ['Vertical force from wall friction', fmt(Pvert), 'kN/m'],
    ['Wall weight', fmt(W), 'kN/m'], ['Backfill weight on the base', fmt(Wsoil), 'kN/m'], ['Overturning moment (toe)', fmt(Mo / 1000), 'kN·m/m'], ['Resisting moment (toe)', fmt(Mres / 1000), 'kN·m/m'],
  ].map((r2) => r2.map((c) => (typeof c === 'number' ? c : c))).map((row) => [row[0], row[1], row[2]]) });
  void kpa;
  r.tables.push(bodyTable(P, { post, model }));
  describeInputs(r, P, sl);
  if (autoSupport) r.notes.push('No supports were defined: the bottom of the model is fixed and its vertical sides are rollers. Make the soil body wide and deep enough (at least 2 – 3 wall heights) that these boundaries do not influence the wall.');
  r.notes.push(`Wall length ${fmt(Lw)} mm, retained side +${'XY'[ax]}${sgn > 0 ? '' : ' (negative)'}; the classical checks neglect passive resistance in front of the toe. The 3-D soil is linear elastic: the Mohr–Coulomb index shows the proximity to failure of the stress state, not the post-failure behaviour.`);
  for (const w of sl.warnings) r.notes.push(w);
  const okAll = FSs >= target && FSo >= 2 && qmaxKpa <= qa && ecc <= B / 6 && fosWall >= target && soilFrac < 0.25;
  r.verdict = { pass: okAll, text: okAll ? `PASS: sliding ${fmt(FSs, 3)}, overturning ${fmt(FSo, 3)}, base pressure ${fmt(qmaxKpa)} kPa.` : `FAIL: ${[FSs < target ? `sliding ${fmt(FSs, 3)} < ${target}` : '', FSo < 2 ? `overturning ${fmt(FSo, 3)} < 2` : '', qmaxKpa > qa ? `bearing ${fmt(qmaxKpa)} kPa > ${qa}` : '', ecc > B / 6 ? 'resultant outside the middle third' : '', fosWall < target ? `wall strength ${fmt(fosWall, 3)}` : '', soilFrac >= 0.25 ? `${(100 * soilFrac).toFixed(1)} % of the soil beyond Mohr–Coulomb failure` : ''].filter(Boolean).join('; ')}.` };
  void critOf; void failureIndex; void invariants; void effMass; void magnitude; void modalForce; void newBC; void FACE_NORMAL; void addMeshAndSolver;
  return r;
}

const nn = (g: Prep['g']) => nNodes(g);

export type { Modal, Series };
