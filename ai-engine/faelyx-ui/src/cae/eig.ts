// Eigen-solvers: dense Jacobi for small projected problems, LOBPCG for the lowest modes
// K φ = ω² M φ (M lumped/diagonal), and subspace iteration for linear buckling K φ = −λ Kg φ.

import { dot } from './mg';
import { geomTemplates } from './elem';
import { cornerOffsets, elemBaseNodes, type Grid } from './voxel';

/** Eigen-decomposition of a symmetric n×n matrix (row-major). Returns ascending eigenvalues and vectors as columns of V (n×n). */
export function jacobiEig(Ain: Float64Array, n: number): { w: Float64Array; V: Float64Array } {
  const A = Float64Array.from(Ain), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k * n + p], vkq = V[k * n + q];
        V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
      }
    }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[a * n + a] - A[b * n + b]);
  const w = new Float64Array(n), Vs = new Float64Array(n * n);
  idx.forEach((src, dst) => { w[dst] = A[src * n + src]; for (let k = 0; k < n; k++) Vs[k * n + dst] = V[k * n + src]; });
  return { w, V: Vs };
}

/** Generalised small problem A x = λ B x with B symmetric positive (semi)definite; drops directions with tiny B-norm. */
export function genEigSmall(A: Float64Array, B: Float64Array, n: number): { w: Float64Array; V: Float64Array; rank: number } {
  const eb = jacobiEig(B, n);
  const wmax = eb.w[n - 1];
  const keep: number[] = [];
  for (let i = 0; i < n; i++) if (eb.w[i] > 1e-11 * wmax) keep.push(i);
  const r = keep.length;
  const T = new Float64Array(n * r);
  keep.forEach((src, dst) => { const s = 1 / Math.sqrt(eb.w[src]); for (let k = 0; k < n; k++) T[k * r + dst] = eb.V[k * n + src] * s; });
  const At = new Float64Array(r * r), tmp = new Float64Array(n * r);
  for (let i = 0; i < n; i++) for (let j = 0; j < r; j++) { let s = 0; for (let k = 0; k < n; k++) s += A[i * n + k] * T[k * r + j]; tmp[i * r + j] = s; }
  for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) { let s = 0; for (let k = 0; k < n; k++) s += T[k * r + i] * tmp[k * r + j]; At[i * r + j] = s; }
  for (let i = 0; i < r; i++) for (let j = i + 1; j < r; j++) { const m = 0.5 * (At[i * r + j] + At[j * r + i]); At[i * r + j] = m; At[j * r + i] = m; }
  const e = jacobiEig(At, r);
  const V = new Float64Array(n * r);
  for (let i = 0; i < n; i++) for (let j = 0; j < r; j++) { let s = 0; for (let k = 0; k < r; k++) s += T[i * r + k] * e.V[k * r + j]; V[i * r + j] = s; }
  return { w: e.w, V, rank: r };
}

export interface ModalResult { values: Float64Array; vectors: Float64Array[]; iterations: number; converged: boolean; residuals: Float64Array }

