// Eigen-analyses and modal-superposition dynamics: natural frequencies, buckling, fatigue, harmonic and transient response.

import { addMeshAndSolver, boolP, dispScaleFor, describeInputs, numP, strP, bodyTable } from './an_static';
import { baseResult, critOf, fmt, structPost, type Env } from './base';
import { ElasticModel, nodalAverage, type StructBC } from './fem';
import { GeomStiffness, bucklingModes, lobpcg } from './eig';
import { buildStructLoads, requireSupports, type StructLoads } from './loads';
import { failureIndex, invariants, snAllowable, snLife, type Axis, type Material } from './materials';
import { makeField, type CaseInput, type LoadType, type Result } from './model';
import { prepare, boxSize, type Prep } from './prepare';
import { nNodes } from './voxel';

const TWO_PI = 2 * Math.PI;

export interface Modal {
  P: Prep; model: ElasticModel; sl: StructLoads; nn: number;
  f: number[]; w2: number[]; phi: Float64Array[]; M: Float64Array;       // M: lumped mass per DOF (tonne)
  iterations: number; converged: boolean; ms: number; rigid: number; free: boolean;
}

export function setupStruct(input: CaseInput, env: Env, o: { skip?: LoadType[]; h?: number; needSupport?: boolean; what?: string; maxElems?: number } = {}) {
  env.progress(0.03, 'Voxelising the model');
  const P = prepare(input, { h: o.h, maxElems: o.maxElems });
  const model = new ElasticModel(P.g, P.mats, { tet: strP(input, 'elem') === 'tet', fibre: P.fibre as Axis[] });
  const sl = buildStructLoads(P, model, { skip: o.skip, selfweight: boolP(input, 'selfweight') });
  if (o.needSupport) requireSupports(sl, o.what ?? 'This analysis');
  return { P, model, sl };
}

/** Lowest modes of the supported structure (mass-normalised). Unsupported bodies get a small shift so free-free modes can be computed. */
export function modalCore(P: Prep, model: ElasticModel, sl: StructLoads, nev: number, env: Env, tol = 5e-3, maxIt = 80): Modal {
  const t0 = Date.now();
  const nn = nNodes(P.g), M = new Float64Array(3 * nn), mn = model.nodalMass();
  for (let i = 0; i < nn; i++) { M[3 * i] = M[3 * i + 1] = M[3 * i + 2] = mn[i]; }
  const free = !sl.hasSupport;
  const s = boxSize(P.box), L = Math.max(s[0], s[1], s[2]);
  const mat = P.mats[0], c = Math.sqrt(mat.E / (mat.rho * 1e-12));
  const sigma = free ? Math.pow((Math.PI * c) / L, 2) * 0.05 : 0;
  const shift = free ? M.map((m) => m * sigma) : null;
  const mg = model.build(sl.bc, shift);
  const rigid = free ? 6 : 0;
  const op = { n: 3 * nn, A: (x: Float64Array, y: Float64Array) => mg.apply(x, y), T: (a: Float64Array, z: Float64Array) => mg.precondition(a, z), mask: mg.fixedMask(), Bdiag: M };
  // starting block: static responses to uniform accelerations and rigid-body rotation fields (rich in the sway, bending and torsion modes);
  // the first Ritz value is then never above their Rayleigh quotients, so dominant low modes cannot be missed.
  const init: Float64Array[] = [];
  {
    const g = P.g, sx = g.nx + 1, sxy = (g.nx + 1) * (g.ny + 1);
    const cx = g.ox + 0.5 * g.nx * g.h, cy = g.oy + 0.5 * g.ny * g.h, cz = g.oz + 0.5 * g.nz * g.h;
    const fields: Float64Array[] = [];
    for (let k = 0; k < 6; k++) fields.push(new Float64Array(3 * nn));
    for (let n = 0; n < nn; n++) {
      const kk = Math.floor(n / sxy), jj = Math.floor((n - kk * sxy) / sx), ii = n - kk * sxy - jj * sx;
      const x = g.ox + ii * g.h - cx, y = g.oy + jj * g.h - cy, z = g.oz + kk * g.h - cz, m = mn[n];
      fields[0][3 * n] = m; fields[1][3 * n + 1] = m; fields[2][3 * n + 2] = m;
      fields[3][3 * n + 1] = -m * z; fields[3][3 * n + 2] = m * y;      // rotation about x
      fields[4][3 * n] = m * z; fields[4][3 * n + 2] = -m * x;          // about y
      fields[5][3 * n] = -m * y; fields[5][3 * n + 1] = m * x;          // about z
    }
    const mask = mg.fixedMask();
    fields.forEach((b, k) => {
      for (let i = 0; i < b.length; i++) if (mask[i]) b[i] = 0;
      const x = new Float64Array(b.length);
      mg.solve(b, x, 5e-2, 40);
      env.progress(0.12 + 0.01 * k, 'Building the starting subspace');
      init.push(x);
    });
  }
  const r = lobpcg(op, nev + rigid, { tol, maxIt, extra: 3, init, onProgress: (it, res) => env.progress(0.2 + 0.6 * Math.min(1, it / maxIt), `Eigen-solver: iteration ${it}, residual ${res.toExponential(1)}`) });
  const f: number[] = [], w2: number[] = [], phi: Float64Array[] = [];
  for (let i = 0; i < r.values.length; i++) {
    const lam = r.values[i] - sigma;
    if (free && lam < 1e-3 * Math.max(sigma, 1)) continue;          // rigid-body mode
    const v = r.vectors[i];
    let m = 0; for (let q = 0; q < v.length; q++) m += M[q] * v[q] * v[q];
    const sc = m > 0 ? 1 / Math.sqrt(m) : 1;
    const p = v.map((x) => x * sc);
    f.push(Math.sqrt(Math.max(lam, 0)) / TWO_PI); w2.push(Math.max(lam, 0)); phi.push(p);
  }
  const order = f.map((_, i) => i).sort((a, b) => f[a] - f[b]);
  return { P, model, sl, nn, f: order.map((i) => f[i]), w2: order.map((i) => w2[i]), phi: order.map((i) => phi[i]), M, iterations: r.iterations, converged: r.converged, ms: Date.now() - t0, rigid, free };
}

