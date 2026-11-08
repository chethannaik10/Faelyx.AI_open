// Matrix-free finite-element operator on the voxel grid with a geometric multigrid preconditioner.
//   d = 3 degrees of freedom per node (elasticity) or d = 1 (scalar fields).
// The grid is "full": every node of the padded box has d DOFs; DOFs of nodes that no solid element
// touches are switched off. Element matrices come from templates (elem.ts) scaled by factor · h.
// Coarse levels are built by averaging the stiffness of the eight children (topology-optimisation style
// rediscretisation) and serve only as a preconditioner for conjugate gradients on the fine level.

import { activeNodes, elemBaseNodes, nNodes, type Grid } from './voxel';

export interface Tpl { K: Float64Array; kscale: number }

interface Level {
  nx: number; ny: number; nz: number; h: number; nn: number;
  list: Int32Array;            // active voxel indices
  base: Int32Array;            // corner-0 node of each listed voxel
  fac: Float32Array;           // per listed voxel (level 0)
  ke?: Float32Array;           // dense Galerkin element matrices (coarse levels), n8d² per listed cell
  tpl: Uint8Array;             // per listed voxel
  off: Int32Array;             // 8 corner offsets
  diag: Float64Array; fixed: Uint8Array; extra: Float64Array;
  r: Float64Array; t: Float64Array; x: Float64Array; b: Float64Array; cd: Float64Array; cr: Float64Array;
  lmax: number;                // estimate of the largest eigenvalue of D⁻¹A
  mx?: AxisMap; my?: AxisMap; mz?: AxisMap;             // transfer tables to the next coarser level
}

interface AxisMap { a: Int32Array; b: Int32Array; wa: Float64Array; wb: Float64Array }

export interface SolveInfo { iterations: number; residual: number; converged: boolean; ms: number }

export class MGOperator {
  readonly d: number;
  readonly g: Grid;
  readonly levels: Level[] = [];
  readonly tpls: Tpl[];
  readonly nDof: number;
  readonly active: Uint8Array;                 // per node
  private chol: Float64Array | null = null;
  private coarseFree: Int32Array | null = null;
  nu = 2; ratio = 4;

  /**
   * @param fixed   d·nNodes flags (1 = constrained to zero)
   * @param extra   optional d·nNodes nodal diagonal terms (springs, penalty, mass/Δt)
   */
  constructor(g: Grid, tpls: Tpl[], d: number, fixed: Uint8Array, extra?: Float64Array | null) {
    this.g = g; this.d = d; this.tpls = tpls;
    const nn = nNodes(g);
    this.nDof = d * nn;
    const base = elemBaseNodes(g);
    this.active = activeNodes(g, base);
    const L0 = this.newLevel(g.nx, g.ny, g.nz, g.h);
    L0.list = g.elem; L0.base = base;
    L0.fac = new Float32Array(g.nElem).fill(1);
    L0.tpl = new Uint8Array(g.nElem);
    for (let e = 0; e < g.nElem; e++) L0.tpl[e] = g.mat[g.elem[e]] - 1;
    L0.fixed = Uint8Array.from(fixed);
    for (let n = 0; n < nn; n++) if (!this.active[n]) for (let c = 0; c < d; c++) L0.fixed[n * d + c] = 1;
    if (extra) L0.extra = Float64Array.from(extra);
    this.levels.push(L0);
    this.computeDiag(L0);
    this.buildCoarse();
    for (const L of this.levels) this.estimateLmax(L);
  }

  private newLevel(nx: number, ny: number, nz: number, h: number): Level {
    const nn = (nx + 1) * (ny + 1) * (nz + 1), nd = nn * this.d;
    const sx = 1, sy = nx + 1, sz = (nx + 1) * (ny + 1);
    return {
      nx, ny, nz, h, nn, list: new Int32Array(0), base: new Int32Array(0), fac: new Float32Array(0), tpl: new Uint8Array(0),
      off: Int32Array.from([0, sx, sx + sy, sy, sz, sz + sx, sz + sx + sy, sz + sy]),
      diag: new Float64Array(nd), fixed: new Uint8Array(nd), extra: new Float64Array(nd),
      r: new Float64Array(nd), t: new Float64Array(nd), x: new Float64Array(nd), b: new Float64Array(nd), cd: new Float64Array(nd), cr: new Float64Array(nd), lmax: 2,
    };
  }

