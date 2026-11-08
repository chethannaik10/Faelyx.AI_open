// Laser / plasma profile cutting: slices the part at mid thickness, offsets the outline by half the kerf,
// cuts holes first (smallest to largest) and the outside last, with lead-ins that pierce in the scrap.

import { type Mesh, type P2, transformMesh, signedDistance, isoContours, simplifyClosed, polyArea } from './geometry';
import { sliceMask, polyLen } from './printPlan';
import { type MachineDef, type StockMaterial, type ControllerId, type Tool, type StockSetup } from './camData';
import { type Cmd, type OpSummary, type Program, type ToolUse } from './toolpath';
import { cutData } from './feeds';

export interface CutRequest { mesh: Mesh; process: 'laser' | 'plasma'; machine: MachineDef; controller: ControllerId; material: StockMaterial; stock: StockSetup; thicknessOverride?: number; kerfOverride?: number }

export function planCut(req: CutRequest): Program {
  const { machine: M, material: mat } = req;
  const warnings: string[] = [];
  const m0 = req.mesh;
  const thick = req.thicknessOverride ?? (m0.max[2] - m0.min[2]);
  if (thick > 30) warnings.push(`Part is ${thick.toFixed(0)} mm tall: laser / plasma cutting suits flat sheet parts.`);
  const margin = 10;
  const mesh = transformMesh(m0, (x, y, z) => [x - m0.min[0] + margin, y - m0.min[1] + margin, z - m0.min[2]]);
  const sheet: [number, number] = [M.envelope[0], M.envelope[1]];
  const w = mesh.max[0] - mesh.min[0], h = mesh.max[1] - mesh.min[1];
  if (w + 2 * margin > sheet[0] || h + 2 * margin > sheet[1]) warnings.push(`Part ${w.toFixed(0)} × ${h.toFixed(0)} mm plus a 10 mm edge margin does not fit the ${sheet[0]} × ${sheet[1]} mm table.`);
  if (req.process === 'laser' && mat.laserOk === false) warnings.push(`${mat.name} is not normally laser cut.`);
  if (req.process === 'plasma' && !mat.plasmaOk) warnings.push(`${mat.name} cannot be plasma cut (needs a conductive metal).`);
  const cd = cutData(mat, thick, req.process, M);
  const kerf = req.kerfOverride ?? cd.kerf;
  // mask the outline at mid thickness
  const cell = Math.max(0.1, Math.min(0.3, Math.max(w, h) / 600));
  const gm = 8;
  const x0 = mesh.min[0] - gm, y0 = mesh.min[1] - gm;
  const nx = Math.ceil((w + 2 * gm) / cell), ny = Math.ceil((h + 2 * gm) / cell);
  const ids = new Int32Array(mesh.n).map((_, i) => i);
  const mask = new Uint8Array(nx * ny);
  const rows: number[][] = Array.from({ length: ny }, () => []);
  sliceMask(mesh, ids, 0, mesh.n, thick / 2, nx, ny, cell, x0, y0, mask, rows);
  const sd = signedDistance(mask, nx, ny, cell);
  const sample = (x: number, y: number) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell);
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1e3 : sd[j * nx + i];
  };
  const loops0 = isoContours(sd, nx, ny, -kerf / 2, cell, x0, y0).filter((l) => l.length > 6).map((l) => simplifyClosed(l, 0.04));
  // classify: a loop is a hole when the material (sd > 0) is outside it
  const info = loops0.map((lp) => {
    const area = Math.abs(polyArea(lp));
    // test a point just outside the loop's first segment, to the left / right of travel
    const a = lp[0], b = lp[1];
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    const nxv = -ty / tl, nyv = tx / tl, eps = Math.max(0.4, kerf);
    const sdL = sample((a[0] + b[0]) / 2 + nxv * eps, (a[1] + b[1]) / 2 + nyv * eps), sdR = sample((a[0] + b[0]) / 2 - nxv * eps, (a[1] + b[1]) / 2 - nyv * eps);
    const matSide = sdL > sdR ? [nxv, nyv] : [-nxv, -nyv];
    // is the loop encircling material? compare orientation: material on the inside of an outer loop
    const signed = polyArea(lp);
    const ccw = signed > 0;
    const matLeft = sdL > sdR;
    const outer = ccw === matLeft; // CCW loop with material on the left = outer boundary
    return { lp, area, outer, matSide };
  });
  const holes = info.filter((q) => !q.outer).sort((a, b) => a.area - b.area);
  const outers = info.filter((q) => q.outer).sort((a, b) => a.area - b.area);
  const order = [...holes, ...outers];
  if (!order.length) warnings.push('No cuttable outline was found: the model may not be a closed solid.');

  const cmds: Cmd[] = [];
  cmds.push({ k: 'setup', name: 'Sheet setup', a: 0, c: 0, wcs: req.stock.wcs, index: false });
  const tool: Tool = { id: req.process, kind: 'flat', name: req.process === 'laser' ? `${cd.power} W laser, ${cd.assist} assist` : `${cd.power} A plasma torch`, d: kerf, flutes: 1, fluteLen: 0, stickout: 0, holderD: 20, material: 'carbide', coating: '' };
  cmds.push({ k: 'op', name: 'Profile cut', tool: 1, rpm: cd.power, coolant: false, spindle: false, note: `Kerf ${kerf} mm, pierce ${cd.pierce} s` });
  let x = 0, y = 0, feedLen = 0, rapidLen = 0, minutes = 0, pierces = 0;
  const loops: { pts: [number, number][]; inside: boolean }[] = [];
  const rapid = (X: number, Y: number) => { rapidLen += Math.hypot(X - x, Y - y); minutes += Math.hypot(X - x, Y - y) / ((M.rapid ?? 12000) * 0.7); cmds.push({ k: 'rapid', x: +X.toFixed(3), y: +Y.toFixed(3) }); x = X; y = Y; };
  const feed = (X: number, Y: number) => { const L = Math.hypot(X - x, Y - y); feedLen += L; minutes += L / cd.feed; cmds.push({ k: 'feed', x: +X.toFixed(3), y: +Y.toFixed(3), f: cd.feed }); x = X; y = Y; };
  const lead = Math.min(cd.leadIn, 6);
  // start point of each loop: the vertex nearest to the current position, preferring a gentle corner
  for (const q of order) {
    // rotate loop to start near the current point
    let bi = 0, bd = Infinity;
    q.lp.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; bi = i; } });
    const lp = [...q.lp.slice(bi), ...q.lp.slice(0, bi)];
    const a = lp[0], b = lp[1], prev = lp[lp.length - 1];
    const tx = b[0] - prev[0], ty = b[1] - prev[1], tl = Math.hypot(tx, ty) || 1;
    const t: P2 = [tx / tl, ty / tl];
    // scrap side = opposite the material side (for holes, the slug inside)
    const scrap: P2 = [-q.matSide[0], -q.matSide[1]];
    const pierce: P2 = [a[0] + scrap[0] * lead * 0.8 - t[0] * lead * 0.6, a[1] + scrap[1] * lead * 0.8 - t[1] * lead * 0.6];
    rapid(pierce[0], pierce[1]);
    cmds.push({ k: 'on', on: true, pierce: cd.pierce }); pierces++; minutes += cd.pierce / 60;
    feed(a[0], a[1]);
    for (let i = 1; i < lp.length; i++) feed(lp[i][0], lp[i][1]);
    feed(a[0], a[1]);
    feed(a[0] + t[0] * Math.min(1.5, lead * 0.4), a[1] + t[1] * Math.min(1.5, lead * 0.4));
    cmds.push({ k: 'on', on: false });
    loops.push({ pts: [pierce, ...lp, a] as [number, number][], inside: !q.outer });
  }
  rapid(0, 0);
  const ops: OpSummary[] = [{
    id: 1, name: 'Profile cut', strategy: `${holes.length} hole${holes.length === 1 ? '' : 's'} first, then the outside; ${pierces} pierces`, toolNo: 1, toolName: tool.name,
    rpm: cd.power, feed: cd.feed, ap: thick, ae: kerf, mrr: +(cd.feed * thick * kerf / 1000).toFixed(1), powerKw: 0, length: feedLen, time: minutes, startCmd: 1, endCmd: cmds.length, setup: 0,
    notes: [`Kerf compensated by ${kerf / 2} mm per side`, `Lead-in ${lead} mm into the scrap`, req.process === 'laser' ? `Assist gas ${cd.assist}` : `Torch height ${cd.standoff} mm`],
  }];
  const tu: ToolUse = { n: 1, tool, rpm: cd.power, minutes, ops: 1 };
  void polyLen;
  return {
    kind: 'cut', process: req.process, controller: req.controller, machine: M, name: 'FAELYX_CUT', unit: 'mm', cmds, ops, tools: [tu],
    stock: { ...req.stock, box: [sheet[0], sheet[1], thick] }, sims: [], cut: { thickness: thick, sheet, kerf, loops },
    warnings, totalTime: minutes, rapidLength: rapidLen, feedLength: feedLen, partVolume: 0, removedVolume: 0,
  };
}