export const unitDisp = (p: Float64Array): Float32Array => {
  let mx = 0; for (let n = 0; n < p.length / 3; n++) mx = Math.max(mx, Math.hypot(p[3 * n], p[3 * n + 1], p[3 * n + 2]));
  const sc = mx > 0 ? 1 / mx : 1;
  return Float32Array.from(p, (v) => v * sc);
};
export const magnitude = (u: ArrayLike<number>, nn: number): Float32Array => { const m = new Float32Array(nn); for (let n = 0; n < nn; n++) m[n] = Math.hypot(u[3 * n], u[3 * n + 1], u[3 * n + 2]); return m; };

export function effMass(m: Modal, i: number): [number, number, number] {
  const g = [0, 0, 0], p = m.phi[i];
  for (let n = 0; n < m.nn; n++) { g[0] += m.M[3 * n] * p[3 * n]; g[1] += m.M[3 * n + 1] * p[3 * n + 1]; g[2] += m.M[3 * n + 2] * p[3 * n + 2]; }
  return [g[0] * g[0], g[1] * g[1], g[2] * g[2]];
}

// ---------------------------------------------------------------------------------------------

export function runModal(input: CaseInput, env: Env): Result {
  const nModes = Math.round(numP(input, 'nModes', 8));
  const { P, model, sl } = setupStruct(input, env, { skip: ['force', 'torque', 'pressure', 'gravity', 'centrifugal'], maxElems: 20000 });
  env.progress(0.1, `Building the solver (${P.g.nElem.toLocaleString()} elements)`);
  const md = modalCore(P, model, sl, nModes, env);
  const r = baseResult(P, 'modal', strP(input, 'elem') === 'tet' ? 'Tetrahedral (split voxels)' : 'Hexahedral 8-node', Date.now() - md.ms);
  r.mesh.dof = 3 * r.mesh.nodes;
  r.solver = { name: 'LOBPCG with multigrid preconditioner', iterations: md.iterations, time: md.ms, log: [`Block eigen-solver, ${md.iterations} iterations${md.converged ? '' : ' (not fully converged)'}`] };
  const totalMass = model.totalMass();
  r.kv.push({ label: 'Mass', value: `${fmt(totalMass * 1000)} kg` });
  if (!md.f.length) { r.verdict = { pass: null, text: 'No flexible modes were found.' }; return r; }
  const rows: (string | number)[][] = [];
  let cx = 0, cy = 0, cz = 0;
  md.f.forEach((f, i) => {
    const e = effMass(md, i);
    cx += e[0]; cy += e[1]; cz += e[2];
    rows.push([i + 1, fmt(f, 5), fmt(f * TWO_PI, 5), fmt(1000 / f, 4), (100 * e[0] / totalMass).toFixed(1), (100 * e[1] / totalMass).toFixed(1), (100 * e[2] / totalMass).toFixed(1)]);
    r.modes.push({ label: `Mode ${i + 1}: ${fmt(f, 5)} Hz`, freq: f, disp: unitDisp(md.phi[i]) });
  });
  r.tables.push({ id: 'modes', title: 'Natural frequencies and effective modal mass', cols: ['Mode', 'Frequency (Hz)', 'ω (rad/s)', 'Period (ms)', 'Eff. mass X (%)', 'Eff. mass Y (%)', 'Eff. mass Z (%)'], rows });
  r.curves.push({ id: 'spectrum', title: 'Natural frequencies', xlabel: 'Mode', ylabel: 'Frequency (Hz)', series: [{ name: 'f', x: md.f.map((_, i) => i + 1), y: md.f }] });
  r.kv.push({ label: 'Fundamental frequency', value: `${fmt(md.f[0], 5)} Hz`, status: 'info' });
  r.kv.push({ label: 'Modes computed', value: `${md.f.length}; cumulative effective mass X/Y/Z ${(100 * cx / totalMass).toFixed(0)} / ${(100 * cy / totalMass).toFixed(0)} / ${(100 * cz / totalMass).toFixed(0)} %` });
  if (md.free) r.kv.push({ label: 'Boundary conditions', value: 'free-free: the six rigid-body modes were removed', status: 'info' });
  const um = unitDisp(md.phi[0]);
  r.fields.push(makeField('modeshape', 'Mode shape (normalised displacement)', '', 'node', magnitude(um, md.nn)));
  r.defaultField = 'modeshape';
  r.disp = null; r.dispScale = dispScaleFor(P, 1);
  const ops = String(input.params.operating ?? '').split(/[,;\s]+/).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const band = numP(input, 'band', 15);
  let clash = false;
  for (const fo of ops) {
    const hits = md.f.map((f, i) => ({ f, i })).filter((q) => Math.abs(q.f - fo) / fo * 100 <= band);
    const nearest = md.f.reduce((b, f) => (Math.abs(f - fo) < Math.abs(b - fo) ? f : b), md.f[0]);
    r.checks.push({ name: `Resonance at ${fo} Hz`, value: hits.length ? `mode ${hits[0].i + 1} at ${fmt(hits[0].f)} Hz` : `nearest ${fmt(nearest)} Hz`, limit: `outside ±${band} %`, ok: hits.length === 0 });
    if (hits.length) clash = true;
  }
  if (ops.length) r.verdict = { pass: !clash, text: clash ? 'FAIL: an operating frequency lies within the resonance band of a natural frequency.' : `PASS: no natural frequency within ±${band} % of the operating frequencies.` };
  else r.verdict = { pass: null, text: `Fundamental frequency ${fmt(md.f[0], 5)} Hz. Enter operating frequencies to check for resonance.` };
  if (!md.converged) r.notes.push('The eigen-solver stopped before reaching its tolerance: the higher modes are approximate.');
  describeInputs(r, P, sl);
  return r;
}