  private computeDiag(L: Level) {
    const d = this.d, n8 = 8 * d, nn2 = n8 * n8;
    L.diag.fill(0);
    if (L.ke) {
      for (let e = 0; e < L.list.length; e++) {
        const b = L.base[e], o = e * nn2;
        for (let a = 0; a < 8; a++) { const nd = (b + L.off[a]) * d; for (let c = 0; c < d; c++) L.diag[nd + c] += L.ke[o + (a * d + c) * n8 + a * d + c]; }
      }
    } else {
      for (let e = 0; e < L.list.length; e++) {
        const K = this.tpls[L.tpl[e]].K, f = L.fac[e] * L.h, b = L.base[e];
        for (let a = 0; a < 8; a++) { const nd = (b + L.off[a]) * d; for (let c = 0; c < d; c++) L.diag[nd + c] += f * K[(a * d + c) * n8 + a * d + c]; }
      }
    }
    for (let i = 0; i < L.diag.length; i++) { L.diag[i] += L.extra[i]; }
  }

  /** Galerkin coarse operators: a coarse cell's matrix is Σ over its children of PᵀKᶜP with P the trilinear interpolation. */
  private buildCoarse() {
    const d = this.d, n8 = 8 * d, nn2 = n8 * n8;
    let L = this.levels[0];
    // corner bit layout of the hexahedron (matches Level.off)
    const cx = [0, 1, 1, 0, 0, 1, 1, 0], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
    const wt = (pos: number, bit: number) => (pos === 1 ? 0.5 : (pos === 0) === (bit === 0) ? 1 : 0);
    // Pchild[child][a*8+B]
    const Pch: Float64Array[] = [];
    for (let ch = 0; ch < 8; ch++) {
      const di = ch & 1, dj = (ch >> 1) & 1, dk = (ch >> 2) & 1;
      const P = new Float64Array(64);
      for (let a = 0; a < 8; a++) for (let B = 0; B < 8; B++) {
        P[a * 8 + B] = wt(di + cx[a], cx[B]) * wt(dj + cy[a], cy[B]) * wt(dk + cz[a], cz[B]);
      }
      Pch.push(P);
    }
    const Pcs = [new Float64Array(64), new Float64Array(64), new Float64Array(64)];
    const T = new Float64Array(n8 * n8), M = new Float64Array(nn2), Ke0 = new Float64Array(nn2);
    while (this.levels.length < 9) {
      if (L.nx % 2 || L.ny % 2 || L.nz % 2 || L.nx < 4 || L.ny < 4 || L.nz < 4 || L.nn * d <= 1500) break;
      const nx = L.nx / 2, ny = L.ny / 2, nz = L.nz / 2;
      const C = this.newLevel(nx, ny, nz, L.h * 2);
      L.mx = this.axisMap(L.nx); L.my = this.axisMap(L.ny); L.mz = this.axisMap(L.nz);
      // dense map voxel -> listed index on the fine level
      const eidx = new Int32Array(L.nx * L.ny * L.nz).fill(-1);
      for (let e = 0; e < L.list.length; e++) eidx[L.list[e]] = e;
      const list: number[] = [];
      const kes: Float32Array[] = [];
      for (let K = 0; K < nz; K++) for (let J = 0; J < ny; J++) for (let I = 0; I < nx; I++) {
        M.fill(0);
        let any = false;
        for (let ch = 0; ch < 8; ch++) {
          const v = ((2 * K + (ch >> 2)) * L.ny + (2 * J + ((ch >> 1) & 1))) * L.nx + 2 * I + (ch & 1);
          const e = eidx[v];
          if (e < 0) continue;
          any = true;
          let Ke: Float64Array | Float32Array;
          if (L.ke) Ke = L.ke.subarray(e * nn2, (e + 1) * nn2);
          else { const t = this.tpls[L.tpl[e]].K, f = L.fac[e] * L.h; for (let i = 0; i < nn2; i++) Ke0[i] = f * t[i]; Ke = Ke0; }
          const P0 = Pch[ch], bnode = L.base[e];
          // rows of constrained fine DOFs are removed from the interpolation (Galerkin product of the constrained operator)
          for (let c = 0; c < d; c++) {
            const Pc = Pcs[c];
            for (let a = 0; a < 8; a++) {
              const fx = L.fixed[(bnode + L.off[a]) * d + c];
              for (let B = 0; B < 8; B++) Pc[a * 8 + B] = fx ? 0 : P0[a * 8 + B];
            }
          }
          // T[i][B*d+c] = Σ_a Pc[a][B] Ke[i][a*d+c]
          for (let i = 0; i < n8; i++) {
            const ri = i * n8;
            for (let B = 0; B < 8; B++) for (let c = 0; c < d; c++) {
              const Pc = Pcs[c];
              let s = 0;
              for (let a = 0; a < 8; a++) s += Pc[a * 8 + B] * Ke[ri + a * d + c];
              T[ri + B * d + c] = s;
            }
          }
          // M[A*d+c'][j] += Σ_a' Pc'[a'][A] T[a'*d+c'][j]
          for (let A = 0; A < 8; A++) for (let c2 = 0; c2 < d; c2++) {
            const ro = (A * d + c2) * n8, Pc = Pcs[c2];
            for (let j = 0; j < n8; j++) {
              let s = 0;
              for (let a = 0; a < 8; a++) s += Pc[a * 8 + A] * T[(a * d + c2) * n8 + j];
              M[ro + j] += s;
            }
          }
        }
        if (!any) continue;
        list.push((K * ny + J) * nx + I);
        kes.push(Float32Array.from(M));
      }
      C.list = Int32Array.from(list);
      C.ke = new Float32Array(list.length * nn2);
      for (let e = 0; e < list.length; e++) C.ke.set(kes[e], e * nn2);
      C.fac = new Float32Array(0); C.tpl = new Uint8Array(0);
      C.base = new Int32Array(list.length);
      for (let e = 0; e < list.length; e++) {
        const v = list[e], k = Math.floor(v / (nx * ny)), r = v - k * nx * ny, j = Math.floor(r / nx), i = r - j * nx;
        C.base[e] = (k * (ny + 1) + j) * (nx + 1) + i;
      }
      // constraints: coarse node = fine node at even indices
      for (let K = 0; K <= nz; K++) for (let J = 0; J <= ny; J++) for (let I = 0; I <= nx; I++) {
        const cn = (K * (ny + 1) + J) * (nx + 1) + I, fn = (2 * K * (L.ny + 1) + 2 * J) * (L.nx + 1) + 2 * I;
        for (let c = 0; c < d; c++) C.fixed[cn * d + c] = L.fixed[fn * d + c];
      }
      this.restrictDiag(L, C);
      this.computeDiag(C);
      const touched = new Uint8Array(C.nn);
      for (let e = 0; e < C.list.length; e++) for (let a = 0; a < 8; a++) touched[C.base[e] + C.off[a]] = 1;
      for (let n = 0; n < C.nn; n++) if (!touched[n]) for (let c = 0; c < d; c++) C.fixed[n * d + c] = 1;
      this.levels.push(C);
      L = C;
    }
    this.factorCoarsest();
  }

