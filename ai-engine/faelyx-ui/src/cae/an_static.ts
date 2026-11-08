// Static structural analysis, mesh convergence study and hot-spot sub-modelling.

import { baseResult, fmt, reactions, structPost, type Env, type StructPost } from './base';
import { ElasticModel } from './fem';
import { buildStructLoads, requireSupports, type StructLoads } from './loads';
import type { CaseInput, Result, TableData } from './model';
import { bodiesBox, boxSize, prepare, elementSize, type Prep } from './prepare';
import { locate, nNodes, nodeXYZ } from './voxel';
import type { Axis } from './materials';

export interface StaticCore {
  P: Prep; model: ElasticModel; sl: StructLoads; u: Float64Array; sig: Float32Array; post: StructPost;
  iterations: number; residual: number; solveMs: number; energy: number; react: { sum: [number, number, number]; max: number }; ms: number;
}

export const boolP = (input: CaseInput, k: string) => !!input.params[k];
export const numP = (input: CaseInput, k: string, d = 0) => { const v = input.params[k]; return typeof v === 'number' && Number.isFinite(v) ? v : d; };
export const strP = (input: CaseInput, k: string, d = '') => { const v = input.params[k]; return typeof v === 'string' ? v : d; };

export function solveStaticCore(input: CaseInput, env: Env, h?: number, tag = '', extra?: (P: Prep, sl: StructLoads) => void): StaticCore {
  const t0 = Date.now();
  env.progress(0.03, `${tag}Voxelising the model`);
  const P = prepare(input, { h });
  const model = new ElasticModel(P.g, P.mats, { tet: strP(input, 'elem') === 'tet', fibre: P.fibre as Axis[] });
  const sl = buildStructLoads(P, model, { selfweight: boolP(input, 'selfweight') });
  if (extra) extra(P, sl);
  requireSupports(sl, 'A static analysis');
  env.progress(0.12, `${tag}Building the multigrid solver (${P.g.nElem.toLocaleString()} elements)`);
  model.build(sl.bc);
  env.progress(0.2, `${tag}Solving`);
  const { u, info } = model.solveStatic(sl.bc, null, 1e-7, 500, (it, res) => env.progress(0.2 + 0.55 * Math.min(1, Math.log10(1 / Math.max(res, 1e-12)) / 7), `${tag}Solving: iteration ${it}, residual ${res.toExponential(1)}`));
  env.progress(0.78, `${tag}Recovering stresses`);
  const sig = model.elementStress(u);
  const post = structPost(P, model, u, sig, strP(input, 'criterion', 'auto'));
  const react = reactions(model, u, sl.bc.force, sl.bc.spring);
  return { P, model, sl, u, sig, post, iterations: info.iterations, residual: info.residual, solveMs: info.ms, energy: model.strainEnergy(u), react, ms: Date.now() - t0 };
}

export function addMeshAndSolver(r: Result, c: StaticCore, name: string) {
  r.mesh.dof = 3 * r.mesh.nodes;
  r.mesh.time = c.ms;
  r.solver = { name, iterations: c.iterations, residual: c.residual, time: c.ms, log: [`Multigrid-preconditioned conjugate gradient, ${c.iterations} iterations, final relative residual ${c.residual.toExponential(2)}`, `Solve time ${(c.solveMs / 1000).toFixed(2)} s`] };
}

export function describeInputs(r: Result, P: Prep, sl?: StructLoads) {
  r.inputs.push({ label: 'Bodies', value: P.input.bodies.map((b) => `${b.name}: ${b.mat.name}`).join('; ') });
  if (sl) for (const i of sl.info) r.inputs.push({ label: i.label, value: i.text });
}

export function dispScaleFor(P: Prep, maxDisp: number): number {
  const s = boxSize(P.box), L = Math.max(s[0], s[1], s[2]);
  if (maxDisp <= 0) return 1;
  return Math.max(1, Math.min(1e6, (0.08 * L) / maxDisp));
}