// ---------------------------------------------------------------------------------------------

export function runBuckling(input: CaseInput, env: Env): Result {
  const nModes = Math.round(numP(input, 'nModes', 3)), target = numP(input, 'fosTarget', 1.5);
  const t0 = Date.now();
  const { P, model, sl } = setupStruct(input, env, { skip: ['torque', 'centrifugal'], needSupport: true, what: 'A buckling analysis', maxElems: 20000 });
  env.progress(0.1, `Building the solver (${P.g.nElem.toLocaleString()} elements)`);
  const mg = model.build(sl.bc);
  const { u, info } = model.solveStatic(sl.bc, null, 1e-9, 600, (it, res) => env.progress(0.15 + 0.2 * Math.min(1, -Math.log10(Math.max(res, 1e-12)) / 9), `Reference load case: iteration ${it}`));
  const sig = model.elementStress(u);
  const Kg = new GeomStiffness(P.g), n = 3 * nNodes(P.g);
  env.progress(0.4, 'Buckling eigenvalue iteration');
  const res = bucklingModes(n, mg.fixedMask(), (x, y) => mg.apply(x, y), (b, x) => { x.fill(0); mg.solve(b, x, 1e-7, 400); }, (x, y) => { y.fill(0); Kg.apply(sig, x, y); }, nModes, { maxIt: 18, tol: 1e-4, onProgress: (it) => env.progress(0.4 + 0.5 * Math.min(1, (it + 1) / 18), `Buckling iteration ${it + 1}`) });
  const pos = Array.from(res.factors).map((f, i) => ({ f, i })).filter((q) => q.f > 0).sort((a, b) => a.f - b.f).slice(0, nModes);
  const post = structPost(P, model, u, sig, 'auto');
  const r = baseResult(P, 'buckling', 'Hexahedral 8-node', t0);
  addMeshAndSolver(r, { P, model, sl, u, sig, post, iterations: info.iterations, residual: info.residual, solveMs: info.ms, energy: 0, react: { sum: [0, 0, 0], max: 0 }, ms: Date.now() - t0 }, 'Inverse subspace iteration, multigrid');
  r.fields = post.fields; r.hotspots = post.hotspots;
  if (!pos.length) {
    r.verdict = { pass: null, text: 'No positive buckling factor was found: the applied loads put the structure in tension everywhere, or the load is too small to resolve.' };
    r.notes.push('Buckling needs compressive membrane stress. Check the direction of the load.');
    return r;
  }
  const refF = Math.hypot(...sl.force);
  r.tables.push({ id: 'buck', title: 'Buckling modes', cols: ['Mode', 'Load factor λ', 'Critical load (N)'], rows: pos.map((q, k) => [k + 1, fmt(q.f, 5), refF > 0 ? fmt(q.f * refF, 5) : '—']) });
  pos.forEach((q, k) => r.modes.push({ label: `Buckling mode ${k + 1}: λ = ${fmt(q.f, 4)}`, freq: q.f, disp: unitDisp(res.vectors[q.i]) }));
  r.fields.unshift(makeField('modeshape', 'Buckled shape (normalised displacement)', '', 'node', magnitude(unitDisp(res.vectors[pos[0].i]), nNodes(P.g))));
  r.defaultField = 'modeshape';
  r.dispScale = dispScaleFor(P, 1);
  const l1 = pos[0].f;
  r.kv.push({ label: 'Critical load factor λ₁', value: fmt(l1, 5), status: l1 >= target ? 'ok' : l1 >= 1 ? 'warn' : 'fail' });
  if (refF > 0) r.kv.push({ label: 'Critical load', value: `${fmt(l1 * refF, 5)} N (applied: ${fmt(refF)} N)` });
  r.checks.push({ name: 'Buckling safety factor', value: fmt(l1, 4), limit: `≥ ${target}`, ok: l1 >= target });
  r.verdict = { pass: l1 >= target, text: l1 >= target ? `PASS: the first buckling load is ${fmt(l1, 3)} × the applied load.` : `FAIL: the structure buckles at ${fmt(l1, 3)} × the applied load (required ${target}).` };
  if (!res.converged) r.notes.push('The buckling iteration stopped before full convergence; the load factors are accurate to a few percent.');
  r.notes.push('Loads are scaled linearly. The factor applies to the force, pressure and gravity loads together.');
  describeInputs(r, P, sl);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Fatigue

const SURF: Record<string, [number, number]> = { ground: [1.58, -0.085], machined: [4.51, -0.265], hot: [57.7, -0.718], forged: [272, -0.995] };

function zScore(rel: number): number {
  // inverse normal CDF, Acklam-like rational approximation for the upper tail
  const p = 1 - rel / 100;
  if (p <= 0) return 4; if (p >= 0.5) return 0;
  const t = Math.sqrt(-2 * Math.log(p));
  return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
}

export interface MarinInfo { ka: number; kb: number; kc: number; kd: number; ke: number; kf: number; Se: number; SeBase: number; de: number }
export function marin(m: Material, finish: string, de: number, tempC: number, reliab: number, kf: number): MarinInfo {
  const base = m.fat?.Se ?? 0.35 * m.ultimate;
  let ka = 1;
  if (finish !== 'polished') { const [a, b] = SURF[finish] ?? SURF.machined; ka = Math.min(1, a * Math.pow(m.ultimate, b)); }
  const kb = de <= 2.79 ? 1 : de <= 51 ? 1.24 * Math.pow(de, -0.107) : de <= 254 ? 1.51 * Math.pow(de, -0.157) : 0.6;
  const tf = 1.8 * tempC + 32;
  const kd = tempC <= 20 ? 1 : Math.max(0.3, 0.975 + 0.432e-3 * tf - 0.115e-5 * tf * tf + 0.104e-8 * tf ** 3 - 0.595e-12 * tf ** 4);
  const ke = 1 - 0.08 * zScore(reliab);
  const kc = 1;
  return { ka, kb, kc, kd, ke, kf, SeBase: base, de, Se: ka * kb * kc * kd * ke * base };
}

export function runFatigue(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const life = numP(input, 'life', 1e6), target = numP(input, 'fosTarget', 1.5), kf = numP(input, 'kf', 1);
  const cyc = strP(input, 'cycle', 'ratio'), R = cyc === 'full' ? -1 : cyc === 'zero' ? 0 : numP(input, 'R', 0);
  const theory = strP(input, 'theory', 'goodman');
  const { P, model, sl } = setupStruct(input, env, { needSupport: true, what: 'A fatigue analysis' });
  env.progress(0.1, `Building the solver (${P.g.nElem.toLocaleString()} elements)`);
  model.build(sl.bc);
  const { u, info } = model.solveStatic(sl.bc, null, 1e-8, 500, (it, res) => env.progress(0.15 + 0.5 * Math.min(1, -Math.log10(Math.max(res, 1e-12)) / 8), `Solving the peak-load case: iteration ${it}`));
  const sig = model.elementStress(u);
  const post = structPost(P, model, u, sig, 'vonmises');
  env.progress(0.75, 'Evaluating the S-N curve at every element');
  const g = P.g, ne = g.nElem;
  const s = boxSize(P.box).slice().sort((a, b) => a - b);
  const de = 0.808 * Math.sqrt(s[0] * s[1]);
  const mods = P.mats.map((m) => { const k = marin(m, strP(input, 'finish', 'machined'), de, numP(input, 'temp', 20), numP(input, 'reliab', 99), kf); return { m, k, mm: { ...m, fat: { ...(m.fat ?? { Se: 0.35 * m.ultimate, Nk: 1e6, f: 0.9 }), Se: k.Se } } as Material }; });
  const logN = new Float32Array(ne), dmg = new Float32Array(ne), sa = new Float32Array(ne), sm = new Float32Array(ne), inv = new Float32Array(ne);
  let minLog = Infinity, worst = 0, maxIdx = 0, worstSar = 0;
  for (let e = 0; e < ne; e++) {
    const mi = g.mat[g.elem[e]] - 1, { m, mm } = mods[mi];
    const iv = invariants(sig, e * 6);
    const sgn = Math.abs(iv.s1) >= Math.abs(iv.s3) ? Math.sign(iv.s1) || 1 : -1;
    const smax = sgn * iv.vm, smin = R * smax;
    const a = Math.abs(smax - smin) / 2 * kf, mean = (smax + smin) / 2;
    sa[e] = a; sm[e] = mean;
    const Su = m.ultimate, Sy = m.yield;
    let sar: number;
    if (theory === 'gerber') sar = mean >= 0 ? (1 - (mean / Su) ** 2 > 1e-6 ? a / (1 - (mean / Su) ** 2) : 1e9) : a;
    else if (theory === 'soderberg') sar = mean >= 0 ? (1 - mean / Sy > 1e-6 ? a / (1 - mean / Sy) : 1e9) : a;
    else if (theory === 'swt') { const mx = a + mean; sar = mx > 0 ? Math.sqrt(mx * a) : 0; }
    else sar = mean >= 0 ? (1 - mean / Su > 1e-6 ? a / (1 - mean / Su) : 1e9) : a;
    const N = snLife(mm, sar);
    const l10 = Number.isFinite(N) ? Math.log10(Math.max(1, N)) : 12;
    logN[e] = Math.min(12, l10);
    dmg[e] = Number.isFinite(N) ? life / N : 0;
    const allow = snAllowable(mm, life);
    inv[e] = sar > 0 ? sar / allow : 0;                // 1/FOS
    if (inv[e] > maxIdx) { maxIdx = inv[e]; worst = e; worstSar = sar; }
    if (logN[e] < minLog) minLog = logN[e];
  }
  const r = baseResult(P, 'fatigue', 'Hexahedral 8-node', t0);
  addMeshAndSolver(r, { P, model, sl, u, sig, post, iterations: info.iterations, residual: info.residual, solveMs: info.ms, energy: 0, react: { sum: [0, 0, 0], max: 0 }, ms: Date.now() - t0 }, 'Multigrid PCG + S-N post-processing');
  const nn = nNodes(g);
  const fosNode = new Float32Array(nn), idxN = nodalAverage(g, inv, 1);
  for (let i = 0; i < nn; i++) fosNode[i] = idxN[i] > 1e-6 ? Math.min(100, 1 / idxN[i]) : 100;
  r.fields = [
    makeField('life', 'Fatigue life (log₁₀ cycles)', 'log₁₀ N', 'node', nodalAverage(g, logN, 1), { lowIsBad: true }),
    makeField('fatfos', 'Fatigue safety factor at the required life', '', 'node', fosNode, { lowIsBad: true }),
    makeField('damage', 'Damage at the required life', '', 'node', nodalAverage(g, dmg.map((v) => Math.min(v, 100)), 1)),
    makeField('sa', 'Alternating stress', 'MPa', 'node', nodalAverage(g, sa, 1)),
    makeField('sm', 'Mean stress', 'MPa', 'node', nodalAverage(g, sm, 1), { diverging: true }),
    ...post.fields.filter((f) => ['vm', 'disp'].includes(f.id)),
  ];
  r.defaultField = 'life';
  r.disp = Float32Array.from(u); r.dispScale = dispScaleFor(P, post.maxDisp);
  const fs = maxIdx > 0 ? 1 / maxIdx : Infinity;
  const nMin = Math.pow(10, minLog);
  const mi0 = g.mat[g.elem[worst]] - 1, wk = mods[mi0];
  const hot = post.hotspots.find((h) => h.fieldId === 'vm');
  r.hotspots = hot ? [{ ...hot, label: 'Highest cyclic stress' }] : [];
  r.kv.push({ label: 'Minimum life', value: minLog >= 11.9 ? 'infinite (below endurance limit)' : `${fmt(nMin, 3)} cycles`, status: nMin >= life ? 'ok' : 'fail' });
  r.kv.push({ label: 'Fatigue safety factor', value: fmt(fs, 3), status: fs >= target ? 'ok' : fs >= 1 ? 'warn' : 'fail' });
  r.kv.push({ label: 'Peak von Mises stress (load maximum)', value: `${fmt(post.maxVm)} MPa` });
  r.kv.push({ label: 'Worst-case equivalent alternating stress', value: `${fmt(worstSar)} MPa` });
  r.kv.push({ label: 'Loading', value: `R = ${R}, ${theory} mean-stress correction` });
  const k = wk.k;
  r.tables.push({ id: 'marin', title: `Endurance limit modification (worst body: ${wk.m.name})`, cols: ['Factor', 'Value', 'Meaning'], rows: [['Se′', fmt(k.SeBase), 'Endurance limit of the test specimen (MPa)'], ['ka', fmt(k.ka, 3), 'Surface finish'], ['kb', fmt(k.kb, 3), `Size (equivalent diameter ${fmt(k.de, 3)} mm)`], ['kc', '1', 'Loading (von Mises stress used)'], ['kd', fmt(k.kd, 3), 'Temperature'], ['ke', fmt(k.ke, 3), `Reliability ${numP(input, 'reliab', 99)} %`], ['Kf', fmt(kf, 3), 'Fatigue notch factor (on stress amplitude)'], ['Se', fmt(k.Se), 'Corrected endurance limit (MPa)']] });
  // S-N plot
  const xs: number[] = [], ys: number[] = [];
  for (let l = 3; l <= 9; l += 0.25) { xs.push(Math.pow(10, l)); ys.push(snAllowable(wk.mm, Math.pow(10, l))); }
  r.curves.push({ id: 'sn', title: 'S-N curve and worst point', xlabel: 'Cycles', ylabel: 'Stress amplitude (MPa)', logx: true, series: [{ name: 'S-N (corrected)', x: xs, y: ys }, { name: 'Worst element', x: [Math.min(1e9, Math.max(1e3, nMin))], y: [worstSar] }] });
  r.checks.push({ name: 'Fatigue life', value: minLog >= 11.9 ? '∞' : fmt(nMin, 3), limit: `≥ ${fmt(life, 3)} cycles`, ok: nMin >= life });
  r.checks.push({ name: 'Fatigue safety factor', value: fmt(fs, 3), limit: `≥ ${target}`, ok: fs >= target });
  if (post.maxVm > mods[mi0].m.yield) r.notes.push('The peak stress exceeds the yield strength: the elastic stress-life method is not valid there (low-cycle fatigue).');
  r.notes.push('The result is for the stress at the load maximum with the stated load ratio; all load cases are assumed to scale together.');
  r.verdict = { pass: nMin >= life && fs >= target, text: nMin >= life && fs >= target ? `PASS: life ≥ ${fmt(life, 3)} cycles with fatigue safety factor ${fmt(fs, 3)}.` : `FAIL: ${nMin < life ? `predicted life ${fmt(nMin, 3)} cycles is below the required ${fmt(life, 3)}` : `fatigue safety factor ${fmt(fs, 3)} is below ${target}`}.` };
  r.tables.push(bodyTable(P, { post, model }));
  describeInputs(r, P, sl);
  void critOf; void failureIndex;
  return r;
}

// ---------------------------------------------------------------------------------------------
// Dynamic response by modal superposition

export interface ModalSampler { nodes: Int32Array }
export function sampleNodes(md: Modal, count = 1400): Int32Array {
  const P = md.P, g = P.g, nn = md.nn;
  const act = new Uint8Array(nn);
  const base = md.model.base, off = md.model.off;
  for (let e = 0; e < g.nElem; e++) for (let a = 0; a < 8; a++) act[base[e] + off[a]] = 1;
  const list: number[] = [];
  for (let n = 0; n < nn; n++) if (act[n]) list.push(n);
  const stride = Math.max(1, Math.floor(list.length / count));
  const out = new Set<number>();
  for (let i = 0; i < list.length; i += stride) out.add(list[i]);
  for (const p of md.phi) { let b = -1, bv = 0; for (const n of list) { const v = Math.hypot(p[3 * n], p[3 * n + 1], p[3 * n + 2]); if (v > bv) { bv = v; b = n; } } if (b >= 0) out.add(b); }
  return Int32Array.from(out);
}

/** modal participation of a load vector: p_i = φᵢᵀ f */
export const modalForce = (md: Modal, f: Float64Array): number[] => md.phi.map((p) => { let s = 0; for (let i = 0; i < f.length; i++) s += p[i] * f[i]; return s; });

export function superpose(md: Modal, q: ArrayLike<number>, out?: Float64Array): Float64Array {
  const n = md.nn * 3, u = out ?? new Float64Array(n);
  u.fill(0);
  for (let i = 0; i < md.phi.length; i++) { const qi = q[i]; if (qi === 0) continue; const p = md.phi[i]; for (let k = 0; k < n; k++) u[k] += qi * p[k]; }
  return u;
}

export function runDynamic(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const kind = strP(input, 'kind', 'harmonic'), zeta = numP(input, 'zeta', 0.02), amp = numP(input, 'amp', 1), nModes = Math.round(numP(input, 'nModes', 10)), target = numP(input, 'fosTarget', 1.5);
  const { P, model, sl } = setupStruct(input, env, { needSupport: true, what: 'A dynamic analysis', maxElems: 20000 });
  if (!sl.bc.force.some((v) => v !== 0)) throw new Error('The dynamic analysis needs a load pattern (force, pressure or gravity).');
  env.progress(0.08, `Building the solver (${P.g.nElem.toLocaleString()} elements)`);
  const md = modalCore(P, model, sl, nModes, env);
  if (!md.f.length) throw new Error('No modes were found.');
  const f0 = Float64Array.from(sl.bc.force, (v) => v * amp);
  // static reference
  env.progress(0.82, 'Static reference solution');
  const sbc: StructBC = { ...sl.bc, force: f0 };
  const { u: ust } = model.solveStatic(sbc, null, 1e-7, 400);
  const samp = sampleNodes(md);
  const pi = modalForce(md, f0);
  const staticMax = (() => { let m = 0; for (const n of samp) m = Math.max(m, Math.hypot(ust[3 * n], ust[3 * n + 1], ust[3 * n + 2])); return m; })();
  const r = baseResult(P, 'dynamic', strP(input, 'elem') === 'tet' ? 'Tetrahedral (split voxels)' : 'Hexahedral 8-node', t0);
  r.mesh.dof = 3 * r.mesh.nodes;
  r.solver = { name: 'Modal superposition', iterations: md.iterations, time: Date.now() - t0, log: [`${md.f.length} modes, f₁ = ${fmt(md.f[0], 5)} Hz … f_n = ${fmt(md.f[md.f.length - 1], 5)} Hz`, `Modal damping ζ = ${zeta}`] };
  const nm = md.f.length, nn = md.nn, g = P.g;
  let peakU: Float64Array, peakLabel = '', dynMax = 0;
  const post = (u: Float64Array) => { const sig = model.elementStress(u); return { sig, post: structPost(P, model, u, sig, strP(input, 'criterion', 'auto')) }; };
  const modeLoad = md.f.map((_, i) => Math.abs(pi[i]));
  if (kind === 'harmonic') {
    const f1 = numP(input, 'f1', 10), f2 = Math.max(f1 * 1.01, numP(input, 'f2', 2000));
    const freqs: number[] = [];
    const np = 260;
    for (let i = 0; i < np; i++) freqs.push(f1 * Math.pow(f2 / f1, i / (np - 1)));
    for (const f of md.f) if (f > f1 && f < f2) { freqs.push(f, f * (1 - zeta), f * (1 + zeta)); }
    freqs.sort((a, b) => a - b);
    const resp: number[] = [];
    const H = (i: number, W: number): [number, number] => {
      const w = Math.sqrt(md.w2[i]), a = md.w2[i] - W * W, b = 2 * zeta * w * W, den = a * a + b * b;
      return [(pi[i] * a) / den, (-pi[i] * b) / den];
    };
    let pk = 0, pf = freqs[0];
    for (const Fq of freqs) {
      const W = TWO_PI * Fq;
      const re = new Float64Array(nm), im = new Float64Array(nm);
      for (let i = 0; i < nm; i++) { const h = H(i, W); re[i] = h[0]; im[i] = h[1]; }
      let m = 0;
      for (const n of samp) {
        let s = 0;
        for (let c = 0; c < 3; c++) { let a = 0, b = 0; for (let i = 0; i < nm; i++) { const p = md.phi[i][3 * n + c]; a += p * re[i]; b += p * im[i]; } s += a * a + b * b; }
        if (s > m) m = s;
      }
      const v = Math.sqrt(m);
      resp.push(v);
      if (v > pk) { pk = v; pf = Fq; }
      env.progress(0.84 + 0.1 * (freqs.indexOf(Fq) / freqs.length), 'Frequency response');
    }
    dynMax = pk;
    r.curves.push({ id: 'frf', title: 'Frequency response: peak displacement amplitude', xlabel: 'Frequency (Hz)', ylabel: 'Displacement amplitude (mm)', logx: true, logy: true, series: [{ name: 'Dynamic', x: freqs, y: resp.map((v) => Math.max(v, 1e-12)) }, { name: 'Static', x: [freqs[0], freqs[freqs.length - 1]], y: [Math.max(staticMax, 1e-12), Math.max(staticMax, 1e-12)] }], marks: md.f.filter((f) => f > f1 && f < f2).map((f, i) => ({ x: f, label: `f${i + 1}` })) });
    // complex field at the peak frequency
    const W = TWO_PI * pf, re = new Float64Array(nm), im = new Float64Array(nm);
    for (let i = 0; i < nm; i++) { const h = H(i, W); re[i] = h[0]; im[i] = h[1]; }
    const ur = superpose(md, re), ui = superpose(md, im);
    const sr = model.elementStress(ur), si = model.elementStress(ui);
    // phase sweep for the envelope
    const ne = g.nElem, nph = 12, vmEnv = new Float32Array(ne), idxEnv = new Float32Array(ne), tmp = new Float32Array(6);
    let bestPh = 0, bestVm = 0;
    for (let k = 0; k < nph; k++) {
      const th = (Math.PI * k) / nph, c = Math.cos(th), s = Math.sin(th);
      for (let e = 0; e < ne; e++) {
        for (let q = 0; q < 6; q++) tmp[q] = sr[e * 6 + q] * c + si[e * 6 + q] * s;
        const iv = invariants(tmp, 0), mi = g.mat[g.elem[e]] - 1;
        if (iv.vm > vmEnv[e]) vmEnv[e] = iv.vm;
        const fi = failureIndex(P.mats[mi], critOf(P, mi, strP(input, 'criterion', 'auto')), tmp, 0, P.fibre[mi]);
        if (fi > idxEnv[e]) idxEnv[e] = fi;
        if (iv.vm > bestVm) { bestVm = iv.vm; bestPh = th; }
      }
    }
    const uw = new Float64Array(ur.length);
    for (let i = 0; i < uw.length; i++) uw[i] = ur[i] * Math.cos(bestPh) + ui[i] * Math.sin(bestPh);
    const pp = post(uw);
    const amplitude = new Float32Array(nn);
    for (let n = 0; n < nn; n++) amplitude[n] = Math.sqrt(ur[3 * n] ** 2 + ui[3 * n] ** 2 + ur[3 * n + 1] ** 2 + ui[3 * n + 1] ** 2 + ur[3 * n + 2] ** 2 + ui[3 * n + 2] ** 2);
    const idxN = nodalAverage(g, idxEnv, 1), fosN = new Float32Array(nn);
    for (let n = 0; n < nn; n++) fosN[n] = idxN[n] > 1e-6 ? Math.min(100, 1 / idxN[n]) : 100;
    r.fields = pp.post.fields.map((fd) => fd.id === 'vm' ? makeField('vm', 'Equivalent stress amplitude (envelope over the cycle)', 'MPa', 'node', nodalAverage(g, vmEnv, 1)) : fd.id === 'fos' ? makeField('fos', 'Dynamic factor of safety', '', 'node', fosN, { lowIsBad: true }) : fd.id === 'disp' ? makeField('disp', 'Displacement amplitude', 'mm', 'node', amplitude) : fd);
    r.defaultField = 'vm';
    r.disp = Float32Array.from(uw); r.dispScale = dispScaleFor(P, pp.post.maxDisp);
    let mxv = 0, mxi = 0; for (let e = 0; e < ne; e++) { if (vmEnv[e] > mxv) mxv = vmEnv[e]; if (idxEnv[e] > mxi) mxi = idxEnv[e]; }
    // animation: one cycle of the response at the peak frequency
    const nf = Math.min(16, Math.max(6, Math.floor(1.5e7 / (12 * nn))));
    for (let k = 0; k < nf; k++) {
      const th = (TWO_PI * k) / nf, c = Math.cos(th), s = Math.sin(th), d = new Float32Array(3 * nn);
      for (let i = 0; i < d.length; i++) d[i] = ur[i] * c + ui[i] * s;
      r.frames.push({ label: `Phase ${Math.round((360 * k) / nf)}°`, t: k / nf / pf, disp: d });
    }
    peakLabel = `Peak response at ${fmt(pf, 5)} Hz`;
    r.kv.push({ label: 'Peak response frequency', value: `${fmt(pf, 5)} Hz`, status: 'info' });
    r.kv.push({ label: 'Peak displacement amplitude', value: `${fmt(dynMax)} mm` });
    r.kv.push({ label: 'Peak stress amplitude (envelope)', value: `${fmt(mxv)} MPa` });
    r.kv.push({ label: 'Dynamic amplification vs static', value: staticMax > 0 ? `${fmt(dynMax / staticMax, 3)} ×` : 'n/a' });
    r.kv.push({ label: 'Minimum dynamic safety factor', value: mxi > 0 ? fmt(1 / mxi, 3) : '∞', status: 1 / (mxi || 1e-9) >= target ? 'ok' : 'fail' });
    r.checks.push({ name: 'Safety factor at peak response', value: mxi > 0 ? fmt(1 / mxi, 3) : '∞', limit: `≥ ${target}`, ok: mxi === 0 || 1 / mxi >= target });
    r.verdict = { pass: mxi === 0 || 1 / mxi >= target, text: mxi === 0 || 1 / mxi >= target ? `PASS: dynamic safety factor ${mxi > 0 ? fmt(1 / mxi, 3) : '∞'} over the sweep.` : `FAIL: dynamic safety factor ${fmt(1 / mxi, 3)} at ${fmt(pf, 4)} Hz is below ${target}.` };
    r.hotspots = pp.post.hotspots;
    peakU = uw;
  } else {
    // transient: Newmark average acceleration on every mode
    const dur = Math.max(1e-6, numP(input, 'dur', 5) / 1000);
    const T1 = 1 / md.f[0], Tn = 1 / md.f[nm - 1];
    const tEnd = Math.max(2.5 * T1, 6 * dur);
    let dt = Math.min(dur / 60, Tn / 20, tEnd / 400);
    let steps = Math.ceil(tEnd / dt);
    if (steps > 40000) { dt = tEnd / 40000; steps = 40000; r.notes.push('The time step was enlarged to keep the run time reasonable: the highest modes are under-resolved in time.'); }
    const g1 = (t: number) => (kind === 'pulse' ? (t < dur ? Math.sin((Math.PI * t) / dur) : 0) : t >= 0 ? 1 : 0);
    const q = new Float64Array(nm), v = new Float64Array(nm), a = new Float64Array(nm);
    for (let i = 0; i < nm; i++) a[i] = pi[i] * g1(0);
    const evalEvery = Math.max(1, Math.floor(steps / 900));
    const ts: number[] = [], ys: number[] = [];
    let best = 0, bestT = 0, bestQ = new Float64Array(nm);
    const nFrames = Math.min(24, Math.max(8, Math.floor(2e7 / (12 * nn)))), frameStep = Math.max(1, Math.floor(steps / (nFrames - 1)));
    const frameQ: { t: number; q: Float64Array }[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s * dt;
      if (s % evalEvery === 0) {
        let m = 0;
        for (const n of samp) { let sq = 0; for (let c = 0; c < 3; c++) { let u = 0; for (let i = 0; i < nm; i++) u += md.phi[i][3 * n + c] * q[i]; sq += u * u; } if (sq > m) m = sq; }
        const val = Math.sqrt(m);
        ts.push(t * 1000); ys.push(val);
        if (val > best) { best = val; bestT = t; bestQ = Float64Array.from(q); }
      }
      if (s % frameStep === 0 && frameQ.length < nFrames) frameQ.push({ t, q: Float64Array.from(q) });
      if (s === steps) break;
      const tn = t + dt, pn = g1(tn);
      for (let i = 0; i < nm; i++) {
        // Newmark β = 1/4, γ = 1/2
        const w2 = md.w2[i], w = Math.sqrt(w2), c = 2 * zeta * w;
        const rhs = pi[i] * pn - c * (v[i] + 0.5 * dt * a[i]) - w2 * (q[i] + dt * v[i] + 0.25 * dt * dt * a[i]);
        const an = rhs / (1 + 0.5 * dt * c + 0.25 * dt * dt * w2);
        const vn = v[i] + 0.5 * dt * (a[i] + an), qn = q[i] + dt * v[i] + 0.25 * dt * dt * (a[i] + an);
        a[i] = an; v[i] = vn; q[i] = qn;
      }
      if (s % 2000 === 0) env.progress(0.84 + 0.08 * (s / steps), `Time integration ${Math.round((100 * s) / steps)} %`);
    }
    dynMax = best;
    const up = superpose(md, bestQ);
    const pp = post(up);
    r.fields = pp.post.fields; r.defaultField = 'vm';
    r.disp = Float32Array.from(up); r.dispScale = dispScaleFor(P, pp.post.maxDisp);
    r.hotspots = pp.post.hotspots;
    for (const fq of frameQ) { const d = superpose(md, fq.q); r.frames.push({ label: `t = ${(fq.t * 1000).toFixed(3)} ms`, t: fq.t, disp: Float32Array.from(d) }); }
    r.curves.push({ id: 'hist', title: 'Peak displacement history', xlabel: 'Time (ms)', ylabel: 'Displacement (mm)', series: [{ name: 'Dynamic', x: ts, y: ys }, { name: 'Static', x: [0, tEnd * 1000], y: [staticMax, staticMax] }] });
    const fos = pp.post.minFos;
    r.kv.push({ label: 'Peak displacement', value: `${fmt(dynMax)} mm at ${fmt(bestT * 1000, 4)} ms`, status: 'info' });
    r.kv.push({ label: 'Static displacement (same load)', value: `${fmt(staticMax)} mm` });
    r.kv.push({ label: 'Dynamic amplification', value: staticMax > 0 ? `${fmt(dynMax / staticMax, 3)} ×` : 'n/a' });
    r.kv.push({ label: 'Peak von Mises stress', value: `${fmt(pp.post.maxVm)} MPa` });
    r.kv.push({ label: 'Minimum factor of safety at the peak', value: fmt(fos, 3), status: fos >= target ? 'ok' : 'fail' });
    r.checks.push({ name: 'Safety factor at peak response', value: fmt(fos, 3), limit: `≥ ${target}`, ok: fos >= target });
    r.verdict = { pass: fos >= target, text: fos >= target ? `PASS: dynamic safety factor ${fmt(fos, 3)} at the instant of peak displacement.` : `FAIL: dynamic safety factor ${fmt(fos, 3)} is below ${target}.` };
    peakLabel = `Peak response at t = ${fmt(bestT * 1000, 4)} ms`;
    peakU = up;
  }
  void peakU; void peakLabel; void modeLoad;
  r.modes = md.f.slice(0, 6).map((f, i) => ({ label: `Mode ${i + 1}: ${fmt(f, 5)} Hz`, freq: f, disp: unitDisp(md.phi[i]) }));
  r.tables.push({ id: 'modes', title: 'Modes used', cols: ['Mode', 'Frequency (Hz)', 'Load participation'], rows: md.f.map((f, i) => [i + 1, fmt(f, 5), fmt(pi[i], 4)]) });
  r.notes.push(`${peakLabel}.`);
  describeInputs(r, P, sl);
  return r;
}
