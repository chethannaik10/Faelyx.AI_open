// Scalar-field finite elements on the voxel grid: heat conduction, electrostatics, DC conduction, magnetic scalar potential.
//   ∇·(κ ∇u) = −q     κ per material (orthotropic allowed), Dirichlet / Neumann / Robin boundaries, steady or transient.
// Units are decided by the caller (thermal uses mm, mW, K).

import { hexScalar, type ScalarTpl } from './elem';
import { MGOperator, dot, type SolveInfo } from './mg';
import { FACE_NORMAL, cornerOffsets, elemBaseNodes, faceNodes, nNodes, type Grid, type SurfFace } from './voxel';

export interface ScalarMaterial { kx: number; ky: number; kz: number; rhoC?: number }   // conductivity and volumetric heat capacity

export class ScalarModel {
  readonly g: Grid; readonly nn: number;
  readonly tpls: ScalarTpl[];
  readonly mats: ScalarMaterial[];
  readonly base: Int32Array; readonly off: Int32Array;
  mg: MGOperator | null = null;

  constructor(g: Grid, mats: ScalarMaterial[]) {
    this.g = g; this.nn = nNodes(g); this.mats = mats;
    this.tpls = mats.map((m) => hexScalar(m.kx, m.ky, m.kz));
    this.base = elemBaseNodes(g); this.off = cornerOffsets(g);
  }

  /** Build the operator. `fixed` = Dirichlet nodes, `extra` = nodal diagonal (Robin, capacity/Δt). */
  build(fixed: Uint8Array, extra?: Float64Array | null): MGOperator {
    this.mg = new MGOperator(this.g, this.tpls, 1, fixed, extra ?? null);
    return this.mg;
  }

  /** Nodal heat capacity (rhoC · V/8 per element corner) */
  nodalCapacity(): Float64Array {
    const c = new Float64Array(this.nn), g = this.g, v8 = (g.h ** 3) / 8;
    for (let e = 0; e < g.nElem; e++) {
      const rc = this.mats[g.mat[g.elem[e]] - 1].rhoC ?? 0;
      for (let a = 0; a < 8; a++) c[this.base[e] + this.off[a]] += rc * v8;
    }
    return c;
  }

  /** Volumetric source q (per element, from a function of the material index) → nodal load */
  sourceLoad(qOfElem: (e: number, mat: number) => number): Float64Array {
    const b = new Float64Array(this.nn), g = this.g, v8 = (g.h ** 3) / 8;
    for (let e = 0; e < g.nElem; e++) {
      const q = qOfElem(e, g.mat[g.elem[e]] - 1);
      if (!q) continue;
      for (let a = 0; a < 8; a++) b[this.base[e] + this.off[a]] += q * v8;
    }
    return b;
  }

  /** Solve with Dirichlet values already in `value` at the fixed nodes. Returns the full solution. */
  solve(b: Float64Array, fixed: Uint8Array, value: Float64Array, guess?: Float64Array | null, tol = 1e-9, maxIt = 400, onProgress?: (it: number, res: number) => void): { u: Float64Array; info: SolveInfo } {
    const mg = this.mg!;
    const up = new Float64Array(this.nn), rhs = Float64Array.from(b);
    let any = false;
    for (let i = 0; i < this.nn; i++) if (fixed[i] && mg.active[i]) { up[i] = value[i]; any = true; }
    if (any) {
      const Ku = new Float64Array(this.nn);
      mg.applyFull(up, Ku);
      for (let i = 0; i < this.nn; i++) rhs[i] -= Ku[i];
    }
    const x = new Float64Array(this.nn);
    if (guess) for (let i = 0; i < this.nn; i++) if (!fixed[i]) x[i] = guess[i] - up[i] * 0;
    const info = mg.solve(rhs, x, tol, maxIt, onProgress);
    for (let i = 0; i < this.nn; i++) if (fixed[i] && mg.active[i]) x[i] = value[i];
    return { u: x, info };
  }

  /** ∇u at the element centres: Float32Array(3·nElem), in (field units)/mm */
  gradient(u: ArrayLike<number>): Float32Array {
    const g = this.g, out = new Float32Array(3 * g.nElem);
    const C = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    for (let e = 0; e < g.nElem; e++) {
      let gx = 0, gy = 0, gz = 0;
      for (let a = 0; a < 8; a++) { const v = u[this.base[e] + this.off[a]]; gx += C[a][0] * v; gy += C[a][1] * v; gz += C[a][2] * v; }
      out[e * 3] = gx / (4 * g.h); out[e * 3 + 1] = gy / (4 * g.h); out[e * 3 + 2] = gz / (4 * g.h);
    }
    return out;
  }

  /** Energy ½ ∫ κ |∇u|² dV  (field units² · κ · mm) */
  energy(u: ArrayLike<number>): number {
    const gr = this.gradient(u), g = this.g;
    let w = 0;
    for (let e = 0; e < g.nElem; e++) {
      const m = this.mats[g.mat[g.elem[e]] - 1];
      w += 0.5 * (m.kx * gr[e * 3] ** 2 + m.ky * gr[e * 3 + 1] ** 2 + m.kz * gr[e * 3 + 2] ** 2) * g.h ** 3;
    }
    return w;
  }
}

/** Faces whose outward normal and node set are used for boundary terms — nodal contribution of a uniform face quantity */
export function faceNodeAreas(g: Grid, faces: SurfFace[]): Map<number, number> {
  const m = new Map<number, number>(), a = (g.h * g.h) / 4;
  for (const fc of faces) for (const nd of faceNodes(g, fc)) m.set(nd, (m.get(nd) ?? 0) + a);
  return m;
}

/** Robin boundary −κ ∂u/∂n = h(u − u∞): returns nodal diagonal terms and right-hand side contributions */
export function addConvection(g: Grid, faces: SurfFace[], hc: number, uInf: number, diag: Float64Array, rhs: Float64Array) {
  const areas = faceNodeAreas(g, faces);
  areas.forEach((a, nd) => { diag[nd] += hc * a; rhs[nd] += hc * a * uInf; });
}

/** Prescribed flux q″ (into the body, positive) */
export function addFlux(g: Grid, faces: SurfFace[], q: number, rhs: Float64Array) {
  const areas = faceNodeAreas(g, faces);
  areas.forEach((a, nd) => { rhs[nd] += q * a; });
}

export { FACE_NORMAL, dot };
