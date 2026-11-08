// Computational fluid dynamics: virtual wind tunnel, internal flow with conjugate heat transfer and the one-way fluid-structure coupling.
// The flow is solved by a lattice-Boltzmann (D3Q19) large-eddy scheme on a voxel grid; see flow.ts / lbm.ts.

import { baseResult, fmt, type Env } from './base';
import { boolP, describeInputs, numP, strP, dispScaleFor, addMeshAndSolver, bodyTable, solveStaticCore } from './an_static';
import { FLUIDS, applyM, externalDomain, meshFrom, prandtl, rotateTris, runLbm, solveHeat, streamlines, vorticity, windFrame, trilinear, type FlowDomain, type Fluid, type LbmRun, type M3 } from './flow';
import { frontalCells } from './lbm';
import { analysisSpec, emptyResult, type CaseInput, type FieldDef, type Hotspot, type Result, type Series, type Stream } from './model';
import { bodiesBox, faceCenter, type V3 } from './prepare';
import { fillBody, FACE_NORMAL } from './voxel';
import { pressureOnFacesFromField } from './loads';

const U_LB = 0.08;
const SOUND_LIMIT = 0.8;

export const QUALITY: Record<string, { cells: number; ft: number; label: string }> = {
  fast: { cells: 80_000, ft: 1.5, label: 'Fast' },
  standard: { cells: 200_000, ft: 2.2, label: 'Standard' },
  fine: { cells: 400_000, ft: 3.0, label: 'Fine' },
};
export const LBM_NS_PER_CELL_STEP = 360;

function fluidOf(input: CaseInput, key = 'fluid'): Fluid {
  const f = strP(input, key, 'air');
  if (f === 'custom' || !FLUIDS[f]) {
    const air = FLUIDS.air;
    return { name: 'Custom fluid', rho: numP(input, 'rho', air.rho), mu: numP(input, 'mu', air.mu), a: numP(input, 'sound', air.a), k: air.k, cp: air.cp };
  }
  return FLUIDS[f];
}

function fluidField(id: string, label: string, unit: string, data: Float32Array, solid: Uint8Array, o: Partial<FieldDef> = {}): FieldDef {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < data.length; i++) { if (solid[i]) { data[i] = NaN; continue; } const v = data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!Number.isFinite(mn)) { mn = 0; mx = 0; }
  return { id, label, unit, loc: 'cell', data, min: mn, max: mx, domain: 'fluid', ...o };
}

/** Cells that are solid and touch fluid, plus all cells of explicit bodies: what is drawn as the part. */
function wallMask(dom: FlowDomain, onlyShell: boolean): Uint8Array {
  const { nx, ny, nz } = dom, m = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = i + nx * (j + ny * k);
    if (!dom.solid[c]) continue;
    if (!onlyShell || dom.body[c]) { m[c] = 1; continue; }
    const t = (a: number, b: number, d: number) => a >= 0 && b >= 0 && d >= 0 && a < nx && b < ny && d < nz && !dom.solid[a + nx * (b + ny * d)];
    if (t(i - 1, j, k) || t(i + 1, j, k) || t(i, j - 1, k) || t(i, j + 1, k) || t(i, j, k - 1) || t(i, j, k + 1)) m[c] = 1;
  }
  return m;
}

function surfaceCells(dom: FlowDomain): number[] {
  const { nx, ny, nz } = dom, out: number[] = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const c = i + nx * (j + ny * k);
    if (dom.solid[c]) continue;
    if (dom.solid[c - 1] || dom.solid[c + 1] || dom.solid[c - nx] || dom.solid[c + nx] || dom.solid[c - nx * ny] || dom.solid[c + nx * ny]) out.push(c);
  }
  return out;
}

function cellPos(dom: FlowDomain, c: number): V3 {
  const { nx, ny } = dom, i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
  return [dom.ox + (i + 0.5) * dom.dx, dom.oy + (j + 0.5) * dom.dx, dom.oz + (k + 0.5) * dom.dx];
}

function setGrid(r: Result, dom: FlowDomain) {
  r.grid = { nx: dom.nx, ny: dom.ny, nz: dom.nz, h: dom.dx, ox: dom.ox, oy: dom.oy, oz: dom.oz };
}

// ---------------------------------------------------------------------------------------------
// Wind tunnel core (shared with the fluid-structure coupling)

export interface WindCfg {
  U: number; aoa: number; beta: number; fl: Fluid; turb: string; ground: 'off' | 'slip' | 'wall'; quality: string;
  Lref: number; Aref: number; Tbody: number; Tinf: number;
}

export interface WindCore {
  cfg: WindCfg; dom: FlowDomain; run: LbmRun; M: M3; centre: V3; names: string[];
  vScale: number; dxm: number; Re: number; mach: number; smag: number; nuLb: number; nuClamped: boolean;
  A: number; L: number; sigma: number; steps: number;
  Fn: { drag: number; side: number; lift: number }; Cd: number; Cl: number; Cy: number; CdRaw: number; blockF: number; pgF: number;
  rhoRef: number; q: number;
}

export function windCfgFrom(input: CaseInput): WindCfg {
  const fl = fluidOf(input);
  const g = strP(input, 'ground', 'off');
  return {
    U: numP(input, 'U', 30), aoa: numP(input, 'aoa', 0), beta: numP(input, 'beta', 0), fl, turb: strP(input, 'turb', 'auto'), ground: g === 'slip' || g === 'wall' ? g : 'off',
    quality: strP(input, 'quality', 'standard'), Lref: numP(input, 'Lref', 0), Aref: numP(input, 'Aref', 0), Tbody: numP(input, 'Tbody', 0), Tinf: numP(input, 'Tinf', 20),
  };
}

