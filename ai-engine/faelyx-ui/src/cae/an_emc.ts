// Full-wave electromagnetics by FDTD (Yee scheme) on the voxel grid: shielding effectiveness and cavity resonances.
// Fields are normalised (c = 1, H scaled by the free-space impedance); the metal is a perfect conductor.

import { numP, strP } from './an_static';
import { baseResult, fmt, type Env } from './base';
import { makeField, type CaseInput, type Result } from './model';
import { prepare } from './prepare';
import { nNodes } from './voxel';
import { amax, amin } from './util';

const C0 = 299792458;       // m/s

interface Sim {
  nx: number; ny: number; nz: number; h: number; S: number;       // S = c dt / h (Courant number)
  dt: number;
  pec: Uint8Array; eps: Float32Array;
}

function runFdtd(sim: Sim, steps: number, src: { i: number; j: number; k: number; dir: number; wave: (t: number) => number }, probe: { i: number; j: number; k: number }, freqs: Float64Array, o: { dftF?: number; progress?: (p: number) => void; sponge: number }) {
  const { nx, ny, nz, S, dt } = sim, n = nx * ny * nz, sx = 1, sy = nx, sz = nx * ny;
  const Ex = new Float32Array(n), Ey = new Float32Array(n), Ez = new Float32Array(n), Hx = new Float32Array(n), Hy = new Float32Array(n), Hz = new Float32Array(n);
  const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
  const { pec, eps } = sim;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const id = i + sy * j + sz * k;
    const ci = (a: number, b: number, c: number) => { const ii = Math.max(0, i - a), jj = Math.max(0, j - b), kk = Math.max(0, k - c); return ii + sy * jj + sz * kk; };
    // Ex edge touches cells (i,j,k) (i,j-1,k) (i,j,k-1) (i,j-1,k-1)
    const ex = [id, ci(0, 1, 0), ci(0, 0, 1), ci(0, 1, 1)], ey = [id, ci(1, 0, 0), ci(0, 0, 1), ci(1, 0, 1)], ez = [id, ci(1, 0, 0), ci(0, 1, 0), ci(1, 1, 0)];
    const co = (cells: number[]) => { let p = 0, e = 0; for (const c of cells) { if (pec[c]) p = 1; e += eps[c]; } return p ? 0 : S / (e / 4); };
    cx[id] = co(ex); cy[id] = co(ey); cz[id] = co(ez);
  }
  // sponge layer: multiplicative damping on the outermost cells
  const N = o.sponge, damp: { idx: Int32Array; f: Float32Array } = { idx: new Int32Array(0), f: new Float32Array(0) };
  {
    const idx: number[] = [], f: number[] = [];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = Math.min(i, j, k, nx - 1 - i, ny - 1 - j, nz - 1 - k);
      if (d >= N) continue;
      const q = (N - d) / N;
      idx.push(i + sy * j + sz * k); f.push(1 - 0.18 * q * q);
    }
    damp.idx = Int32Array.from(idx); damp.f = Float32Array.from(f);
  }
  const nf = freqs.length, accR = new Float64Array(3 * nf), accI = new Float64Array(3 * nf), zr = new Float64Array(nf).fill(1), zi = new Float64Array(nf), cd = new Float64Array(nf), sd = new Float64Array(nf);
  for (let f = 0; f < nf; f++) { const a = 2 * Math.PI * freqs[f] * dt; cd[f] = Math.cos(a); sd[f] = Math.sin(a); }
  const pid = probe.i + sy * probe.j + sz * probe.k, sid = src.i + sy * src.j + sz * src.k;
  const dftW = o.dftF ? 2 * Math.PI * o.dftF : 0, dre = new Float32Array(dftW ? n * 3 : 0), dim = new Float32Array(dftW ? n * 3 : 0);
  for (let t = 0; t < steps; t++) {
    // H update
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) {
      let id = sy * j + sz * k;
      for (let i = 0; i < nx - 1; i++, id++) {
        Hx[id] -= S * ((Ez[id + sy] - Ez[id]) - (Ey[id + sz] - Ey[id]));
        Hy[id] -= S * ((Ex[id + sz] - Ex[id]) - (Ez[id + sx] - Ez[id]));
        Hz[id] -= S * ((Ey[id + sx] - Ey[id]) - (Ex[id + sy] - Ex[id]));
      }
    }
    // E update
    for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) {
      let id = 1 + sy * j + sz * k;
      for (let i = 1; i < nx; i++, id++) {
        Ex[id] += cx[id] * ((Hz[id] - Hz[id - sy]) - (Hy[id] - Hy[id - sz]));
        Ey[id] += cy[id] * ((Hx[id] - Hx[id - sz]) - (Hz[id] - Hz[id - sx]));
        Ez[id] += cz[id] * ((Hy[id] - Hy[id - sx]) - (Hx[id] - Hx[id - sy]));
      }
    }
    // soft source (current density)
    const w = src.wave(t * dt);
    if (src.dir === 0) Ex[sid] += w; else if (src.dir === 1) Ey[sid] += w; else Ez[sid] += w;
    // sponge
    for (let q = 0; q < damp.idx.length; q++) { const id = damp.idx[q], f = damp.f[q]; Ex[id] *= f; Ey[id] *= f; Ez[id] *= f; Hx[id] *= f; Hy[id] *= f; Hz[id] *= f; }
    {
      const ex = Ex[pid], ey = Ey[pid], ez = Ez[pid];
      for (let f = 0; f < nf; f++) {
        const a = zr[f], b = zi[f];
        accR[3 * f] += ex * a; accI[3 * f] += ex * b; accR[3 * f + 1] += ey * a; accI[3 * f + 1] += ey * b; accR[3 * f + 2] += ez * a; accI[3 * f + 2] += ez * b;
        zr[f] = a * cd[f] + b * sd[f]; zi[f] = b * cd[f] - a * sd[f];
      }
    }
    if (dftW && t % 3 === 0) {
      const ph = dftW * t * dt, c = Math.cos(ph), s = -Math.sin(ph);
      for (let id = 0; id < n; id++) { dre[3 * id] += Ex[id] * c; dim[3 * id] += Ex[id] * s; dre[3 * id + 1] += Ey[id] * c; dim[3 * id + 1] += Ey[id] * s; dre[3 * id + 2] += Ez[id] * c; dim[3 * id + 2] += Ez[id] * s; }
    }
    if (t % 50 === 0) o.progress?.(t / steps);
  }
  const spec = new Float64Array(nf);
  for (let f = 0; f < nf; f++) spec[f] = Math.sqrt(accR[3 * f] ** 2 + accI[3 * f] ** 2 + accR[3 * f + 1] ** 2 + accI[3 * f + 1] ** 2 + accR[3 * f + 2] ** 2 + accI[3 * f + 2] ** 2) * dt;
  return { spec, dre, dim };
}

