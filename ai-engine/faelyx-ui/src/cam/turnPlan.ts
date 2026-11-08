// Lathe turning planner: facing, G71-style rough passes, a finishing profile pass and part-off.
// X is diameter, Z runs along the spindle with Z0 on the finished free end and the chuck at negative Z.

import { type Mesh, type V3, type P2, simplify, meshStats } from './geometry';
import { type MachineDef, type StockMaterial, type StockSetup, type Tool, type ControllerId } from './camData';
import { type Cmd, type OpSummary, type Program, type ToolUse } from './toolpath';
import { turnData } from './feeds';

export interface TurnRequest { mesh: Mesh; machine: MachineDef; controller: ControllerId; material: StockMaterial; stock: StockSetup; faceAllow?: number }

const STD_BARS = [6, 8, 10, 12, 16, 20, 25, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 120, 150, 200];

const turnTool = (id: string, name: string, w: number): Tool => ({ id, kind: 'flat', name, d: w, flutes: 1, fluteLen: 20, stickout: 30, holderD: 20, material: 'carbide', coating: 'TiAlN' });
export const TURN_TOOLS = {
  rough: turnTool('turn-cnmg', 'CNMG 120408 rough OD insert', 12),
  finish: turnTool('turn-vnmg', 'VNMG 160404 finish OD insert', 6),
  part: turnTool('turn-part', 'Part-off blade 3 mm', 3),
};

/** Outer radius of the solid as a function of z, binned. */
export function radialProfile(m: Mesh, bin = 0.25): { z: number; r: number }[] {
  const cx = (m.min[0] + m.max[0]) / 2, cy = (m.min[1] + m.max[1]) / 2;
  const n = Math.max(2, Math.ceil((m.max[2] - m.min[2]) / bin) + 1);
  const r = new Float32Array(n);
  const t = m.tris;
  const upd = (z: number, x: number, y: number) => {
    const i = Math.round((z - m.min[2]) / bin);
    if (i < 0 || i >= n) return;
    const rr = Math.hypot(x - cx, y - cy);
    if (rr > r[i]) r[i] = rr;
  };
  for (let f = 0; f < t.length; f += 9) {
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      const x0 = t[f + a * 3], y0 = t[f + a * 3 + 1], z0 = t[f + a * 3 + 2], x1 = t[f + b * 3], y1 = t[f + b * 3 + 1], z1 = t[f + b * 3 + 2];
      const dz = Math.abs(z1 - z0);
      const steps = Math.max(1, Math.ceil(dz / bin));
      for (let s = 0; s <= steps; s++) { const u = s / steps; upd(z0 + (z1 - z0) * u, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u); }
    }
  }
  // the vertex sampling only sees the silhouette at edges; fill gaps by carrying the max of neighbours for sparse bins
  for (let i = 1; i < n - 1; i++) if (r[i] === 0) r[i] = Math.min(r[i - 1], r[i + 1]) || Math.max(r[i - 1], r[i + 1]);
  return Array.from(r).map((v, i) => ({ z: m.min[2] + i * bin, r: v }));
}

