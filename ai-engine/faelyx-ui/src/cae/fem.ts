// Linear elasticity on the voxel grid: model set-up, loads, static solution, stress recovery.
// Units: mm, N, MPa, tonne, s (density in t/mm³, acceleration in mm/s²).

import { constitutive, alphaGlobal, type Axis, type Material } from './materials';
import { hexElastic, tetElastic, type ElasticTpl } from './elem';
import { MGOperator, type SolveInfo } from './mg';
import { FACE_NORMAL, activeNodes, elemBaseNodes, faceNodes, cornerOffsets, nNodes, nodeXYZ, type Grid, type SurfFace } from './voxel';

export const G_ACC = 9810;            // mm/s²

export interface StructBC {
  fixed: Uint8Array;                   // 3·nn, 1 = constrained
  spring: Float64Array;                // 3·nn nodal spring stiffness (N/mm), may be all zero
  force: Float64Array;                 // 3·nn nodal forces (N)
}

export const newBC = (g: Grid): StructBC => { const nn = nNodes(g); return { fixed: new Uint8Array(3 * nn), spring: new Float64Array(3 * nn), force: new Float64Array(3 * nn) }; };

export class ElasticModel {
  readonly g: Grid;
  readonly mats: Material[];
  readonly fibre: Axis[];
  readonly tet: boolean;
  readonly tpls: ElasticTpl[];
  readonly base: Int32Array;
  readonly off: Int32Array;
  readonly nn: number;
  readonly alpha: [number, number, number][];
  readonly rho: number[];                       // t/mm³
  mg: MGOperator | null = null;

  constructor(g: Grid, mats: Material[], opts: { tet?: boolean; fibre?: Axis[] } = {}) {
    this.g = g; this.mats = mats; this.tet = !!opts.tet;
    this.fibre = mats.map((_, i) => opts.fibre?.[i] ?? 0);
    this.tpls = mats.map((m, i) => { const C = constitutive(m, this.fibre[i]); return this.tet ? tetElastic(C) : hexElastic(C); });
    this.alpha = mats.map((m, i) => alphaGlobal(m, this.fibre[i]).map((a) => a * 1e-6) as [number, number, number]);
    this.rho = mats.map((m) => m.rho * 1e-12);
    this.base = elemBaseNodes(g);
    this.off = cornerOffsets(g);
    this.nn = nNodes(g);
  }

  /** (Re)builds the multigrid operator for the given constraints and springs. Extra diagonal terms are optional (shift). */
  build(bc: Pick<StructBC, 'fixed' | 'spring'>, shift?: Float64Array | null): MGOperator {
    let extra: Float64Array | null = null;
    if (shift || bc.spring.some((v) => v !== 0)) {
      extra = new Float64Array(3 * this.nn);
      for (let i = 0; i < extra.length; i++) extra[i] = (bc.spring[i] || 0) + (shift ? shift[i] : 0);
    }
    this.mg = new MGOperator(this.g, this.tpls, 3, bc.fixed, extra);
    return this.mg;
  }

  /** Lumped mass per node (tonne), equal for the three directions */
  nodalMass(): Float64Array {
    const g = this.g, m = new Float64Array(this.nn), v8 = (g.h ** 3) / 8;
    for (let e = 0; e < g.nElem; e++) {
      const rho = this.rho[g.mat[g.elem[e]] - 1];
      for (let a = 0; a < 8; a++) m[this.base[e] + this.off[a]] += rho * v8;
    }
    return m;
  }

  totalMass(): number { let s = 0; const m = this.nodalMass(); for (let i = 0; i < m.length; i++) s += m[i]; return s; }

  /** Body force from a uniform acceleration (mm/s², applied as an inertial load: f = m·a is added to the load vector with sign +) */
  addAcceleration(f: Float64Array, a: [number, number, number]) {
    const m = this.nodalMass();
    for (let n = 0; n < this.nn; n++) if (m[n]) { f[3 * n] += m[n] * a[0]; f[3 * n + 1] += m[n] * a[1]; f[3 * n + 2] += m[n] * a[2]; }
  }

