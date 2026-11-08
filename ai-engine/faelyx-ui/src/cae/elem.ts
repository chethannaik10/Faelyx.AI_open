// Element templates for unit cubes (h = 1 mm). Everything scales with the real voxel size:
//   stiffness / conductivity  K_e = K̂ · h        mass  M_e = M̂ · h³
// so one 24×24 (elasticity) or 8×8 (scalar) matrix per material serves every element.
//
// Elasticity: 8-node brick with 9 incompatible (Wilson–Taylor) modes, which removes shear locking in
// bending, or a conforming 6-tetrahedron (Kuhn) split of the same voxel with constant-strain tets.

export type Voigt6 = Float64Array;               // 6×6, order xx yy zz xy yz zx (engineering shear)

export interface ElasticTpl {
  K: Float64Array;                                // 24×24, unit cube
  Bc: Float64Array;                               // 6×24 strain-displacement (centre / tet average)
  Bth: Float64Array;                              // 6×24: ∫ Bᵀ C e_c dV for unit strain components c = 0..5 (row c)
  C: Voigt6;
  tet: boolean;
  kscale: number;                                 // representative stiffness (K[0], used to compare materials)
}

const CORNERS: [number, number, number][] = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];

/** Isotropic constitutive matrix */
export function isoC(E: number, nu: number): Voigt6 {
  const C = new Float64Array(36);
  const l = (E * nu) / ((1 + nu) * (1 - 2 * nu)), G = E / (2 * (1 + nu));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 6 + j] = l + (i === j ? 2 * G : 0);
  C[3 * 6 + 3] = G; C[4 * 6 + 4] = G; C[5 * 6 + 5] = G;
  return C;
}

/** Orthotropic constitutive matrix, material axes aligned with x, y, z. G12 = Gxy, G23 = Gyz, G31 = Gzx */
export function orthoC(E1: number, E2: number, E3: number, nu12: number, nu23: number, nu31: number, G12: number, G23: number, G31: number): Voigt6 {
  const nu21 = nu12 * E2 / E1, nu32 = nu23 * E3 / E2, nu13 = nu31 * E1 / E3;
  const S = new Float64Array(36);
  S[0] = 1 / E1; S[7] = 1 / E2; S[14] = 1 / E3;
  S[1] = S[6] = -nu21 / E2; S[2] = S[12] = -nu31 / E3; S[8] = S[13] = -nu32 / E3;
  void nu13;
  S[21] = 1 / G12; S[28] = 1 / G23; S[35] = 1 / G31;
  return invert(S, 6);
}

export function invert(A: Float64Array, n: number): Float64Array {
  const M = new Float64Array(n * 2 * n);
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i * 2 * n + j] = A[i * n + j]; M[i * 2 * n + n + i] = 1; }
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(M[c * 2 * n + c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(M[r * 2 * n + c]); if (v > best) { best = v; p = r; } }
    if (best < 1e-300) throw new Error('singular matrix');
    if (p !== c) for (let j = 0; j < 2 * n; j++) { const t = M[c * 2 * n + j]; M[c * 2 * n + j] = M[p * 2 * n + j]; M[p * 2 * n + j] = t; }
    const d = M[c * 2 * n + c];
    for (let j = 0; j < 2 * n; j++) M[c * 2 * n + j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r * 2 * n + c];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) M[r * 2 * n + j] -= f * M[c * 2 * n + j];
    }
  }
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = M[i * 2 * n + n + j];
  return out;
}

/** 6×k strain operator for one scalar shape function with gradient g (3), acting on 3 displacement components */
function bBlock(g: number[], B: Float64Array, ncol: number, col: number) {
  // rows xx yy zz xy yz zx ; columns col, col+1, col+2 = u v w
  B[0 * ncol + col] = g[0];
  B[1 * ncol + col + 1] = g[1];
  B[2 * ncol + col + 2] = g[2];
  B[3 * ncol + col] = g[1]; B[3 * ncol + col + 1] = g[0];
  B[4 * ncol + col + 1] = g[2]; B[4 * ncol + col + 2] = g[1];
  B[5 * ncol + col] = g[2]; B[5 * ncol + col + 2] = g[0];
}

const GP = 1 / Math.sqrt(3);