  /** per-axis interpolation table: fine index → two coarse indices with weights (second weight 0 for coincident nodes) */
  private axisMap(nFine: number): { a: Int32Array; b: Int32Array; wa: Float64Array; wb: Float64Array } {
    const a = new Int32Array(nFine + 1), b = new Int32Array(nFine + 1), wa = new Float64Array(nFine + 1), wb = new Float64Array(nFine + 1);
    for (let i = 0; i <= nFine; i++) {
      if (i & 1) { a[i] = (i - 1) >> 1; b[i] = (i + 1) >> 1; wa[i] = 0.5; wb[i] = 0.5; } else { a[i] = i >> 1; b[i] = i >> 1; wa[i] = 1; wb[i] = 0; }
    }
    return { a, b, wa, wb };
  }

  private restrictDiag(F: Level, C: Level) {
    const d = this.d;
    const X = F.mx!, Y = F.my!, Z = F.mz!;
    const sx = C.nx + 1, sxy = (C.nx + 1) * (C.ny + 1);
    for (let k = 0; k <= F.nz; k++) for (let j = 0; j <= F.ny; j++) for (let i = 0; i <= F.nx; i++) {
      const fn = (k * (F.ny + 1) + j) * (F.nx + 1) + i;
      for (let c = 0; c < d; c++) {
        const val = F.extra[fn * d + c];
        if (val === 0) continue;
        for (let q = 0; q < 2; q++) { const K = q ? Z.b[k] : Z.a[k], wk = q ? Z.wb[k] : Z.wa[k]; if (wk === 0) continue;
          for (let p = 0; p < 2; p++) { const J = p ? Y.b[j] : Y.a[j], wj = p ? Y.wb[j] : Y.wa[j]; if (wj === 0) continue;
            for (let o = 0; o < 2; o++) { const I = o ? X.b[i] : X.a[i], wi = o ? X.wb[i] : X.wa[i]; if (wi === 0) continue;
              const w = wk * wj * wi;
              C.extra[(K * sxy + J * sx + I) * d + c] += w * w * val;      // diag(PᵀDP): Galerkin projection of a nodal diagonal term
            } } }
      }
    }
  }