  /** Centrifugal load for rotation ω (rad/s) about the axis through `p` with unit direction `ax` */
  addCentrifugal(f: Float64Array, omega: number, p: [number, number, number], ax: [number, number, number]) {
    const m = this.nodalMass(), g = this.g;
    for (let n = 0; n < this.nn; n++) {
      if (!m[n]) continue;
      const [x, y, z] = nodeXYZ(g, n);
      const rx = x - p[0], ry = y - p[1], rz = z - p[2];
      const dd = rx * ax[0] + ry * ax[1] + rz * ax[2];
      const px = rx - dd * ax[0], py = ry - dd * ax[1], pz = rz - dd * ax[2];
      const k = m[n] * omega * omega;
      f[3 * n] += k * px; f[3 * n + 1] += k * py; f[3 * n + 2] += k * pz;
    }
  }

  /** Thermal strain load for the nodal temperature change dT (K) */
  thermalLoad(dT: ArrayLike<number>): Float64Array {
    const f = new Float64Array(3 * this.nn), g = this.g;
    for (let e = 0; e < g.nElem; e++) {
      const mi = g.mat[g.elem[e]] - 1, tpl = this.tpls[mi], al = this.alpha[mi];
      let t = 0;
      for (let a = 0; a < 8; a++) t += dT[this.base[e] + this.off[a]];
      t /= 8;
      if (t === 0) continue;
      const hf = g.h * g.h;                 // ∫BᵀCe dV scales with h²
      for (let a = 0; a < 8; a++) {
        const nd = (this.base[e] + this.off[a]) * 3;
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let k = 0; k < 3; k++) s += al[k] * t * tpl.Bth[k * 24 + a * 3 + c];
          f[nd + c] += hf * s;
        }
      }
    }
    return f;
  }

  solveStatic(bc: StructBC, extraLoad?: Float64Array | null, tol = 1e-8, maxIt = 400, onProgress?: (it: number, res: number) => void): { u: Float64Array; info: SolveInfo } {
    const mg = this.mg ?? this.build(bc);
    const b = Float64Array.from(bc.force);
    if (extraLoad) for (let i = 0; i < b.length; i++) b[i] += extraLoad[i];
    const u = new Float64Array(b.length);
    const info = mg.solve(b, u, tol, maxIt, onProgress);
    return { u, info };
  }

  /** Stress at the centre of every element: Float32Array(6·nElem), Voigt xx yy zz xy yz zx (MPa) */
  elementStress(u: Float64Array, dT?: ArrayLike<number> | null): Float32Array {
    const g = this.g, out = new Float32Array(6 * g.nElem), ue = new Float64Array(24);
    const inv = 1 / g.h;                    // strain operator scales with 1/h
    for (let e = 0; e < g.nElem; e++) {
      const mi = g.mat[g.elem[e]] - 1, tpl = this.tpls[mi];
      for (let a = 0; a < 8; a++) { const nd = (this.base[e] + this.off[a]) * 3; ue[a * 3] = u[nd]; ue[a * 3 + 1] = u[nd + 1]; ue[a * 3 + 2] = u[nd + 2]; }
      const eps = [0, 0, 0, 0, 0, 0];
      for (let r = 0; r < 6; r++) { let s = 0; for (let j = 0; j < 24; j++) s += tpl.Bc[r * 24 + j] * ue[j]; eps[r] = s * inv; }
      if (dT) {
        let t = 0; for (let a = 0; a < 8; a++) t += dT[this.base[e] + this.off[a]]; t /= 8;
        const al = this.alpha[mi];
        eps[0] -= al[0] * t; eps[1] -= al[1] * t; eps[2] -= al[2] * t;
      }
      for (let r = 0; r < 6; r++) { let s = 0; for (let k = 0; k < 6; k++) s += tpl.C[r * 6 + k] * eps[k]; out[e * 6 + r] = s; }
    }
    return out;
  }


  /** Static solution with prescribed (non-zero) values `pre` on the constrained DOFs (sub-modelling). */
  solvePrescribed(bc: StructBC, pre: Float64Array, extraLoad?: Float64Array | null, tol = 1e-8, maxIt = 400, onProgress?: (it: number, res: number) => void): { u: Float64Array; info: SolveInfo } {
    const mg = this.mg ?? this.build(bc);
    const n = 3 * this.nn, up = new Float64Array(n), mask = mg.fixedMask();
    for (let i = 0; i < n; i++) if (bc.fixed[i] && mg.active[(i / 3) | 0]) up[i] = pre[i];
    const Ku = new Float64Array(n);
    mg.applyFull(up, Ku);
    const b = Float64Array.from(bc.force);
    if (extraLoad) for (let i = 0; i < n; i++) b[i] += extraLoad[i];
    for (let i = 0; i < n; i++) b[i] -= Ku[i];
    const x = new Float64Array(n);
    const info = mg.solve(b, x, tol, maxIt, onProgress);
    for (let i = 0; i < n; i++) if (!mask[i]) continue; else x[i] = up[i] || 0;
    return { u: x, info };
  }

  /** Strain at the centre of every element (Voigt, engineering shear): Float32Array(6·nElem) */
  elementStrain(u: Float64Array, dT?: ArrayLike<number> | null, mechanical = false): Float32Array {
    const g = this.g, out = new Float32Array(6 * g.nElem), ue = new Float64Array(24), inv = 1 / g.h;
    for (let e = 0; e < g.nElem; e++) {
      const mi = g.mat[g.elem[e]] - 1, tpl = this.tpls[mi];
      for (let a = 0; a < 8; a++) { const nd = (this.base[e] + this.off[a]) * 3; ue[a * 3] = u[nd]; ue[a * 3 + 1] = u[nd + 1]; ue[a * 3 + 2] = u[nd + 2]; }
      for (let r = 0; r < 6; r++) { let s = 0; for (let j = 0; j < 24; j++) s += tpl.Bc[r * 24 + j] * ue[j]; out[e * 6 + r] = s * inv; }
      if (dT && mechanical) {
        let t = 0; for (let a = 0; a < 8; a++) t += dT[this.base[e] + this.off[a]]; t /= 8;
        const al = this.alpha[mi];
        out[e * 6] -= al[0] * t; out[e * 6 + 1] -= al[1] * t; out[e * 6 + 2] -= al[2] * t;
      }
    }
    return out;
  }

  /** Total strain energy ½ uᵀ K u (N·mm) — computed from element stiffness */
  strainEnergy(u: Float64Array): number {
    const g = this.g, ue = new Float64Array(24);
    let w = 0;
    for (let e = 0; e < g.nElem; e++) {
      const K = this.tpls[g.mat[g.elem[e]] - 1].K;
      for (let a = 0; a < 8; a++) { const nd = (this.base[e] + this.off[a]) * 3; ue[a * 3] = u[nd]; ue[a * 3 + 1] = u[nd + 1]; ue[a * 3 + 2] = u[nd + 2]; }
      let s = 0;
      for (let i = 0; i < 24; i++) { let t = 0; for (let j = 0; j < 24; j++) t += K[i * 24 + j] * ue[j]; s += ue[i] * t; }
      w += 0.5 * g.h * s;
    }
    return w;
  }
}