export function bodyTable(P: Prep, c: { post: StructPost; model: ElasticModel }): TableData {
  const g = P.g, n = P.mats.length;
  const vol = new Float64Array(n), mx = new Float64Array(n), idx = new Float64Array(n);
  for (let e = 0; e < g.nElem; e++) {
    const mi = g.mat[g.elem[e]] - 1;
    vol[mi] += g.h ** 3;
    if (c.post.vmElem[e] > mx[mi]) mx[mi] = c.post.vmElem[e];
    if (c.post.idxElem[e] > idx[mi]) idx[mi] = c.post.idxElem[e];
  }
  const rows: (string | number)[][] = [];
  for (let i = 0; i < n; i++) {
    if (!vol[i]) continue;
    const name = P.bodyOf[i] >= 0 ? P.input.bodies[P.bodyOf[i]].name : 'Air';
    rows.push([name, P.mats[i].name, fmt(vol[i] * P.mats[i].rho * 1e-9, 3), fmt(mx[i], 3), fmt(P.mats[i].yield, 3), idx[i] > 0 ? fmt(1 / idx[i], 3) : '∞']);
  }
  return { id: 'bodies', title: 'Results by body', cols: ['Body', 'Material', 'Mass (kg)', 'Peak σ_vm (MPa)', 'Yield (MPa)', 'Min FOS'], rows };
}

export function runStatic(input: CaseInput, env: Env): Result {
  const c = solveStaticCore(input, env, undefined, '', (_P, l) => {
    // a run whose loads resolved to nothing would report a meaningless "PASS" with zero stress
    if (Math.hypot(l.force[0], l.force[1], l.force[2]) === 0 && !l.info.some((i) => /^(Acceleration|Rotation|Gravity)/.test(i.text))) {
      throw new Error(`No load acts on the part. ${l.warnings.filter((w) => !w.startsWith('Point and line')).join(' ') || 'Add a force, pressure, torque or gravity load.'}`);
    }
  });
  const { P, post, sl } = c;
  {
    // a part that can move freely (one fixed edge is only a hinge line, one fixed point only a ball joint) has no meaningful answer
    const rs0 = c.react.sum, ap0 = sl.force, eq0 = Math.hypot(rs0[0] + ap0[0], rs0[1] + ap0[1], rs0[2] + ap0[2]), sc0 = Math.max(Math.hypot(...ap0), Math.hypot(...rs0), 1e-9);
    const sz = boxSize(P.box), big = Math.max(sz[0], sz[1], sz[2]);
    if (eq0 / sc0 > 0.05 || post.maxDisp > 100 * big) {
      throw new Error('The supports do not hold the part still: it can move or rotate freely. A fixed edge only acts as a hinge line and a fixed point as a ball joint. Fix a surface, or combine supports (for example an edge plus a point away from it, or several edges that are not parallel).');
    }
  }
  const r = baseResult(P, 'static', strP(input, 'elem') === 'tet' ? 'Tetrahedral (split voxel, 6 per cell)' : 'Hexahedral 8-node, incompatible modes', Date.now() - c.ms);
  addMeshAndSolver(r, c, 'Geometric multigrid PCG');
  r.fields = post.fields; r.defaultField = 'vm';
  r.disp = Float32Array.from(c.u); r.dispScale = dispScaleFor(P, post.maxDisp);
  r.hotspots = post.hotspots;
  const target = numP(input, 'fosTarget', 1.5);
  const mass = c.model.totalMass() * 1000;
  r.kv.push({ label: 'Maximum displacement', value: `${fmt(post.maxDisp)} mm`, status: 'info' });
  r.kv.push({ label: 'Maximum von Mises stress', value: `${fmt(post.maxVm)} MPa`, status: 'info' });
  r.kv.push({ label: 'Maximum principal stress', value: `${fmt(post.maxS1)} MPa` });
  r.kv.push({ label: 'Minimum principal stress', value: `${fmt(post.minS3)} MPa` });
  r.kv.push({ label: 'Minimum factor of safety', value: fmt(post.minFos, 3), status: post.minFos >= target ? 'ok' : post.minFos >= 1 ? 'warn' : 'fail' });
  r.kv.push({ label: 'Strain energy', value: `${fmt(c.energy)} N·mm` });
  r.kv.push({ label: 'Mass', value: `${fmt(mass)} kg` });
  const rs = c.react.sum, ap = sl.force;
  const eq = Math.hypot(rs[0] + ap[0], rs[1] + ap[1], rs[2] + ap[2]), scale = Math.max(Math.hypot(...ap), Math.hypot(...rs), 1e-9);
  r.kv.push({ label: 'Reaction force', value: `(${rs.map((v) => fmt(v, 4)).join(', ')}) N` });
  r.checks.push({ name: 'Factor of safety', value: fmt(post.minFos, 3), limit: `≥ ${target}`, ok: post.minFos >= target, note: post.minFos < 1 ? 'Predicted to fail (yield/ultimate exceeded).' : undefined });
  r.checks.push({ name: 'Force equilibrium (reactions vs. applied)', value: `${(100 * eq / scale).toFixed(3)} %`, limit: '< 0.5 %', ok: eq / scale < 0.005 });
  r.tables.push(bodyTable(P, c));
  describeInputs(r, P, sl);
  for (const w of sl.warnings) r.notes.push(w);
  r.curves = [];
  if (boolP(input, 'refine') && post.hotspots.length) {
    try { subModel(input, env, c, r); } catch (e) { r.notes.push(`Hot-spot refinement failed: ${(e as Error).message}`); }
  }
  if (post.minFos < 1) r.notes.push('The loads exceed the strength of the material at the location(s) marked as hot-spots. Because the model is linear, the predicted stress above yield is not realistic (plasticity would redistribute it).');
  r.verdict = { pass: post.minFos >= target, text: post.minFos >= target ? `PASS: minimum factor of safety ${fmt(post.minFos, 3)} meets the requirement of ${target}.` : `FAIL: minimum factor of safety ${fmt(post.minFos, 3)} is below the requirement of ${target}.` };
  return r;
}