export function runEmc(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const mode = strP(input, 'mode', 'shield');
  const fMHz = numP(input, 'f', 1000), fmaxMHz = numP(input, 'fmax', 3000), margin = mode === 'shield' ? numP(input, 'margin', 0.5) : 0.35;
  const fHigh = (mode === 'shield' ? fMHz * 1.8 : fmaxMHz) * 1e6;
  const cap = numP(input, 'cells', 400) * 1000;
  env.progress(0.03, 'Voxelising the model');
  // cell size: the mesh setting, but at least 10 cells per wavelength at the highest frequency (mm)
  const lam = (C0 / fHigh) * 1000;
  let P = prepare(input, { airMargin: margin, maxCells: cap });
  let h = P.g.h;
  const want = lam / 12;
  if (h > want) { const P2 = prepare(input, { airMargin: margin, maxCells: cap, h: want }); P = P2; h = P.g.h; }
  const g = P.g;
  const cellsPerLambda = lam / h;
  const pec = new Uint8Array(g.nx * g.ny * g.nz), eps = new Float32Array(g.nx * g.ny * g.nz).fill(1);
  for (let v = 0; v < pec.length; v++) {
    const m = g.mat[v];
    if (!m) continue;
    const mat = P.mats[m - 1];
    if ((m - 1) === P.air) continue;
    if ((mat.sigma ?? 0) >= 1e5) pec[v] = 1; else eps[v] = mat.epsr ?? 1;
  }
  if (!pec.some((v) => v)) throw new Error('No metal body found: the enclosure needs a conductive material (steel, aluminium, copper…).');
  const S = 0.5;                                   // Courant number (≤ 1/√3)
  const dt = (S * h * 1e-3) / C0;
  const cellOf = (x: number, y: number, z: number) => ({ i: Math.min(g.nx - 2, Math.max(1, Math.floor((x - g.ox) / g.h))), j: Math.min(g.ny - 2, Math.max(1, Math.floor((y - g.oy) / g.h))), k: Math.min(g.nz - 2, Math.max(1, Math.floor((z - g.oz) / g.h))) });
  const bx = P.box, mid = [(bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2];
  const sp = [numP(input, 'sx', mid[0]), numP(input, 'sy', mid[1]), numP(input, 'sz', mid[2])];
  const pp = [numP(input, 'px', mid[0]), numP(input, 'py', mid[1]), numP(input, 'pz', mid[2])];
  const sdir = 'xyz'.indexOf(strP(input, 'sdir', 'z'));
  const sc = cellOf(sp[0], sp[1], sp[2]), pc = cellOf(pp[0], pp[1], pp[2]);
  // For the shielding study the source sits outside the enclosure when the user left it at the default (centre) position
  const userSrc = ['sx', 'sy', 'sz'].some((k) => Math.abs(numP(input, k, 0)) > 1e-9);
  if (mode === 'shield' && !userSrc) { sc.i = Math.max(2, Math.floor((bx.min[0] - g.ox) / g.h) - Math.ceil(0.15 * (bx.max[0] - bx.min[0]) / g.h)); sc.j = pc.j; sc.k = pc.k; }
  if (mode === 'shield' && pec[sc.i + g.nx * (sc.j + g.ny * sc.k)]) throw new Error('The source lies inside the metal: move it into the air.');
  if (pec[pc.i + g.nx * (pc.j + g.ny * pc.k)]) throw new Error('The probe lies inside the metal: move it into the cavity.');
  const f0 = mode === 'shield' ? fMHz * 1e6 : 0.5 * fmaxMHz * 1e6;
  const tau = mode === 'shield' ? 1 / (Math.PI * f0 * 0.9) : 1 / (Math.PI * 0.8 * fHigh);
  const t0p = 4.5 * tau;
  const wave = mode === 'shield'
    ? (t: number) => Math.exp(-(((t - t0p) / tau) ** 2)) * Math.sin(2 * Math.PI * f0 * (t - t0p))
    : (t: number) => -2 * ((t - t0p) / tau) * Math.exp(-(((t - t0p) / tau) ** 2));
  const sim: Sim = { nx: g.nx, ny: g.ny, nz: g.nz, h: g.h * 1e-3, S, dt, pec, eps };
  const domain = Math.max(g.nx, g.ny, g.nz) * g.h * 1e-3;
  const steps = mode === 'shield' ? Math.min(6000, Math.ceil((t0p * 2 + 3.5 * domain / C0) / dt)) : Math.min(14000, Math.ceil((t0p * 2 + 40 * domain / C0) / dt));
  // frequency grid
  const nF = 160;
  const fLo = mode === 'shield' ? 0.35 * f0 : 0.1 * fHigh, fHi = mode === 'shield' ? 1.65 * f0 : fHigh;
  const freqs = new Float64Array(nF).map((_, i) => fLo + ((fHi - fLo) * i) / (nF - 1));
  env.progress(0.08, `FDTD: ${(g.nx * g.ny * g.nz / 1e3).toFixed(0)} k cells, ${steps} steps, ${cellsPerLambda.toFixed(1)} cells per wavelength`);
  const prog = (a: number, b: number) => (p: number) => env.progress(a + (b - a) * p, `FDTD time stepping ${Math.round(p * 100)} %`);
  const run = runFdtd(sim, steps, { ...sc, dir: sdir, wave }, pc, freqs, { dftF: mode === 'shield' ? f0 : undefined, progress: prog(0.1, mode === 'shield' ? 0.5 : 0.85), sponge: Math.max(5, Math.min(10, Math.floor(Math.min(g.nx, g.ny, g.nz) / 6))) });
  const spec = run.spec;
  const r = baseResult(P, 'emc', 'Yee FDTD grid (perfect conductor + dielectrics)', t0);
  r.mesh.dof = 6 * g.nx * g.ny * g.nz;
  r.mask = new Uint8Array(pec);
  const reportRes = cellsPerLambda < 10 ? 'fail' : cellsPerLambda < 15 ? 'warn' : 'ok';
  r.kv.push({ label: 'Cell size', value: `${fmt(g.h)} mm = λ/${cellsPerLambda.toFixed(1)} at ${fmt(fHigh / 1e6, 4)} MHz`, status: reportRes as 'ok' | 'warn' | 'fail' });
  r.kv.push({ label: 'Grid', value: `${g.nx} × ${g.ny} × ${g.nz} = ${(g.nx * g.ny * g.nz / 1e3).toFixed(0)} k cells, ${steps} steps` });
  if (cellsPerLambda < 10) r.notes.push(`The grid has only ${cellsPerLambda.toFixed(1)} cells per wavelength at the highest frequency: numerical dispersion is large and results above about ${fmt((C0 / (10 * g.h * 1e-3)) / 1e6, 4)} MHz are unreliable. Raise the cell limit or lower the frequency.`);
  const nodeF = (amp: Float32Array): Float32Array => {
    // cell values → node values
    const nn = nNodes(g), out = new Float32Array(nn), cnt = new Uint8Array(nn), sy = g.nx + 1, sz = (g.nx + 1) * (g.ny + 1);
    for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const v = amp[i + g.nx * (j + g.ny * k)], b = i + sy * j + sz * k;
      for (const o of [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1]) { out[b + o] += v; cnt[b + o]++; }
    }
    for (let q = 0; q < nn; q++) if (cnt[q]) out[q] /= cnt[q];
    return out;
  };
  if (mode === 'shield') {
    // reference run in free space (no metal) for the same source and probe
    env.progress(0.52, 'Reference run without the enclosure');
    const sim0: Sim = { ...sim, pec: new Uint8Array(pec.length), eps: new Float32Array(eps.length).fill(1) };
    const ref = runFdtd(sim0, steps, { ...sc, dir: sdir, wave }, pc, freqs, { progress: prog(0.52, 0.92), sponge: Math.max(5, Math.min(10, Math.floor(Math.min(g.nx, g.ny, g.nz) / 6))) });
    const sref = ref.spec;
    const se = Array.from(freqs, (_, i) => 20 * Math.log10(Math.max(sref[i], 1e-30) / Math.max(spec[i], 1e-30)));
    const iCentre = freqs.reduce((b, f, i) => (Math.abs(f - f0) < Math.abs(freqs[b] - f0) ? i : b), 0);
    const seC = se[iCentre];
    r.curves.push({ id: 'se', title: 'Shielding effectiveness at the probe', xlabel: 'Frequency (MHz)', ylabel: 'SE (dB)', series: [{ name: 'SE', x: Array.from(freqs, (f) => f / 1e6), y: se }] });
    r.curves.push({ id: 'spec', title: 'Field at the probe (with / without the enclosure)', xlabel: 'Frequency (MHz)', ylabel: '|E| (a.u.)', logy: true, series: [{ name: 'With enclosure', x: Array.from(freqs, (f) => f / 1e6), y: Array.from(spec, (v) => Math.max(v, 1e-30)) }, { name: 'Free space', x: Array.from(freqs, (f) => f / 1e6), y: Array.from(sref, (v) => Math.max(v, 1e-30)) }] });
    const seMin = amin(se);
    r.kv.push({ label: `Shielding effectiveness at ${fmt(f0 / 1e6, 4)} MHz`, value: `${fmt(seC, 3)} dB`, status: seC >= 40 ? 'ok' : seC >= 20 ? 'warn' : 'fail' });
    r.kv.push({ label: 'Minimum SE in the band', value: `${fmt(seMin, 3)} dB at ${fmt(freqs[se.indexOf(seMin)] / 1e6, 4)} MHz` });
    r.checks.push({ name: 'Shielding effectiveness at the design frequency', value: `${fmt(seC, 3)} dB`, limit: '≥ 40 dB (general EMC target)', ok: seC >= 40 });
    r.checks.push({ name: 'Worst SE across the band', value: `${fmt(seMin, 3)} dB`, limit: '≥ 20 dB', ok: seMin >= 20, note: seMin < 0 ? 'Negative SE: a cavity resonance amplifies the field.' : undefined });
    r.verdict = { pass: seC >= 40 && seMin >= 20, text: seC >= 40 && seMin >= 20 ? `PASS: shielding effectiveness ${fmt(seC, 3)} dB at ${fmt(f0 / 1e6, 4)} MHz (minimum ${fmt(seMin, 3)} dB in band).` : `FAIL: shielding effectiveness ${fmt(seC, 3)} dB at ${fmt(f0 / 1e6, 4)} MHz, minimum ${fmt(seMin, 3)} dB in the band. Look for apertures and seams near the field maximum.` };
    // field at the centre frequency
    const n = g.nx * g.ny * g.nz, amp = new Float32Array(n);
    let mx = 0;
    for (let id = 0; id < n; id++) { const a = Math.hypot(run.dre[3 * id], run.dim[3 * id], run.dre[3 * id + 1], run.dim[3 * id + 1], run.dre[3 * id + 2], run.dim[3 * id + 2]); amp[id] = a; if (a > mx && !pec[id]) mx = a; }
    const dB = new Float32Array(n);
    for (let id = 0; id < n; id++) dB[id] = pec[id] ? -80 : Math.max(-80, 20 * Math.log10(Math.max(amp[id], 1e-30) / Math.max(mx, 1e-30)));
    r.fields = [makeField('Edb', 'Field amplitude at the centre frequency (dB re. maximum)', 'dB', 'node', nodeF(dB), { domain: 'fluid' }), makeField('E', 'Field amplitude at the centre frequency', 'a.u.', 'node', nodeF(amp.map((v, i) => (pec[i] ? 0 : v / (mx || 1)))), { domain: 'fluid' })];
    r.defaultField = 'Edb';
  } else {
    // resonance peaks
    const idx: number[] = [];
    const mxs = amax(spec);
    for (let i = 2; i < nF - 2; i++) if (spec[i] > spec[i - 1] && spec[i] >= spec[i + 1] && spec[i] > 0.12 * mxs) idx.push(i);
    const peaks = idx.map((i) => {
      const a = Math.log(spec[i - 1] + 1e-30), b = Math.log(spec[i] + 1e-30), c = Math.log(spec[i + 1] + 1e-30);
      const d = a - 2 * b + c, off = d !== 0 ? (0.5 * (a - c)) / d : 0;
      return { f: freqs[i] + off * (freqs[1] - freqs[0]), a: spec[i] };
    });
    // interior size from the probe: ray march to the wall along each axis
    const ray = (dx: number, dy: number, dz: number) => { let n = 0, i = pc.i, j = pc.j, k = pc.k; while (i > 0 && j > 0 && k > 0 && i < g.nx - 1 && j < g.ny - 1 && k < g.nz - 1 && !pec[i + g.nx * (j + g.ny * k)]) { i += dx; j += dy; k += dz; n++; } return n; };
    const inside = ray(1, 0, 0) + ray(-1, 0, 0) < g.nx * 0.95 && ray(0, 1, 0) + ray(0, -1, 0) < g.ny * 0.95 && ray(0, 0, 1) + ray(0, 0, -1) < g.nz * 0.95;
    const a = (ray(1, 0, 0) + ray(-1, 0, 0)) * g.h * 1e-3, b = (ray(0, 1, 0) + ray(0, -1, 0)) * g.h * 1e-3, d = (ray(0, 0, 1) + ray(0, 0, -1)) * g.h * 1e-3;
    const modes: { f: number; label: string }[] = [];
    if (inside) for (let m = 0; m <= 3; m++) for (let nn2 = 0; nn2 <= 3; nn2++) for (let p = 0; p <= 3; p++) { if (Number(m > 0) + Number(nn2 > 0) + Number(p > 0) < 2) continue; modes.push({ f: (C0 / 2) * Math.sqrt((m / a) ** 2 + (nn2 / b) ** 2 + (p / d) ** 2), label: `${m}${nn2}${p}` }); }
    modes.sort((x, y) => x.f - y.f);
    r.curves.push({ id: 'res', title: 'Cavity response at the probe', xlabel: 'Frequency (MHz)', ylabel: '|E| (a.u.)', logy: true, series: [{ name: 'Probe', x: Array.from(freqs, (f) => f / 1e6), y: Array.from(spec, (v) => Math.max(v, 1e-30)) }], marks: peaks.slice(0, 8).map((p, i) => ({ x: p.f / 1e6, label: `f${i + 1}` })) });
    r.tables.push({ id: 'peaks', title: 'Resonant frequencies', cols: ['#', 'FDTD (MHz)', 'Closest rectangular-cavity mode', 'Analytic (MHz)', 'Difference'], rows: peaks.slice(0, 12).map((p, i) => { const c = modes.reduce((bb, m) => (Math.abs(m.f - p.f) < Math.abs(bb.f - p.f) ? m : bb), modes[0] ?? { f: NaN, label: '—' }); return [i + 1, fmt(p.f / 1e6, 5), c ? c.label : '—', c && Number.isFinite(c.f) ? fmt(c.f / 1e6, 5) : '—', c && Number.isFinite(c.f) ? `${(100 * (p.f - c.f) / c.f).toFixed(1)} %` : '—']; }) });
    r.kv.push({ label: 'Resonances found', value: String(peaks.length), status: 'info' });
    if (peaks.length) r.kv.push({ label: 'Lowest resonance', value: `${fmt(peaks[0].f / 1e6, 5)} MHz`, status: 'info' });
    if (inside) r.kv.push({ label: 'Interior size seen from the probe', value: `${fmt(a * 1000)} × ${fmt(b * 1000)} × ${fmt(d * 1000)} mm` });
    r.verdict = { pass: null, text: peaks.length ? `Lowest cavity resonance ${fmt(peaks[0].f / 1e6, 5)} MHz; ${peaks.length} resonances up to ${fmt(fHigh / 1e6, 4)} MHz.` : 'No resonance was resolved: lengthen the run, or place the source and probe away from field nulls.' };
    if (!inside) r.notes.push('The probe is not inside a closed cavity, so the rectangular-cavity comparison is omitted.');
    r.notes.push('Resonance accuracy is limited by the frequency resolution of the run and by the staircase wall positions (about one cell).');
  }
  r.solver = { name: 'FDTD, leapfrog, sponge boundary', iterations: steps, time: Date.now() - t0, log: [`Courant number ${S}, time step ${(dt * 1e12).toFixed(2)} ps`, `${steps} steps${mode === 'shield' ? ' × 2 runs (with and without the enclosure)' : ''}`] };
  r.mesh.time = Date.now() - t0;
  r.inputs.push({ label: 'Bodies', value: P.input.bodies.map((b) => `${b.name}: ${b.mat.name}`).join('; ') });
  r.inputs.push({ label: 'Source', value: `${strP(input, 'sdir', 'z').toUpperCase()}-polarised dipole at (${fmt(g.ox + sc.i * g.h, 4)}, ${fmt(g.oy + sc.j * g.h, 4)}, ${fmt(g.oz + sc.k * g.h, 4)}) mm` });
  r.inputs.push({ label: 'Probe', value: `(${fmt(g.ox + pc.i * g.h, 4)}, ${fmt(g.oy + pc.j * g.h, 4)}, ${fmt(g.oz + pc.k * g.h, 4)}) mm` });
  r.hotspots = [{ x: g.ox + pc.i * g.h, y: g.oy + pc.j * g.h, z: g.oz + pc.k * g.h, value: 0, label: 'Probe', fieldId: '' }, { x: g.ox + sc.i * g.h, y: g.oy + sc.j * g.h, z: g.oz + sc.k * g.h, value: 0, label: 'Source', fieldId: '' }];
  return r;
}