export interface EigOperator {
  n: number;
  A(x: Float64Array, y: Float64Array): void;        // A x
  T(r: Float64Array, z: Float64Array): void;        // preconditioner
  mask: Uint8Array;                                  // 1 = constrained (vectors are kept zero there)
  Bdiag: Float64Array;                               // lumped mass (diagonal B)
}

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/** Lowest `nev` eigenpairs of A x = λ B x (B = diag) with LOBPCG */
export function lobpcg(op: EigOperator, nev: number, opts: { tol?: number; maxIt?: number; extra?: number; seed?: number; init?: Float64Array[]; onProgress?: (it: number, maxRes: number) => void } = {}): ModalResult {
  const n = op.n, tol = opts.tol ?? 1e-5, maxIt = opts.maxIt ?? 80;
  const m = nev + (opts.extra ?? 2);
  const rand = rng(opts.seed ?? 12345);
  const mk = () => new Float64Array(n);
  const zeroMask = (v: Float64Array) => { for (let i = 0; i < n; i++) if (op.mask[i]) v[i] = 0; };
  const Mv = (x: Float64Array, y: Float64Array) => { for (let i = 0; i < n; i++) y[i] = op.Bdiag[i] * x[i]; };
  const fl: number[] = []; for (let i = 0; i < n; i++) if (!op.mask[i]) fl.push(i);
  const fi = Int32Array.from(fl), nf = fi.length;
  const ip = (a: Float64Array, b: Float64Array) => { let s = 0; for (let q = 0; q < nf; q++) { const i = fi[q]; s += a[i] * b[i]; } return s; };

  // initial block: smooth-ish random, scaled by the mass
  let X: Float64Array[] = [];
  for (let j = 0; j < m; j++) {
    if (opts.init && j < opts.init.length) { const v0 = Float64Array.from(opts.init[j]); zeroMask(v0); X.push(v0); continue; }
    // random vector smoothed by a few applications of the preconditioner (approximate inverse iteration): rich in the lowest modes
    let v = mk(); for (let i = 0; i < n; i++) v[i] = rand() - 0.5; zeroMask(v);
    for (let k = 0; k < 4; k++) {
      const z = mk(); op.T(v, z); zeroMask(z);
      let nm = 0; for (let q = 0; q < nf; q++) { const i = fi[q]; nm += z[i] * z[i]; }
      nm = Math.sqrt(nm) || 1; for (let q = 0; q < nf; q++) { const i = fi[q]; z[i] /= nm; }
      v = z;
    }
    X.push(v);
  }
  let AX: Float64Array[] = X.map((x) => { const y = mk(); op.A(x, y); return y; });
  // Balancing deflation of a recycled subspace Z (static starting shapes + current Ritz vectors): makes the preconditioner exact on span(Z),
  // which repairs the multigrid's weak coarse correction on smooth, low-energy (bending / sway) modes.
  const nInit = Math.min(opts.init?.length ?? 0, X.length);
  const zBase: Float64Array[] = X.slice(0, nInit), azBase: Float64Array[] = AX.slice(0, nInit);
  let Zs: Float64Array[] = [], AZs: Float64Array[] = [], Einv = new Float64Array(0);
  const setZ = (Z: Float64Array[], AZ: Float64Array[]) => {
    Zs = Z; AZs = AZ;
    const k = Z.length;
    if (!k) { Einv = new Float64Array(0); return; }
    const E = new Float64Array(k * k);
    for (let i = 0; i < k; i++) for (let j = i; j < k; j++) { const v = ip(Z[i], AZ[j]); E[i * k + j] = v; E[j * k + i] = v; }
    const sc = new Float64Array(k); for (let i = 0; i < k; i++) sc[i] = 1 / Math.sqrt(Math.max(E[i * k + i], 1e-300));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) E[i * k + j] *= sc[i] * sc[j];
    const e = jacobiEig(E, k);
    const wmax = e.w[k - 1];
    Einv = new Float64Array(k * k);
    for (let q = 0; q < k; q++) {
      if (e.w[q] < 1e-9 * wmax) continue;
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) Einv[i * k + j] += e.V[i * k + q] * e.V[j * k + q] / e.w[q];
    }
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) Einv[i * k + j] *= sc[i] * sc[j];
  };
  const r1buf = mk(), z1buf = mk();
  const Tdef = (r: Float64Array, z: Float64Array) => {
    const k = Zs.length;
    if (!k) { op.T(r, z); return; }
    const a = new Float64Array(k), b = new Float64Array(k), c = new Float64Array(k), c2 = new Float64Array(k);
    for (let i = 0; i < k; i++) a[i] = ip(Zs[i], r);
    for (let i = 0; i < k; i++) { let s = 0; for (let j = 0; j < k; j++) s += Einv[i * k + j] * a[j]; c[i] = s; }
    r1buf.set(r);
    for (let i = 0; i < k; i++) { const ci = c[i], v = AZs[i]; if (ci) for (let q = 0; q < nf; q++) { const j = fi[q]; r1buf[j] -= ci * v[j]; } }
    op.T(r1buf, z1buf); zeroMask(z1buf);
    for (let i = 0; i < k; i++) b[i] = ip(AZs[i], z1buf);
    for (let i = 0; i < k; i++) { let s = 0; for (let j = 0; j < k; j++) s += Einv[i * k + j] * b[j]; c2[i] = s; }
    z.fill(0);
    for (let q = 0; q < nf; q++) { const j = fi[q]; z[j] = z1buf[j]; }
    for (let i = 0; i < k; i++) { const w = c[i] - c2[i]; if (w) { const v = Zs[i]; for (let q = 0; q < nf; q++) { const j = fi[q]; z[j] += w * v[j]; } } }
  };
  if (nInit) setZ(zBase, azBase);
  let P: Float64Array[] = [], AP: Float64Array[] = [];
  const lam = new Float64Array(m);

  const rayleighRitz = (S: Float64Array[], AS: Float64Array[]) => {
    const k = S.length;
    const As = new Float64Array(k * k), Bs = new Float64Array(k * k), tmp = mk();
    for (let i = 0; i < k; i++) { Mv(S[i], tmp); for (let j = i; j < k; j++) { const b = ip(tmp, S[j]), a = ip(S[i], AS[j]); Bs[i * k + j] = b; Bs[j * k + i] = b; As[i * k + j] = a; As[j * k + i] = ip(S[j], AS[i]); } }
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const a = 0.5 * (As[i * k + j] + As[j * k + i]); As[i * k + j] = a; As[j * k + i] = a; const b = 0.5 * (Bs[i * k + j] + Bs[j * k + i]); Bs[i * k + j] = b; Bs[j * k + i] = b; }
    return { ...genEigSmall(As, Bs, k), k };
  };
  const combine = (S: Float64Array[], V: Float64Array, k: number, r: number, cols: number[], rows?: number[]) => {
    const out: Float64Array[] = [];
    for (const c of cols) {
      const v = mk();
      const rr = rows ?? Array.from({ length: k }, (_, i) => i);
      for (const i of rr) { const w = V[i * r + c]; if (w === 0) continue; const s = S[i]; for (let q = 0; q < nf; q++) { const j = fi[q]; v[j] += w * s[j]; } }
      out.push(v);
    }
    return out;
  };

  // initial Rayleigh–Ritz on X
  {
    const rr = rayleighRitz(X, AX);
    const cols = Array.from({ length: Math.min(m, rr.rank) }, (_, i) => i);
    const nX = combine(X, rr.V, rr.k, rr.rank, cols), nAX = combine(AX, rr.V, rr.k, rr.rank, cols);
    X = nX; AX = nAX; cols.forEach((c) => (lam[c] = rr.w[c]));
  }
  let iterations = 0, converged = false;
  let lamPrev: Float64Array | null = null;
  const resNorm = new Float64Array(m);
  const tmp = mk();
  for (let it = 0; it < maxIt; it++) {
    iterations = it + 1;
    // residuals R_i = A x_i − λ_i B x_i and the preconditioned residuals W_i = T R_i;
    // convergence is judged by the energy-norm error estimate sqrt(R·W / (λ xᵀBx)), which is uniform across the spectrum.
    const R: Float64Array[] = [], Wall: Float64Array[] = [];
    let maxRes = 0, nconv = 0;
    for (let i = 0; i < X.length; i++) {
      Mv(X[i], tmp);
      const r = mk(); let xm = 0;
      for (let q = 0; q < n; q++) { r[q] = AX[i][q] - lam[i] * tmp[q]; xm += tmp[q] * X[i][q]; }
      zeroMask(r);
      const w = mk(); Tdef(r, w); zeroMask(w);
      // true residual in the B⁻¹ norm relative to λ‖x‖_B: bounds the relative eigenvalue error (independent of the preconditioner's scale)
      let rb = 0; for (let q = 0; q < nf; q++) { const j = fi[q]; const bj = op.Bdiag[j]; if (bj > 0) rb += r[j] * r[j] / bj; }
      resNorm[i] = Math.sqrt(rb / (xm + 1e-300)) / (Math.abs(lam[i]) + 1e-300);     // relative residual; converted to an eigenvalue-error estimate below
      R.push(r); Wall.push(w);
    }
    // Kato–Temple estimate of the relative eigenvalue error: relres² / relative gap (gap floored for clusters / degenerate pairs)
    const errEst = new Float64Array(X.length);
    for (let i = 0; i < X.length; i++) {
      let gap = Infinity;
      for (let j = 0; j < X.length; j++) if (j !== i) gap = Math.min(gap, Math.abs(lam[j] - lam[i]));
      const gr = Math.max(gap / (Math.abs(lam[i]) + 1e-300), 0.1);
      errEst[i] = resNorm[i] * resNorm[i] / gr;
      if (i < nev) { if (errEst[i] < tol) nconv++; maxRes = Math.max(maxRes, errEst[i]); }
    }
    if ((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.EIGDBG && it % 10 === 0) console.log('it', it, Array.from(resNorm).map((v) => v.toExponential(1)).join(' '), 'lam', Array.from(lam).map((l) => (Math.sqrt(Math.max(l, 0)) / 6.2832).toFixed(2)).join(' '));
    opts.onProgress?.(it, maxRes);
    if (nconv >= nev) { converged = true; break; }
    // Ritz values are upper bounds of the true eigenvalues; when they no longer move over 10 iterations the subspace has stopped improving
    if (it > 0 && it % 10 === 0) {
      if (lamPrev && it >= 20) {
        let d = 0; for (let i = 0; i < nev; i++) d = Math.max(d, Math.abs(lam[i] - lamPrev[i]) / (Math.abs(lam[i]) + 1e-300));
        if (d < tol * 0.02) { converged = true; break; }
      }
      lamPrev = Float64Array.from(lam);
    }
    const W: Float64Array[] = [];
    for (let i = 0; i < X.length; i++) { if (i < nev && errEst[i] < tol * 0.01) continue; W.push(Wall[i]); }
    const AW = W.map((w) => { const y = mk(); op.A(w, y); return y; });
    const S = [...X, ...W, ...P], AS = [...AX, ...AW, ...AP];
    const rr = rayleighRitz(S, AS);
    const kx = X.length, kw = W.length;
    const cols = Array.from({ length: Math.min(m, rr.rank) }, (_, i) => i);
    const nX = combine(S, rr.V, rr.k, rr.rank, cols), nAX = combine(AS, rr.V, rr.k, rr.rank, cols);
    // new search directions: the W and P components of the Ritz vectors
    const rows = Array.from({ length: S.length - kx }, (_, i) => kx + i);
    const nP = combine(S, rr.V, rr.k, rr.rank, cols, rows), nAP = combine(AS, rr.V, rr.k, rr.rank, cols, rows);
    void kw;
    X = nX; AX = nAX; P = nP; AP = nAP;
    for (const c of cols) lam[c] = rr.w[c];
    if (nInit && it % 8 === 7) setZ([...zBase, ...X], [...azBase, ...AX]);
    // keep P well-scaled
    for (let i = 0; i < P.length; i++) { const nm = Math.sqrt(ip(P[i], P[i])) || 1; for (let q = 0; q < n; q++) { P[i][q] /= nm; AP[i][q] /= nm; } }
  }
  return { values: lam.slice(0, nev), vectors: X.slice(0, nev), iterations, converged, residuals: resNorm.slice(0, nev) };
}