  // ---------------------------------------------------------------- operator

  /** y = A x on a level (x must be zero at constrained DOFs) */
  private applyLevel(L: Level, x: Float64Array, y: Float64Array) {
    y.fill(0);
    if (this.d === 3) this.apply3(L, x, y); else this.apply1(L, x, y);
    const fx = L.fixed, ex = L.extra;
    for (let i = 0; i < y.length; i++) {
      if (fx[i]) y[i] = 0; else y[i] += ex[i] * x[i];
    }
  }

  private apply3(L: Level, x: Float64Array, y: Float64Array) {
    const xe = new Float64Array(24), n3 = new Int32Array(8);
    const off = L.off, list = L.list.length, tpls = this.tpls, base = L.base, fac = L.fac, tpl = L.tpl, h = L.h;
    const ke = L.ke;
    for (let e = 0; e < list; e++) {
      const b = base[e];
      for (let a = 0; a < 8; a++) {
        const nd = (b + off[a]) * 3; n3[a] = nd;
        xe[a * 3] = x[nd]; xe[a * 3 + 1] = x[nd + 1]; xe[a * 3 + 2] = x[nd + 2];
      }
      if (ke) {
        const o = e * 576;
        for (let a = 0; a < 8; a++) {
          let s0 = 0, s1 = 0, s2 = 0;
          const r0 = o + a * 72, r1 = r0 + 24, r2 = r1 + 24;
          for (let j = 0; j < 24; j++) { const xj = xe[j]; s0 += ke[r0 + j] * xj; s1 += ke[r1 + j] * xj; s2 += ke[r2 + j] * xj; }
          const nd = n3[a];
          y[nd] += s0; y[nd + 1] += s1; y[nd + 2] += s2;
        }
        continue;
      }
      const K = tpls[tpl[e]].K, f = fac[e] * h;
      for (let a = 0; a < 8; a++) {
        let s0 = 0, s1 = 0, s2 = 0;
        const r0 = a * 72, r1 = r0 + 24, r2 = r1 + 24;
        for (let j = 0; j < 24; j++) { const xj = xe[j]; s0 += K[r0 + j] * xj; s1 += K[r1 + j] * xj; s2 += K[r2 + j] * xj; }
        const nd = n3[a];
        y[nd] += f * s0; y[nd + 1] += f * s1; y[nd + 2] += f * s2;
      }
    }
  }

  private apply1(L: Level, x: Float64Array, y: Float64Array) {
    const xe = new Float64Array(8);
    const off = L.off, list = L.list.length, tpls = this.tpls, base = L.base, fac = L.fac, tpl = L.tpl, h = L.h;
    const ke = L.ke;
    for (let e = 0; e < list; e++) {
      const b = base[e];
      for (let a = 0; a < 8; a++) xe[a] = x[b + off[a]];
      if (ke) {
        const o = e * 64;
        for (let a = 0; a < 8; a++) {
          let s = 0; const r = o + a * 8;
          for (let j = 0; j < 8; j++) s += ke[r + j] * xe[j];
          y[b + off[a]] += s;
        }
        continue;
      }
      const K = tpls[tpl[e]].K, f = fac[e] * h;
      for (let a = 0; a < 8; a++) {
        let s = 0; const r = a * 8;
        for (let j = 0; j < 8; j++) s += K[r + j] * xe[j];
        y[b + off[a]] += f * s;
      }
    }
  }

  apply(x: Float64Array, y: Float64Array) { this.applyLevel(this.levels[0], x, y); }

  /** y = A x including the rows and columns of constrained DOFs (used to move prescribed values to the right-hand side) */
  applyFull(x: Float64Array, y: Float64Array) {
    const L = this.levels[0];
    y.fill(0);
    if (this.d === 3) this.apply3(L, x, y); else this.apply1(L, x, y);
    for (let i = 0; i < y.length; i++) y[i] += L.extra[i] * x[i];
  }

