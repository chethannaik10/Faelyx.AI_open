// Fluid utilities: fluid properties, flow-domain construction, LBM driver, streamlines, vorticity and the
// advection-diffusion (heat) solver used for conjugate heat transfer.

import { Lbm, frontalCells } from './lbm';
import type { Mesh } from '../cam/geometry';
import { Cancelled } from './model';
import { fillBody, MG_MULT, type Body } from './voxel';

export interface Fluid { name: string; rho: number; mu: number; a: number; k: number; cp: number }
export const FLUIDS: Record<string, Fluid> = {
  air: { name: 'Air, 20 °C', rho: 1.204, mu: 1.81e-5, a: 343, k: 0.0257, cp: 1005 },
  water: { name: 'Water, 20 °C', rho: 998, mu: 1.0e-3, a: 1480, k: 0.598, cp: 4182 },
  oil: { name: 'Engine oil, 40 °C', rho: 860, mu: 0.035, a: 1400, k: 0.14, cp: 2000 },
};
export const prandtl = (f: Fluid) => (f.mu * f.cp) / f.k;

export type M3 = [number, number, number, number, number, number, number, number, number];

/** Rotation taking the wind direction (in body axes) to +X of the flow frame, with +Z the lift direction. Rows are the new axes. */
export function windFrame(aoaDeg: number, betaDeg: number): M3 {
  const a = (aoaDeg * Math.PI) / 180, b = (betaDeg * Math.PI) / 180;
  const w: [number, number, number] = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];   // wind in body axes: it comes from below the chord for a positive angle of attack (nose up)
  let up: [number, number, number] = [0, 0, 1];
  const d = up[0] * w[0] + up[1] * w[1] + up[2] * w[2];
  up = [up[0] - d * w[0], up[1] - d * w[1], up[2] - d * w[2]];
  const ul = Math.hypot(...up); up = [up[0] / ul, up[1] / ul, up[2] / ul];
  const y: [number, number, number] = [up[1] * w[2] - up[2] * w[1], up[2] * w[0] - up[0] * w[2], up[0] * w[1] - up[1] * w[0]];
  return [w[0], w[1], w[2], y[0], y[1], y[2], up[0], up[1], up[2]];
}
export const applyM = (m: M3, p: number[]): [number, number, number] => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
export const applyMT = (m: M3, p: number[]): [number, number, number] => [m[0] * p[0] + m[3] * p[1] + m[6] * p[2], m[1] * p[0] + m[4] * p[1] + m[7] * p[2], m[2] * p[0] + m[5] * p[1] + m[8] * p[2]];

export function rotateTris(tris: Float32Array, m: M3, c: number[]): Float32Array {
  const o = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) { const p = applyM(m, [tris[i] - c[0], tris[i + 1] - c[1], tris[i + 2] - c[2]]); o[i] = p[0]; o[i + 1] = p[1]; o[i + 2] = p[2]; }
  return o;
}