// ---------------------------------------------------------------------------------------------
// Geometric (initial-stress) stiffness for linear buckling — hexahedral elements

export class GeomStiffness {
  private T = geomTemplates();
  private base: Int32Array; private off: Int32Array;
  constructor(private g: Grid) { this.base = elemBaseNodes(g); this.off = cornerOffsets(g); }

  /** y += Kg(σ) x with σ: per-element stress Float32Array(6·nElem) in Voigt xx yy zz xy yz zx */
  apply(sig: Float32Array, x: Float64Array, y: Float64Array) {
    const g = this.g, T = this.T, S = new Float64Array(64), xe = new Float64Array(8);
    for (let e = 0; e < g.nElem; e++) {
      const sxx = sig[e * 6], syy = sig[e * 6 + 1], szz = sig[e * 6 + 2], sxy = sig[e * 6 + 3], syz = sig[e * 6 + 4], szx = sig[e * 6 + 5];
      for (let q = 0; q < 64; q++) S[q] = sxx * T[0][q] + syy * T[4][q] + szz * T[8][q] + sxy * (T[1][q] + T[3][q]) + syz * (T[5][q] + T[7][q]) + szx * (T[2][q] + T[6][q]);
      for (let c = 0; c < 3; c++) {
        for (let a = 0; a < 8; a++) xe[a] = x[(this.base[e] + this.off[a]) * 3 + c];
        for (let a = 0; a < 8; a++) { let s = 0; for (let b = 0; b < 8; b++) s += S[a * 8 + b] * xe[b]; y[(this.base[e] + this.off[a]) * 3 + c] += g.h * s; }
      }
    }
  }
}

