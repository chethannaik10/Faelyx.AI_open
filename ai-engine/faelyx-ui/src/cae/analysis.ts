// Analysis dispatcher: one entry point for the UI, the worker and the tests.

import { runConvergence, runStatic } from './an_static';
import { runBuckling, runDynamic, runFatigue, runModal } from './an_modal';
import { runImpact } from './an_impact';
import { runElectrostatic, runJoule, runMagnetostatic, runThermal, runThermoStress } from './an_thermal';
import { runEmc } from './an_emc';
import { runFsi, runInternal, runWindTunnel } from './an_cfd';
import { runBridge, runRetaining, runSeismic } from './an_civil';
import { runHeatSink, runHighSpeed, runIntegrity } from './an_misc';
import type { Env } from './base';
import type { CaseInput, Result } from './model';

const RUNNERS: Record<string, (input: CaseInput, env: Env) => Result> = {
  static: runStatic, modal: runModal, buckling: runBuckling, fatigue: runFatigue, dynamic: runDynamic, impact: runImpact, convergence: runConvergence,
  windtunnel: runWindTunnel, internal: runInternal, highspeed: runHighSpeed, seismic: runSeismic, bridge: runBridge, retaining: runRetaining,
  thermal: runThermal, joule: runJoule, electrostatic: runElectrostatic, magnetostatic: runMagnetostatic, emc: runEmc, heatsink: runHeatSink, integrity: runIntegrity,
  fsi: runFsi, thermostress: runThermoStress,
};

/** The minimum and maximum of a solid-domain field are taken over the nodes / cells that belong to the part only. */
export function fixRanges(r: Result) {
  if (!r.grid || !r.mask) return;
  const g = r.grid, nx = g.nx, ny = g.ny, nz = g.nz, sx = nx + 1, sy = (nx + 1) * (ny + 1);
  let nodeAct: Uint8Array | null = null;
  const active = () => {
    if (nodeAct) return nodeAct;
    nodeAct = new Uint8Array((nx + 1) * (ny + 1) * (nz + 1));
    const m = r.mask!;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!m[(k * ny + j) * nx + i]) continue;
      const b = i + j * sx + k * sy;
      nodeAct[b] = nodeAct[b + 1] = nodeAct[b + sx] = nodeAct[b + sx + 1] = nodeAct[b + sy] = nodeAct[b + sy + 1] = nodeAct[b + sy + sx] = nodeAct[b + sy + sx + 1] = 1;
    }
    return nodeAct;
  };
  for (const f of r.fields) {
    if (f.domain !== 'solid') continue;
    const sel = f.loc === 'node' ? active() : r.mask;
    if (sel.length !== f.data.length) continue;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < f.data.length; i++) { if (!sel[i]) continue; const v = f.data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (Number.isFinite(mn)) { f.min = mn; f.max = mx; }
  }
}

export function runAnalysis(input: CaseInput, env: Env): Result {
  const t0 = Date.now();
  const run = RUNNERS[input.analysis];
  if (!run) throw new Error(`Unknown analysis "${input.analysis}".`);
  const noGeometry = input.analysis === 'heatsink' || input.analysis === 'integrity';
  if (!noGeometry && !input.bodies.some((b) => b.role !== 'carve' && b.tris.length >= 9)) throw new Error('Load a part first: use "Open part" or pick one of the sample models.');
  const r = run(input, env);
  fixRanges(r);
  // one verdict for everything: a failed check cannot sit beside a PASS
  const failed = r.checks.filter((c) => !c.ok);
  if (r.verdict.pass === true && failed.length) { r.verdict.pass = false; r.verdict.text = `FAIL: ${failed.map((c) => c.name).join('; ')} not satisfied. ${r.verdict.text.replace(/^PASS:\s*/, 'Otherwise: ')}`; }
  if (!r.solver.time) r.solver.time = Date.now() - t0;
  if (!r.mesh.time) r.mesh.time = Date.now() - t0;
  env.progress(1, 'Done');
  return r;
}

/** Typed-array buffers of a result, for zero-copy transfer from the worker. */
export function transferables(r: Result): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>();
  const add = (a: ArrayBufferView | null | undefined) => { if (a && a.buffer instanceof ArrayBuffer && a.byteLength > 0) set.add(a.buffer); };
  for (const f of r.fields) add(f.data);
  add(r.disp); add(r.mask); add(r.matIndex);
  for (const m of r.modes) add(m.disp);
  for (const fr of r.frames) { add(fr.disp); if (fr.fields) for (const k of Object.keys(fr.fields)) add(fr.fields[k]); }
  for (const s of r.streams) { add(s.pts); add(s.speed); }
  if (r.tri) { add(r.tri.pos); add(r.tri.val); }
  return [...set];
}
