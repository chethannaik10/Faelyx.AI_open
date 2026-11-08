// Shared helpers for the analysis modules: result scaffolding and structural post-processing.

import type { ElasticModel } from './fem';
import { nodalAverage } from './fem';
import { defaultCriterion, failureIndex, invariants, type Criterion } from './materials';
import { analysisSpec, emptyResult, makeField, type FieldDef, type Hotspot, type Progress, type Result } from './model';
import type { Prep } from './prepare';
import { nNodes } from './voxel';

export interface Env { progress: Progress; ctrl?: { cancelled: boolean } }

export const fmt = (v: number, d = 3): string => {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'n/a';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6 || a < 1e-3) return v.toExponential(Math.max(1, d - 1));
  if (a >= 100) return v.toFixed(Math.max(0, d - 3 + (a >= 1000 ? 0 : 0)));
  return v.toPrecision(d).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m));
};

export function baseResult(P: Prep, analysis: Result['analysis'], elemType: string, t0: number): Result {
  const spec = analysisSpec(analysis);
  const r = emptyResult(analysis, spec.label);
  const g = P.g;
  r.grid = { nx: g.nx, ny: g.ny, nz: g.nz, h: g.h, ox: g.ox, oy: g.oy, oz: g.oz };
  const mask = new Uint8Array(g.mat.length);
  for (let e = 0; e < g.nElem; e++) { const v = g.elem[e]; if (P.air < 0 || g.mat[v] !== P.air + 1) mask[v] = 1; }
  r.mask = mask;
  r.matIndex = g.mat;
  r.bodies = P.mats.map((m, i) => (P.bodyOf[i] >= 0 ? P.input.bodies[P.bodyOf[i]].name : 'Air') + ` (${m.name})`);
  let solid = 0; for (let i = 0; i < mask.length; i++) solid += mask[i];
  r.mesh = {
    type: elemType, elements: solid, nodes: countActive(P), dof: 0, h: g.h, bodyVolume: solid * g.h ** 3, minDim: P.minDim,
    quality: `${(P.minDim / g.h).toFixed(1)} elements across the thinnest dimension`, time: Date.now() - t0,
  };
  for (const w of P.warnings) r.notes.push(w);
  if (P.minDim / g.h < 3) r.notes.push(`The thinnest dimension of the part spans only ${(P.minDim / g.h).toFixed(1)} elements: bending and local stresses are poorly resolved. Refine the mesh.`);
  r.assumptions.push(...spec.limits);
  return r;
}

function countActive(P: Prep): number {
  const g = P.g, act = new Uint8Array(nNodes(g));
  const sx = 1, sy = g.nx + 1, sz = (g.nx + 1) * (g.ny + 1);
  let n = 0;
  for (let e = 0; e < g.nElem; e++) {
    const v = g.elem[e], k = Math.floor(v / (g.nx * g.ny)), rr = v - k * g.nx * g.ny, j = Math.floor(rr / g.nx), i = rr - j * g.nx;
    const b = i + j * sy + k * sz;
    for (const o of [0, sx, sy, sx + sy, sz, sz + sx, sz + sy, sz + sx + sy]) if (!act[b + o]) { act[b + o] = 1; n++; }
  }
  return n;
}

export function critOf(P: Prep, mi: number, requested: string): Criterion {
  if (requested && requested !== 'auto') return requested as Criterion;
  return defaultCriterion(P.mats[mi]);
}

export interface StructPost {
  fields: FieldDef[];
  vmElem: Float32Array; idxElem: Float32Array;
  maxVm: number; minFos: number; maxDisp: number; maxS1: number; minS3: number;
  hotspots: Hotspot[];
  unitStress: string;
}