/** Average element values (k components each) to the nodes of the grid. */
export function nodalAverage(g: Grid, vals: Float32Array, k: number): Float32Array {
  const nn = nNodes(g), out = new Float32Array(nn * k), cnt = new Float32Array(nn);
  const base = elemBaseNodes(g), off = cornerOffsets(g);
  for (let e = 0; e < g.nElem; e++) for (let a = 0; a < 8; a++) {
    const n = base[e] + off[a]; cnt[n]++;
    for (let c = 0; c < k; c++) out[n * k + c] += vals[e * k + c];
  }
  for (let n = 0; n < nn; n++) if (cnt[n]) for (let c = 0; c < k; c++) out[n * k + c] /= cnt[n];
  return out;
}

// ---------------------------------------------------------------------------------------------
// Load helpers working on surface faces

export function faceArea(g: Grid): number { return g.h * g.h; }

/** Pressure p (MPa) acting on the faces (positive = pushing into the body). */
export function addPressure(g: Grid, f: Float64Array, faces: SurfFace[], p: number) {
  const q = (p * g.h * g.h) / 4;
  for (const fc of faces) {
    const n = FACE_NORMAL[fc.dir];
    for (const nd of faceNodes(g, fc)) { f[3 * nd] -= q * n[0]; f[3 * nd + 1] -= q * n[1]; f[3 * nd + 2] -= q * n[2]; }
  }
}