export function windCore(input: CaseInput, cfg: WindCfg, env: Env): WindCore {
  const bodies = input.bodies.filter((b) => b.role === 'solid');
  if (!bodies.length) throw new Error('Add at least one solid body to test in the wind tunnel.');
  const mach = cfg.U / cfg.fl.a;
  if (mach > SOUND_LIMIT) throw new Error(`Mach ${mach.toFixed(2)} is beyond the range of the incompressible flow solver (Mach ≤ 0.8). Use "Compressible: subsonic, supersonic & hypersonic" instead.`);
  const box = bodiesBox(bodies);
  const centre: V3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const M = windFrame(cfg.aoa, cfg.beta);
  const rot = bodies.map((b) => ({ tris: rotateTris(b.tris, M, centre), name: b.name }));
  const q = QUALITY[cfg.quality] ?? QUALITY.standard;
  env.progress(0.02, 'Building the flow domain');
  const dom = externalDomain(rot, q.cells, cfg.ground !== 'off');
  const dxm = dom.dx * 1e-3;
  const solidCount = dom.solid.reduce((a, b) => a + b, 0);
  if (solidCount < 40) throw new Error('The part is too small for the flow domain (fewer than 40 solid cells). Use a finer resolution or check the part size.');
  const ex = dom.bodyBox.max[0] - dom.bodyBox.min[0];
  const L = cfg.Lref > 0 ? cfg.Lref : ex;
  const aCells = frontalCells(dom.solid, dom.nx, dom.ny, dom.nz);
  const A = cfg.Aref > 0 ? cfg.Aref * 1e-6 : aCells * dxm * dxm;
  const Re = (cfg.fl.rho * cfg.U * L * 1e-3) / cfg.fl.mu;
  let nuLb = (U_LB * (L / dom.dx)) / Re;
  const nuClamped = nuLb < 1e-5;
  nuLb = Math.max(nuLb, 1e-5);
  const turbulent = cfg.turb === 'les' || (cfg.turb === 'auto' && Re > 1500);
  const smag = turbulent ? 0.14 : 0;
  const steps = Math.ceil((q.ft * dom.nx) / U_LB);
  env.progress(0.05, `Flow domain ${dom.nx} × ${dom.ny} × ${dom.nz} = ${dom.cells.toLocaleString()} cells, Re = ${fmt(Re, 3)}`);
  const run = runLbm(dom, { uLb: U_LB, nuLb, smag, steps, ground: cfg.ground, monitor: (s) => s.force[0], minSteps: Math.floor((0.9 * dom.nx) / U_LB), tol: 0.02, ctrl: env.ctrl },
    (p, label) => env.progress(0.05 + 0.75 * p, label));
  if (!run.stable) throw new Error('The flow solution became unstable (velocities exceeded the lattice limit). Lower the Reynolds number, enlarge the reference length or choose a finer resolution.');
  const vScale = cfg.U / U_LB;
  const fScale = cfg.fl.rho * vScale * vScale * dxm * dxm;
  const Fn = { drag: run.force[0] * fScale, side: run.force[1] * fScale, lift: run.force[2] * fScale };
  const qdyn = 0.5 * cfg.fl.rho * cfg.U * cfg.U;
  const CdRaw = Fn.drag / (qdyn * A);
  const sigma = (aCells * dxm * dxm) / (dom.ny * dom.nz * dxm * dxm);
  const blockF = 1 / (1 + Math.max(0, CdRaw) * sigma);
  const pgF = mach > 0.3 ? 1 / Math.sqrt(1 - mach * mach) : 1;
  // inlet reference density for the pressure coefficient
  let rs = 0, rn = 0;
  for (let k = 0; k < dom.nz; k++) for (let j = 0; j < dom.ny; j++) for (let i = 0; i < 3; i++) { const c = i + dom.nx * (j + dom.ny * k); if (!dom.solid[c]) { rs += run.mean.rho[c]; rn++; } }
  return {
    cfg, dom, run, M, centre, names: bodies.map((b) => b.name), vScale, dxm, Re, mach, smag, nuLb, nuClamped, A, L, sigma, steps,
    Fn, CdRaw, Cd: CdRaw * blockF, Cl: (Fn.lift / (qdyn * A)) * blockF * pgF, Cy: (Fn.side / (qdyn * A)) * blockF, blockF, pgF, rhoRef: rn ? rs / rn : 1, q: qdyn,
  };
}

function pressurePa(w: WindCore, rho: number): number {
  return ((rho - w.rhoRef) / 3) * w.cfg.fl.rho * w.vScale * w.vScale;
}

function commonFlowFields(dom: FlowDomain, m: LbmRun['mean'], vScale: number, dxm: number, rhoFn: (rho: number) => number, cpScale: number | null) {
  const N = dom.cells, solid = dom.solid;
  const sp = new Float32Array(N), ux = new Float32Array(N), uy = new Float32Array(N), uz = new Float32Array(N), pr = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    if (solid[c]) continue;
    ux[c] = m.ux[c] * vScale; uy[c] = m.uy[c] * vScale; uz[c] = m.uz[c] * vScale;
    sp[c] = Math.hypot(ux[c], uy[c], uz[c]);
    pr[c] = rhoFn(m.rho[c]);
  }
  const v = vorticity(dom, m);
  const w = vScale / dxm, vort = new Float32Array(N), qq = new Float32Array(N);
  for (let c = 0; c < N; c++) { vort[c] = v.vort[c] * w; qq[c] = v.q[c] * w * w; }
  const fields: FieldDef[] = [
    fluidField('speed', 'Velocity magnitude', 'm/s', sp, solid),
    fluidField('vx', 'Velocity X (along the flow)', 'm/s', ux, solid, { diverging: true }),
    fluidField('vy', 'Velocity Y', 'm/s', uy, solid, { diverging: true }),
    fluidField('vz', 'Velocity Z', 'm/s', uz, solid, { diverging: true }),
    fluidField('pressure', 'Static pressure (gauge)', 'Pa', pr, solid, { diverging: true }),
  ];
  if (cpScale) {
    const cp = new Float32Array(N); for (let c = 0; c < N; c++) cp[c] = pr[c] * cpScale;
    fields.push(fluidField('cp', 'Pressure coefficient Cp', '', cp, solid, { diverging: true }));
  }
  fields.push(fluidField('vort', 'Vorticity magnitude', '1/s', vort, solid));
  fields.push(fluidField('qcrit', 'Q-criterion (vortex cores: Q > 0)', '1/s²', qq, solid, { diverging: true }));
  return { fields, strain: v.strain };
}

function toStreams(dom: FlowDomain, m: LbmRun['mean'], vScale: number, seeds: [number, number, number][]): Stream[] {
  return streamlines(dom, m, seeds).map((s) => ({ pts: Float32Array.from(s.pts), speed: Float32Array.from(s.speed, (v) => v * vScale) }));
}

function inletSeeds(y0: number, y1: number, z0: number, z1: number, ny: number, nz: number): [number, number, number][] {
  const seeds: [number, number, number][] = [];
  for (let a = 0; a < ny; a++) for (let b = 0; b < nz; b++) {
    const y = y0 + ((a + 0.5) / ny) * (y1 - y0), z = z0 + ((b + 0.5) / nz) * (z1 - z0);
    seeds.push([2.5, y, z]);
  }
  return seeds;
}

// ---------------------------------------------------------------------------------------------