function maxima(P: Prep, val: Float32Array, n: number, sep: number, label: string, fieldId: string, minimum = false): Hotspot[] {
  const g = P.g, idx: number[] = [];
  for (let e = 0; e < g.nElem; e++) idx.push(e);
  idx.sort((a, b) => (minimum ? val[a] - val[b] : val[b] - val[a]));
  const out: Hotspot[] = [];
  const nxy = g.nx * g.ny;
  const pos = (e: number): [number, number, number] => {
    const v = g.elem[e], k = Math.floor(v / nxy), rr = v - k * nxy, j = Math.floor(rr / g.nx), i = rr - j * g.nx;
    return [g.ox + (i + 0.5) * g.h, g.oy + (j + 0.5) * g.h, g.oz + (k + 0.5) * g.h];
  };
  for (const e of idx) {
    if (out.length >= n) break;
    const p = pos(e);
    if (out.some((h) => Math.hypot(h.x - p[0], h.y - p[1], h.z - p[2]) < sep)) continue;
    out.push({ x: p[0], y: p[1], z: p[2], value: val[e], label: `${label} #${out.length + 1}`, fieldId });
  }
  return out;
}
export { maxima };

/** Fields for a stress state: displacement, stress components, invariants, strain and the safety factor. */
export function structPost(P: Prep, model: ElasticModel, u: Float64Array, sig: Float32Array, requested: string, dT?: ArrayLike<number> | null): StructPost {
  const g = P.g, nn = nNodes(g), ne = g.nElem;
  const vm = new Float32Array(ne), tr = new Float32Array(ne), s1 = new Float32Array(ne), s3 = new Float32Array(ne), idx = new Float32Array(ne), hyd = new Float32Array(ne), ese = new Float32Array(ne);
  const eps = model.elementStrain(u, dT, !!dT);
  const eq = new Float32Array(ne);
  let maxVm = 0, maxIdx = 0, maxS1 = -Infinity, minS3 = Infinity;
  for (let e = 0; e < ne; e++) {
    const mi = g.mat[g.elem[e]] - 1;
    const iv = invariants(sig, e * 6);
    vm[e] = iv.vm; tr[e] = iv.tresca; s1[e] = iv.s1; s3[e] = iv.s3; hyd[e] = iv.hydro;
    idx[e] = failureIndex(P.mats[mi], critOf(P, mi, requested), sig, e * 6, P.fibre[mi]);
    // equivalent (von Mises) strain
    const ex = eps[e * 6], ey = eps[e * 6 + 1], ez = eps[e * 6 + 2], gxy = eps[e * 6 + 3], gyz = eps[e * 6 + 4], gzx = eps[e * 6 + 5];
    const nu = 0.3;
    eq[e] = (Math.SQRT2 / (3 * (1 + nu))) * Math.sqrt((ex - ey) ** 2 + (ey - ez) ** 2 + (ez - ex) ** 2 + 1.5 * (gxy * gxy + gyz * gyz + gzx * gzx));
    const w = 0.5 * (sig[e * 6] * eps[e * 6] + sig[e * 6 + 1] * eps[e * 6 + 1] + sig[e * 6 + 2] * eps[e * 6 + 2] + sig[e * 6 + 3] * eps[e * 6 + 3] + sig[e * 6 + 4] * eps[e * 6 + 4] + sig[e * 6 + 5] * eps[e * 6 + 5]);
    ese[e] = w;
    if (vm[e] > maxVm) maxVm = vm[e];
    if (idx[e] > maxIdx) maxIdx = idx[e];
    if (s1[e] > maxS1) maxS1 = s1[e];
    if (s3[e] < minS3) minS3 = s3[e];
  }
  const avg1 = (a: Float32Array) => nodalAverage(g, a, 1);
  const fields: FieldDef[] = [];
  // displacement
  const um = new Float32Array(nn), ux = new Float32Array(nn), uy = new Float32Array(nn), uz = new Float32Array(nn);
  let maxDisp = 0;
  for (let n = 0; n < nn; n++) {
    ux[n] = u[3 * n]; uy[n] = u[3 * n + 1]; uz[n] = u[3 * n + 2];
    um[n] = Math.hypot(ux[n], uy[n], uz[n]);
    if (um[n] > maxDisp) maxDisp = um[n];
  }
  fields.push(makeField('disp', 'Total displacement', 'mm', 'node', um));
  fields.push(makeField('ux', 'Displacement X', 'mm', 'node', ux, { diverging: true }));
  fields.push(makeField('uy', 'Displacement Y', 'mm', 'node', uy, { diverging: true }));
  fields.push(makeField('uz', 'Displacement Z', 'mm', 'node', uz, { diverging: true }));
  fields.push(makeField('vm', 'Equivalent (von Mises) stress', 'MPa', 'node', avg1(vm)));
  fields.push(makeField('tresca', 'Maximum shear stress ×2 (Tresca)', 'MPa', 'node', avg1(tr)));
  fields.push(makeField('s1', 'Maximum principal stress', 'MPa', 'node', avg1(s1), { diverging: true }));
  fields.push(makeField('s3', 'Minimum principal stress', 'MPa', 'node', avg1(s3), { diverging: true }));
  fields.push(makeField('hydro', 'Mean (hydrostatic) stress', 'MPa', 'node', avg1(hyd), { diverging: true }));
  const comp = ['sxx', 'syy', 'szz', 'sxy', 'syz', 'szx'], cl = ['Normal stress X', 'Normal stress Y', 'Normal stress Z', 'Shear stress XY', 'Shear stress YZ', 'Shear stress ZX'];
  for (let k = 0; k < 6; k++) {
    const a = new Float32Array(ne); for (let e = 0; e < ne; e++) a[e] = sig[e * 6 + k];
    fields.push(makeField(comp[k], cl[k], 'MPa', 'node', avg1(a), { diverging: true }));
  }
  fields.push(makeField('strain', 'Equivalent strain', 'mm/mm', 'node', avg1(eq)));
  fields.push(makeField('sed', 'Strain energy density', 'mJ/mm³', 'node', avg1(ese)));
  // safety factor from the nodal-averaged failure index (smooth) and the element-wise minimum for the report
  const nodalIdx = avg1(idx), fos = new Float32Array(nn);
  for (let n = 0; n < nn; n++) fos[n] = nodalIdx[n] > 1e-6 ? Math.min(100, 1 / nodalIdx[n]) : 100;
  fields.push(makeField('fos', 'Factor of safety', '', 'node', fos, { lowIsBad: true }));
  fields.push(makeField('idx', 'Failure index (1 = failure)', '', 'node', nodalIdx));
  const hot = maxima(P, vm, 3, 4 * g.h, 'Peak stress', 'vm');
  const weakest = maxima(P, idx, 1, 4 * g.h, 'Lowest safety factor', 'fos').map((h) => ({ ...h, value: h.value > 0 ? 1 / h.value : 100 }));
  const minFos = maxIdx > 0 ? 1 / maxIdx : Infinity;
  return { fields, vmElem: vm, idxElem: idx, maxVm, minFos, maxDisp, maxS1, minS3, hotspots: [...hot, ...weakest], unitStress: 'MPa' };
}

/** Reaction forces at the constrained nodes: the sum must balance the applied loads. */
export function reactions(model: ElasticModel, u: Float64Array, force: Float64Array, spring?: Float64Array): { sum: [number, number, number]; max: number } {
  const mg = model.mg!, n = u.length, ku = new Float64Array(n), mask = mg.fixedMask(), sum: [number, number, number] = [0, 0, 0];
  mg.applyFull(u, ku);
  let max = 0;
  for (let i = 0; i < n; i++) if (mask[i] && mg.active[(i / 3) | 0]) { const r = ku[i] - force[i]; sum[i % 3] += r; if (Math.abs(r) > max) max = Math.abs(r); }
  if (spring) for (let i = 0; i < n; i++) if (spring[i] && !mask[i]) sum[i % 3] += spring[i] * u[i];
  return { sum, max };
}