export function hexElastic(C: Voigt6): ElasticTpl {
  const Kuu = new Float64Array(24 * 24), Kua = new Float64Array(24 * 9), Kaa = new Float64Array(81);
  const Bth = new Float64Array(6 * 24);
  const w = 1 / 8;                                  // Gauss weight (1) × detJ (1/8) for the unit cube
  for (const sx of [-GP, GP]) for (const sy of [-GP, GP]) for (const sz of [-GP, GP]) {
    const Bu = new Float64Array(6 * 24), Ba = new Float64Array(6 * 9);
    for (let a = 0; a < 8; a++) {
      const [cx, cy, cz] = CORNERS[a];
      const gx = (cx * (1 + cy * sy) * (1 + cz * sz)) / 8, gy = (cy * (1 + cx * sx) * (1 + cz * sz)) / 8, gz = (cz * (1 + cx * sx) * (1 + cy * sy)) / 8;
      bBlock([2 * gx, 2 * gy, 2 * gz], Bu, 24, 3 * a);
    }
    // incompatible modes (1 - ξ²) etc.: d/dx = 2 · (-2ξ) = -4ξ
    bBlock([-4 * sx, 0, 0], Ba, 9, 0); bBlock([0, -4 * sy, 0], Ba, 9, 3); bBlock([0, 0, -4 * sz], Ba, 9, 6);
    const CB = (B: Float64Array, nc: number) => {
      const out = new Float64Array(6 * nc);
      for (let i = 0; i < 6; i++) for (let j = 0; j < nc; j++) { let s = 0; for (let k = 0; k < 6; k++) s += C[i * 6 + k] * B[k * nc + j]; out[i * nc + j] = s; }
      return out;
    };
    const CBu = CB(Bu, 24), CBa = CB(Ba, 9);
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 24; j++) { let s = 0; for (let k = 0; k < 6; k++) s += Bu[k * 24 + i] * CBu[k * 24 + j]; Kuu[i * 24 + j] += w * s; }
      for (let j = 0; j < 9; j++) { let s = 0; for (let k = 0; k < 6; k++) s += Bu[k * 24 + i] * CBa[k * 9 + j]; Kua[i * 9 + j] += w * s; }
    }
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { let s = 0; for (let k = 0; k < 6; k++) s += Ba[k * 9 + i] * CBa[k * 9 + j]; Kaa[i * 9 + j] += w * s; }
    // thermal / initial strain loads  ∫ Bᵀ C e_c
    for (let c = 0; c < 6; c++) for (let i = 0; i < 24; i++) { let s = 0; for (let k = 0; k < 6; k++) s += Bu[k * 24 + i] * C[k * 6 + c]; Bth[c * 24 + i] += w * s; }
  }
  const Kaai = invert(Kaa, 9);
  const K = new Float64Array(24 * 24);
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
    let s = 0;
    for (let p = 0; p < 9; p++) { let t = 0; for (let q = 0; q < 9; q++) t += Kaai[p * 9 + q] * Kua[j * 9 + q]; s += Kua[i * 9 + p] * t; }
    K[i * 24 + j] = Kuu[i * 24 + j] - s;
  }
  for (let i = 0; i < 24; i++) for (let j = i + 1; j < 24; j++) { const m = 0.5 * (K[i * 24 + j] + K[j * 24 + i]); K[i * 24 + j] = m; K[j * 24 + i] = m; }
  // strain operator at the centre
  const Bc = new Float64Array(6 * 24);
  for (let a = 0; a < 8; a++) { const [cx, cy, cz] = CORNERS[a]; bBlock([cx / 4, cy / 4, cz / 4], Bc, 24, 3 * a); }
  return { K, Bc, Bth, C, tet: false, kscale: K[0] };
}

/** Kuhn split: 6 tets, each a monotone path 0 → … → 6 through the cube corners. */
const KUHN: number[][] = [[0, 1, 2, 6], [0, 1, 5, 6], [0, 3, 2, 6], [0, 3, 7, 6], [0, 4, 5, 6], [0, 4, 7, 6]];
const P3: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