  /** nodal diagonal of the fine operator, used by eigen solvers for scaling */
  diagonal(): Float64Array { return this.levels[0].diag; }
  fixedMask(): Uint8Array { return this.levels[0].fixed; }

  // ---------------------------------------------------------------- transfer

  private prolongAdd(C: Level, F: Level, xc: Float64Array, xf: Float64Array) {
    const d = this.d, X = F.mx!, Y = F.my!, Z = F.mz!;
    const sx = C.nx + 1, sxy = (C.nx + 1) * (C.ny + 1);
    let fn = 0;
    for (let k = 0; k <= F.nz; k++) for (let j = 0; j <= F.ny; j++) for (let i = 0; i <= F.nx; i++, fn++) {
      const k0 = Z.a[k] * sxy, k1 = Z.b[k] * sxy, j0 = Y.a[j] * sx, j1 = Y.b[j] * sx, i0 = X.a[i], i1 = X.b[i];
      const wz0 = Z.wa[k], wz1 = Z.wb[k], wy0 = Y.wa[j], wy1 = Y.wb[j], wx0 = X.wa[i], wx1 = X.wb[i];
      for (let c = 0; c < d; c++) {
        if (F.fixed[fn * d + c]) continue;
        let s = wz0 * (wy0 * (wx0 * xc[(k0 + j0 + i0) * d + c] + (wx1 ? wx1 * xc[(k0 + j0 + i1) * d + c] : 0)) + (wy1 ? wy1 * (wx0 * xc[(k0 + j1 + i0) * d + c] + (wx1 ? wx1 * xc[(k0 + j1 + i1) * d + c] : 0)) : 0));
        if (wz1) s += wz1 * (wy0 * (wx0 * xc[(k1 + j0 + i0) * d + c] + (wx1 ? wx1 * xc[(k1 + j0 + i1) * d + c] : 0)) + (wy1 ? wy1 * (wx0 * xc[(k1 + j1 + i0) * d + c] + (wx1 ? wx1 * xc[(k1 + j1 + i1) * d + c] : 0)) : 0));
        xf[fn * d + c] += s;
      }
    }
  }

  private restrict(F: Level, C: Level, rf: Float64Array, rc: Float64Array) {
    const d = this.d, X = F.mx!, Y = F.my!, Z = F.mz!;
    const sx = C.nx + 1, sxy = (C.nx + 1) * (C.ny + 1);
    rc.fill(0);
    let fn = 0;
    for (let k = 0; k <= F.nz; k++) for (let j = 0; j <= F.ny; j++) for (let i = 0; i <= F.nx; i++, fn++) {
      const k0 = Z.a[k] * sxy, k1 = Z.b[k] * sxy, j0 = Y.a[j] * sx, j1 = Y.b[j] * sx, i0 = X.a[i], i1 = X.b[i];
      const wz0 = Z.wa[k], wz1 = Z.wb[k], wy0 = Y.wa[j], wy1 = Y.wb[j], wx0 = X.wa[i], wx1 = X.wb[i];
      for (let c = 0; c < d; c++) {
        const v = rf[fn * d + c];
        if (v === 0) continue;
        for (let q = 0; q < 2; q++) {
          const wz = q ? wz1 : wz0; if (!wz) continue; const kk = q ? k1 : k0;
          for (let p = 0; p < 2; p++) {
            const wy = p ? wy1 : wy0; if (!wy) continue; const jj = p ? j1 : j0;
            for (let o = 0; o < 2; o++) {
              const wx = o ? wx1 : wx0; if (!wx) continue;
              rc[(kk + jj + (o ? i1 : i0)) * d + c] += wz * wy * wx * v;
            }
          }
        }
      }
    }
    for (let i = 0; i < rc.length; i++) if (C.fixed[i]) rc[i] = 0;
  }

  // ---------------------------------------------------------------- coarsest level