// ---------------------------------------------------------------------------------------------
// Sub-model: re-solves a box around the peak stress at half the element size

function subModel(input: CaseInput, env: Env, c: StaticCore, r: Result) {
  const P = c.P, g = P.g;
  const hot = c.post.hotspots[0];
  const half = 6 * g.h, h2 = g.h / 2;                       // box side 12 h = 24 h2 (multiple of 8 cells)
  const min: [number, number, number] = [hot.x - half, hot.y - half, hot.z - half], max: [number, number, number] = [hot.x + half, hot.y + half, hot.z + half];
  env.progress(0.82, 'Sub-model: voxelising the hot-spot region at half the element size');
  const P0 = prepare(input, { h: h2, clip: { min, max } });
  if (P0.g.nElem === 0) throw new Error('the sub-model region is empty');
  // concentrated loads are shared with the global model by area ratio
  const loads2 = input.loads.map((l) => {
    if (l.type !== 'force' && l.type !== 'torque') return l;
    if (P.isNodeRegion(l.region)) return l;
    const a = P.faces(l.region).length * g.h * g.h, b = P0.faces(l.region).length * h2 * h2;
    return { ...l, p: scaleLoad(l.type, l.p, a > 0 ? b / a : 0) };
  });
  const P2 = prepare({ ...input, loads: loads2 }, { h: h2, clip: { min, max } });
  const g2 = P2.g, nn2 = nNodes(g2);
  const model2 = new ElasticModel(g2, P2.mats, { tet: strP(input, 'elem') === 'tet', fibre: P2.fibre as Axis[] });
  const sl2 = buildStructLoads(P2, model2, { selfweight: boolP(input, 'selfweight') });
  const bc = sl2.bc, pre = new Float64Array(3 * nn2);
  const act2 = activeSet(g2), actC = activeSet(g), nnC = nNodes(g);
  for (let n = 0; n < nn2; n++) {
    if (!act2[n]) continue;
    const [x, y, z] = nodeXYZ(g2, n);
    const sx = g2.nx + 1, sxy = (g2.nx + 1) * (g2.ny + 1), k = Math.floor(n / sxy), rr = n - k * sxy, j = Math.floor(rr / sx), i = rr - j * sx;
    if (i > 0 && j > 0 && k > 0 && i < g2.nx && j < g2.ny && k < g2.nz) continue;           // interior node
    const loc = locate(g, x, y, z);
    if (!loc) continue;
    let wsum = 0; const v = [0, 0, 0];
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const nd = loc.n0 + dx + dy * (g.nx + 1) + dz * (g.nx + 1) * (g.ny + 1);
      if (nd >= nnC || !actC[nd]) continue;
      const w = (dx ? loc.fx : 1 - loc.fx) * (dy ? loc.fy : 1 - loc.fy) * (dz ? loc.fz : 1 - loc.fz);
      wsum += w; v[0] += w * c.u[3 * nd]; v[1] += w * c.u[3 * nd + 1]; v[2] += w * c.u[3 * nd + 2];
    }
    if (wsum < 1e-9) continue;
    for (let q = 0; q < 3; q++) if (!bc.fixed[3 * n + q]) { bc.fixed[3 * n + q] = 1; pre[3 * n + q] = v[q] / wsum; }
  }
  env.progress(0.88, 'Sub-model: solving');
  model2.build(bc);
  const { u: u2 } = model2.solvePrescribed(bc, pre, null, 1e-7, 400);
  const sig2 = model2.elementStress(u2);
  const post2 = structPost(P2, model2, u2, sig2, strP(input, 'criterion', 'auto'));
  // the peak is taken away from the cut planes (interior elements only)
  let peak2 = 0;
  const nxy = g2.nx * g2.ny, m = 3;
  for (let e = 0; e < g2.nElem; e++) {
    const v = g2.elem[e], k = Math.floor(v / nxy), rr = v - k * nxy, j = Math.floor(rr / g2.nx), i = rr - j * g2.nx;
    if (i < m || j < m || k < m || i >= g2.nx - m || j >= g2.ny - m || k >= g2.nz - m) continue;
    if (post2.vmElem[e] > peak2) peak2 = post2.vmElem[e];
  }
  const peak1 = c.post.maxVm;
  r.tables.push({ id: 'submodel', title: 'Hot-spot refinement (sub-model at half the element size)', cols: ['Model', 'Element size (mm)', 'Elements', 'Peak σ_vm (MPa)'], rows: [['Global model', fmt(g.h), g.nElem, fmt(peak1)], ['Sub-model', fmt(h2), g2.nElem, fmt(peak2)]] });
  const ch = peak1 > 0 ? (100 * (peak2 - peak1)) / peak1 : 0;
  r.kv.push({ label: 'Peak stress after hot-spot refinement', value: `${fmt(peak2)} MPa (${ch >= 0 ? '+' : ''}${ch.toFixed(1)} %)`, status: Math.abs(ch) < 10 ? 'ok' : 'warn' });
  r.notes.push(Math.abs(ch) < 10 ? `Hot-spot refinement changed the peak stress by ${ch.toFixed(1)} %: the global mesh is adequate there.` : `Hot-spot refinement changed the peak stress by ${ch.toFixed(1)} %: the global mesh is too coarse at the hot-spot, or the stress is a singularity. Refine the mesh or run the convergence study.`);
}