export function runWindTunnel(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const cfg = windCfgFrom(input);
  const w = windCore(input, cfg, env);
  const { dom, run, dxm, vScale } = w;
  const spec = analysisSpec('windtunnel');
  const r = emptyResult('windtunnel', spec.label);
  setGrid(r, dom);
  r.mask = wallMask(dom, false);
  r.matIndex = dom.body; r.bodies = w.names;
  env.progress(0.82, 'Post-processing the flow field');
  const cpScale = 1 / (0.5 * cfg.fl.rho * cfg.U * cfg.U);
  const { fields, strain } = commonFlowFields(dom, run.mean, vScale, dxm, (rho) => pressurePa(w, rho), cpScale);
  r.fields = fields; r.defaultField = 'speed';
  // streamlines
  const bb = dom.bodyBox, y0 = (bb.min[1] - dom.oy) / dom.dx, y1 = (bb.max[1] - dom.oy) / dom.dx, z0 = Math.max(1.5, (bb.min[2] - dom.oz) / dom.dx), z1 = (bb.max[2] - dom.oz) / dom.dx;
  const padY = 0.15 * (y1 - y0) + 1, padZ = 0.15 * (z1 - z0) + 1;
  r.streams = toStreams(dom, run.mean, vScale, inletSeeds(Math.max(1.5, y0 - padY), Math.min(dom.ny - 1.5, y1 + padY), Math.max(1.5, z0 - padZ), Math.min(dom.nz - 1.5, z1 + padZ), 11, 8));
  // surface pressure hotspots
  const cp = fields.find((f) => f.id === 'cp')!.data, surf = surfaceCells(dom);
  let cmax = -Infinity, cmin = Infinity, imax = -1, imin = -1;
  for (const c of surf) { if (cp[c] > cmax) { cmax = cp[c]; imax = c; } if (cp[c] < cmin) { cmin = cp[c]; imin = c; } }
  const hot: Hotspot[] = [];
  if (imax >= 0) { const p = cellPos(dom, imax); hot.push({ x: p[0], y: p[1], z: p[2], value: cmax, label: 'Stagnation / peak pressure', fieldId: 'cp' }); }
  if (imin >= 0) { const p = cellPos(dom, imin); hot.push({ x: p[0], y: p[1], z: p[2], value: cmin, label: 'Suction peak', fieldId: 'cp' }); }
  r.hotspots = hot;
  // heat transfer
  let heat: { Q: number; h: number; Nu: number; Tmax: number; Awet: number } | null = null;
  if (cfg.Tbody !== 0) {
    env.progress(0.88, 'Solving the temperature field');
    heat = heatTransfer(w, strain, r, env);
  }
  // coefficients
  const qdyn = w.q;
  const fScale = cfg.fl.rho * vScale * vScale * dxm * dxm;
  const dtMs = (U_LB * dxm / cfg.U) * 1e3;
  const sx = run.forceHist.map((h) => h.step * dtMs);
  const Cdh = run.forceHist.map((h) => (h.f[0] * fScale) / (qdyn * w.A) * w.blockF);
  const Clh = run.forceHist.map((h) => (h.f[2] * fScale) / (qdyn * w.A) * w.blockF * w.pgF);
  r.curves.push({ id: 'coef', title: 'Force coefficients during the run', xlabel: 'Flow time (ms)', ylabel: 'Coefficient', series: [{ name: 'Cd', x: sx, y: Cdh }, { name: 'Cl', x: sx, y: Clh }], marks: [{ x: run.transient * dtMs, label: 'averaging starts' }] });
  // wake centreline
  const cy = (dom.bodyBox.min[1] + dom.bodyBox.max[1]) / 2, cz = (dom.bodyBox.min[2] + dom.bodyBox.max[2]) / 2;
  const jc = (cy - dom.oy) / dom.dx, kc = (cz - dom.oz) / dom.dx, wx: number[] = [], wy: number[] = [];
  for (let i = 1; i < dom.nx - 1; i += 2) { const v = trilinear(run.mean.ux, dom.nx, dom.ny, dom.nz, i + 0.5, jc, kc); wx.push(+(dom.ox + (i + 0.5) * dom.dx).toFixed(2)); wy.push(dom.solid[i + dom.nx * (Math.floor(jc) + dom.ny * Math.floor(kc))] ? 0 : v / U_LB); }
  const wake: Series = { name: 'u / U on the centreline', x: wx, y: wy };
  r.curves.push({ id: 'wake', title: 'Velocity along the stream-wise centre-line', xlabel: 'x (mm, flow frame)', ylabel: 'u / U', series: [wake] });
  // key values
  const regime = w.smag > 0 ? 'turbulent (Smagorinsky LES)' : 'laminar';
  r.kv.push({ label: 'Drag coefficient Cd', value: fmt(w.Cd, 4), status: 'info' });
  r.kv.push({ label: 'Lift coefficient Cl', value: fmt(w.Cl, 4), status: 'info' });
  r.kv.push({ label: 'Side-force coefficient Cy', value: fmt(w.Cy, 4) });
  r.kv.push({ label: 'Drag force', value: `${fmt(w.Fn.drag * w.blockF)} N` });
  r.kv.push({ label: 'Lift force', value: `${fmt(w.Fn.lift * w.blockF * w.pgF)} N` });
  r.kv.push({ label: 'Lift / drag', value: fmt(Math.abs(w.Cd) > 1e-9 ? w.Cl / w.Cd : 0, 3) });
  r.kv.push({ label: 'Reynolds number', value: `${fmt(w.Re, 3)} (${regime})` });
  r.kv.push({ label: 'Mach number', value: w.mach.toFixed(3), status: w.mach > 0.3 ? 'warn' : 'ok' });
  r.kv.push({ label: 'Reference area / length', value: `${fmt(w.A * 1e6)} mm² / ${fmt(w.L)} mm` });
  r.kv.push({ label: 'Dynamic pressure', value: `${fmt(qdyn)} Pa` });
  r.kv.push({ label: 'Peak Cp / minimum Cp on the surface', value: `${fmt(cmax)} / ${fmt(cmin)}` });
  if (heat) {
    r.kv.push({ label: 'Heat transfer rate', value: `${fmt(heat.Q)} W` });
    r.kv.push({ label: 'Mean film coefficient h', value: `${fmt(heat.h)} W/m²K` });
    r.kv.push({ label: 'Nusselt number (reference length)', value: fmt(heat.Nu, 3) });
  }
  r.kv.push({ label: 'Flow domain', value: `${dom.nx} × ${dom.ny} × ${dom.nz} cells, Δ = ${fmt(dom.dx)} mm` });
  r.checks.push({ name: 'Solver stable', value: 'yes', limit: 'stable', ok: true });
  r.checks.push({ name: 'Wind-tunnel blockage', value: `${(100 * w.sigma).toFixed(1)} %`, limit: '< 7.5 %', ok: w.sigma < 0.075, note: w.sigma >= 0.075 ? 'High blockage: coefficients are corrected (Maskell) but a larger domain would be more reliable.' : undefined });
  const cells = dom.cells, cellsAcross = w.L / dom.dx;
  const thin = Math.min(dom.bodyBox.max[0] - dom.bodyBox.min[0], dom.bodyBox.max[1] - dom.bodyBox.min[1], dom.bodyBox.max[2] - dom.bodyBox.min[2]) / dom.dx;
  r.checks.push({ name: 'Cells across the thinnest dimension of the part', value: `${thin.toFixed(1)} cells`, limit: '≥ 8 cells', ok: thin >= 8, note: thin < 8 ? 'The surface is a staircase of cells: thin wings and plates are not resolved, so lift and drag are unreliable (drag too high, lift too low).' : undefined });
  r.checks.push({ name: 'Resolution across the reference length', value: `${cellsAcross.toFixed(0)} cells`, limit: '≥ 20 cells', ok: cellsAcross >= 20, note: cellsAcross < 20 ? 'Under-resolved: use a finer resolution.' : undefined });
  r.checks.push({ name: 'Transient converged before averaging', value: run.converged ? `after ${run.transient} steps` : 'not detected', limit: 'converged', ok: run.converged, note: run.converged ? undefined : 'The drag was still drifting when the run ended; use a finer or longer run.' });
  r.checks.push({ name: 'Compressibility', value: `Mach ${w.mach.toFixed(2)}`, limit: '≤ 0.3 (≤ 0.8 corrected)', ok: w.mach <= 0.3, note: w.mach > 0.3 ? `Prandtl–Glauert factor ${w.pgF.toFixed(3)} applied to the lift coefficient; drag is not corrected for wave drag.` : undefined });
  r.tables.push({ id: 'coeff', title: 'Aerodynamic coefficients', cols: ['Quantity', 'Raw (solver)', 'Corrected', 'Correction'], rows: [
    ['Cd', fmt(w.CdRaw, 4), fmt(w.Cd, 4), `blockage ×${w.blockF.toFixed(3)}`],
    ['Cl', fmt(w.Fn.lift / (qdyn * w.A), 4), fmt(w.Cl, 4), `blockage ×${w.blockF.toFixed(3)}${w.pgF > 1 ? `, compressibility ×${w.pgF.toFixed(3)}` : ''}`],
    ['Cy', fmt(w.Fn.side / (qdyn * w.A), 4), fmt(w.Cy, 4), `blockage ×${w.blockF.toFixed(3)}`],
  ] });
  r.verdict = { pass: null, text: `Cd = ${fmt(w.Cd, 3)}, Cl = ${fmt(w.Cl, 3)} at ${cfg.U} m/s, α = ${cfg.aoa}°, Re = ${fmt(w.Re, 3)}.` };
  r.notes.push('Results are drawn in the wind-aligned frame: the wind blows along +X and the lift direction is +Z (the part is rotated by the angle of attack and yaw).');
  if (w.nuClamped) r.notes.push('The Reynolds number is higher than the lattice can represent at this resolution; the sub-grid model carries the dissipation and the near-wall flow is under-resolved.');
  r.notes.push('Benchmark (sphere, standard resolution): drag over-predicted by about 18 % at Re = 200 and about 30 – 40 % at Re = 10⁵ against published values. Thin or streamlined bodies are the least reliable (their surface is a staircase of cells: a wing section needs about 8 or more cells across its thickness); use the result for comparison between designs.');
  r.mesh = { type: 'Lattice-Boltzmann D3Q19 voxel grid', elements: cells, nodes: cells, dof: cells * 19, h: dom.dx, bodyVolume: 0, minDim: 0, quality: `${cellsAcross.toFixed(0)} cells across the reference length`, time: Date.now() - t0, extra: `${dom.nx} × ${dom.ny} × ${dom.nz}` };
  r.solver = { name: 'Lattice-Boltzmann D3Q19 BGK + Smagorinsky', iterations: run.steps, time: run.ms, log: [...run.log, `Re = ${fmt(w.Re, 4)}, lattice viscosity ${w.nuLb.toExponential(2)}, Smagorinsky C = ${w.smag}`] };
  r.assumptions.push(...spec.limits);
  r.inputs.push({ label: 'Bodies', value: w.names.join(', ') });
  r.inputs.push({ label: 'Flow', value: `${cfg.fl.name}, U = ${cfg.U} m/s, α = ${cfg.aoa}°, β = ${cfg.beta}°` });
  if (cfg.ground !== 'off') r.inputs.push({ label: 'Ground', value: cfg.ground === 'wall' ? 'no-slip' : 'slip' });
  return r;
}

