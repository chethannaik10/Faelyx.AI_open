// Closed-form and panel-method analyses: supersonic / hypersonic panel aerodynamics, heat-sink optimisation and signal integrity.

import { fmt, type Env } from './base';
import { numP, boolP, strP } from './an_static';
import { applyM, windFrame } from './flow';
import { analysisSpec, emptyResult, type CaseInput, type Curve, type Result, type TableData } from './model';
import { bodiesBox } from './prepare';
import { amax } from './util';

const GAMMA = 1.4, R_AIR = 287.05;

// ---------------------------------------------------------------------------------------------
// Standard atmosphere (ISA) to 84.8 km

export function isa(h: number): { T: number; p: number; rho: number; a: number; mu: number } {
  let T: number, p: number;
  if (h <= 11000) { T = 288.15 - 0.0065 * h; p = 101325 * Math.pow(T / 288.15, 5.2559); }
  else if (h <= 20000) { T = 216.65; p = 22632.06 * Math.exp(-(h - 11000) / 6341.62); }
  else if (h <= 32000) { T = 216.65 + 0.001 * (h - 20000); p = 5474.889 * Math.pow(T / 216.65, -34.1632); }
  else if (h <= 47000) { T = 228.65 + 0.0028 * (h - 32000); p = 868.0187 * Math.pow(T / 228.65, -12.2011); }
  else if (h <= 51000) { T = 270.65; p = 110.9063 * Math.exp(-(h - 47000) / 7922.26); }
  else if (h <= 71000) { T = 270.65 - 0.0028 * (h - 51000); p = 66.93887 * Math.pow(T / 270.65, 12.2011); }
  else { T = 214.65 - 0.002 * (h - 71000); p = 3.956420 * Math.pow(T / 214.65, 17.0816); }
  const rho = p / (R_AIR * T), a = Math.sqrt(GAMMA * R_AIR * T);
  const mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4);
  return { T, p, rho, a, mu };
}

// ---------------------------------------------------------------------------------------------
// Supersonic panel aerodynamics

/** Oblique-shock weak-solution wave angle (rad) for deflection θ, or null if the shock detaches. */
function waveAngle(M: number, theta: number): number | null {
  const g = GAMMA, f = (b: number) => 2 / Math.tan(b) * (M * M * Math.sin(b) ** 2 - 1) / (M * M * (g + Math.cos(2 * b)) + 2) - Math.tan(theta);
  const mu = Math.asin(1 / M);
  // scan for the maximum deflection to bracket the weak branch
  let bMax = mu, fMax = -Infinity;
  for (let i = 1; i <= 200; i++) { const b = mu + ((Math.PI / 2 - mu) * i) / 200, v = f(b) + Math.tan(theta); if (v > fMax) { fMax = v; bMax = b; } }
  if (Math.tan(theta) > fMax) return null;
  let lo = mu + 1e-9, hi = bMax;
  for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (f(mid) < 0) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}