  private factorCoarsest() {
    const L = this.levels[this.levels.length - 1];
    const free: number[] = [];
    for (let i = 0; i < L.fixed.length; i++) if (!L.fixed[i]) free.push(i);
    this.coarseFree = Int32Array.from(free);
    const n = free.length;
    if (n === 0 || n > 3000) { this.chol = null; return; }
    const A = new Float64Array(n * n);
    const e = new Float64Array(L.fixed.length), y = new Float64Array(L.fixed.length);
    for (let c = 0; c < n; c++) {
      e[free[c]] = 1;
      this.applyLevel(L, e, y);
      e[free[c]] = 0;
      for (let r = 0; r < n; r++) A[r * n + c] = y[free[r]];
    }
    // Cholesky with a small regularisation if needed
    for (let attempt = 0, reg = 0; attempt < 6; attempt++, reg = reg === 0 ? 1e-10 : reg * 100) {
      const Lc = Float64Array.from(A);
      let ok = true;
      let maxd = 0; for (let i = 0; i < n; i++) maxd = Math.max(maxd, A[i * n + i]);
      for (let i = 0; i < n && ok; i++) {
        Lc[i * n + i] += reg * maxd;
        for (let j = 0; j <= i; j++) {
          let s = Lc[i * n + j];
          for (let k = 0; k < j; k++) s -= Lc[i * n + k] * Lc[j * n + k];
          if (i === j) { if (s <= 1e-300) { ok = false; break; } Lc[i * n + i] = Math.sqrt(s); } else Lc[i * n + j] = s / Lc[j * n + j];
        }
      }
      if (ok) { this.chol = Lc; return; }
    }
    this.chol = null;
  }