// ---------------------------------------------------------------------------------------------
// Heat transfer from a body at uniform temperature

function heatTransfer(w: WindCore, strain: Float32Array, r: Result, env: Env) {
  const { dom, cfg } = w, N = dom.cells, fl = cfg.fl;
  const dtOverDx2 = 1 / (w.vScale * w.dxm);                     // dt/dx² : converts m²/s to lattice units
  const aMol = (fl.k / (fl.rho * fl.cp)) * dtOverDx2;
  const alpha = new Float32Array(N), fixed = new Uint8Array(N), value = new Float32Array(N), src = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    alpha[c] = dom.solid[c] ? aMol : aMol + (w.smag * w.smag * strain[c]) / 0.85;
    if (dom.solid[c]) { fixed[c] = 1; value[c] = cfg.Tbody; }
  }
  const sol = solveHeat({ dom, u: w.run.mean, alpha, src, fixed, value, Tin: cfg.Tinf }, 800, 1e-6, (it, res) => env.progress(0.88 + 0.08 * Math.min(1, it / 800), `Temperature solver: iteration ${it}, residual ${res.toExponential(1)}`));
  const { nx, ny, nz } = dom, T = sol.T;
  let sum = 0, faces = 0, tmax = -Infinity;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = i + nx * (j + ny * k);
    if (dom.solid[c]) continue;
    if (T[c] > tmax) tmax = T[c];
    const nb = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1, k > 0 ? c - nx * ny : -1, k < nz - 1 ? c + nx * ny : -1];
    for (const n of nb) if (n >= 0 && dom.solid[n]) { sum += alpha[c] * (cfg.Tbody - T[c]); faces++; }
  }
  const Q = fl.rho * fl.cp * w.dxm * w.dxm * w.vScale * sum;
  const Awet = faces * w.dxm * w.dxm;
  const h = Awet > 0 && cfg.Tbody !== cfg.Tinf ? Q / (Awet * (cfg.Tbody - cfg.Tinf)) : 0;
  const Nu = (h * w.L * 1e-3) / fl.k;
  const tf = new Float32Array(T);
  r.fields.push(fluidField('temp', 'Fluid temperature', '°C', tf, dom.solid));
  r.tables.push({ id: 'heat', title: 'Heat transfer', cols: ['Quantity', 'Value'], rows: [['Body surface temperature', `${cfg.Tbody} °C`], ['Free-stream temperature', `${cfg.Tinf} °C`], ['Wetted area (voxel faces)', `${fmt(Awet * 1e6)} mm²`], ['Heat flow', `${fmt(Q)} W`], ['Mean film coefficient', `${fmt(h)} W/m²K`], ['Nusselt number', fmt(Nu, 3)], ['Prandtl number', fmt(prandtl(fl), 3)]] });
  r.notes.push(`Heat transfer: first-order upwind advection–diffusion on the converged mean flow (${sol.iterations} iterations, residual ${sol.residual.toExponential(1)}). The thermal boundary layer is not resolved: h is indicative (voxel wetted area is up to 1.5 × the true area).`);
  return { Q, h, Nu, Tmax: tmax, Awet };
}

// ---------------------------------------------------------------------------------------------
// Internal flow

const PERM: Record<string, [number, number, number]> = { x: [0, 1, 2], y: [1, 2, 0], z: [2, 0, 1] };
function permTris(t: Float32Array, p: [number, number, number]): Float32Array {
  const o = new Float32Array(t.length);
  for (let i = 0; i < t.length; i += 3) { o[i] = t[i + p[0]]; o[i + 1] = t[i + p[1]]; o[i + 2] = t[i + p[2]]; }
  return o;
}