function scaleLoad(type: string, p: Record<string, number>, ratio: number): Record<string, number> {
  const q = { ...p };
  if (type === 'force') { q.fx = (p.fx ?? 0) * ratio; q.fy = (p.fy ?? 0) * ratio; q.fz = (p.fz ?? 0) * ratio; }
  if (type === 'torque') q.m = (p.m ?? 0) * ratio;
  return q;
}

function activeSet(g: { nx: number; ny: number; nz: number; nElem: number; elem: Int32Array }): Uint8Array {
  const a = new Uint8Array((g.nx + 1) * (g.ny + 1) * (g.nz + 1)), sy = g.nx + 1, sz = (g.nx + 1) * (g.ny + 1), nxy = g.nx * g.ny;
  for (let e = 0; e < g.nElem; e++) {
    const v = g.elem[e], k = Math.floor(v / nxy), rr = v - k * nxy, j = Math.floor(rr / g.nx), i = rr - j * g.nx, b = i + j * sy + k * sz;
    a[b] = a[b + 1] = a[b + sy] = a[b + sy + 1] = a[b + sz] = a[b + sz + 1] = a[b + sz + sy] = a[b + sz + sy + 1] = 1;
  }
  return a;
}

// ---------------------------------------------------------------------------------------------
// Mesh convergence study

