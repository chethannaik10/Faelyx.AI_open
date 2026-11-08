// Impact / crash: explicit central-difference dynamics with rigid-wall penalty contact (elastic material).

import { addMeshAndSolver, bodyTable, describeInputs, dispScaleFor, numP, strP } from './an_static';
import { baseResult, fmt, structPost, type Env } from './base';
import { nodalAverage } from './fem';
import { setupStruct } from './an_modal';
import { failureIndex, invariants } from './materials';
import { makeField, type CaseInput, type Result } from './model';
import { nNodes, nodeXYZ } from './voxel';

export function runImpact(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const v0 = numP(input, 'v', 5) * 1000, zeta = numP(input, 'zeta', 0.002), mu = numP(input, 'mu', 0), target = numP(input, 'fosTarget', 1.5);
  const dirS = strP(input, 'dir', '-z'), sgn = dirS[0] === '-' ? -1 : 1, ax = 'xyz'.indexOf(dirS[1]);
  const d: [number, number, number] = [0, 0, 0]; d[ax] = sgn;
  const { P, model, sl } = setupStruct(input, env, { skip: ['force', 'torque', 'pressure', 'gravity', 'centrifugal', 'spring', 'frictionless', 'fixed'], maxElems: 9000 });
  const g = P.g, nn = nNodes(g), n3 = 3 * nn;
  env.progress(0.06, `Preparing the explicit model (${g.nElem.toLocaleString()} elements)`);
  const mg = model.build(sl.bc);
  const mn = model.nodalMass();
  const act = mg.active, fixedMask = mg.fixedMask();
  let mTot = 0, mMin = Infinity;
  for (let i = 0; i < nn; i++) if (act[i]) { mTot += mn[i]; if (mn[i] < mMin) mMin = mn[i]; }
  // wall position: the node furthest along the direction of travel
  const pos = new Float64Array(n3), s = [0, 0, 0];
  let xw = -Infinity;
  for (let i = 0; i < nn; i++) { if (!act[i]) continue; const p = nodeXYZ(g, i); pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2]; const q = p[ax] * sgn; if (q > xw) xw = q; }
  void s;
  const nearList: number[] = [];
  for (let i = 0; i < nn; i++) if (act[i] && pos[3 * i + ax] * sgn > xw - 2.5 * g.h) nearList.push(i);
  const near = Int32Array.from(nearList);
  const mat0 = P.mats[0], Emax = Math.max(...P.mats.map((m) => m.E)), rho0 = mat0.rho * 1e-12;
  const kp = 1.0 * Emax * g.h;
  // critical time step from the largest frequency (power iteration on M⁻¹K)
  env.progress(0.1, 'Estimating the critical time step');
  let z = new Float64Array(n3), y = new Float64Array(n3);
  let seed = 7; for (let i = 0; i < n3; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; z[i] = fixedMask[i] ? 0 : seed / 0x7fffffff - 0.5; }
  let lam = 0;
  for (let it = 0; it < 30; it++) {
    mg.applyFull(z, y);
    let num = 0, den = 0;
    for (let i = 0; i < n3; i++) { if (fixedMask[i]) { y[i] = 0; continue; } const m = mn[(i / 3) | 0]; num += z[i] * y[i]; den += m * z[i] * z[i]; y[i] /= m; }
    lam = num / den;
    let nm = 0; for (let i = 0; i < n3; i++) nm += y[i] * y[i];
    nm = Math.sqrt(nm) || 1; for (let i = 0; i < n3; i++) z[i] = y[i] / nm;
  }
  const w2max = 1.2 * lam + (2 * kp) / mMin * 0.25;
  let dt = 0.85 * 2 / Math.sqrt(w2max);
  const Lx = [0, 1, 2].map((k) => P.box.max[k] - P.box.min[k]), Ld = Lx[ax];
  const c = Math.sqrt(Emax / rho0);
  let tEnd = numP(input, 'tmax', 0) > 0 ? numP(input, 'tmax', 0) / 1000 : Math.max(10 * Ld / c, 20 * Ld / v0 * 0.02);
  const maxSteps = 9000;
  let steps = Math.ceil(tEnd / dt);
  if (steps > maxSteps) { steps = maxSteps; tEnd = steps * dt; }
  const alpha = 2 * zeta * (Math.PI * c / (2 * Math.max(...Lx)));
  const u = new Float64Array(n3), v = new Float64Array(n3), a = new Float64Array(n3), ku = new Float64Array(n3), kuOld = new Float64Array(n3);
  const beta = 0.2 / Math.sqrt(w2max);                   // stiffness-proportional damping: 10 % at the highest frequency, removes spurious wave-front ringing
  for (let i = 0; i < nn; i++) if (act[i]) for (let k = 0; k < 3; k++) if (!fixedMask[3 * i + k]) v[3 * i + k] = v0 * d[k];
  const Ne = g.nElem;
  const envVm = new Float32Array(Ne), envS1 = new Float32Array(Ne).fill(-Infinity), envS3 = new Float32Array(Ne).fill(Infinity), envIdx = new Float32Array(Ne);
  const maxDispN = new Float32Array(nn);
  const tH: number[] = [], fH: number[] = [], keH: number[] = [], seH: number[] = [], vcH: number[] = [];
  const frames: { t: number; u: Float32Array }[] = [];
  const nFrames = Math.min(24, Math.max(8, Math.floor(1.5e7 / (12 * nn)))), frameEvery = Math.max(1, Math.floor(steps / (nFrames - 1)));
  const stressEvery = Math.max(1, Math.floor(steps / 160));
  const histEvery = Math.max(1, Math.floor(steps / 500));
  const E0 = 0.5 * mTot * v0 * v0;
  let peakF = 0, peakFt = 0, impulse = 0, contactT0 = -1, contactT1 = 0, quiet = 0, everContact = false, maxAdv = 0, stepsDone = 0, maxPen = 0;
  const rigid = (vec: Float64Array): [number, number, number] => { let sx = 0, sy = 0, sz = 0, mm = 0; for (let i = 0; i < nn; i++) { if (!act[i]) continue; sx += mn[i] * vec[3 * i]; sy += mn[i] * vec[3 * i + 1]; sz += mn[i] * vec[3 * i + 2]; mm += mn[i]; } return [sx / mm, sy / mm, sz / mm]; };
  const sampleStress = () => {
    const sig = model.elementStress(u);
    for (let e = 0; e < Ne; e++) {
      const iv = invariants(sig, e * 6), mi = g.mat[g.elem[e]] - 1;
      if (iv.vm > envVm[e]) envVm[e] = iv.vm;
      if (iv.s1 > envS1[e]) envS1[e] = iv.s1;
      if (iv.s3 < envS3[e]) envS3[e] = iv.s3;
      const fi = failureIndex(P.mats[mi], P.mats[mi].brittle ? 'principal' : 'vonmises', sig, e * 6, P.fibre[mi]);
      if (fi > envIdx[e]) envIdx[e] = fi;
    }
  };
  const fc = new Float64Array(n3);
  let ke = 0, se = 0;
  const contact = () => {
    fc.fill(0);
    let Fn = 0, pe = 0, pmax = 0;
    for (let q = 0; q < near.length; q++) {
      const i = near[q], pen = (pos[3 * i + ax] + u[3 * i + ax]) * sgn - xw;
      if (pen <= 0) continue;
      const f = kp * pen;
      fc[3 * i + ax] -= sgn * f; Fn += f; pe += 0.5 * kp * pen * pen; if (pen > pmax) pmax = pen;
      if (mu > 0) {
        const vt = [v[3 * i], v[3 * i + 1], v[3 * i + 2]]; vt[ax] = 0;
        const vm = Math.hypot(vt[0], vt[1], vt[2]);
        if (vm > 0) { const sc = (mu * f) / (vm + 1e-3 * v0); for (let k = 0; k < 3; k++) if (k !== ax) fc[3 * i + k] -= sc * vt[k]; }
      }
    }
    return { Fn, pe, pmax };
  };
  mg.applyFull(u, ku);
  kuOld.set(ku);
  for (let s2 = 0; s2 <= steps; s2++) {
    const t = s2 * dt;
    const { Fn, pe, pmax } = contact();
    if (pmax > maxPen) maxPen = pmax;
    if (Fn > 0) { everContact = true; if (contactT0 < 0) contactT0 = t; contactT1 = t; quiet = 0; } else if (everContact) quiet++;
    if (Fn > peakF) { peakF = Fn; peakFt = t; }
    if (s2 > 0) impulse += Fn * dt;
    if (s2 % histEvery === 0 || s2 === steps) {
      let k2 = 0, s3 = 0;
      for (let i = 0; i < nn; i++) if (act[i]) { const m = mn[i]; k2 += 0.5 * m * (v[3 * i] ** 2 + v[3 * i + 1] ** 2 + v[3 * i + 2] ** 2); s3 += 0.5 * (u[3 * i] * ku[3 * i] + u[3 * i + 1] * ku[3 * i + 1] + u[3 * i + 2] * ku[3 * i + 2]); }
      ke = k2; se = s3 + pe;
      tH.push(t * 1e6); fH.push(Fn / 1000); keH.push(ke / 1e3); seH.push(se / 1e3);
      vcH.push((rigid(v)[ax] * sgn) / 1000);
    }
    if (s2 % stressEvery === 0 || s2 === steps) sampleStress();
    if (s2 % frameEvery === 0 && frames.length < nFrames) {
      const tr = rigid(u), f32 = new Float32Array(n3);
      for (let i = 0; i < nn; i++) if (act[i]) for (let k = 0; k < 3; k++) f32[3 * i + k] = u[3 * i + k] - tr[k];
      frames.push({ t, u: f32 });
    }
    if (s2 % 25 === 0) { const tr = rigid(u); for (let i = 0; i < nn; i++) if (act[i]) { const m = Math.hypot(u[3 * i] - tr[0], u[3 * i + 1] - tr[1], u[3 * i + 2] - tr[2]); if (m > maxDispN[i]) maxDispN[i] = m; if (m > maxAdv) maxAdv = m; } }
    stepsDone = s2;
    if (s2 === steps) break;
    if (everContact && quiet > Math.max(300, Math.floor(0.05 * steps)) && s2 > 50) break;
    // velocity-Verlet form of the central-difference scheme
    const half = 0.5 * dt;
    for (let i = 0; i < n3; i++) {
      if (fixedMask[i]) { a[i] = 0; v[i] = 0; continue; }
      const m = mn[(i / 3) | 0];
      a[i] = (fc[i] - ku[i] - (beta * (ku[i] - kuOld[i])) / dt) / m - alpha * v[i];
      v[i] += half * a[i];
      u[i] += dt * v[i];
    }
    kuOld.set(ku);
    mg.applyFull(u, ku);
    contact();
    for (let i = 0; i < n3; i++) {
      if (fixedMask[i]) continue;
      v[i] += half * ((fc[i] - ku[i] - (beta * (ku[i] - kuOld[i])) / dt) / mn[(i / 3) | 0] - alpha * v[i]);
    }
    if (s2 % 200 === 0) env.progress(0.12 + 0.76 * (s2 / steps), `Explicit time stepping: ${(t * 1e6).toFixed(1)} µs of ${(tEnd * 1e6).toFixed(0)} µs`);
  }
  const mom = mTot * v0;
  const vcFinal = rigid(v)[ax] * sgn;
  const e = Math.max(0, -vcFinal / v0);
  const energyEnd = ke + se;
  // result
  const stressDummy = new Float32Array(6 * Ne);
  const post0 = structPost(P, model, new Float64Array(n3), stressDummy, 'vonmises');
  const r = baseResult(P, 'impact', 'Hexahedral 8-node, explicit central difference', t0);
  addMeshAndSolver(r, { P, model, sl, u, sig: stressDummy, post: post0, iterations: stepsDone, residual: 0, solveMs: Date.now() - t0, energy: 0, react: { sum: [0, 0, 0], max: 0 }, ms: Date.now() - t0 }, 'Explicit central difference');
  r.solver.iterations = stepsDone;
  r.solver.log = [`${stepsDone.toLocaleString()} steps of ${(dt * 1e9).toFixed(0)} ns (critical step from the largest frequency ${(Math.sqrt(w2max) / (2 * Math.PI) / 1000).toFixed(0)} kHz)`, `Penalty contact stiffness ${fmt(kp)} N/mm per node`];
  const maxVm = envVm.reduce((m, x) => Math.max(m, x), 0), maxIdx = envIdx.reduce((m, x) => Math.max(m, x), 0);
  const g1 = (arr: Float32Array) => nodalAverage(g, arr, 1);
  const nn1 = nn, fosN = new Float32Array(nn1), idxN = g1(envIdx);
  for (let i = 0; i < nn1; i++) fosN[i] = idxN[i] > 1e-6 ? Math.min(100, 1 / idxN[i]) : 100;
  const yieldFlag = new Float32Array(Ne); let yieldVol = 0;
  for (let q = 0; q < Ne; q++) { const m = P.mats[g.mat[g.elem[q]] - 1]; if (envIdx[q] >= 1 || envVm[q] > m.yield) { yieldFlag[q] = 1; yieldVol++; } }
  r.fields = [
    makeField('vm', 'Peak equivalent stress during the impact', 'MPa', 'node', g1(envVm)),
    makeField('fos', 'Minimum factor of safety during the impact', '', 'node', fosN, { lowIsBad: true }),
    makeField('s1', 'Peak tensile (max principal) stress', 'MPa', 'node', g1(envS1.map((x) => (Number.isFinite(x) ? x : 0)))),
    makeField('s3', 'Peak compressive (min principal) stress', 'MPa', 'node', g1(envS3.map((x) => (Number.isFinite(x) ? x : 0)))),
    makeField('yield', 'Yield region (1 = stress above yield)', '', 'node', g1(yieldFlag)),
    makeField('disp', 'Peak deformation (relative to rigid motion)', 'mm', 'node', maxDispN),
  ];
  r.defaultField = 'vm';
  r.frames = frames.map((f) => ({ label: `t = ${(f.t * 1e6).toFixed(1)} µs`, t: f.t, disp: f.u }));
  r.disp = null; r.dispScale = dispScaleFor(P, maxAdv);
  r.curves.push({ id: 'force', title: 'Contact force', xlabel: 'Time (µs)', ylabel: 'Force (kN)', series: [{ name: 'Wall force', x: tH, y: fH }] });
  r.curves.push({ id: 'energy', title: 'Energy balance', xlabel: 'Time (µs)', ylabel: 'Energy (J)', series: [{ name: 'Kinetic', x: tH, y: keH }, { name: 'Strain + contact', x: tH, y: seH }, { name: 'Total', x: tH, y: keH.map((k, i) => k + seH[i]) }] });
  r.curves.push({ id: 'vel', title: 'Velocity of the centre of mass (towards the wall = +)', xlabel: 'Time (µs)', ylabel: 'Velocity (m/s)', series: [{ name: 'v', x: tH, y: vcH }] });
  const aPeak = peakF / mTot / 9810;
  r.kv.push({ label: 'Impact speed', value: `${fmt(v0 / 1000)} m/s (${dirS})`, status: 'info' });
  r.kv.push({ label: 'Peak contact force', value: `${fmt(peakF / 1000)} kN at ${fmt(peakFt * 1e6, 4)} µs` });
  r.kv.push({ label: 'Peak deceleration of the part', value: `${fmt(aPeak, 4)} g` });
  r.kv.push({ label: 'Contact duration', value: contactT0 >= 0 ? `${fmt((contactT1 - contactT0) * 1e6, 4)} µs` : 'no contact' });
  r.kv.push({ label: 'Peak von Mises stress', value: `${fmt(maxVm)} MPa` });
  r.kv.push({ label: 'Minimum factor of safety', value: maxIdx > 0 ? fmt(1 / maxIdx, 3) : '∞', status: maxIdx > 0 && 1 / maxIdx >= target ? 'ok' : 'fail' });
  r.kv.push({ label: 'Volume above yield', value: `${(100 * yieldVol / Math.max(1, Ne)).toFixed(2)} %`, status: yieldVol ? 'fail' : 'ok' });
  r.kv.push({ label: 'Rebound (restitution)', value: fmt(e, 3) });
  r.checks.push({ name: 'Safety factor during impact', value: maxIdx > 0 ? fmt(1 / maxIdx, 3) : '∞', limit: `≥ ${target}`, ok: maxIdx === 0 || 1 / maxIdx >= target });
  r.checks.push({ name: 'No material above yield', value: `${(100 * yieldVol / Math.max(1, Ne)).toFixed(2)} % of volume`, limit: '0 %', ok: yieldVol === 0 });
  r.checks.push({ name: 'Numerical dissipation (energy lost to damping)', value: `${(100 * Math.abs(energyEnd - E0) / Math.max(E0, 1e-12)).toFixed(1)} % of impact energy`, limit: '< 30 %', ok: Math.abs(energyEnd - E0) / Math.max(E0, 1e-12) < 0.3, note: 'Stiffness-proportional damping removes spurious stress-wave ringing; peak stresses are slightly under-estimated by it.' });
  r.checks.push({ name: 'Momentum balance (impulse = m v (1+e))', value: `${fmt(impulse / (mom * (1 + e)) * 100, 3)} %`, limit: '90 – 110 %', ok: impulse / (mom * (1 + e)) > 0.9 && impulse / (mom * (1 + e)) < 1.1 });
  if (!everContact) r.notes.push('The part did not touch the wall within the simulated time: check the direction of travel.');
  if (stepsDone >= maxSteps) r.notes.push('The step budget was reached before the part left the wall; results describe the first part of the impact.');
  r.notes.push('Material is linear elastic: where the stress exceeds yield the result is only an indication that the part will deform permanently.');
  r.tables.push(bodyTable(P, { post: { ...post0, vmElem: envVm, idxElem: envIdx }, model }));
  r.hotspots = (() => { let best = 0, be = 0; for (let q = 0; q < Ne; q++) if (envVm[q] > best) { best = envVm[q]; be = q; } const vv = g.elem[be], k = Math.floor(vv / (g.nx * g.ny)), rr = vv - k * g.nx * g.ny, j = Math.floor(rr / g.nx), i = rr - j * g.nx; return [{ x: g.ox + (i + 0.5) * g.h, y: g.oy + (j + 0.5) * g.h, z: g.oz + (k + 0.5) * g.h, value: best, label: 'Peak impact stress', fieldId: 'vm' }]; })();
  const ok = (maxIdx === 0 || 1 / maxIdx >= target) && yieldVol === 0;
  r.verdict = { pass: ok, text: ok ? `PASS: the part stays elastic with minimum factor of safety ${maxIdx > 0 ? fmt(1 / maxIdx, 3) : '∞'}.` : `FAIL: ${yieldVol ? `${(100 * yieldVol / Ne).toFixed(1)} % of the volume exceeds yield` : 'factor of safety below the requirement'}; peak stress ${fmt(maxVm)} MPa.` };
  describeInputs(r, P, sl);
  return r;
}