/** Tributary area per node of a face selection */
export function nodeAreas(g: Grid, faces: SurfFace[]): Map<number, number> {
  const m = new Map<number, number>();
  const a = (g.h * g.h) / 4;
  for (const fc of faces) for (const nd of faceNodes(g, fc)) m.set(nd, (m.get(nd) ?? 0) + a);
  return m;
}

export function addForceOnFaces(g: Grid, f: Float64Array, faces: SurfFace[], force: [number, number, number]) {
  const areas = nodeAreas(g, faces);
  let tot = 0; areas.forEach((v) => (tot += v));
  if (tot === 0) return;
  areas.forEach((v, nd) => { const w = v / tot; f[3 * nd] += w * force[0]; f[3 * nd + 1] += w * force[1]; f[3 * nd + 2] += w * force[2]; });
}

/** Moment (N·mm) about the axis (point p, direction ax) distributed as a tangential traction on the faces */
export function addTorqueOnFaces(g: Grid, f: Float64Array, faces: SurfFace[], moment: number, p: [number, number, number], ax: [number, number, number]) {
  const areas = nodeAreas(g, faces);
  let den = 0;
  const pts: { nd: number; a: number; t: [number, number, number]; r2: number }[] = [];
  areas.forEach((a, nd) => {
    const [x, y, z] = nodeXYZ(g, nd);
    const r: [number, number, number] = [x - p[0], y - p[1], z - p[2]];
    const t: [number, number, number] = [ax[1] * r[2] - ax[2] * r[1], ax[2] * r[0] - ax[0] * r[2], ax[0] * r[1] - ax[1] * r[0]];   // axis × r
    const r2 = t[0] * t[0] + t[1] * t[1] + t[2] * t[2];
    pts.push({ nd, a, t, r2 }); den += a * r2;
  });
  if (den === 0) return;
  for (const q of pts) { const w = (moment * q.a) / den; f[3 * q.nd] += w * q.t[0]; f[3 * q.nd + 1] += w * q.t[1]; f[3 * q.nd + 2] += w * q.t[2]; }
}

/** Constrain the nodes of the faces: comps = [x,y,z] flags */
export function fixFaces(g: Grid, fixed: Uint8Array, faces: SurfFace[], comps: [boolean, boolean, boolean]) {
  for (const fc of faces) for (const nd of faceNodes(g, fc)) for (let c = 0; c < 3; c++) if (comps[c]) fixed[3 * nd + c] = 1;
}

export function springFaces(g: Grid, spring: Float64Array, faces: SurfFace[], kPerArea: number, dirs: [boolean, boolean, boolean] = [true, true, true]) {
  const areas = nodeAreas(g, faces);
  areas.forEach((a, nd) => { for (let c = 0; c < 3; c++) if (dirs[c]) spring[3 * nd + c] += kPerArea * a; });
}

export { activeNodes };