const nu = (M: number) => { const g = GAMMA, k = Math.sqrt((g + 1) / (g - 1)); return k * Math.atan(Math.sqrt(((g - 1) / (g + 1)) * (M * M - 1))) - Math.atan(Math.sqrt(M * M - 1)); };
function machFromNu(v: number): number {
  let lo = 1, hi = 60;
  for (let i = 0; i < 80; i++) { const mid = 0.5 * (lo + hi); if (nu(mid) < v) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}

/** Pressure coefficient of a panel inclined by θ (rad, positive = facing the flow) at free-stream Mach M. */
export function panelCp(M: number, theta: number): number {
  const g = GAMMA, cpVac = -2 / (g * M * M);
  if (Math.abs(theta) < 1e-6) return 0;
  if (theta > 0) {
    if (M < 5) {
      const b = waveAngle(M, theta);
      if (b != null) return (4 / (g + 1)) * (Math.sin(b) ** 2 - 1 / (M * M));
    }
    // modified Newtonian theory with the Rayleigh pitot pressure
    const p02 = Math.pow(((g + 1) ** 2 * M * M) / (4 * g * M * M - 2 * (g - 1)), g / (g - 1)) * ((1 - g + 2 * g * M * M) / (g + 1));
    const cpMax = (2 / (g * M * M)) * (p02 - 1);
    return cpMax * Math.sin(theta) ** 2;
  }
  // Prandtl–Meyer expansion
  const t = -theta, v2 = nu(M) + t;
  if (v2 >= (Math.PI / 2) * (Math.sqrt((g + 1) / (g - 1)) - 1)) return cpVac;
  const M2 = machFromNu(v2), pr = Math.pow((1 + 0.5 * (g - 1) * M * M) / (1 + 0.5 * (g - 1) * M2 * M2), g / (g - 1));
  return Math.max(cpVac, (2 / (g * M * M)) * (pr - 1));
}

export function runHighSpeed(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const spec = analysisSpec('highspeed');
  const M = numP(input, 'mach', 2.5), alt = numP(input, 'alt', 10000), aoa = numP(input, 'aoa', 0), beta = numP(input, 'beta', 0);
  if (M < 0.8) throw new Error(`Mach ${M} is subsonic: use the virtual wind tunnel (valid to Mach 0.8).`);
  if (M < 1.2) throw new Error(`Mach ${M} is transonic. No solver in this environment resolves the transonic range (Mach 0.8 – 1.2); run Mach ≤ 0.8 in the wind tunnel or Mach ≥ 1.2 here.`);
  const bodies = input.bodies.filter((b) => b.role === 'solid');
  if (!bodies.length) throw new Error('Add at least one solid body.');
  const atm = isa(alt), V = M * atm.a, q = 0.5 * atm.rho * V * V;
  const box = bodiesBox(bodies), c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const Mrot = windFrame(aoa, beta);
  let nTri = 0; for (const b of bodies) nTri += b.tris.length / 9;
  const pos = new Float32Array(9 * nTri), cp = new Float32Array(nTri);
  const area = new Float64Array(nTri), nrm = new Float64Array(3 * nTri), cen = new Float64Array(3 * nTri), theta = new Float64Array(nTri);
  const flow: [number, number, number] = [1, 0, 0];                 // wind direction in the flow frame
  const pf = new Float64Array(9 * nTri);                            // triangles in the flow frame
  let k = 0;
  for (const b of bodies) {
    for (let i = 0; i < b.tris.length; i += 9) {
      for (let v = 0; v < 3; v++) { pos[9 * k + 3 * v] = b.tris[i + 3 * v]; pos[9 * k + 3 * v + 1] = b.tris[i + 3 * v + 1]; pos[9 * k + 3 * v + 2] = b.tris[i + 3 * v + 2]; const p = applyM(Mrot, [b.tris[i + 3 * v] - c[0], b.tris[i + 3 * v + 1] - c[1], b.tris[i + 3 * v + 2] - c[2]]); pf[9 * k + 3 * v] = p[0]; pf[9 * k + 3 * v + 1] = p[1]; pf[9 * k + 3 * v + 2] = p[2]; }
      k++;
    }
  }
  // orientation: the signed volume tells whether the triangles are wound outward
  let vol6 = 0;
  for (let t = 0; t < nTri; t++) {
    const o = 9 * t;
    vol6 += pf[o] * (pf[o + 4] * pf[o + 8] - pf[o + 5] * pf[o + 7]) - pf[o + 1] * (pf[o + 3] * pf[o + 8] - pf[o + 5] * pf[o + 6]) + pf[o + 2] * (pf[o + 3] * pf[o + 7] - pf[o + 4] * pf[o + 6]);
  }
  const orient = vol6 < 0 ? -1 : 1;
  for (let t = 0; t < nTri; t++) {
    const a = pf.subarray(9 * t, 9 * t + 3), b = pf.subarray(9 * t + 3, 9 * t + 6), d = pf.subarray(9 * t + 6, 9 * t + 9);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    area[t] = l / 2;
    if (l < 1e-18) { nrm[3 * t] = 1; continue; }
    nrm[3 * t] = (orient * nx) / l; nrm[3 * t + 1] = (orient * ny) / l; nrm[3 * t + 2] = (orient * nz) / l;
    cen[3 * t] = (a[0] + b[0] + d[0]) / 3; cen[3 * t + 1] = (a[1] + b[1] + d[1]) / 3; cen[3 * t + 2] = (a[2] + b[2] + d[2]) / 3;
    theta[t] = Math.asin(Math.max(-1, Math.min(1, -(nrm[3 * t] * flow[0]))));      // > 0 : the panel faces the wind
  }
  // shadowing by a depth buffer on the plane normal to the flow
  const shadowed = new Uint8Array(nTri);
  if (boolP(input, 'shadow')) {
    env.progress(0.2, 'Shadowing hidden surfaces');
    let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < pf.length; i += 3) { x0 = Math.min(x0, pf[i]); x1 = Math.max(x1, pf[i]); y0 = Math.min(y0, pf[i + 1]); y1 = Math.max(y1, pf[i + 1]); z0 = Math.min(z0, pf[i + 2]); z1 = Math.max(z1, pf[i + 2]); }
    const NB = 512, sy = (y1 - y0) / NB || 1, sz = (z1 - z0) / NB || 1, zb = new Float32Array(NB * NB).fill(Infinity);
    for (let t = 0; t < nTri; t++) {
      if (theta[t] <= 0) continue;
      const P = [0, 1, 2].map((v) => [(pf[9 * t + 3 * v + 1] - y0) / sy, (pf[9 * t + 3 * v + 2] - z0) / sz, pf[9 * t + 3 * v]]);
      const ax = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), bx = Math.min(NB - 1, Math.floor(Math.max(P[0][0], P[1][0], P[2][0])));
      const ay = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), by = Math.min(NB - 1, Math.floor(Math.max(P[0][1], P[1][1], P[2][1])));
      const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
      if (Math.abs(den) < 1e-12) continue;
      for (let j = ay; j <= by; j++) for (let i = ax; i <= bx; i++) {
        const px = i + 0.5, py = j + 0.5;
        const l1 = ((P[1][1] - P[2][1]) * (px - P[2][0]) + (P[2][0] - P[1][0]) * (py - P[2][1])) / den, l2 = ((P[2][1] - P[0][1]) * (px - P[2][0]) + (P[0][0] - P[2][0]) * (py - P[2][1])) / den, l3 = 1 - l1 - l2;
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
        const dep = l1 * P[0][2] + l2 * P[1][2] + l3 * P[2][2];
        if (dep < zb[j * NB + i]) zb[j * NB + i] = dep;
      }
    }
    const tol = 0.01 * (x1 - x0 + 1e-9);
    for (let t = 0; t < nTri; t++) {
      const i = Math.min(NB - 1, Math.max(0, Math.floor((cen[3 * t + 1] - y0) / sy))), j = Math.min(NB - 1, Math.max(0, Math.floor((cen[3 * t + 2] - z0) / sz)));
      if (cen[3 * t] > zb[j * NB + i] + tol) shadowed[t] = 1;
    }
  }
  env.progress(0.5, 'Panel pressures');
  const cache = new Map<number, number>();
  const cpVac = -2 / (GAMMA * M * M);
  let Fx = 0, Fy = 0, Fz = 0, Mx = 0, My = 0, Mz = 0, Aproj = 0, Awet = 0, cpMax = -Infinity, cpMin = Infinity, imax = 0, imin = 0, nShadow = 0;
  for (let t = 0; t < nTri; t++) {
    let v: number;
    if (shadowed[t] && theta[t] > 0) { v = cpVac * 0.3; nShadow++; }
    else { const key = Math.round(theta[t] * 20000); const hit = cache.get(key); if (hit !== undefined) v = hit; else { v = panelCp(M, theta[t]); cache.set(key, v); } }
    cp[t] = v;
    const f = -v * q * area[t];
    Fx += f * nrm[3 * t]; Fy += f * nrm[3 * t + 1]; Fz += f * nrm[3 * t + 2];
    const X = cen[3 * t], Y = cen[3 * t + 1], Z = cen[3 * t + 2], fx = f * nrm[3 * t], fy = f * nrm[3 * t + 1], fz = f * nrm[3 * t + 2];
    Mx += Y * fz - Z * fy; My += Z * fx - X * fz; Mz += X * fy - Y * fx;
    Aproj += 0.5 * Math.abs(nrm[3 * t]) * area[t]; Awet += area[t];
    if (v > cpMax) { cpMax = v; imax = t; } if (v < cpMin) { cpMin = v; imin = t; }
  }
  const Lref = (() => { let a = Infinity, b = -Infinity; for (let i = 0; i < pf.length; i += 3) { a = Math.min(a, pf[i]); b = Math.max(b, pf[i]); } return b - a; })() * 1e-3;
  const A = Aproj * 1e-6, Aw = Awet * 1e-6;
  const CdW = Fx * 1e-6 / (q * A) , Cl = Fz * 1e-6 / (q * A), Cy = Fy * 1e-6 / (q * A);
  // skin friction (turbulent flat plate, compressible)
  const Re = (atm.rho * V * Lref) / atm.mu, Tw = 1 + 0.2 * M * M;
  const Cf = 0.455 / Math.pow(Math.log10(Math.max(Re, 1e4)), 2.58) / Math.pow(Tw, 0.65);
  const fric = boolP(input, 'friction');
  const CdF = fric ? (Cf * Aw) / A * 0.5 : 0;                 // projected onto the flow: wetted area exposed at about half the total
  const Cd = CdW + CdF;
  // centre of pressure (along the flow axis, flow frame)
  const xcp = Fz !== 0 ? -My / Fz * 1e0 : 0;
  const r = emptyResult('highspeed', spec.label);
  r.tri = { pos, val: cp, label: 'Pressure coefficient Cp', unit: '', min: Math.min(cpMin, cpVac), max: cpMax, diverging: true };
  r.bodies = bodies.map((b) => b.name);
  const T0 = atm.T * (1 + 0.2 * M * M), p0 = atm.p * Math.pow(1 + 0.2 * M * M, 3.5);
  r.kv.push({ label: 'Wave-drag coefficient Cd (pressure)', value: fmt(CdW, 4), status: 'info' });
  if (fric) r.kv.push({ label: 'Skin-friction drag coefficient (estimate)', value: fmt(CdF, 4) });
  r.kv.push({ label: 'Total drag coefficient Cd', value: fmt(Cd, 4), status: 'info' });
  r.kv.push({ label: 'Lift coefficient Cl', value: fmt(Cl, 4), status: 'info' });
  r.kv.push({ label: 'Side-force coefficient Cy', value: fmt(Cy, 4) });
  r.kv.push({ label: 'Lift / drag', value: fmt(Cd !== 0 ? Cl / Cd : 0, 3) });
  r.kv.push({ label: 'Drag force', value: `${fmt(Cd * q * A)} N` });
  r.kv.push({ label: 'Lift force', value: `${fmt(Cl * q * A)} N` });
  r.kv.push({ label: 'Free-stream speed / dynamic pressure', value: `${fmt(V)} m/s / ${fmt(q)} Pa` });
  r.kv.push({ label: 'Atmosphere at altitude', value: `T = ${fmt(atm.T)} K, p = ${fmt(atm.p)} Pa, ρ = ${fmt(atm.rho)} kg/m³` });
  r.kv.push({ label: 'Stagnation temperature / pressure', value: `${fmt(T0)} K / ${fmt(p0)} Pa (isentropic)` });
  r.kv.push({ label: 'Mach angle', value: `${fmt((Math.asin(1 / M) * 180) / Math.PI)}°` });
  r.kv.push({ label: 'Peak Cp / minimum Cp', value: `${fmt(cpMax)} / ${fmt(cpMin)}` });
  r.kv.push({ label: 'Reference area / length', value: `${fmt(A * 1e6)} mm² / ${fmt(Lref * 1e3)} mm` });
  r.hotspots = [
    { x: cen[3 * imax] + c[0], y: cen[3 * imax + 1] + c[1], z: cen[3 * imax + 2] + c[2], value: cpMax, label: 'Peak pressure', fieldId: 'tri' },
  ];
  // the hot-spots are in body axes: recompute from the original positions
  const body = (t: number): [number, number, number] => [(pos[9 * t] + pos[9 * t + 3] + pos[9 * t + 6]) / 3, (pos[9 * t + 1] + pos[9 * t + 4] + pos[9 * t + 7]) / 3, (pos[9 * t + 2] + pos[9 * t + 5] + pos[9 * t + 8]) / 3];
  const bm = body(imax), bn = body(imin);
  r.hotspots = [{ x: bm[0], y: bm[1], z: bm[2], value: cpMax, label: 'Peak pressure', fieldId: 'tri' }, { x: bn[0], y: bn[1], z: bn[2], value: cpMin, label: 'Lowest pressure', fieldId: 'tri' }];
  void xcp;
  // Mach sweep curve
  const ms: number[] = [], cds: number[] = [], cls: number[] = [];
  for (let i = 0; i < 14; i++) {
    const Mi = 1.3 + (i * (Math.max(M * 1.6, 6) - 1.3)) / 13; let fx = 0, fz = 0;
    const ck = new Map<number, number>();
    for (let t = 0; t < nTri; t++) { const key = Math.round(theta[t] * 20000); let v = ck.get(key); if (v === undefined) { v = shadowed[t] && theta[t] > 0 ? -0.3 * 2 / (GAMMA * Mi * Mi) : panelCp(Mi, theta[t]); ck.set(key, v); } const f = -v * area[t]; fx += f * nrm[3 * t]; fz += f * nrm[3 * t + 2]; }
    ms.push(+Mi.toFixed(2)); cds.push(fx * 1e-6 / (A) ); cls.push(fz * 1e-6 / (A));
  }
  const curve: Curve = { id: 'mach', title: 'Coefficients against Mach number (same attitude, pressure part)', xlabel: 'Mach number', ylabel: 'Coefficient × q', series: [{ name: 'Cd (pressure)', x: ms, y: cds.map((v) => v) }, { name: 'Cl', x: ms, y: cls.map((v) => v) }] };
  // note: the sweep divides by the dynamic pressure of each Mach implicitly: Cp already is normalised, so q cancels
  curve.ylabel = 'Coefficient'; r.curves.push(curve);
  r.tables.push(<TableData>{ id: 'atm', title: 'Free-stream conditions', cols: ['Quantity', 'Value'], rows: [['Altitude', `${alt} m`], ['Mach number', M], ['Temperature', `${fmt(atm.T)} K`], ['Pressure', `${fmt(atm.p)} Pa`], ['Density', `${fmt(atm.rho)} kg/m³`], ['Speed of sound', `${fmt(atm.a)} m/s`], ['Reynolds number (reference length)', fmt(Re, 3)], ['Panels shadowed', `${nShadow} of ${nTri}`]] });
  r.checks.push({ name: 'Mach range of the method', value: `Mach ${M}`, limit: '1.2 – 25', ok: M >= 1.2 && M <= 25 });
  r.checks.push({ name: 'Real-gas effects negligible', value: `Mach ${M}`, limit: '≤ 8', ok: M <= 8, note: M > 8 ? 'Dissociation and vibrational excitation lower the shock temperature and change Cp; ideal-gas results are approximate.' : undefined });
  r.verdict = { pass: null, text: `Cd = ${fmt(Cd, 3)}, Cl = ${fmt(Cl, 3)} at Mach ${M}, ${alt} m, α = ${aoa}°.` };
  r.notes.push(`Method: ${M < 5 ? 'tangent-wedge (oblique-shock) compression with Prandtl–Meyer expansion; modified Newtonian theory where the shock detaches' : 'modified Newtonian compression with Prandtl–Meyer expansion on the lee side'}. Colours show Cp on the surface of the part in its own axes.`);
  r.notes.push(`Frontal reference area is the area of the part projected normal to the wind. ${nShadow} panels were treated as shadowed.`);
  r.mesh = { type: 'Triangle panels', elements: nTri, nodes: 3 * nTri, dof: 0, h: 0, bodyVolume: 0, minDim: 0, quality: '', time: Date.now() - t0 };
  r.solver = { name: 'Shock-expansion / Newtonian panel method', time: Date.now() - t0, log: [`${nTri} panels`] };
  r.assumptions.push(...spec.limits);
  r.inputs.push({ label: 'Flight condition', value: `Mach ${M}, altitude ${alt} m, α ${aoa}°, β ${beta}°` });
  return r;
}