export function runInternal(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const spec = analysisSpec('internal');
  const fl = fluidOf(input);
  const axis = strP(input, 'axis', 'x'), perm = PERM[axis] ?? PERM.x;
  const Uin = numP(input, 'U', 2), heat = boolP(input, 'heat'), Tin = numP(input, 'Tin', 20);
  const fluidBodies = input.bodies.filter((b) => b.role === 'fluid'), solidBodies = input.bodies.filter((b) => b.role === 'solid');
  if (!fluidBodies.length) throw new Error('Mark the flow passage as a "Fluid" body (Bodies panel → role). The internal-flow solver treats the volume of that body as the space the fluid fills.');
  const fb = fluidBodies.map((b) => ({ tris: permTris(b.tris, perm), name: b.name })), sb = solidBodies.map((b) => ({ tris: permTris(b.tris, perm), name: b.name, b }));
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const upd = (t: Float32Array) => { for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { const v = t[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; } };
  fb.forEach((b) => upd(b.tris)); sb.forEach((b) => upd(b.tris));
  const fmn = [Infinity, Infinity, Infinity], fmx = [-Infinity, -Infinity, -Infinity];
  for (const b of fb) for (let i = 0; i < b.tris.length; i += 3) for (let k = 0; k < 3; k++) { const v = b.tris[i + k]; if (v < fmn[k]) fmn[k] = v; if (v > fmx[k]) fmx[k] = v; }
  // the box ends at the passage ends along the flow axis
  const lo = [fmn[0], mn[1], mn[2]], hi = [fmx[0], mx[1], mx[2]];
  const q = QUALITY[strP(input, 'quality', 'standard')] ?? QUALITY.standard;
  const vol = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
  let dx = Math.cbrt(vol / q.cells);
  const Lx = hi[0] - lo[0];
  let nx = Math.max(12, Math.round(Lx / dx));
  dx = Lx / nx;
  const ny = Math.max(8, Math.ceil((hi[1] - lo[1]) / dx - 1e-6)), nz = Math.max(8, Math.ceil((hi[2] - lo[2]) / dx - 1e-6));
  if (nx * ny * nz > q.cells * 2.2) {
    const f = Math.cbrt((nx * ny * nz) / (q.cells * 1.5));
    dx *= f; nx = Math.max(12, Math.round(Lx / dx)); dx = Lx / nx;
  }
  const NY = Math.max(8, Math.ceil((hi[1] - lo[1]) / dx - 1e-6)), NZ = Math.max(8, Math.ceil((hi[2] - lo[2]) / dx - 1e-6));
  const N = nx * NY * NZ, warnings: string[] = [];
  env.progress(0.02, 'Voxelising the passage');
  const fluidMask = new Uint8Array(N), bodyIdx = new Uint8Array(N);
  for (const b of fb) fillBody({ mesh: meshFrom(b.tris), mat: 0, name: b.name }, dx, lo, nx, NY, NZ, fluidMask, warnings);
  sb.forEach((b, bi) => {
    const tmp = new Uint8Array(N);
    fillBody({ mesh: meshFrom(b.tris), mat: 0, name: b.name }, dx, lo, nx, NY, NZ, tmp, warnings);
    for (let i = 0; i < N; i++) if (tmp[i] && !fluidMask[i]) bodyIdx[i] = bi + 1;
  });
  const solid = new Uint8Array(N);
  let nFluid = 0;
  for (let i = 0; i < N; i++) { if (fluidMask[i]) nFluid++; else solid[i] = 1; }
  const dom: FlowDomain = { nx, ny: NY, nz: NZ, dx, ox: lo[0], oy: lo[1], oz: lo[2], solid, body: bodyIdx, bodyBox: { min: [fmn[0], fmn[1], fmn[2]], max: [fmx[0], fmx[1], fmx[2]] }, cells: N };
  if (nFluid < 200) throw new Error('The flow passage is too small for the resolution (fewer than 200 fluid cells). Choose a finer resolution or check that the Fluid body is a closed solid.');
  // inlet / outlet planes
  const plane = (i: number) => { const list: number[] = []; for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const c = i + nx * (j + NY * k); if (!solid[c]) list.push(c); } return list; };
  const pin = plane(0), pout = plane(nx - 1);
  if (!pin.length || !pout.length) throw new Error('The passage must be open at both ends of the flow axis (inlet at the minimum, outlet at the maximum along the chosen axis).');
  const dxm = dx * 1e-3;
  const Ain = pin.length * dxm * dxm;
  let perim = 0;
  for (const c of pin) { const j = Math.floor(c / nx) % NY, k = Math.floor(c / (nx * NY)); const t = (jj: number, kk: number) => jj < 0 || kk < 0 || jj >= NY || kk >= NZ || solid[nx * (jj + NY * kk)]; for (const [a, b] of [[j - 1, k], [j + 1, k], [j, k - 1], [j, k + 1]]) if (t(a, b)) perim += dxm; }
  const Dh = perim > 0 ? (4 * Ain) / perim : Math.sqrt((4 * Ain) / Math.PI);
  const Re = (fl.rho * Uin * Dh) / fl.mu;
  const turb = strP(input, 'turb', 'auto');
  const smag = turb === 'les' || (turb === 'auto' && Re > 2300) ? 0.14 : 0;
  let nuLb = (U_LB * (Dh / dxm)) / Re;
  const nuClamped = nuLb < 1e-5; nuLb = Math.max(1e-5, Math.min(nuLb, 0.3));
  const viscCapped = (U_LB * (Dh / dxm)) / Re > 0.3;
  const steps = Math.ceil((q.ft * nx) / U_LB * 1.3);
  env.progress(0.05, `Flow domain ${nx} × ${NY} × ${NZ} = ${N.toLocaleString()} cells, Re(Dh) = ${fmt(Re, 3)}`);
  const planeMean = (i: number, rho: Float32Array) => { let s = 0, n = 0; for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const c = i + nx * (j + NY * k); if (!solid[c]) { s += rho[c]; n++; } } return n ? s / n : 1; };
  const run = runLbm(dom, { uLb: U_LB, nuLb, smag, steps, ground: 'off', wallAll: true, monitor: (s) => planeMean(2, s.rho) - planeMean(nx - 3, s.rho), minSteps: Math.floor((1.5 * nx) / U_LB), tol: 0.015, ctrl: env.ctrl },
    (p, label) => env.progress(0.05 + 0.7 * p, label));
  if (!run.stable) throw new Error('The flow solution became unstable. Lower the Reynolds number (velocity), use a finer resolution or a more viscous fluid.');
  const vScale = Uin / U_LB, rhoF = fl.rho;
  const pScale = rhoF * vScale * vScale / 3;
  const rhoOut = planeMean(nx - 3, run.mean.rho), rhoIn = planeMean(2, run.mean.rho);
  const dPs = (rhoIn - rhoOut) * pScale;
  // total pressure (mass-flux weighted)
  const total = (i: number) => { let s = 0, w = 0; for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const c = i + nx * (j + NY * k); if (solid[c]) continue; const u = run.mean.ux[c], sp2 = u * u + run.mean.uy[c] ** 2 + run.mean.uz[c] ** 2; const p = (run.mean.rho[c] - rhoOut) * pScale, pt = p + 0.5 * rhoF * sp2 * vScale * vScale; if (u > 0) { s += pt * u; w += u; } } return w ? s / w : 0; };
  const dPt = total(2) - total(nx - 3);
  const q0 = 0.5 * rhoF * Uin * Uin, Lm = nx * dxm;
  const K = dPt / q0, fD = (dPs * Dh) / (Lm * q0);
  const mdot = rhoF * Uin * Ain;
  env.progress(0.78, 'Post-processing the flow field');
  const r = emptyResult('internal', spec.label);
  setGrid(r, dom);
  r.mask = wallMask(dom, true); r.matIndex = bodyIdx; r.bodies = sb.map((b) => b.name);
  const { fields, strain } = commonFlowFields(dom, run.mean, vScale, dxm, (rho) => (rho - rhoOut) * pScale, null);
  r.fields = fields; r.defaultField = 'speed';
  const seeds: [number, number, number][] = [];
  const stride = Math.max(1, Math.floor(pin.length / 90));
  for (let q2 = 0; q2 < pin.length; q2 += stride) { const c = pin[q2]; seeds.push([2.5, Math.floor(c / nx) % NY + 0.5, Math.floor(c / (nx * NY)) + 0.5]); }
  r.streams = toStreams(dom, run.mean, vScale, seeds);
  // axial profile
  const xs: number[] = [], pmean: number[] = [], pt: number[] = [];
  for (let i = 1; i < nx - 1; i += Math.max(1, Math.floor(nx / 60))) { xs.push(+(lo[0] + (i + 0.5) * dx).toFixed(2)); pmean.push((planeMean(i, run.mean.rho) - rhoOut) * pScale); pt.push(total(i)); }
  r.curves.push({ id: 'pdrop', title: 'Pressure along the flow axis (relative to the outlet)', xlabel: 'Position along the flow (mm)', ylabel: 'Pressure (Pa)', series: [{ name: 'Static', x: xs, y: pmean }, { name: 'Total', x: xs, y: pt }] });
  r.curves.push({ id: 'dphist', title: 'Convergence of the pressure drop', xlabel: 'Lattice step', ylabel: 'Δρ (lattice)', series: [{ name: 'Inlet − outlet', x: run.monitorHist.map((h) => h.step), y: run.monitorHist.map((h) => h.v) }], marks: [{ x: run.transient, label: 'averaging starts' }] });
  r.kv.push({ label: 'Static pressure drop', value: `${fmt(dPs)} Pa`, status: 'info' });
  r.kv.push({ label: 'Total pressure loss', value: `${fmt(dPt)} Pa`, status: 'info' });
  r.kv.push({ label: 'Loss coefficient K (total)', value: fmt(K, 3) });
  r.kv.push({ label: 'Darcy friction factor (static)', value: fmt(fD, 3) });
  r.kv.push({ label: 'Reynolds number (hydraulic diameter)', value: `${fmt(Re, 3)} (${smag > 0 ? 'turbulent LES' : 'laminar'})` });
  r.kv.push({ label: 'Hydraulic diameter', value: `${fmt(Dh * 1e3)} mm` });
  r.kv.push({ label: 'Inlet area', value: `${fmt(Ain * 1e6)} mm²` });
  r.kv.push({ label: 'Mass flow', value: `${fmt(mdot)} kg/s` });
  r.kv.push({ label: 'Volume flow', value: `${fmt(Uin * Ain * 1e3 * 60)} L/min` });
  r.kv.push({ label: 'Hydraulic power (ΔP·Q)', value: `${fmt(dPt * Uin * Ain)} W` });
  let maxSp = 0; for (let c = 0; c < N; c++) if (!solid[c]) maxSp = Math.max(maxSp, fields[0].data[c]);
  r.kv.push({ label: 'Maximum velocity', value: `${fmt(maxSp)} m/s` });
  // mass conservation
  const flux = (i: number) => { let s = 0; for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const c = i + nx * (j + NY * k); if (!solid[c]) s += run.mean.ux[c]; } return s; };
  const fin = flux(2), fout = flux(nx - 3), cons = fin > 0 ? Math.abs(fout - fin) / fin : 1;
  r.checks.push({ name: 'Mass conservation (inlet vs outlet)', value: `${(100 * cons).toFixed(1)} %`, limit: '< 3 %', ok: cons < 0.03 });
  r.checks.push({ name: 'Pressure drop converged', value: run.converged ? `after ${run.transient} steps` : 'not detected', limit: 'converged', ok: run.converged, note: run.converged ? undefined : 'The pressure drop was still drifting at the end of the run. Low-Reynolds, long passages need more steps: use a finer or longer run, or a shorter section.' });
  const across = Dh / dxm;
  r.checks.push({ name: 'Resolution across the passage', value: `${across.toFixed(1)} cells`, limit: '≥ 10 cells', ok: across >= 10, note: across < 10 ? 'The passage is under-resolved; pressure loss is unreliable.' : undefined });
  // reference estimate for a straight smooth pipe
  const fRef = Re < 2300 ? 64 / Re : Math.pow(-1.8 * Math.log10(6.9 / Re), -2);
  r.tables.push({ id: 'ref', title: 'Comparison with a smooth straight circular pipe of the same hydraulic diameter', cols: ['Quantity', 'Solver', 'Reference'], rows: [['Darcy friction factor', fmt(fD, 3), fmt(fRef, 3)], ['Static pressure drop (Pa)', fmt(dPs), fmt(fRef * (Lm / Dh) * q0)]] });
  if (viscCapped) r.notes.push('The Reynolds number is so low that the lattice viscosity was capped; the flow is effectively at a higher Re than requested.');
  if (nuClamped) r.notes.push('The Reynolds number is higher than the lattice can represent at this resolution; the sub-grid model carries the dissipation.');
  r.notes.push('The flow axis is drawn along +X (the model is permuted cyclically when the axis is Y or Z). The inlet velocity is uniform over the open inlet area.');
  // conjugate heat transfer
  if (heat) conjugate(input, env, { dom, run, fl, vScale, dxm, smag, strain, Tin, Uin, Ain, mdot, sb, r, perm });
  r.verdict = { pass: null, text: `Static pressure drop ${fmt(dPs)} Pa, total pressure loss ${fmt(dPt)} Pa (K = ${fmt(K, 3)}) at ${Uin} m/s.` };
  r.mesh = { type: 'Lattice-Boltzmann D3Q19 voxel grid', elements: N, nodes: N, dof: N * 19, h: dx, bodyVolume: nFluid * dx ** 3, minDim: Dh * 1e3, quality: `${across.toFixed(1)} cells across the hydraulic diameter`, time: Date.now() - t0, extra: `${nx} × ${NY} × ${NZ}` };
  r.solver = { name: 'Lattice-Boltzmann D3Q19 BGK + Smagorinsky', iterations: run.steps, time: run.ms, log: [...run.log, `Re(Dh) = ${fmt(Re, 4)}, lattice viscosity ${nuLb.toExponential(2)}`] };
  r.assumptions.push(...spec.limits);
  for (const w of warnings) r.notes.push(w);
  r.inputs.push({ label: 'Flow passage', value: fluidBodies.map((b) => b.name).join(', ') });
  r.inputs.push({ label: 'Fluid / inlet', value: `${fl.name}, mean inlet velocity ${Uin} m/s along ${axis.toUpperCase()}` });
  return r;
}