export function meshFrom(tris: Float32Array): Mesh {
  const n = tris.length / 9, min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { const v = tris[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { tris, n, min, max };
}

export interface FlowDomain {
  nx: number; ny: number; nz: number; dx: number; ox: number; oy: number; oz: number;
  solid: Uint8Array; body: Uint8Array;            // body = per cell body index + 1 (0 fluid)
  bodyBox: { min: [number, number, number]; max: [number, number, number] };
  cells: number;
}

const roundUp = (n: number, m: number) => Math.ceil(n / m) * m;

/** External-flow domain around bodies already expressed in the flow frame (+X is the wind). */
export function externalDomain(bodies: { tris: Float32Array; name: string }[], budget: number, ground: boolean): FlowDomain {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) for (let i = 0; i < b.tris.length; i += 3) for (let k = 0; k < 3; k++) { const v = b.tris[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  const ex = mx[0] - mn[0], ey = mx[1] - mn[1], ez = mx[2] - mn[2], S = Math.max(ey, ez, 0.3 * ex);
  const up = Math.max(0.9 * ex, 1.2 * S), down = Math.max(3.2 * ex, 3.5 * S);
  const my = Math.max(0.9 * ey, 0.45 * ex, 0.6 * S), mzTop = Math.max(0.9 * ez, 0.45 * ex, 0.6 * S), mzLow = ground ? Math.max(0.25 * ez, 0.12 * ex) : mzTop;
  const lo = [mn[0] - up, mn[1] - my, mn[2] - mzLow], hi = [mx[0] + down, mx[1] + my, mx[2] + mzTop];
  const vol = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
  let dx = Math.cbrt(vol / budget);
  const dims = (d: number) => [0, 1, 2].map((k) => roundUp(Math.ceil((hi[k] - lo[k]) / d), 4));
  let d3 = dims(dx);
  for (let i = 0; i < 6 && d3[0] * d3[1] * d3[2] > budget * 1.25; i++) { dx *= 1.04; d3 = dims(dx); }
  const [nx, ny, nz] = d3;
  const ox = lo[0], oy = (lo[1] + hi[1]) / 2 - (ny * dx) / 2, oz = ground ? lo[2] : (lo[2] + hi[2]) / 2 - (nz * dx) / 2;
  const solid = new Uint8Array(nx * ny * nz), body = new Uint8Array(nx * ny * nz), warnings: string[] = [];
  bodies.forEach((b, bi) => {
    const tmp = new Uint8Array(nx * ny * nz);
    fillBody({ mesh: meshFrom(b.tris), mat: 0, name: b.name }, dx, [ox, oy, oz], nx, ny, nz, tmp, warnings);
    for (let i = 0; i < tmp.length; i++) if (tmp[i]) { solid[i] = 1; body[i] = bi + 1; }
  });
  return { nx, ny, nz, dx, ox, oy, oz, solid, body, bodyBox: { min: [mn[0], mn[1], mn[2]], max: [mx[0], mx[1], mx[2]] }, cells: nx * ny * nz };
}

export interface LbmRun {
  mean: { rho: Float32Array; ux: Float32Array; uy: Float32Array; uz: Float32Array };
  force: [number, number, number];            // time-averaged momentum-exchange force (lattice)
  forceHist: { step: number; f: [number, number, number] }[];
  monitorHist: { step: number; v: number }[];
  steps: number; transient: number; ms: number; stable: boolean; converged: boolean; log: string[];
}

export interface LbmOptions {
  uLb: number; nuLb: number; smag: number; steps: number; ground: 'off' | 'slip' | 'wall'; wallAll?: boolean; closedOutlet?: boolean;
  monitor?: (sim: Lbm) => number;              // scalar watched for convergence of the transient (sampled every 10 steps)
  minSteps?: number; tol?: number;
  ctrl?: { cancelled: boolean };
}

export function runLbm(dom: FlowDomain, o: LbmOptions, progress: (p: number, label: string) => void): LbmRun {
  const { nx, ny, nz } = dom, N = nx * ny * nz;
  const sim = new Lbm({ nx, ny, nz, solid: dom.solid, uLb: o.uLb, nuLb: o.nuLb, smag: o.smag, wallY: o.wallAll ? 'wall' : 'slip', wallZlow: o.ground === 'wall' || o.wallAll ? 'wall' : 'slip', wallZhigh: o.wallAll ? 'wall' : 'slip', closedOutlet: o.closedOutlet });
  const mean = { rho: new Float32Array(N), ux: new Float32Array(N), uy: new Float32Array(N), uz: new Float32Array(N) };
  const avgSteps = Math.max(300, Math.floor(o.steps * 0.38));
  let phase1 = Math.max(0, o.steps - avgSteps);
  const minSteps = o.minSteps ?? 0, tol = o.tol ?? 0.01;
  let nAvg = 0, nField = 0, fx = 0, fy = 0, fz = 0, converged = false;
  const hist: { step: number; f: [number, number, number] }[] = [], mon: number[] = [], monHist: { step: number; v: number }[] = [];
  const t0 = Date.now();
  let stable = true, s = 0;
  for (; s < phase1 + avgSteps; s++) {
    sim.step();
    if (s % 10 === 0) {
      hist.push({ step: s, f: [...sim.force] as [number, number, number] });
      if (o.monitor && s < phase1) {
        const v = o.monitor(sim); mon.push(v); monHist.push({ step: s, v });
        if (s >= minSteps && s % 100 === 0 && mon.length >= 40) {
          const m = (a: number, b: number) => { let q = 0; for (let i = a; i < b; i++) q += mon[i]; return q / (b - a); };
          const n = mon.length, p = m(n - 20, n), q = m(n - 40, n - 20);
          if (Math.abs(p - q) <= tol * Math.max(Math.abs(p), Math.abs(q), 1e-12)) { phase1 = s; converged = true; }
        }
      }
    }
    if (s >= phase1) {
      nAvg++; fx += sim.force[0]; fy += sim.force[1]; fz += sim.force[2];
      if ((s - phase1) % 4 === 0) { nField++; for (let i = 0; i < N; i++) { mean.rho[i] += sim.rho[i]; mean.ux[i] += sim.ux[i]; mean.uy[i] += sim.uy[i]; mean.uz[i] += sim.uz[i]; } }
    }
    if (s % 40 === 0) {
      progress(Math.min(0.99, s / (phase1 + avgSteps)), `Flow solver: step ${s}${converged ? ' (averaging)' : ''}`);
      if (o.ctrl?.cancelled) throw new Cancelled();
      if (!sim.stable()) { stable = false; break; }
    }
  }
  const inv = 1 / Math.max(1, nField);
  for (let i = 0; i < N; i++) { mean.rho[i] *= inv; mean.ux[i] *= inv; mean.uy[i] *= inv; mean.uz[i] *= inv; }
  const k = 1 / Math.max(1, nAvg);
  return { mean, force: [fx * k, fy * k, fz * k], forceHist: hist, monitorHist: monHist, steps: sim.stepCount, transient: phase1, ms: Date.now() - t0, stable, converged, log: [`${sim.stepCount} lattice steps in ${((Date.now() - t0) / 1000).toFixed(1)} s${converged ? `, transient converged after ${phase1} steps` : ''}`] };
}

export { frontalCells, MG_MULT };
export type { Body };

// ---------------------------------------------------------------------------------------------
// Post-processing of the mean flow

export function trilinear(f: ArrayLike<number>, nx: number, ny: number, nz: number, x: number, y: number, z: number): number {
  // x,y,z in cell units, cell centres at +0.5
  const u = x - 0.5, v = y - 0.5, w = z - 0.5;
  let i = Math.floor(u), j = Math.floor(v), k = Math.floor(w);
  const fx = u - i, fy = v - j, fz = w - k;
  const cl = (a: number, n: number) => (a < 0 ? 0 : a >= n ? n - 1 : a);
  const g = (a: number, b: number, c: number) => f[cl(a, nx) + nx * (cl(b, ny) + ny * cl(c, nz))];
  i = Math.floor(u);
  return (1 - fz) * ((1 - fy) * ((1 - fx) * g(i, j, k) + fx * g(i + 1, j, k)) + fy * ((1 - fx) * g(i, j + 1, k) + fx * g(i + 1, j + 1, k))) + fz * ((1 - fy) * ((1 - fx) * g(i, j, k + 1) + fx * g(i + 1, j, k + 1)) + fy * ((1 - fx) * g(i, j + 1, k + 1) + fx * g(i + 1, j + 1, k + 1)));
}

export function vorticity(dom: FlowDomain, m: LbmRun['mean']): { vort: Float32Array; q: Float32Array; strain: Float32Array } {
  const { nx, ny, nz } = dom, N = nx * ny * nz, vort = new Float32Array(N), q = new Float32Array(N), strain = new Float32Array(N);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const c = id(i, j, k);
    if (dom.solid[c]) continue;
    const d = (f: Float32Array, a: number) => {
      const p = a === 0 ? id(i + 1, j, k) : a === 1 ? id(i, j + 1, k) : id(i, j, k + 1), mm = a === 0 ? id(i - 1, j, k) : a === 1 ? id(i, j - 1, k) : id(i, j, k - 1);
      const fp = dom.solid[p] ? f[c] : f[p], fm = dom.solid[mm] ? f[c] : f[mm];
      return 0.5 * (fp - fm);
    };
    const dudx = d(m.ux, 0), dudy = d(m.ux, 1), dudz = d(m.ux, 2), dvdx = d(m.uy, 0), dvdy = d(m.uy, 1), dvdz = d(m.uy, 2), dwdx = d(m.uz, 0), dwdy = d(m.uz, 1), dwdz = d(m.uz, 2);
    const wx = dwdy - dvdz, wy = dudz - dwdx, wz = dvdx - dudy;
    vort[c] = Math.hypot(wx, wy, wz);
    const s2 = dudx * dudx + dvdy * dvdy + dwdz * dwdz + 0.5 * ((dudy + dvdx) ** 2 + (dudz + dwdx) ** 2 + (dvdz + dwdy) ** 2);
    strain[c] = Math.sqrt(2 * s2);
    const om2 = 0.5 * (wx * wx + wy * wy + wz * wz) * 0.5;      // ‖Ω‖² = ½ Ω_ij Ω_ij = ¼|ω|²
    q[c] = om2 - 0.5 * (2 * s2 * 0.5);                          // Q = ½(‖Ω‖² − ‖S‖²) with ‖S‖² = S_ij S_ij
  }
  return { vort, q, strain };
}

export interface Streamline { pts: number[]; speed: number[] }
/** Streamlines of the mean flow: midpoint (RK2) integration with a constant step of 0.7 cells; seeds in cell coordinates. */
export function streamlines(dom: FlowDomain, m: LbmRun['mean'], seeds: [number, number, number][], maxLen = 0): Streamline[] {
  const { nx, ny, nz } = dom, out: Streamline[] = [];
  const limit = maxLen || Math.ceil((nx / 0.7) * 1.6);
  const vel = (x: number, y: number, z: number): [number, number, number] => [trilinear(m.ux, nx, ny, nz, x, y, z), trilinear(m.uy, nx, ny, nz, x, y, z), trilinear(m.uz, nx, ny, nz, x, y, z)];
  for (const s of seeds) {
    let x = s[0], y = s[1], z = s[2];
    const pts: number[] = [], sp: number[] = [];
    for (let it = 0; it < limit; it++) {
      const ci = Math.floor(x), cj = Math.floor(y), ck = Math.floor(z);
      if (ci < 0 || cj < 0 || ck < 0 || ci >= nx || cj >= ny || ck >= nz) break;
      if (dom.solid[ci + nx * (cj + ny * ck)]) break;
      const v1 = vel(x, y, z), m1 = Math.hypot(v1[0], v1[1], v1[2]);
      if (m1 < 1e-4) break;
      const h = 0.7;
      const v2 = vel(x + 0.5 * h * v1[0] / m1, y + 0.5 * h * v1[1] / m1, z + 0.5 * h * v1[2] / m1), m2 = Math.hypot(v2[0], v2[1], v2[2]) || m1;
      if (it % 3 === 0) { pts.push(dom.ox + x * dom.dx, dom.oy + y * dom.dx, dom.oz + z * dom.dx); sp.push(m1); }
      x += h * v2[0] / m2; y += h * v2[1] / m2; z += h * v2[2] / m2;
    }
    if (sp.length > 6) out.push({ pts, speed: sp });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Steady advection-diffusion (temperature) on the LBM grid: first-order upwind, BiCGStab with Jacobi scaling

export interface HeatProblem {
  dom: FlowDomain;
  u: LbmRun['mean'];
  alpha: Float32Array;               // diffusivity per cell (lattice units; solids carry k_s/ρcp)
  src: Float32Array;                 // volumetric source per cell, K per step
  fixed: Uint8Array;                 // Dirichlet cells
  value: Float32Array;               // their values
  Tin: number;
}

export function solveHeat(p: HeatProblem, maxIt = 1500, tol = 1e-7, progress?: (it: number, r: number) => void): { T: Float32Array; iterations: number; residual: number } {
  const { nx, ny, nz } = p.dom, N = nx * ny * nz, solid = p.dom.solid;
  const aP = new Float64Array(N), aN = new Float64Array(6 * N), rhs = new Float64Array(N);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  // fluid velocity (zero in solids)
  const U = (c: number, a: number) => (solid[c] ? 0 : a === 0 ? p.u.ux[c] : a === 1 ? p.u.uy[c] : p.u.uz[c]);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = id(i, j, k);
    if (p.fixed[c]) { aP[c] = 1; rhs[c] = p.value[c]; continue; }
    let sum = 0;
    for (let f = 0; f < 6; f++) {
      const a = f >> 1, sgn = f & 1 ? 1 : -1;
      const ni = i + (a === 0 ? sgn : 0), nj = j + (a === 1 ? sgn : 0), nk = k + (a === 2 ? sgn : 0);
      const inside = ni >= 0 && nj >= 0 && nk >= 0 && ni < nx && nj < ny && nk < nz;
      if (!inside) {
        if (a === 0 && sgn < 0) {                       // inlet: Dirichlet at the boundary
          const F = U(c, 0), D = 2 * p.alpha[c];
          const co = D + Math.max(F, 0);
          sum += co; rhs[c] += co * p.Tin;
        }
        continue;                                       // other boundaries: adiabatic / outflow
      }
      const n = id(ni, nj, nk);
      const F = sgn * 0.5 * (U(c, a) + U(n, a));         // outward normal velocity
      const ac = p.alpha[c], an = p.alpha[n];
      const D = (2 * ac * an) / (ac + an + 1e-30);
      const co = D + Math.max(-F, 0);
      aN[6 * c + f] = co; sum += co;
    }
    aP[c] = sum; rhs[c] += p.src[c];
  }
  const matvec = (x: Float64Array, y: Float64Array) => {
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = id(i, j, k);
      if (p.fixed[c]) { y[c] = x[c]; continue; }
      let s = aP[c] * x[c];
      const b = 6 * c;
      if (i > 0) s -= aN[b] * x[c - 1]; if (i < nx - 1) s -= aN[b + 1] * x[c + 1];
      if (j > 0) s -= aN[b + 2] * x[c - nx]; if (j < ny - 1) s -= aN[b + 3] * x[c + nx];
      if (k > 0) s -= aN[b + 4] * x[c - nx * ny]; if (k < nz - 1) s -= aN[b + 5] * x[c + nx * ny];
      y[c] = s;
    }
  };
  const x = new Float64Array(N).fill(p.Tin);
  for (let c = 0; c < N; c++) if (p.fixed[c]) x[c] = p.value[c];
  const r = new Float64Array(N), r0 = new Float64Array(N), pv = new Float64Array(N), v = new Float64Array(N), s = new Float64Array(N), t = new Float64Array(N), ph = new Float64Array(N), sh = new Float64Array(N);
  matvec(x, v);
  let bn = 0;
  for (let c = 0; c < N; c++) { r[c] = rhs[c] - v[c]; r0[c] = r[c]; bn += rhs[c] * rhs[c]; }
  bn = Math.sqrt(bn) || 1;
  let rho = 1, alpha = 1, omega = 1, res = Math.sqrt(r.reduce((a, b) => a + b * b, 0)) / bn, it = 0;
  const dot = (a: Float64Array, b: Float64Array) => { let q = 0; for (let i = 0; i < N; i++) q += a[i] * b[i]; return q; };
  while (res > tol && it < maxIt) {
    const rho1 = dot(r0, r);
    if (Math.abs(rho1) < 1e-300) break;
    const beta = (rho1 / rho) * (alpha / omega);
    for (let c = 0; c < N; c++) pv[c] = r[c] + beta * (pv[c] - omega * v[c]);
    for (let c = 0; c < N; c++) ph[c] = pv[c] / (aP[c] || 1);
    matvec(ph, v);
    alpha = rho1 / (dot(r0, v) || 1e-300);
    for (let c = 0; c < N; c++) s[c] = r[c] - alpha * v[c];
    for (let c = 0; c < N; c++) sh[c] = s[c] / (aP[c] || 1);
    matvec(sh, t);
    const tt = dot(t, t);
    omega = tt > 0 ? dot(t, s) / tt : 0;
    for (let c = 0; c < N; c++) { x[c] += alpha * ph[c] + omega * sh[c]; r[c] = s[c] - omega * t[c]; }
    rho = rho1; it++;
    res = Math.sqrt(dot(r, r)) / bn;
    if (it % 20 === 0) progress?.(it, res);
    if (!Number.isFinite(res)) break;
  }
  return { T: Float32Array.from(x), iterations: it, residual: res };
}