// ---------------------------------------------------------------------------------------------
// Heat-sink optimisation

const SINK_MATS: Record<string, { name: string; k: number; rho: number }> = {
  al6061: { name: 'Aluminium 6061', k: 167, rho: 2700 }, cu: { name: 'Copper', k: 390, rho: 8960 }, al7075: { name: 'Aluminium 7075', k: 130, rho: 2810 },
};

interface Sink { N: number; t: number; H: number; b: number }
interface SinkEval { R: number; Rconv: number; Rcond: number; h: number; eta: number; Tb: number; Tfin: number; m: number; mass: number; Nu: number }

function airProps(Tfilm: number) {
  const T = Tfilm + 273.15;
  return { rho: 101325 / (R_AIR * T), mu: 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4), k: 0.0241 + 7.6e-5 * (T - 273.15), cp: 1007, beta: 1 / T };
}

function evalSink(s: Sink, o: { P: number; Tamb: number; W: number; L: number; tb: number; k: number; rho: number; forced: boolean; U: number; rth: number }): SinkEval {
  const { N, t, H, b } = s, W = o.W * 1e-3, L = o.L * 1e-3, tb = o.tb * 1e-3, tt = t * 1e-3, HH = H * 1e-3, bb = b * 1e-3;
  const aFin = N * (2 * HH + tt) * L, aBase = Math.max(0, (N - 1) * bb) * L;
  let Tb = o.Tamb + o.P * 0.5, h = 5, eta = 1, Tfin = Tb, Nu = 0, m = 0;
  for (let it = 0; it < 60; it++) {
    const Tw = Tb - 0.35 * (Tb - o.Tamb) * 0;          // wall temperature for the correlation (base)
    const ap = airProps(0.5 * (Tw + o.Tamb));
    const alpha = ap.k / (ap.rho * ap.cp), nuK = ap.mu / ap.rho, Pr = nuK / alpha;
    if (o.forced) {
      const Uch = o.U * W / Math.max(W - N * tt, 1e-6);
      const Reb = (Uch * bb) / nuK, Res = (Reb * bb) / L;
      const a1 = (Res * Pr) / 2, a2 = 0.664 * Math.sqrt(Res) * Math.cbrt(Pr) * Math.sqrt(1 + 3.65 / Math.sqrt(Res));
      Nu = Math.pow(Math.pow(a1, -3) + Math.pow(a2, -3), -1 / 3);
    } else {
      const dT = Math.max(1, Tb - o.Tamb) * 0.9;
      const Ra = (9.80665 * ap.beta * dT * bb ** 3) / (nuK * alpha), El = Ra * (bb / L);
      Nu = Math.pow(576 / (El * El) + 2.873 / Math.sqrt(El), -0.5);
    }
    const hn = (Nu * ap.k) / bb;
    m = Math.sqrt((2 * hn) / (o.k * tt));
    const Hc = HH + tt / 2;
    eta = Math.tanh(m * Hc) / (m * Hc);
    const Rconv = 1 / (hn * (eta * aFin + aBase));
    const Rcond = tb / (o.k * W * L);
    const R = o.rth + Rcond + Rconv;
    const Tbn = o.Tamb + o.P * R;
    h = hn;
    // mean fin temperature
    Tfin = o.Tamb + (Tbn - o.Tamb - o.P * (o.rth + Rcond) * 0) * eta;
    if (Math.abs(Tbn - Tb) < 1e-4) { Tb = Tbn; break; }
    Tb = 0.5 * Tb + 0.5 * Tbn;
  }
  const Rcond = tb / (o.k * W * L), Rconv = 1 / (h * (eta * aFin + aBase));
  const mass = o.rho * (W * L * tb + N * tt * HH * L);
  return { R: o.rth + Rcond + Rconv, Rconv, Rcond, h, eta, Tb, Tfin, m, mass, Nu };
}