  private solveCoarsest(L: Level, b: Float64Array, x: Float64Array) {
    const free = this.coarseFree!;
    const n = free.length;
    if (this.chol) {
      const Lc = this.chol, z = new Float64Array(n);
      for (let i = 0; i < n; i++) { let s = b[free[i]]; for (let k = 0; k < i; k++) s -= Lc[i * n + k] * z[k]; z[i] = s / Lc[i * n + i]; }
      for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < n; k++) s -= Lc[k * n + i] * z[k]; z[i] = s / Lc[i * n + i]; }
      x.fill(0);
      for (let i = 0; i < n; i++) x[free[i]] = z[i];
      return;
    }
    // fallback: fixed number of Jacobi-preconditioned CG iterations
    x.fill(0);
    const r = Float64Array.from(b), z = new Float64Array(b.length), p = new Float64Array(b.length), q = new Float64Array(b.length);
    for (let i = 0; i < r.length; i++) { if (L.fixed[i]) r[i] = 0; z[i] = L.diag[i] > 0 ? r[i] / L.diag[i] : 0; p[i] = z[i]; }
    let rz = dot(r, z);
    for (let it = 0; it < 40 && rz > 0; it++) {
      this.applyLevel(L, p, q);
      const a = rz / dot(p, q);
      for (let i = 0; i < x.length; i++) { x[i] += a * p[i]; r[i] -= a * q[i]; }
      for (let i = 0; i < r.length; i++) z[i] = L.diag[i] > 0 ? r[i] / L.diag[i] : 0;
      const rz2 = dot(r, z);
      const beta = rz2 / rz; rz = rz2;
      for (let i = 0; i < p.length; i++) p[i] = z[i] + beta * p[i];
    }
  }

  // ---------------------------------------------------------------- V-cycle & PCG

  /** power iteration for the largest eigenvalue of D⁻¹A on a level */
  private estimateLmax(L: Level) {
    const n = L.diag.length, v = L.cd, w = L.cr;
    let nv = 0;
    for (let i = 0; i < n; i++) { v[i] = L.fixed[i] || !(L.diag[i] > 0) ? 0 : Math.sin(i * 1.7 + 0.3) + 0.5 * Math.cos(i * 0.37); nv += v[i] * v[i]; }
    nv = Math.sqrt(nv) || 1; for (let i = 0; i < n; i++) v[i] /= nv;
    let lam = 1;
    for (let it = 0; it < 25; it++) {
      this.applyLevel(L, v, w);
      let s = 0;
      for (let i = 0; i < n; i++) { w[i] = L.fixed[i] || !(L.diag[i] > 0) ? 0 : w[i] / L.diag[i]; s += w[i] * w[i]; }
      lam = Math.sqrt(s); if (!(lam > 0)) break;
      for (let i = 0; i < n; i++) v[i] = w[i] / lam;
    }
    L.lmax = Math.max(lam * 1.08, 1);
    L.cd.fill(0); L.cr.fill(0);
  }

  /** Chebyshev-accelerated Jacobi smoother targeting the upper part [λmax/ratio, λmax] of the spectrum of D⁻¹A. x may start non-zero. */
  private smooth(L: Level, b: Float64Array, x: Float64Array, deg: number, zeroStart = false) {
    const n = x.length, hi = L.lmax, lo = hi / this.ratio;
    const th = 0.5 * (hi + lo), dl = 0.5 * (hi - lo), s1 = th / dl;
    const d = L.cd, r = L.cr, t = L.t, dg = L.diag, fx = L.fixed;
    if (zeroStart) { for (let i = 0; i < n; i++) r[i] = fx[i] ? 0 : b[i]; }
    else { this.applyLevel(L, x, t); for (let i = 0; i < n; i++) r[i] = fx[i] ? 0 : b[i] - t[i]; }
    let rho = 1 / s1;
    for (let i = 0; i < n; i++) d[i] = fx[i] || !(dg[i] > 0) ? 0 : r[i] / (dg[i] * th);
    for (let k = 0; k < deg; k++) {
      for (let i = 0; i < n; i++) x[i] += d[i];
      if (k === deg - 1) break;
      this.applyLevel(L, d, t);
      const rho1 = 1 / (2 * s1 - rho), c1 = rho1 * rho, c2 = 2 * rho1 / dl;
      for (let i = 0; i < n; i++) {
        r[i] -= t[i];
        d[i] = fx[i] || !(dg[i] > 0) ? 0 : c1 * d[i] + c2 * r[i] / dg[i];
      }
      rho = rho1;
    }
  }

  private vcycle(l: number, b: Float64Array, x: Float64Array) {
    const L = this.levels[l];
    if (l === this.levels.length - 1) { this.solveCoarsest(L, b, x); return; }
    x.fill(0);
    this.smooth(L, b, x, this.nu, true);
    this.applyLevel(L, x, L.r);
    for (let i = 0; i < L.r.length; i++) L.r[i] = b[i] - L.r[i];
    const C = this.levels[l + 1];
    this.restrict(L, C, L.r, C.b);
    this.vcycle(l + 1, C.b, C.x);
    this.prolongAdd(C, L, C.x, x);
    this.smooth(L, b, x, this.nu);
  }

  /** z = M⁻¹ r (one V-cycle on the fine level) */
  precondition(r: Float64Array, z: Float64Array) {
    const L = this.levels[0];
    const b = L.b;
    for (let i = 0; i < r.length; i++) b[i] = L.fixed[i] ? 0 : r[i];
    const x = L.x;
    this.vcycle(0, b, x);
    for (let i = 0; i < z.length; i++) z[i] = L.fixed[i] ? 0 : x[i];
  }

  /** Solve A x = b with multigrid-preconditioned CG. x holds the initial guess (zero at fixed DOFs). */
  solve(b: Float64Array, x: Float64Array, tol = 1e-8, maxIt = 300, onProgress?: (it: number, res: number) => void): SolveInfo {
    const t0 = Date.now();
    const n = b.length, L = this.levels[0];
    const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
    for (let i = 0; i < n; i++) if (L.fixed[i]) x[i] = 0;
    this.apply(x, q);
    let bn = 0;
    for (let i = 0; i < n; i++) { r[i] = L.fixed[i] ? 0 : b[i] - q[i]; if (!L.fixed[i]) bn += b[i] * b[i]; }
    bn = Math.sqrt(bn);
    if (bn === 0) { x.fill(0); return { iterations: 0, residual: 0, converged: true, ms: 0 }; }
    this.precondition(r, z);
    p.set(z);
    let rz = dot(r, z), res = Math.sqrt(dot(r, r)) / bn, it = 0;
    while (res > tol && it < maxIt) {
      this.apply(p, q);
      const pq = dot(p, q);
      if (!(pq > 0)) break;
      const a = rz / pq;
      for (let i = 0; i < n; i++) { x[i] += a * p[i]; r[i] -= a * q[i]; }
      res = Math.sqrt(dot(r, r)) / bn;
      it++;
      onProgress?.(it, res);
      if (res <= tol) break;
      this.precondition(r, z);
      const rz2 = dot(r, z);
      const beta = rz2 / rz; rz = rz2;
      for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    }
    return { iterations: it, residual: res, converged: res <= tol, ms: Date.now() - t0 };
  }
}

export function dot(a: Float64Array, b: Float64Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