export function runConvergence(input: CaseInput, env: Env): Result {
  const levels = Math.round(numP(input, 'levels', 3)), ratio = numP(input, 'ratio', 1.4), tol = numP(input, 'tolPct', 5);
  const box = bodiesBox(input.bodies.filter((b) => b.role !== 'carve'));
  const hFine = elementSize(box, input.mesh);
  const hs: number[] = [];
  for (let k = 0; k < levels; k++) hs.push(hFine * Math.pow(ratio, levels - 1 - k));
  const runs: StaticCore[] = [];
  for (let k = 0; k < levels; k++) {
    const sub: Env = { progress: (p, l) => env.progress((k + p) / levels, l), ctrl: env.ctrl };
    const c = solveStaticCore({ ...input, params: { ...input.params, refine: false } }, sub, hs[k], `Mesh ${k + 1}/${levels}: `);
    runs.push(c);
  }
  const last = runs[levels - 1];
  const r = baseResult(last.P, 'convergence', 'Hexahedral', Date.now() - last.ms);
  addMeshAndSolver(r, last, 'Geometric multigrid PCG');
  r.fields = last.post.fields; r.defaultField = 'vm';
  r.disp = Float32Array.from(last.u); r.dispScale = dispScaleFor(last.P, last.post.maxDisp);
  r.hotspots = last.post.hotspots;
  const nodalPeak = (c: StaticCore) => c.post.fields.find((f) => f.id === 'vm')!.max;
  const rows = runs.map((c, k) => [k + 1, fmt(hs[k]), c.P.g.nElem, fmt(c.post.maxDisp, 5), fmt(nodalPeak(c)), fmt(c.post.maxVm), fmt(c.energy, 5), fmt(c.post.minFos)]);
  r.tables.push({ id: 'conv', title: 'Mesh sequence', cols: ['Mesh', 'Element size (mm)', 'Elements', 'Max displacement (mm)', 'Peak σ_vm, nodal (MPa)', 'Peak σ_vm, element (MPa)', 'Strain energy (N·mm)', 'Min FOS'], rows });
  const ser = (name: string, f: (c: StaticCore) => number): { name: string; x: number[]; y: number[] } => ({ name, x: runs.map((c) => c.P.g.nElem), y: runs.map(f) });
  const norm = (f: (c: StaticCore) => number) => { const v = runs.map(f); const ref = v[v.length - 1] || 1; return v.map((x) => x / ref); };
  r.curves.push({ id: 'conv', title: 'Convergence (normalised by the finest mesh)', xlabel: 'Elements', ylabel: 'Value / finest', logx: true, series: [
    { name: 'Max displacement', x: runs.map((c) => c.P.g.nElem), y: norm((c) => c.post.maxDisp) }, { name: 'Strain energy', x: runs.map((c) => c.P.g.nElem), y: norm((c) => c.energy) }, { name: 'Peak stress (nodal)', x: runs.map((c) => c.P.g.nElem), y: norm(nodalPeak) }] });
  void ser;
  const rel = (a: number, b: number) => (b !== 0 ? (100 * Math.abs(a - b)) / Math.abs(b) : 0);
  const n = levels;
  const dChange = rel(runs[n - 1].post.maxDisp, runs[n - 2].post.maxDisp), sChange = rel(nodalPeak(runs[n - 1]), nodalPeak(runs[n - 2])), eChange = rel(runs[n - 1].energy, runs[n - 2].energy);
  let extrap = '';
  if (n >= 3) {
    const f = runs.map((c) => c.energy), rr = hs[n - 2] / hs[n - 1];
    const d1 = f[n - 2] - f[n - 3], d2 = f[n - 1] - f[n - 2];
    if (d1 * d2 > 0 && Math.abs(d2) < Math.abs(d1)) {
      const p = Math.log(d1 / d2) / Math.log(rr);
      const fx = f[n - 1] + d2 / (Math.pow(rr, p) - 1);
      extrap = `Richardson extrapolation of the strain energy: order ${p.toFixed(2)}, converged value ${fmt(fx, 5)} N·mm (${rel(f[n - 1], fx).toFixed(2)} % from the finest mesh).`;
    }
  }
  const stressSingular = n >= 3 && nodalPeak(runs[n - 1]) > 1.3 * nodalPeak(runs[n - 2]) && nodalPeak(runs[n - 2]) > 1.3 * nodalPeak(runs[n - 3]);
  r.kv.push({ label: 'Displacement change (last refinement)', value: `${dChange.toFixed(2)} %`, status: dChange < tol ? 'ok' : 'warn' });
  r.kv.push({ label: 'Strain-energy change (last refinement)', value: `${eChange.toFixed(2)} %`, status: eChange < tol ? 'ok' : 'warn' });
  r.kv.push({ label: 'Peak-stress change (last refinement)', value: `${sChange.toFixed(2)} %`, status: sChange < tol ? 'ok' : stressSingular ? 'fail' : 'warn' });
  r.kv.push({ label: 'Finest mesh', value: `${last.P.g.nElem.toLocaleString()} elements, h = ${fmt(hs[n - 1])} mm` });
  r.checks.push({ name: 'Displacement converged', value: `${dChange.toFixed(2)} %`, limit: `< ${tol} %`, ok: dChange < tol });
  r.checks.push({ name: 'Strain energy converged', value: `${eChange.toFixed(2)} %`, limit: `< ${tol} %`, ok: eChange < tol });
  r.checks.push({ name: 'Peak stress converged', value: `${sChange.toFixed(2)} %`, limit: `< ${tol} %`, ok: sChange < tol, note: stressSingular ? 'Stress grows with every refinement: a stress singularity (sharp corner or point load).' : undefined });
  if (extrap) r.notes.push(extrap);
  if (stressSingular) r.notes.push('The peak stress keeps rising with the mesh density, which indicates a singularity. Do not use that value for a strength check: round the corner, spread the load or evaluate the stress away from the singular point.');
  const okAll = dChange < tol && eChange < tol && sChange < tol;
  r.verdict = { pass: okAll, text: okAll ? `CONVERGED: displacement, strain energy and peak stress change by less than ${tol} % between the two finest meshes.` : `NOT CONVERGED: ${[dChange >= tol ? 'displacement' : '', eChange >= tol ? 'strain energy' : '', sChange >= tol ? 'peak stress' : ''].filter(Boolean).join(', ')} still changing by more than ${tol} %. Use a finer mesh.` };
  describeInputs(r, last.P, last.sl);
  return r;
}