export function runHeatSink(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const spec = analysisSpec('heatsink');
  const P = numP(input, 'P', 40), Tamb = numP(input, 'Tamb', 25), Tmax = numP(input, 'Tmax', 80), W = numP(input, 'W', 80), L = numP(input, 'L', 100), tb = numP(input, 'tb', 4), Hmax = numP(input, 'Hmax', 40);
  const mat = SINK_MATS[strP(input, 'mat', 'al6061')] ?? SINK_MATS.al6061, forced = strP(input, 'cool', 'natural') === 'forced', U = numP(input, 'U', 2), tmin = numP(input, 'tmin', 0.8), gmin = numP(input, 'gmin', 2), rth = numP(input, 'rth', 0.1);
  const o = { P, Tamb, W, L, tb, k: mat.k, rho: mat.rho, forced, U, rth };
  const Nmax = Math.max(2, Math.floor((W + gmin) / (tmin + gmin)));
  let best: { s: Sink; e: SinkEval } | null = null;
  const all: { s: Sink; e: SinkEval }[] = [];
  env.progress(0.1, 'Searching the design space');
  for (let N = 2; N <= Nmax; N++) {
    for (let it = 0; it < 14; it++) {
      const tmaxN = (W - (N - 1) * gmin) / N;
      if (tmaxN < tmin) continue;
      const t = tmin + ((tmaxN - tmin) * it) / 13;
      const b = (W - N * t) / (N - 1);
      if (b < gmin - 1e-9) continue;
      for (const hf of [1, 0.85, 0.7, 0.55, 0.4]) {
        const s: Sink = { N, t, H: Hmax * hf, b };
        const e = evalSink(s, o);
        all.push({ s, e });
        // lowest resistance; ties go to the lighter design
        if (!best || e.R < best.e.R - 1e-4 || (Math.abs(e.R - best.e.R) <= 1e-4 && e.mass < best.e.mass)) best = { s, e };
      }
    }
  }
  if (!best) throw new Error('No valid fin layout fits the base: reduce the minimum thickness or gap, or enlarge the base.');
  const bestS = best;
  // lightest design that still meets the temperature limit (within the 10 % best)
  const feasible = all.filter((d) => d.e.Tb <= Tmax).sort((a, c) => a.e.mass - c.e.mass);
  const light = feasible[0] ?? null;
  const Rreq = (Tmax - Tamb) / P;
  // curves
  const tOpt = bestS.s.t, series: { name: string; x: number[]; y: number[] }[] = [];
  for (const f of [0.6, 1, 1.6]) {
    const x: number[] = [], y: number[] = [];
    for (let N = 2; N <= Nmax; N++) {
      const t = Math.min(tOpt * f, (W - (N - 1) * gmin) / N); if (t < tmin - 1e-9) continue;
      const b = (W - N * t) / (N - 1); if (b < gmin - 1e-9) continue;
      x.push(N); y.push(evalSink({ N, t, H: bestS.s.H, b }, o).R);
    }
    series.push({ name: `t = ${(tOpt * f).toFixed(2)} mm`, x, y });
  }
  const hx: number[] = [], hy: number[] = [];
  for (let H = 5; H <= Hmax * 1.0001; H += Math.max(1, Hmax / 24)) { hx.push(+H.toFixed(1)); hy.push(evalSink({ ...bestS.s, H }, o).R); }
  const r = emptyResult('heatsink', spec.label);
  const e = bestS.e, s = bestS.s;
  r.kv.push({ label: 'Lowest thermal resistance', value: `${fmt(e.R, 3)} K/W`, status: e.Tb <= Tmax ? 'ok' : 'fail' });
  r.kv.push({ label: 'Base temperature', value: `${fmt(e.Tb)} °C (limit ${Tmax} °C)`, status: e.Tb <= Tmax ? 'ok' : 'fail' });
  r.kv.push({ label: 'Required resistance', value: `${fmt(Rreq, 3)} K/W` });
  r.kv.push({ label: 'Fin layout', value: `${s.N} fins, ${fmt(s.t)} mm thick, ${fmt(s.H)} mm high, ${fmt(s.b)} mm gap` });
  r.kv.push({ label: 'Film coefficient / fin efficiency', value: `${fmt(e.h)} W/m²K / ${(100 * e.eta).toFixed(0)} %` });
  r.kv.push({ label: 'Resistance split', value: `convection ${fmt(e.Rconv, 3)}, base ${fmt(e.Rcond, 3)}, interface ${fmt(rth, 3)} K/W` });
  r.kv.push({ label: 'Mass', value: `${fmt(e.mass * 1000)} g (${mat.name})` });
  if (light) r.kv.push({ label: 'Lightest design meeting the limit', value: `${light.s.N} fins, ${fmt(light.s.t)} × ${fmt(light.s.H)} mm, ${fmt(light.e.mass * 1000)} g, base ${fmt(light.e.Tb)} °C` });
  r.checks.push({ name: 'Base temperature', value: `${fmt(e.Tb)} °C`, limit: `≤ ${Tmax} °C`, ok: e.Tb <= Tmax, note: e.Tb > Tmax ? `Needs R ≤ ${fmt(Rreq, 3)} K/W: enlarge the envelope, use forced convection or copper.` : undefined });
  r.checks.push({ name: 'Fin efficiency', value: `${(100 * e.eta).toFixed(0)} %`, limit: '≥ 50 %', ok: e.eta >= 0.5, note: e.eta < 0.5 ? 'Tall, thin fins: the tips contribute little; thicken them or use a better conductor.' : undefined });
  const top = all.slice().sort((a, c) => a.e.R - c.e.R);
  const seen = new Set<string>(), rows: (string | number)[][] = [];
  for (const d of top) { const key = `${d.s.N}`; if (seen.has(key)) continue; seen.add(key); rows.push([d.s.N, fmt(d.s.t), fmt(d.s.H), fmt(d.s.b), fmt(d.e.R, 3), fmt(d.e.Tb), fmt(d.e.mass * 1000)]); if (rows.length >= 8) break; }
  r.tables.push({ id: 'designs', title: 'Best layout for each fin count', cols: ['Fins', 't (mm)', 'H (mm)', 'Gap (mm)', 'R (K/W)', 'T base (°C)', 'Mass (g)'], rows });
  r.curves.push({ id: 'nfin', title: 'Thermal resistance against fin count', xlabel: 'Number of fins', ylabel: 'R (K/W)', series });
  r.curves.push({ id: 'hfin', title: 'Thermal resistance against fin height', xlabel: 'Fin height (mm)', ylabel: 'R (K/W)', series: [{ name: 'Optimum layout', x: hx, y: hy }] });
  // 3-D picture: base + fins coloured by temperature
  const tris: number[] = [], vals: number[] = [];
  const addBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, T: number) => {
    const p: [number, number, number][] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    for (const q of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]]) { tris.push(...p[q[0]], ...p[q[1]], ...p[q[2]], ...p[q[0]], ...p[q[2]], ...p[q[3]]); vals.push(T, T); }
  };
  const dTb = e.Tb - Tamb - P * (rth + e.Rcond), Tcase = e.Tb;
  addBox(0, 0, 0, W, L, tb, Tcase);
  const nsl = 10;
  for (let f = 0; f < s.N; f++) {
    const x0 = f * (s.t + s.b);
    for (let q = 0; q < nsl; q++) {
      const z0 = tb + (q * s.H) / nsl, z1 = tb + ((q + 1) * s.H) / nsl, zc = ((q + 0.5) / nsl) * s.H;
      const T = Tamb + (Tcase - Tamb) * Math.cosh(e.m * (s.H * 1e-3 + s.t * 5e-4 - zc * 1e-3)) / Math.cosh(e.m * (s.H * 1e-3 + s.t * 5e-4));
      addBox(x0, 0, z0, x0 + s.t, L, z1, T);
    }
  }
  void dTb;
  const vv = Float32Array.from(vals);
  r.tri = { pos: Float32Array.from(tris), val: vv, label: 'Temperature', unit: '°C', min: Tamb, max: Tcase };
  r.verdict = { pass: e.Tb <= Tmax, text: e.Tb <= Tmax ? `PASS: the best layout holds the base at ${fmt(e.Tb)} °C (limit ${Tmax} °C), R = ${fmt(e.R, 3)} K/W.` : `FAIL: even the best layout reaches ${fmt(e.Tb)} °C (limit ${Tmax} °C).` };
  r.notes.push(`${forced ? `Forced convection (Teertstra et al. correlation) at ${U} m/s approach velocity, shrouded channel (no bypass).` : 'Natural convection in the fin channels (Elenbaas / Bar-Cohen–Rohsenow composite correlation); radiation is neglected, which is conservative by about 10 – 25 %.'} The picture shows the estimated fin temperature (fin theory, adiabatic tip).`);
  r.notes.push(`${all.length.toLocaleString()} layouts were evaluated.`);
  r.mesh = { type: 'Analytical', elements: 0, nodes: 0, dof: 0, h: 0, bodyVolume: 0, minDim: 0, quality: '', time: Date.now() - t0 };
  r.solver = { name: 'Correlation search with fin efficiency', time: Date.now() - t0, log: [`${all.length} designs`] };
  r.assumptions.push(...spec.limits);
  r.inputs.push({ label: 'Envelope', value: `${W} × ${L} mm base, ${tb} mm thick, fins up to ${Hmax} mm` });
  r.inputs.push({ label: 'Thermal load', value: `${P} W, ambient ${Tamb} °C, ${forced ? 'forced ' + U + ' m/s' : 'natural convection'}` });
  return r;
}