export interface BucklingResult { factors: Float64Array; vectors: Float64Array[]; iterations: number; converged: boolean }

/** Smallest-|λ| solutions of K φ = −λ Kg φ by block inverse iteration with Rayleigh–Ritz.
 *  solveK(b,x) must solve K x = b; Kg(x,y) applies the stress stiffness of the reference load. */
export function bucklingModes(n: number, mask: Uint8Array, K: (x: Float64Array, y: Float64Array) => void, solveK: (b: Float64Array, x: Float64Array) => void, Kg: (x: Float64Array, y: Float64Array) => void,
  nev: number, opts: { maxIt?: number; tol?: number; onProgress?: (it: number, d: number) => void; seed?: number } = {}): BucklingResult {
  const m = nev + 2, rand = rng(opts.seed ?? 777), maxIt = opts.maxIt ?? 20, tol = opts.tol ?? 1e-4;
  const mk = () => new Float64Array(n);
  let X: Float64Array[] = [];
  for (let j = 0; j < m; j++) { const v = mk(); for (let i = 0; i < n; i++) v[i] = rand() - 0.5; for (let i = 0; i < n; i++) if (mask[i]) v[i] = 0; X.push(v); }
  let mu = new Float64Array(m);
  let prev = new Float64Array(m).fill(Infinity), converged = false, it = 0;
  const Kgx = mk();
  for (; it < maxIt; it++) {
    // Y = K⁻¹ Kg X
    const Y: Float64Array[] = [];
    for (const x of X) { Kg(x, Kgx); for (let i = 0; i < n; i++) if (mask[i]) Kgx[i] = 0; const y = mk(); solveK(Kgx, y); Y.push(y); }
    // Rayleigh–Ritz on Y: Kg_p q = μ K_p q
    const k = Y.length, Ap = new Float64Array(k * k), Bp = new Float64Array(k * k);
    const KY = Y.map((y) => { const t = mk(); K(y, t); return t; });
    const KgY = Y.map((y) => { const t = mk(); Kg(y, t); for (let i = 0; i < n; i++) if (mask[i]) t[i] = 0; return t; });
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { Bp[i * k + j] = dot(Y[i], KY[j]); Ap[i * k + j] = dot(Y[i], KgY[j]); }
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const a = 0.5 * (Ap[i * k + j] + Ap[j * k + i]); Ap[i * k + j] = a; Ap[j * k + i] = a; const b = 0.5 * (Bp[i * k + j] + Bp[j * k + i]); Bp[i * k + j] = b; Bp[j * k + i] = b; }
    const e = genEigSmall(Ap, Bp, k);
    // sort by |μ| descending
    const order = Array.from({ length: e.rank }, (_, i) => i).sort((a, b) => Math.abs(e.w[b]) - Math.abs(e.w[a]));
    const newX: Float64Array[] = [];
    for (let c = 0; c < Math.min(m, order.length); c++) {
      const v = mk();
      for (let i = 0; i < k; i++) { const w = e.V[i * e.rank + order[c]]; if (w) for (let q = 0; q < n; q++) v[q] += w * Y[i][q]; }
      const nm = Math.sqrt(dot(v, v)) || 1; for (let q = 0; q < n; q++) v[q] /= nm;
      newX.push(v); mu[c] = e.w[order[c]];
    }
    X = newX;
    let d = 0;
    for (let c = 0; c < nev; c++) d = Math.max(d, Math.abs(mu[c] - prev[c]) / (Math.abs(mu[c]) + 1e-300));
    opts.onProgress?.(it, d);
    prev = Float64Array.from(mu);
    if (d < tol) { converged = true; it++; break; }
  }
  // λ = −1/μ
  const idx = Array.from({ length: Math.min(m, X.length) }, (_, i) => i).filter((i) => Math.abs(mu[i]) > 1e-300).sort((a, b) => Math.abs(1 / mu[a]) - Math.abs(1 / mu[b]));
  const take = idx.slice(0, nev + 2);
  return { factors: Float64Array.from(take.map((i) => -1 / mu[i])), vectors: take.map((i) => X[i]), iterations: it, converged };
}