export function tetElastic(C: Voigt6): ElasticTpl {
  const K = new Float64Array(24 * 24), Bc = new Float64Array(6 * 24), Bth = new Float64Array(6 * 24);
  for (const tet of KUHN) {
    const p = tet.map((n) => P3[n]);
    // shape-function gradients of a linear tet: solve [1 x y z] coefficients
    const M = new Float64Array(16);
    for (let r = 0; r < 4; r++) { M[r * 4] = 1; M[r * 4 + 1] = p[r][0]; M[r * 4 + 2] = p[r][1]; M[r * 4 + 3] = p[r][2]; }
    const Mi = invert(M, 4);
    const grad = (a: number) => [Mi[1 * 4 + a], Mi[2 * 4 + a], Mi[3 * 4 + a]];   // N_a = Σ Mi[k][a] · [1,x,y,z]_k
    const det = Math.abs(M[1 * 4 + 1] * 0 + ((p[1][0] - p[0][0]) * ((p[2][1] - p[0][1]) * (p[3][2] - p[0][2]) - (p[2][2] - p[0][2]) * (p[3][1] - p[0][1])) - (p[1][1] - p[0][1]) * ((p[2][0] - p[0][0]) * (p[3][2] - p[0][2]) - (p[2][2] - p[0][2]) * (p[3][0] - p[0][0])) + (p[1][2] - p[0][2]) * ((p[2][0] - p[0][0]) * (p[3][1] - p[0][1]) - (p[2][1] - p[0][1]) * (p[3][0] - p[0][0]))));
    const V = det / 6;
    const B = new Float64Array(6 * 24);
    for (let a = 0; a < 4; a++) bBlock(grad(a), B, 24, 3 * tet[a]);
    for (let i = 0; i < 6 * 24; i++) Bc[i] += B[i] / 6;
    const CB = new Float64Array(6 * 24);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 24; j++) { let s = 0; for (let k = 0; k < 6; k++) s += C[i * 6 + k] * B[k * 24 + j]; CB[i * 24 + j] = s; }
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) { let s = 0; for (let k = 0; k < 6; k++) s += B[k * 24 + i] * CB[k * 24 + j]; K[i * 24 + j] += V * s; }
    for (let c = 0; c < 6; c++) for (let i = 0; i < 24; i++) { let s = 0; for (let k = 0; k < 6; k++) s += B[k * 24 + i] * C[k * 6 + c]; Bth[c * 24 + i] += V * s; }
  }
  return { K, Bc, Bth, C, tet: true, kscale: K[0] };
}

// ---------------------------------------------------------------------------------------------
// Scalar (one degree of freedom per node): conduction, electrostatics, DC current, magnetic potential

export interface ScalarTpl { K: Float64Array; kscale: number }   // 8×8, unit cube, for conductivity (kx, ky, kz)

export function hexScalar(kx: number, ky: number, kz: number): ScalarTpl {
  const K = new Float64Array(64);
  const w = 1 / 8;
  for (const sx of [-GP, GP]) for (const sy of [-GP, GP]) for (const sz of [-GP, GP]) {
    const g: number[][] = [];
    for (let a = 0; a < 8; a++) {
      const [cx, cy, cz] = CORNERS[a];
      g.push([2 * (cx * (1 + cy * sy) * (1 + cz * sz)) / 8, 2 * (cy * (1 + cx * sx) * (1 + cz * sz)) / 8, 2 * (cz * (1 + cx * sx) * (1 + cy * sy)) / 8]);
    }
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) K[a * 8 + b] += w * (kx * g[a][0] * g[b][0] + ky * g[a][1] * g[b][1] + kz * g[a][2] * g[b][2]);
  }
  return { K, kscale: K[0] };
}

/** ∫ ∂N_a/∂x_i ∂N_b/∂x_j dV over the unit cube — used by the geometric (stress) stiffness: T[i*3+j][a*8+b] */
export function geomTemplates(): Float64Array[] {
  const T: Float64Array[] = Array.from({ length: 9 }, () => new Float64Array(64));
  const w = 1 / 8;
  for (const sx of [-GP, GP]) for (const sy of [-GP, GP]) for (const sz of [-GP, GP]) {
    const g: number[][] = [];
    for (let a = 0; a < 8; a++) {
      const [cx, cy, cz] = CORNERS[a];
      g.push([2 * (cx * (1 + cy * sy) * (1 + cz * sz)) / 8, 2 * (cy * (1 + cx * sx) * (1 + cz * sz)) / 8, 2 * (cz * (1 + cx * sx) * (1 + cy * sy)) / 8]);
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) T[i * 3 + j][a * 8 + b] += w * g[a][i] * g[b][j];
  }
  return T;
}

export const CORNER_XYZ = CORNERS;