// ---------------------------------------------------------------------------------------------
// Signal integrity

const C0 = 299792458, MU0 = 4e-7 * Math.PI;

export function microstrip(wmm: number, hmm: number, tum: number, er: number): { Z0: number; ereff: number } {
  const t = tum * 1e-3;                                           // mm
  let u = wmm / hmm;
  if (t > 0) {
    const du1 = (t / (Math.PI * hmm)) * Math.log(1 + (4 * Math.E) / ((t / hmm) / Math.pow(Math.tanh(Math.sqrt(6.517 * u)), 2)));
    u += 0.5 * (1 + 1 / Math.cosh(Math.sqrt(er - 1))) * du1;
  }
  const F = 6 + (2 * Math.PI - 6) * Math.exp(-Math.pow(30.666 / u, 0.7528));
  const Z01 = 60 * Math.log(F / u + Math.sqrt(1 + (2 / u) ** 2));
  const a = 1 + Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 + Math.log(1 + (u / 18.1) ** 3) / 18.7, b = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  const ereff = (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 10 / u, -a * b);
  return { Z0: Z01 / Math.sqrt(ereff), ereff };
}

export function stripline(wmm: number, hmm: number, tum: number, er: number): { Z0: number; ereff: number } {
  const t = tum * 1e-3, b = 2 * hmm + t;
  let Z0: number;
  if (wmm / (b - t) < 0.35) Z0 = (60 / Math.sqrt(er)) * Math.log((4 * b) / (0.67 * Math.PI * (0.8 * wmm + t)));
  else Z0 = (30 * Math.PI * Math.PI / Math.sqrt(er)) * (b - t) / (wmm + 0.441 * (b - t));
  return { Z0, ereff: er };
}