export function planTurn(req: TurnRequest): Program {
  const { machine: M, material: mat, stock } = req;
  const warnings: string[] = [];
  const m = req.mesh;
  const prof0 = radialProfile(m);
  const len = m.max[2] - m.min[2];
  const maxR = Math.max(...prof0.map((p) => p.r));
  const face = req.faceAllow ?? Math.max(1, stock.topAllow);
  // profile in Z-from-free-end coordinates (Z0 at the right end, negative into the chuck)
  const zMax = m.max[2];
  const prof: P2[] = prof0.map((p) => [p.z - zMax, p.r * 2]).sort((a, b) => b[0] - a[0]) as P2[];
  const stockD = stock.auto ? (STD_BARS.find((b) => b >= maxR * 2 + 2) ?? Math.ceil(maxR * 2 + 4)) : stock.size[0];
  if (stockD < maxR * 2 - 1e-6) warnings.push(`Bar Ø${stockD} is smaller than the part (Ø${(maxR * 2).toFixed(1)}).`);
  const chuckZ = -(len + 4);
  const barLen = len + face + 4 + Math.max(stock.holdDepth, 20);
  const maxDia = M.maxTurnDia ?? 250;
  if (stockD > maxDia) warnings.push(`Bar Ø${stockD} exceeds the ${M.model} swing (Ø${maxDia}).`);
  if (M.maxTurnLen && len + 4 > M.maxTurnLen) warnings.push(`Part length ${(len + 4).toFixed(0)} mm exceeds ${M.model} turning length ${M.maxTurnLen} mm.`);
  if (M.chuckMm && stockD > M.chuckMm) warnings.push(`Bar Ø${stockD} is larger than the Ø${M.chuckMm} chuck bore.`);

  const cmds: Cmd[] = [];
  const ops: OpSummary[] = [];
  const toolUse = new Map<number, ToolUse>();
  let x = stockD + 4, z = face + 2, feedLen = 0, rapidLen = 0, minutes = 0;
  const rpmAt = (dia: number, vc: number) => Math.min(M.maxRpm ?? 3000, (vc * 1000) / (Math.PI * Math.max(6, dia)));
  const safeX = stockD + 6, safeZ = face + 5;
  const rapidTo = (nx?: number, nz?: number) => {
    const X = nx ?? x, Z = nz ?? z;
    rapidLen += Math.hypot(X - x, Z - z); minutes += Math.hypot(X - x, Z - z) / ((M.rapid ?? 20000) * 0.6);
    cmds.push({ k: 'rapid', x: +X.toFixed(3), z: +Z.toFixed(3) }); x = X; z = Z;
  };
  const feedTo = (nx: number | undefined, nz: number | undefined, f: number, vc: number) => {
    const X = nx ?? x, Z = nz ?? z;
    const L = Math.hypot((X - x) / 2, Z - z);
    const rpm = rpmAt((X + x) / 2, vc);
    feedLen += L; minutes += L / (f * rpm);
    cmds.push({ k: 'feed', x: +X.toFixed(3), z: +Z.toFixed(3), f });
    x = X; z = Z;
  };
  let tn = 0;
  const begin = (name: string, tool: Tool, vc: number, strategy: string) => {
    const ex = [...toolUse.values()].find((u) => u.tool.id === tool.id);
    if (ex) { tn = ex.n; ex.ops++; } else { tn = toolUse.size + 1; toolUse.set(tn, { n: tn, tool, rpm: 0, minutes: 0, ops: 1 }); }
    cmds.push({ k: 'op', name, tool: tn, rpm: rpmAt(stockD, vc), coolant: mat.coolant !== 'dry', spindle: true, css: vc, maxRpm: M.maxRpm ?? 3000 });
    rapidTo(safeX, undefined); rapidTo(undefined, safeZ);
    return { name, tool, strategy, start: cmds.length, t0: minutes, f0: feedLen, tn, vc };
  };
  const end = (h: ReturnType<typeof begin>, d: ReturnType<typeof turnData>, notes: string[] = []) => {
    const time = minutes - h.t0 + 0.1;
    ops.push({ id: ops.length + 1, name: h.name, strategy: h.strategy, toolNo: h.tn, toolName: h.tool.name, rpm: d.rpm, feed: d.feedRev, ap: d.ap, ae: d.ap, mrr: +(h.vc * d.feedRev * d.ap).toFixed(1), powerKw: 0, length: feedLen - h.f0, time, startCmd: h.start, endCmd: cmds.length, setup: 0, notes });
    toolUse.get(h.tn)!.minutes += time; toolUse.get(h.tn)!.rpm = d.rpm;
  };
  cmds.push({ k: 'setup', name: 'Lathe setup', a: 0, c: 0, wcs: stock.wcs, index: false });

  // 1. facing
  const dR = turnData(mat, M, stockD, 'rough');
  {
    const h = begin('Facing', TURN_TOOLS.rough, dR.vc, 'Face to length in two passes');
    const passes = Math.max(1, Math.ceil(face / Math.min(1.5, dR.ap)));
    for (let p = 1; p <= passes; p++) {
      const zz = face - (face * p) / passes;
      rapidTo(stockD + 2, face + 1); rapidTo(undefined, zz);
      feedTo(-0.5, zz, dR.feedRev * 0.8, dR.vc);
      rapidTo(stockD + 2, zz + 0.5);
    }
    end(h, dR, [`${passes} pass${passes === 1 ? '' : 'es'}, allowance ${face} mm`]);
  }
  // 2. rough turning
  const fin = 0.3;
  const profAt = (zz: number) => {
    // radius (diameter) of the finished part at z, interpolated; the free end is z=0
    for (let i = 0; i < prof.length - 1; i++) if (zz <= prof[i][0] && zz >= prof[i + 1][0]) { const u = (prof[i][0] - zz) / Math.max(1e-9, prof[i][0] - prof[i + 1][0]); return prof[i][1] + (prof[i + 1][1] - prof[i][1]) * u; }
    return prof[prof.length - 1][1];
  };
  {
    const h = begin('Rough turning', TURN_TOOLS.rough, dR.vc, 'G71-style longitudinal roughing');
    let passes = 0;
    const minD = Math.min(...prof.map((p) => p[1]));
    const maxD = Math.max(...prof.map((p) => p[1]));
    const cand = new Set<number>();
    for (let d = stockD - 2 * dR.ap; d > minD + 2 * fin; d -= 2 * dR.ap) cand.add(+d.toFixed(3));
    for (const p of prof) cand.add(+(p[1] + 2 * fin).toFixed(3));
    cand.add(+(minD + 2 * fin).toFixed(3));
    const levels = [...cand].filter((d) => d < stockD - 0.05 && d >= minD + 2 * fin - 1e-6).sort((a, b) => b - a);
    const picked: number[] = [];
    for (const d of levels) {
      const prev = picked.length ? picked[picked.length - 1] : stockD;
      const plateau = prof.some((p) => Math.abs(p[1] + 2 * fin - d) < 0.02);
      if (prev - d < dR.ap * 0.5 && !plateau && d > minD + 2 * fin + 1e-6) continue;
      picked.push(d);
    }
    void maxD;
    for (const d of picked) {
      passes++;
      // end of this pass: first z (towards chuck) where the profile + allowance exceeds the pass diameter
      let zEnd = -len;
      for (let zz = 0; zz >= -len; zz -= 0.25) if (profAt(zz) + 2 * fin > d + 1e-6) { zEnd = zz + 0.25; break; }
      if (zEnd >= -0.1) continue;
      rapidTo(d, safeZ);
      rapidTo(undefined, 1);
      feedTo(d, zEnd, dR.feedRev, dR.vc);
      feedTo(d + 1.2, zEnd + 0.6, dR.feedRev, dR.vc);
      rapidTo(undefined, safeZ);
    }
    end(h, dR, [`${passes} passes, ${fin} mm left for finishing`]);
  }
  // 3. finish
  const dF = turnData(mat, M, maxR * 2, 'finish');
  {
    const h = begin('Finish profile', TURN_TOOLS.finish, dF.vc, 'Contour along the finished profile');
    const pts = simplify(prof.map((p) => [p[0], p[1]] as P2).map((p) => [p[1], p[0]] as P2), 0.008).map((p) => [p[1], p[0]] as P2);
    const first = pts[0];
    rapidTo(first[1] + 2, 1);
    rapidTo(undefined, first[0] + 1);
    feedTo(first[1], first[0], dF.feedRev, dF.vc);
    for (let i = 1; i < pts.length; i++) feedTo(pts[i][1], pts[i][0], dF.feedRev, dF.vc);
    feedTo(stockD + 1, -len, dF.feedRev, dF.vc);
    rapidTo(safeX, undefined); rapidTo(undefined, safeZ);
    end(h, dF, [`${pts.length} profile points`]);
  }
  // 4. part-off
  {
    const dP = turnData(mat, M, stockD * 0.5, 'rough');
    const h = begin('Part-off', TURN_TOOLS.part, dP.vc * 0.7, 'Cut off at the chuck side');
    const zc = -len - TURN_TOOLS.part.d / 2 - 0.2;
    rapidTo(stockD + 2, zc + 0); rapidTo(stockD + 1, zc);
    feedTo(0, zc, dP.feedRev * 0.4, dP.vc * 0.7);
    rapidTo(safeX, undefined); rapidTo(undefined, safeZ);
    end(h, { ...dP, feedRev: dP.feedRev * 0.4 }, ['Groove tool 3 mm wide']);
  }
  rapidTo(safeX, undefined); rapidTo(undefined, safeZ);
  const tools = [...toolUse.values()];
  const stats = meshStats(m);
  const bar = Math.PI * Math.pow(stockD / 2, 2) * (len + face);
  return {
    kind: 'turn', process: 'turn', controller: req.controller, machine: M, name: 'FAELYX_TURN', unit: 'mm', cmds, ops, tools,
    stock: { ...stock, box: [stockD, stockD, barLen] }, sims: [], warnings,
    turn: { stockR: stockD / 2, stockLen: barLen, chuckZ, chuckR: (M.chuckMm ?? 165) / 2, profile: prof },
    totalTime: minutes + tools.length * 0.1, rapidLength: rapidLen, feedLength: feedLen, partVolume: stats.volume, removedVolume: Math.max(0, bar - stats.volume),
  };
}
void (0 as unknown as V3);