interface Cj { dom: FlowDomain; run: LbmRun; fl: Fluid; vScale: number; dxm: number; smag: number; strain: Float32Array; Tin: number; Uin: number; Ain: number; mdot: number; sb: { name: string; b: import('./model').CaeBody }[]; r: Result; perm: [number, number, number] }

function conjugate(input: CaseInput, env: Env, c: Cj) {
  const { dom, fl, r } = c, N = dom.cells;
  env.progress(0.82, 'Conjugate heat transfer');
  const dtOverDx2 = 1 / (c.vScale * c.dxm), conv = dtOverDx2 / (fl.rho * fl.cp);
  const aMol = (fl.k / (fl.rho * fl.cp)) * dtOverDx2;
  const alpha = new Float32Array(N), src = new Float32Array(N), fixed = new Uint8Array(N), value = new Float32Array(N);
  const cnt = new Float64Array(c.sb.length + 1);
  for (let i = 0; i < N; i++) if (dom.body[i]) cnt[dom.body[i]]++;
  const dtPhys = c.dxm / c.vScale;                              // physical time of one lattice step (s)
  for (let i = 0; i < N; i++) {
    if (!dom.solid[i]) { alpha[i] = aMol + (c.smag * c.smag * c.strain[i]) / 0.85; continue; }
    const bi = dom.body[i];
    if (bi) {
      const m = c.sb[bi - 1].b.mat;
      const ks = Array.isArray(m.k) ? (m.k[0] + m.k[1] + m.k[2]) / 3 : m.k;
      alpha[i] = ks * conv;
      const P = c.sb[bi - 1].b.power;
      if (P > 0) src[i] = (P / (cnt[bi] * c.dxm ** 3 * fl.rho * fl.cp)) * dtPhys;
    } else alpha[i] = 1e-9;
  }
  // fixed temperature on solid bodies (temperature loads addressed to the body)
  for (const l of input.loads) {
    if (!l.on || l.type !== 'temperature') continue;
    const bi = c.sb.findIndex((s) => s.b.id === l.region || 'body:' + s.b.id === l.region);
    if (bi < 0) continue;
    for (let i = 0; i < N; i++) if (dom.body[i] === bi + 1) { fixed[i] = 1; value[i] = l.p.t ?? 100; }
  }
  const sol = solveHeat({ dom, u: c.run.mean, alpha, src, fixed, value, Tin: c.Tin }, 1500, 1e-6, (it, res) => env.progress(0.82 + 0.14 * Math.min(1, it / 1500), `Temperature solver: iteration ${it}, residual ${res.toExponential(1)}`));
  const T = sol.T, { nx, ny, nz } = dom;
  // temperature is shown in the fluid and in the heated solids: mask is applied through the 'fluid' domain, so also store the solid temperature per cell
  let tmaxS = -Infinity, tmaxSi = -1;
  const perBody = c.sb.map(() => ({ tmax: -Infinity, tmean: 0, n: 0 }));
  for (let i = 0; i < N; i++) {
    const bi = dom.body[i]; if (!bi) continue;
    if (T[i] > perBody[bi - 1].tmax) perBody[bi - 1].tmax = T[i];
    perBody[bi - 1].tmean += T[i]; perBody[bi - 1].n++;
    if (T[i] > tmaxS) { tmaxS = T[i]; tmaxSi = i; }
  }
  // fluid-only field plus a combined one for the sections
  const solidT = new Float32Array(T);
  r.fields.push(fluidFieldAll('temp', 'Temperature (fluid and solid bodies)', '°C', solidT, dom));
  // outlet bulk temperature
  let sm = 0, sw = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const cc = (nx - 3) + nx * (j + ny * k); if (dom.solid[cc]) continue; const u = c.run.mean.ux[cc]; if (u > 0) { sm += T[cc] * u; sw += u; } }
  const Tout = sw ? sm / sw : c.Tin;
  const Pt = c.sb.reduce((a, s, i) => a + (cnt[i + 1] > 0 ? s.b.power : 0), 0);
  const dTexp = Pt / (c.mdot * fl.cp), dTsim = Tout - c.Tin;
  r.kv.push({ label: 'Outlet bulk temperature rise', value: `${fmt(dTsim)} K (energy balance: ${fmt(dTexp)} K)`, status: Pt > 0 && Math.abs(dTsim - dTexp) / Math.max(dTexp, 1e-9) < 0.15 ? 'ok' : 'warn' });
  if (tmaxSi >= 0) {
    r.kv.push({ label: 'Hottest solid temperature', value: `${fmt(tmaxS)} °C`, status: 'info' });
    const p = cellPos(dom, tmaxSi);
    r.hotspots.push({ x: p[0], y: p[1], z: p[2], value: tmaxS, label: 'Hottest point', fieldId: 'temp' });
  }
  const rows = c.sb.map((s, i) => [s.name, fmt(s.b.power), perBody[i].n ? fmt(perBody[i].tmax) : '-', perBody[i].n ? fmt(perBody[i].tmean / perBody[i].n) : '-', s.b.rjc > 0 && perBody[i].n ? fmt(perBody[i].tmax + s.b.power * s.b.rjc) : '-']);
  r.tables.push({ id: 'cht', title: 'Conjugate heat transfer: solid bodies', cols: ['Body', 'Power (W)', 'Peak T (°C)', 'Mean T (°C)', 'Junction T (°C)'], rows });
  r.checks.push({ name: 'Energy balance (heat in = fluid enthalpy rise)', value: Pt > 0 ? `${(100 * Math.abs(dTsim - dTexp) / Math.max(dTexp, 1e-9)).toFixed(1)} % difference` : 'no heat input', limit: '< 15 %', ok: Pt <= 0 || Math.abs(dTsim - dTexp) / Math.max(dTexp, 1e-9) < 0.15 });
  if (Pt <= 0 && !input.loads.some((l) => l.on && l.type === 'temperature')) r.notes.push('No heat dissipation (W) or temperature load is defined on any solid body, so the temperature field is uniform.');
  r.notes.push(`Conjugate heat transfer: steady advection–diffusion on the converged mean flow (${sol.iterations} iterations, residual ${sol.residual.toExponential(1)}); outer walls are adiabatic.`);
}