export function runIntegrity(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const spec = analysisSpec('integrity');
  const topo = strP(input, 'topo', 'microstrip');
  const w = numP(input, 'w', 0.2), t = numP(input, 't', 35), hh = numP(input, 'hh', 0.2), er = numP(input, 'er', 4.3), tand = numP(input, 'tand', 0.02), len = numP(input, 'len', 100), tr = numP(input, 'trise', 1) * 1e-9, s = numP(input, 's', 0.2), Zs = numP(input, 'Zs', 20), Zl = numP(input, 'Zl', 1e6), V = numP(input, 'V', 3.3);
  env.progress(0.2, 'Evaluating the transmission line');
  const ev = (ww: number) => (topo === 'stripline' ? stripline(ww, hh, t, er) : microstrip(ww, hh, t, er));
  const { Z0, ereff } = ev(w);
  const diff = topo === 'diffpair';
  const Zdiff = diff ? 2 * Z0 * (1 - 0.48 * Math.exp(-0.96 * s / hh)) : 0;
  const tpd = (Math.sqrt(ereff) / C0) * 1e12 * 1e-3;            // ps/mm
  const Td = (len * tpd) * 1e-12;                               // s
  const GL = (Zl - Z0) / (Zl + Z0), GS = (Zs - Z0) / (Zs + Z0);
  const V1 = (V * Z0) / (Zs + Z0);
  const fknee = 0.35 / tr, fbw = 0.5 / tr;
  const sigma = 5.8e7, delta = 1 / Math.sqrt(Math.PI * fknee * MU0 * sigma);
  const tm = t * 1e-6, wm = w * 1e-3;
  const Rdc = 1 / (sigma * wm * tm);
  const Rac = delta < tm / 2 ? 1 / (sigma * (wm + (topo === 'stripline' ? wm : 0)) * delta) : Rdc;
  const alphaC = (Math.max(Rac, Rdc) / (2 * Z0)), alphaD = ((Math.PI * fknee) / C0) * (er / Math.sqrt(ereff)) * ((ereff - 1) / Math.max(er - 1, 1e-6)) * tand;
  const lossDb = 8.686 * (alphaC + alphaD) * len * 1e-3;
  const lcrit = (tr / (6 * tpd * 1e-12)) * 1e3 * 1e-9 * 1e9 / 1e9 * 1e0;
  const Lcrit = ((tr * 1e12) / (6 * tpd));                      // mm
  void lcrit;
  const Kb = 0.25 / (1 + (s / hh) ** 2) * (topo === 'stripline' ? 1 : 1);
  const sat = Math.min(1, (2 * Td) / tr);
  const next = Kb * sat;
  // curves
  const widths: number[] = [], zs: number[] = [];
  for (let i = 0; i < 40; i++) { const ww = w * (0.4 + (1.6 * i) / 39); widths.push(+ww.toFixed(4)); zs.push((diff ? 2 * ev(ww).Z0 * (1 - 0.48 * Math.exp(-0.96 * s / hh)) : ev(ww).Z0)); }
  const fs: number[] = [], il: number[] = [];
  for (let i = 0; i < 60; i++) {
    const f = 1e8 * Math.pow(2e10 / 1e8, i / 59), d = 1 / Math.sqrt(Math.PI * f * MU0 * sigma);
    const rr = d < tm / 2 ? 1 / (sigma * (wm + (topo === 'stripline' ? wm : 0)) * d) : Rdc;
    const aC = Math.max(rr, Rdc) / (2 * Z0), aD = ((Math.PI * f) / C0) * (er / Math.sqrt(ereff)) * ((ereff - 1) / Math.max(er - 1, 1e-6)) * tand;
    fs.push(f / 1e9); il.push(-8.686 * (aC + aD) * len * 1e-3);
  }
  // step response at the load with finite rise time (bounce diagram, lossless)
  const tsim = Td * 14, nsteps = 500, times: number[] = [], vl: number[] = [], vsrc: number[] = [];
  const ramp = (x: number) => (x <= 0 ? 0 : x >= tr ? 1 : x / tr);
  for (let i = 0; i <= nsteps; i++) {
    const tt = (tsim * i) / nsteps; let v = 0, amp = V1;
    for (let k = 0; k < 8; k++) {
      const arrive = (2 * k + 1) * Td;
      v += amp * (1 + GL) * ramp(tt - arrive);
      amp *= GL * GS;
    }
    times.push(+(tt * 1e9).toFixed(4)); vl.push(v); vsrc.push(V * ramp(tt));
  }
  const vfinal = (V * Zl) / (Zs + Zl), vmax = amax(vl);
  const over = vfinal > 0 ? (100 * (vmax - vfinal)) / vfinal : 0;
  const r = emptyResult('integrity', spec.label);
  const target = diff ? 100 : 50, zUse = diff ? Zdiff : Z0;
  r.kv.push({ label: diff ? 'Differential impedance' : 'Characteristic impedance', value: `${fmt(zUse, 4)} Ω`, status: Math.abs(zUse - target) / target <= 0.1 ? 'ok' : 'warn' });
  if (diff) r.kv.push({ label: 'Single-ended / odd-mode impedance', value: `${fmt(Z0, 4)} Ω / ${fmt(Zdiff / 2, 4)} Ω` });
  r.kv.push({ label: 'Effective dielectric constant', value: fmt(ereff, 4) });
  r.kv.push({ label: 'Propagation delay', value: `${fmt(tpd, 4)} ps/mm, line delay ${fmt(Td * 1e12, 4)} ps` });
  r.kv.push({ label: 'Reflection coefficient: load / source', value: `${fmt(GL, 3)} / ${fmt(GS, 3)}` });
  r.kv.push({ label: 'Launched voltage', value: `${fmt(V1, 3)} V (of ${V} V)` });
  r.kv.push({ label: 'Overshoot at the load', value: `${over.toFixed(0)} %`, status: over < 15 ? 'ok' : over < 40 ? 'warn' : 'fail' });
  r.kv.push({ label: 'Signal bandwidth (0.35 / t_r) / knee frequency', value: `${fmt(fknee / 1e9, 3)} GHz / ${fmt(fbw / 1e9, 3)} GHz` });
  r.kv.push({ label: 'Skin depth at the knee frequency', value: `${fmt(delta * 1e6, 3)} µm (copper ${t} µm)` });
  r.kv.push({ label: 'Insertion loss at the knee frequency', value: `${fmt(lossDb, 3)} dB over ${len} mm (conductor ${fmt(8.686 * alphaC * len * 1e-3, 3)}, dielectric ${fmt(8.686 * alphaD * len * 1e-3, 3)})` });
  r.kv.push({ label: 'Critical length (t_r / 6 t_pd)', value: `${fmt(Lcrit)} mm`, status: len > Lcrit ? 'warn' : 'ok' });
  r.kv.push({ label: 'Backward crosstalk to a neighbour (estimate)', value: `${(100 * next).toFixed(1)} % of the swing` });
  r.checks.push({ name: diff ? 'Differential impedance' : 'Impedance', value: `${fmt(zUse, 4)} Ω`, limit: `${target} Ω ± 10 %`, ok: Math.abs(zUse - target) / target <= 0.1 });
  r.checks.push({ name: 'Load reflection', value: fmt(GL, 3), limit: '|Γ| ≤ 0.2', ok: Math.abs(GL) <= 0.2, note: Math.abs(GL) > 0.2 ? 'Terminate the line (series at the source, parallel at the load) to remove ringing.' : undefined });
  r.checks.push({ name: 'Line is electrically short or terminated', value: `${len} mm vs ${fmt(Lcrit)} mm`, limit: 'len ≤ t_r/6t_pd or terminated', ok: len <= Lcrit || Math.abs(GL) <= 0.2 });
  r.checks.push({ name: 'Crosstalk', value: `${(100 * next).toFixed(1)} %`, limit: '≤ 5 %', ok: next <= 0.05 });
  r.checks.push({ name: 'Insertion loss at the knee frequency', value: `${fmt(lossDb, 3)} dB`, limit: '≤ 3 dB', ok: lossDb <= 3 });
  r.curves.push({ id: 'zw', title: `Impedance against trace width (${topo})`, xlabel: 'Trace width (mm)', ylabel: 'Ω', series: [{ name: diff ? 'Zdiff' : 'Z0', x: widths, y: zs }], marks: [{ x: w, label: 'design' }] });
  r.curves.push({ id: 'il', title: 'Insertion loss against frequency', xlabel: 'Frequency (GHz)', ylabel: 'dB', logx: true, series: [{ name: 'S21 (conductor + dielectric)', x: fs, y: il }] });
  r.curves.push({ id: 'step', title: 'Step at the load, including the source/load mismatch', xlabel: 'Time (ns)', ylabel: 'Voltage (V)', series: [{ name: 'Load voltage', x: times, y: vl }, { name: 'Source step', x: times, y: vsrc }] });
  r.tables.push({ id: 'geom', title: 'Stack-up', cols: ['Parameter', 'Value'], rows: [['Type', topo], ['Width / copper thickness', `${w} mm / ${t} µm`], ['Dielectric height', `${hh} mm`], ['εr / loss tangent', `${er} / ${tand}`], ['Length', `${len} mm`], ['Rise time', `${fmt(tr * 1e9, 3)} ns`], ['Spacing to neighbour', `${s} mm`]] });
  r.verdict = { pass: Math.abs(zUse - target) / target <= 0.1 && Math.abs(GL) <= 0.2, text: `${diff ? 'Zdiff' : 'Z0'} = ${fmt(zUse, 3)} Ω (target ${target} Ω), load reflection ${fmt(GL, 3)}, overshoot ${over.toFixed(0)} %.` };
  r.notes.push('Closed-form models (Hammerstad–Jensen microstrip, IPC-2141 stripline and differential pair). Crosstalk uses the weak-coupling backward estimate, saturated when the line is longer than half the rise-time distance. For sign-off use a field solver.');
  r.mesh = { type: 'Analytical', elements: 0, nodes: 0, dof: 0, h: 0, bodyVolume: 0, minDim: 0, quality: '', time: Date.now() - t0 };
  r.solver = { name: 'Closed-form transmission-line models', time: Date.now() - t0, log: [] };
  r.assumptions.push(...spec.limits);
  return r;
}