function fluidFieldAll(id: string, label: string, unit: string, data: Float32Array, dom: FlowDomain): FieldDef {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < data.length; i++) { if (dom.solid[i] && !dom.body[i]) { data[i] = NaN; continue; } const v = data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!Number.isFinite(mn)) { mn = 0; mx = 0; }
  return { id, label, unit, loc: 'cell', data, min: mn, max: mx, domain: 'fluid' };
}

// ---------------------------------------------------------------------------------------------
// One-way fluid-structure interaction

export function runFsi(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const spec = analysisSpec('fsi');
  const cfg: WindCfg = {
    U: numP(input, 'U', 40), aoa: numP(input, 'aoa', 0), beta: numP(input, 'beta', 0), fl: { name: 'Fluid', rho: numP(input, 'rho', 1.204), mu: numP(input, 'mu', 1.81e-5), a: 343, k: 0.0257, cp: 1005 },
    turb: 'auto', ground: 'off', quality: strP(input, 'quality', 'fast'), Lref: 0, Aref: 0, Tbody: 0, Tinf: 20,
  };
  const sub: Env = { progress: (p, l) => env.progress(0.55 * p, `Flow: ${l}`), ctrl: env.ctrl };
  const w = windCore(input, cfg, sub);
  env.progress(0.58, 'Mapping the surface pressure onto the structure');
  const { dom } = w;
  const stat: { pmin: number; pmax: number; fx: number; fy: number; fz: number; faces: number; area: number } = { pmin: Infinity, pmax: -Infinity, fx: 0, fy: 0, fz: 0, faces: 0, area: 0 };
  let appliedNote = '';
  const extra = (P: import('./prepare').Prep, sl: import('./loads').StructLoads) => {
    const g = P.g, faces = P.allFaces();
    const pOf = (c: V3, f: import('./voxel').SurfFace): number => {
      const n = FACE_NORMAL[f.dir];
      const rc = applyM(w.M, [c[0] - w.centre[0], c[1] - w.centre[1], c[2] - w.centre[2]]);
      const rn = applyM(w.M, n);
      for (const off of [1.25, 2.2]) {
        const x = (rc[0] + rn[0] * off * dom.dx - dom.ox) / dom.dx, y = (rc[1] + rn[1] * off * dom.dx - dom.oy) / dom.dx, z = (rc[2] + rn[2] * off * dom.dx - dom.oz) / dom.dx;
        const ci = Math.floor(x), cj = Math.floor(y), ck = Math.floor(z);
        if (ci < 0 || cj < 0 || ck < 0 || ci >= dom.nx || cj >= dom.ny || ck >= dom.nz) continue;
        if (dom.solid[ci + dom.nx * (cj + dom.ny * ck)]) continue;
        const rho = trilinear(w.run.mean.rho, dom.nx, dom.ny, dom.nz, x, y, z);
        const p = pressurePa(w, rho) * 1e-6;                 // Pa → MPa
        stat.faces++; stat.area += g.h * g.h;
        if (p < stat.pmin) stat.pmin = p; if (p > stat.pmax) stat.pmax = p;
        const a = g.h * g.h;
        stat.fx -= p * a * n[0]; stat.fy -= p * a * n[1]; stat.fz -= p * a * n[2];
        return p;
      }
      return 0;
    };
    const before = Float64Array.from(sl.bc.force);
    pressureOnFacesFromField(P, sl.bc.force, faces, pOf);
    void before;
    sl.force[0] += stat.fx; sl.force[1] += stat.fy; sl.force[2] += stat.fz;
    appliedNote = `Aerodynamic pressure on ${stat.faces.toLocaleString()} surface faces (${fmt(stat.pmin * 1e6)} to ${fmt(stat.pmax * 1e6)} Pa), net force (${fmt(stat.fx)}, ${fmt(stat.fy)}, ${fmt(stat.fz)}) N in body axes`;
    sl.info.push({ label: 'Aerodynamic pressure (from CFD)', text: appliedNote });
  };
  const sub2: Env = { progress: (p, l) => env.progress(0.6 + 0.4 * p, l), ctrl: env.ctrl };
  const c = solveStaticCore(input, sub2, undefined, '', extra);
  const { P, post, sl } = c;
  const r = baseResult(P, 'fsi', strP(input, 'elem') === 'tet' ? 'Tetrahedral (split voxel)' : 'Hexahedral 8-node, incompatible modes', Date.now() - c.ms);
  addMeshAndSolver(r, c, 'Lattice-Boltzmann flow + multigrid PCG structure');
  r.fields = post.fields; r.defaultField = 'vm';
  r.disp = Float32Array.from(c.u); r.dispScale = dispScaleFor(P, post.maxDisp);
  r.hotspots = post.hotspots;
  const target = numP(input, 'fosTarget', 1.5);
  const qdyn = w.q;
  r.kv.push({ label: 'Drag / lift coefficient (CFD)', value: `Cd ${fmt(w.Cd, 3)} / Cl ${fmt(w.Cl, 3)}`, status: 'info' });
  r.kv.push({ label: 'Aerodynamic force on the structure', value: `drag ${fmt(w.Fn.drag * w.blockF)} N, lift ${fmt(w.Fn.lift * w.blockF * w.pgF)} N` });
  r.kv.push({ label: 'Dynamic pressure', value: `${fmt(qdyn)} Pa` });
  r.kv.push({ label: 'Surface pressure range', value: `${fmt(stat.pmin * 1e6)} … ${fmt(stat.pmax * 1e6)} Pa` });
  r.kv.push({ label: 'Maximum displacement', value: `${fmt(post.maxDisp)} mm`, status: 'info' });
  r.kv.push({ label: 'Maximum von Mises stress', value: `${fmt(post.maxVm)} MPa`, status: 'info' });
  r.kv.push({ label: 'Minimum factor of safety', value: fmt(post.minFos, 3), status: post.minFos >= target ? 'ok' : post.minFos >= 1 ? 'warn' : 'fail' });
  const rs = c.react.sum, ap = sl.force, eq = Math.hypot(rs[0] + ap[0], rs[1] + ap[1], rs[2] + ap[2]), sc = Math.max(Math.hypot(...ap), Math.hypot(...rs), 1e-9);
  r.checks.push({ name: 'Factor of safety', value: fmt(post.minFos, 3), limit: `≥ ${target}`, ok: post.minFos >= target });
  r.checks.push({ name: 'Force equilibrium (reactions vs. applied)', value: `${(100 * eq / sc).toFixed(3)} %`, limit: '< 0.5 %', ok: eq / sc < 0.005 });
  const bb = bodiesBox(input.bodies.filter((b) => b.role !== 'carve'));
  const L = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  const rel = post.maxDisp / L;
  r.checks.push({ name: 'Small-deflection validity (deflection / size)', value: `${(100 * rel).toFixed(2)} %`, limit: '< 5 %', ok: rel < 0.05, note: rel >= 0.05 ? 'The deflection is large enough that the flow would change; the one-way coupling is not reliable.' : undefined });
  r.tables.push(bodyTable(P, c));
  r.inputs.push({ label: 'Wind', value: `${cfg.U} m/s, α ${cfg.aoa}°, β ${cfg.beta}°, ρ ${cfg.fl.rho} kg/m³` });
  describeInputs(r, P, sl);
  r.notes.push(`CFD: ${dom.nx} × ${dom.ny} × ${dom.nz} cells, Re = ${fmt(w.Re, 3)}; coefficients are blockage-corrected, surface pressure is not.`);
  for (const wv of sl.warnings) r.notes.push(wv);
  r.assumptions = r.assumptions.filter(Boolean);
  r.verdict = { pass: post.minFos >= target, text: post.minFos >= target ? `PASS: minimum factor of safety ${fmt(post.minFos, 3)} under the aerodynamic load (required ${target}).` : `FAIL: minimum factor of safety ${fmt(post.minFos, 3)} under the aerodynamic load (required ${target}).` };
  r.solver.time = Date.now() - t0;
  void spec; void faceCenter;
  return r;
}
