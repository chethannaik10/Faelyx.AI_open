// 3-axis / 3+2 / 5-axis milling planner. Works on a 2.5-D height-field model of the part
// seen along the tool axis: the stock surface S(x,y) and the finished surface T(x,y).
//
//   rough   – z-level raster clearing (HEM-style light radial engagement), flute-length and
//             holder aware, fixtures treated as obstacles, ramp / plunge entry
//   rest    – same machinery with a smaller tool where the first tool could not reach
//   drill   – round holes found in the model: G81 / G83 cycles grouped per drill
//   floors  – flat faces at their exact height
//   walls   – z-level contours of the distance field, climb direction
//   surface – parallel-raster drop-cutter finishing with a ball nose (or 5-axis lead/tilt)

import {
  type Mesh, type HF, type HoleFeature, type V3, type P2, rasterTop, components, distToZero, findHoles, flatLevels, classifySurface, isoContours,
  simplify, simplifyClosed, rotateAC, transformMesh, meshStats, hfAt, signedDistance, dilateFlat, dilateMask,
} from './geometry';
import {
  type MachineDef, type StockMaterial, type StockSetup, type MillSettings, type Tool, TOOL_LIBRARY, type ControllerId, type ProcessId, WCS_LIST, toolById,
} from './camData';
import { type Cmd, type OpSummary, type Program, type SimSetup, type Box3, type ToolUse } from './toolpath';
import { millFeeds, peckFor, type Feeds } from './feeds';

export type MillProcess = 'mill3' | 'mill5i' | 'mill5s';
export type UpAxis = '+Z' | '-Z' | '+X' | '-X' | '+Y' | '-Y';

export interface MillRequest {
  mesh: Mesh; process: MillProcess; machine: MachineDef; controller: ControllerId;
  material: StockMaterial; stock: StockSetup; opts: MillSettings;
  up?: UpAxis;
  tools?: { rough?: string; finish?: string; ball?: string };
  allSides?: boolean;
}

export interface ToolAssign { role: string; tool: Tool; reason: string }
export interface StrategyItem { id: 'rough' | 'rest' | 'drill' | 'floor' | 'wall' | 'surface' | 'five' | 'index'; title: string; detail: string; tool?: string; on: boolean; metric?: string }
export interface MillAnalysis {
  size: V3; volume: number; tris: number; watertight: boolean;
  holes: HoleFeature[]; levels: number[]; surface: { flat: number; slope: number; wall: number };
  stockBox: V3; removalVolume: number; holeGroups: { d: number; drill: number | null; count: number; through: number }[];
  sideSetups: { name: string; a: number; c: number; holes: number }[];
  toolAssign: ToolAssign[]; strategy: StrategyItem[]; warnings: string[]; cell: number;
}
export interface MillResult { program: Program; analysis: MillAnalysis }

// ---------------------------------------------------------------------------

const DRILLS = TOOL_LIBRARY.filter((t) => t.kind === 'drill');
const FLATS = TOOL_LIBRARY.filter((t) => t.kind === 'flat');
const BALLS = TOOL_LIBRARY.filter((t) => t.kind === 'ball');

interface Frame {
  name: string; a: number; c: number;
  cell: number; nx: number; ny: number; x0: number; y0: number;
  T0: Float32Array; T: Float32Array; Tplan: Float32Array;
  inStock: Uint8Array; footprint: Uint8Array; S0: Float32Array; fixTop: Float32Array;
  stockBox: SimSetup['stockBox']; partBox: SimSetup['partBox']; fixtures: Box3[];
  zSafe: number; partTop: number; partBottom: number; stockBottom: number;
  holes: HoleFeature[]; drillHoles: DrillHole[];
  mesh: Mesh; originShift: [number, number, number];
  warnings: string[]; stockSize: V3;
}
interface DrillHole extends HoleFeature { drill: Tool | null; fillZ: number }

const ROT: Record<UpAxis, [number, number]> = { '+Z': [0, 0], '-Z': [180, 0], '+X': [90, 90], '-X': [90, -90], '+Y': [90, 0], '-Y': [90, 180] };

function sideSetupsFor(): { name: string; a: number; c: number }[] {
  return [{ name: 'Side +X', a: 90, c: 90 }, { name: 'Side −X', a: 90, c: -90 }, { name: 'Side +Y', a: 90, c: 0 }, { name: 'Side −Y', a: 90, c: 180 }];
}

function autoCell(req: MillRequest, sx: number, sy: number): number {
  if (req.opts.cell > 0) return req.opts.cell;
  return Math.min(0.6, Math.max(0.25, Math.max(sx, sy) / 240));
}

function nearestDrill(d: number): Tool | null {
  let best: Tool | null = null, bd = 1e9;
  for (const t of DRILLS) { const e = Math.abs(t.d - d); if (e < bd) { bd = e; best = t; } }
  return best && bd <= 0.4 ? best : null;
}

function buildFrame(req: MillRequest, mesh0: Mesh, name: string, a: number, c: number, fixedStock: boolean, primary: boolean): Frame {
  const { stock, opts } = req;
  const warnings: string[] = [];
  const m = mesh0;
  const pw = m.max[0] - m.min[0], ph = m.max[1] - m.min[1], pz = m.max[2] - m.min[2];
  const round = stock.shape === 'cylinder';
  let SX: number, SY: number, SZ: number;
  if (!fixedStock || stock.auto) {
    if (round) { SX = SY = Math.hypot(pw, ph) + 2 * stock.margin; }
    else { SX = pw + 2 * stock.margin; SY = ph + 2 * stock.margin; }
    SZ = stock.topAllow + pz + Math.max(3, stock.holdDepth);
  } else {
    [SX, SY, SZ] = stock.size;
    if (round) { SX = SY = Math.max(SX, SY); }
    if (SX < pw - 1e-6 || SY < ph - 1e-6) warnings.push(`Stock footprint ${SX.toFixed(0)} × ${SY.toFixed(0)} mm is smaller than the part (${pw.toFixed(1)} × ${ph.toFixed(1)}).`);
    if (round && Math.hypot(pw, ph) > SX + 1e-6) warnings.push(`Round stock Ø${SX.toFixed(0)} mm does not enclose the part diagonal (${Math.hypot(pw, ph).toFixed(1)} mm).`);
    if (SZ < pz + stock.topAllow) warnings.push(`Stock height ${SZ.toFixed(1)} mm is shorter than the part plus top allowance (${(pz + stock.topAllow).toFixed(1)} mm).`);
  }
  const sx0 = stock.origin === 'top-center' ? -SX / 2 : 0, sy0 = stock.origin === 'top-center' ? -SY / 2 : 0;
  const sx1 = sx0 + SX, sy1 = sy0 + SY;
  const dx = sx0 + (SX - pw) / 2 - m.min[0], dy = sy0 + (SY - ph) / 2 - m.min[1], dz = -stock.topAllow - m.max[2];
  const mesh = transformMesh(m, (x, y, z) => [x + dx, y + dy, z + dz]);
  const partTop = -stock.topAllow, partBottom = partTop - pz, stockBottom = -SZ;
  const holdEff = partBottom - stockBottom;
  if (holdEff < 3) warnings.push(`Only ${Math.max(0, holdEff).toFixed(1)} mm of stock is left below the part for the vise: raise the stock or machine fewer sides.`);

  // fixtures
  const fixtures: Box3[] = [];
  const cy = (sy0 + sy1) / 2;
  if (stock.hold === 'vise' || stock.hold === 'chuck') {
    const jt = stock.jawThick, jl = stock.jawLength, jh = Math.min(stock.jawHeight, SZ - 0.5);
    fixtures.push({ x0: sx0 - jt, x1: sx0, y0: cy - jl / 2, y1: cy + jl / 2, z0: stockBottom - 25, z1: stockBottom + jh, label: 'Vise jaw (left)' });
    fixtures.push({ x0: sx1, x1: sx1 + jt, y0: cy - jl / 2, y1: cy + jl / 2, z0: stockBottom - 25, z1: stockBottom + jh, label: 'Vise jaw (right)' });
    if (stockBottom + jh > partBottom + 1e-6) warnings.push(`Vise jaws rise ${(stockBottom + jh - partBottom).toFixed(1)} mm above the part bottom: the tool cannot cut the outline down to the base and stock beside the jaws is left.`);
  } else if (stock.hold === 'clamps') {
    const ov = 3, top = 5, ty = [sy0 + SY * 0.25, sy0 + SY * 0.75];
    for (const yy of ty) {
      fixtures.push({ x0: sx0 - 22, x1: sx0 + ov, y0: yy - 9, y1: yy + 9, z0: stockBottom, z1: top, label: 'Toe clamp' });
      fixtures.push({ x0: sx1 - ov, x1: sx1 + 22, y0: yy - 9, y1: yy + 9, z0: stockBottom, z1: top, label: 'Toe clamp' });
    }
  }
  const plateTop = stockBottom;
  fixtures.push({ x0: sx0 - 60, x1: sx1 + 60, y0: sy0 - 60, y1: sy1 + 60, z0: plateTop - 20, z1: plateTop - 0.01, label: stock.hold === 'plate' ? 'Fixture plate' : 'Table' });
  const zSafe = Math.max(0, ...fixtures.map((f) => f.z1)) + Math.max(2, opts.clearance);

  // grid
  const cell = autoCell(req, SX, SY);
  const gm = (stock.hold === 'vise' ? stock.jawThick : 12) + 16;
  const gx0 = sx0 - gm, gy0 = sy0 - gm;
  const nx = Math.ceil((SX + 2 * gm) / cell), ny = Math.ceil((SY + 2 * gm) / cell);
  const T0hf = rasterTop(mesh, gx0, gy0, nx, ny, cell);
  const T0 = T0hf.z;
  const inStock = new Uint8Array(nx * ny);
  const rs = SX / 2, cxs = (sx0 + sx1) / 2;
  for (let j = 0; j < ny; j++) {
    const y = gy0 + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const x = gx0 + (i + 0.5) * cell;
      const inside = round ? Math.hypot(x - cxs, y - cy) <= rs : x >= sx0 && x <= sx1 && y >= sy0 && y <= sy1;
      inStock[j * nx + i] = inside ? 1 : 0;
    }
  }
  // footprint: filled silhouette of the part (enclosed holes included)
  const unc = new Uint8Array(nx * ny);
  for (let k = 0; k < unc.length; k++) unc[k] = T0[k] > -Infinity ? 0 : 1;
  const outside = new Uint8Array(nx * ny);
  for (const comp of components(unc, nx, ny)) if (comp.touchesEdge) for (const k of comp.cells) outside[k] = 1;
  const footprint = new Uint8Array(nx * ny);
  for (let k = 0; k < footprint.length; k++) footprint[k] = outside[k] ? 0 : 1;

  // holes
  const holes = findHoles(T0hf, footprint, partBottom, 1.5, 40);
  const drillHoles: DrillHole[] = [];
  const T = new Float32Array(nx * ny).fill(-Infinity);
  for (let k = 0; k < T.length; k++) if (inStock[k]) T[k] = T0[k] > -Infinity ? Math.max(T0[k], partBottom) : partBottom;
  const Tplan = Float32Array.from(T);
  for (const h of holes) {
    const dr = nearestDrill(h.d);
    const fillZ = h.counterbore ? h.zTop - h.counterbore.depth : h.zTop;
    const dh: DrillHole = { ...h, drill: dr && h.d >= 2.5 && h.d <= 13.5 ? dr : null, fillZ };
    drillHoles.push(dh);
    if (dh.drill && opts.drill) {
      const rr = h.d / 2 + cell * 0.75;
      const i0 = Math.max(0, Math.floor((h.x - rr - gx0) / cell)), i1 = Math.min(nx - 1, Math.ceil((h.x + rr - gx0) / cell));
      const j0 = Math.max(0, Math.floor((h.y - rr - gy0) / cell)), j1 = Math.min(ny - 1, Math.ceil((h.y + rr - gy0) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = gx0 + (i + 0.5) * cell, y = gy0 + (j + 0.5) * cell;
        if (Math.hypot(x - h.x, y - h.y) <= rr && inStock[j * nx + i]) Tplan[j * nx + i] = Math.max(Tplan[j * nx + i], fillZ);
      }
    }
  }
  // fixture obstacle map
  const fixTop = new Float32Array(nx * ny).fill(-Infinity);
  for (const f of fixtures) {
    if (f.label === 'Table' || f.label === 'Fixture plate') continue;
    const i0 = Math.max(0, Math.floor((f.x0 - gx0) / cell)), i1 = Math.min(nx - 1, Math.ceil((f.x1 - gx0) / cell));
    const j0 = Math.max(0, Math.floor((f.y0 - gy0) / cell)), j1 = Math.min(ny - 1, Math.ceil((f.y1 - gy0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fixTop[j * nx + i] = Math.max(fixTop[j * nx + i], f.z1);
  }
  const S0 = new Float32Array(nx * ny).fill(-Infinity);
  for (let k = 0; k < S0.length; k++) if (inStock[k]) S0[k] = 0;
  void primary;
  return {
    name, a, c, cell, nx, ny, x0: gx0, y0: gy0, T0, T, Tplan, inStock, footprint, S0, fixTop,
    stockBox: { x0: sx0, y0: sy0, x1: sx1, y1: sy1, zTop: 0, zBottom: stockBottom, round },
    partBox: { x0: mesh.min[0], y0: mesh.min[1], z0: mesh.min[2], x1: mesh.max[0], y1: mesh.max[1], z1: mesh.max[2] },
    fixtures, zSafe, partTop, partBottom, stockBottom, holes, drillHoles, mesh, originShift: [dx, dy, dz], warnings, stockSize: [SX, SY, SZ],
  };
}

// ---------------------------------------------------------------------------
// Emitter

function maxDisc(fr: Frame, S: Float32Array, x: number, y: number, R: number): number {
  const { cell, nx, ny, x0, y0 } = fr;
  const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell), rc = Math.ceil(R / cell);
  let best = -Infinity;
  for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
    if (i * i + j * j > rc * rc) continue;
    const ii = ci + i, jj = cj + j;
    if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
    const v = S[jj * nx + ii];
    if (v > best) best = v;
  }
  return best;
}
/** Rapid down to just above whatever stands under the tool, then the caller feeds the rest. */
function entryTo(ctx: RoughCtx, x: number, y: number, R: number, L: number, plungeF: number) {
  const top = maxDisc(ctx.fr, ctx.S, x, y, R + ctx.fr.cell * 1.5);
  const zA = Math.max(L, Number.isFinite(top) ? top : L) + 1.0;
  if (ctx.em.z > zA + 0.01) ctx.em.rapid(undefined, undefined, r3(zA));
  ctx.em.feed(undefined, undefined, r3(L), plungeF);
}

class Emitter {
  cmds: Cmd[] = [];
  x = 0; y = 0; z = 0; haveXY = false;
  feedLen = 0; rapidLen = 0; feedMin = 0; rapidMin = 0;
  rapidRate: number;
  constructor(rapidRate: number) { this.rapidRate = Math.max(2000, rapidRate * 0.55); }
  push(c: Cmd) { this.cmds.push(c); }
  rapid(x?: number, y?: number, z?: number) {
    const nx = x ?? this.x, ny = y ?? this.y, nz = z ?? this.z;
    const L = this.haveXY ? Math.hypot(nx - this.x, ny - this.y, nz - this.z) : 0;
    this.rapidLen += L; this.rapidMin += L / this.rapidRate;
    this.cmds.push({ k: 'rapid', x, y, z });
    this.x = nx; this.y = ny; this.z = nz; this.haveXY = true;
  }
  feed(x: number | undefined, y: number | undefined, z: number | undefined, f: number) {
    const nx = x ?? this.x, ny = y ?? this.y, nz = z ?? this.z;
    const L = Math.hypot(nx - this.x, ny - this.y, nz - this.z);
    this.feedLen += L; this.feedMin += L / f;
    this.cmds.push({ k: 'feed', x, y, z, f });
    this.x = nx; this.y = ny; this.z = nz;
  }
  feed5(x: number, y: number, z: number, a: number, c: number, f: number) {
    const L = Math.hypot(x - this.x, y - this.y, z - this.z) + Math.abs(a - this.a) * 0.02 + Math.abs(c - this.c) * 0.0;
    this.feedLen += L; this.feedMin += L / f;
    this.cmds.push({ k: 'feed', x, y, z, a, c, f });
    this.x = x; this.y = y; this.z = z; this.a = a; this.c = c;
  }
  rapid5(a: number, c: number) {
    this.cmds.push({ k: 'rapid', a, c }); this.a = a; this.c = c;
  }
  a = 0; c = 0;
  mark() { return { cmd: this.cmds.length, fl: this.feedLen, rl: this.rapidLen, fm: this.feedMin, rm: this.rapidMin }; }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------------------
// Z-level raster roughing

interface RoughCtx { fr: Frame; em: Emitter; S: Float32Array; warn: string[]; plunges: number; ramps: number }

function runsInRow(ok: Uint8Array, nx: number, j: number): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let i = 0; i < nx; i++) {
    if (ok[j * nx + i]) { if (s < 0) s = i; } else if (s >= 0) { out.push([s, i - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, nx - 1]);
  return out;
}

function levelsFor(fr: Frame, ap: number, allowAxial: number, extraFlats: number[], startZ: number): number[] {
  // lowest level the roughing has to reach
  let zEnd = Infinity;
  for (let k = 0; k < fr.Tplan.length; k++) if (fr.inStock[k] && fr.Tplan[k] < zEnd) zEnd = fr.Tplan[k];
  zEnd += allowAxial;
  const lv: number[] = [];
  for (let z = startZ - ap; z > zEnd + ap * 0.25; z -= ap) lv.push(z);
  lv.push(zEnd);
  // land on flat faces: a floor level replaces a regular step within half a step, else it is inserted
  for (const f of extraFlats) {
    const z = f + allowAxial;
    if (z >= startZ - 0.2 || z < zEnd - 1e-6) continue;
    let bi = -1, bd = Infinity;
    lv.forEach((l, i) => { const d = Math.abs(l - z); if (d < bd) { bd = d; bi = i; } });
    if (bd < 1e-6) continue;
    if (bd < ap * 0.5 && bi >= 0 && Math.abs(lv[bi] - zEnd) > 1e-6) lv[bi] = z; else lv.push(z);
  }
  return [...new Set(lv.map((v) => +v.toFixed(4)))].sort((a, b) => b - a);
}

/** Volume (mm³) of stock that sits more than one depth step above the finished surface, away from wall allowance rings. */
function leftoverVolume(fr: Frame, S: Float32Array, allowAxial: number, allowRadial: number, ap: number): { vol: number; mask: Uint8Array } {
  const { nx, ny, cell } = fr;
  const obs = new Float32Array(nx * ny).fill(-Infinity);
  for (let k = 0; k < obs.length; k++) if (fr.inStock[k]) obs[k] = fr.Tplan[k];
  const ring = dilateFlat(obs, nx, ny, (allowRadial + 2 * cell) / cell);
  const mask = new Uint8Array(nx * ny);
  let vol = 0;
  for (let k = 0; k < mask.length; k++) {
    if (!fr.inStock[k] || fr.fixTop[k] > fr.Tplan[k] - 1) continue;
    const lv = S[k] - (fr.Tplan[k] + allowAxial);
    if (lv > ap * 1.05 + 0.1 && ring[k] - fr.Tplan[k] < ap * 0.5) { mask[k] = 1; vol += lv * cell * cell; }
  }
  return { vol, mask };
}

function pointFree(fr: Frame, S: Float32Array, x: number, y: number, R: number, z: number): boolean {
  const { cell, nx, ny, x0, y0 } = fr;
  const test = (px: number, py: number) => {
    const i = Math.floor((px - x0) / cell), j = Math.floor((py - y0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return true;
    return !(S[j * nx + i] > z + 0.05);
  };
  if (!test(x, y)) return false;
  for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; if (!test(x + Math.cos(t) * R * 0.95, y + Math.sin(t) * R * 0.95)) return false; }
  return true;
}

interface RoughParams { tool: Tool; feeds: Feeds; allowRadial: number; allowAxial: number; label: string; restOnly: boolean }

function roughPass(ctx: RoughCtx, P: RoughParams, flats: number[]): { length: number; levels: number } {
  const { fr, em } = ctx;
  const { cell, nx, ny, x0, y0 } = fr;
  const R = P.tool.d / 2, ap = P.feeds.ap, ae = P.feeds.ae;
  const S = ctx.S;
  // accessibility maps (tool centre positions that are collision free at tip height L)
  const obsPart = new Float32Array(nx * ny);
  for (let k = 0; k < obsPart.length; k++) obsPart[k] = fr.inStock[k] ? fr.Tplan[k] + P.allowAxial : -Infinity;
  const TdilPart = dilateFlat(obsPart, nx, ny, (R + P.allowRadial) / cell);
  const TdilFix = dilateFlat(fr.fixTop, nx, ny, (R + 1.0) / cell);
  const holderR = P.tool.holderD / 2;
  const partNoAllow = new Float32Array(nx * ny);
  for (let k = 0; k < partNoAllow.length; k++) partNoAllow[k] = fr.inStock[k] ? fr.Tplan[k] : -Infinity;
  const TdilHolder = dilateFlat(partNoAllow, nx, ny, (holderR + 1) / cell);
  const reach = P.tool.stickout;
  const levels = levelsFor(fr, ap, P.allowAxial, flats, 0);
  const nStock = (() => { let c = 0; for (let k = 0; k < fr.inStock.length; k++) c += fr.inStock[k]; return c; })();
  void nStock;
  let totalLen = 0, doneLevels = 0;
  let dirFlip = false;
  const sx0 = fr.stockBox.x0, sx1 = fr.stockBox.x1, sy0 = fr.stockBox.y0, sy1 = fr.stockBox.y1;

  for (const L of levels) {
    const A = new Uint8Array(nx * ny);
    for (let k = 0; k < A.length; k++) {
      A[k] = Math.max(TdilPart[k], TdilFix[k]) <= L + 1e-4 && TdilHolder[k] <= L + reach ? 1 : 0;
    }
    const need = new Uint8Array(nx * ny);
    let anyNeed = false;
    for (let k = 0; k < need.length; k++) if (fr.inStock[k] && S[k] > L + 0.02 && fr.fixTop[k] < L - 0.5) { need[k] = 1; anyNeed = true; }
    if (!anyNeed) continue;
    const Sdil = dilateFlat(S, nx, ny, (R + 0.5) / cell);
    const nearNeed = dilateMask(need, nx, ny, R, cell);
    const cand = new Uint8Array(nx * ny);
    let anyCand = false;
    for (let k = 0; k < cand.length; k++) if (A[k] && nearNeed[k] && !(Sdil[k] > L + P.tool.fluteLen + 0.15)) { cand[k] = 1; anyCand = true; }
    if (!anyCand) continue;
    // line positions
    const yFirst = sy0 - R + ae * 0.5, yLast = sy1 + R - ae * 0.5;
    const lines: { y: number; spans: [number, number][] }[] = [];
    for (let y = yFirst; y <= yLast + 1e-9; y += ae) {
      const j = Math.floor((y - y0) / cell);
      if (j < 0 || j >= ny) continue;
      const runs = runsInRow(cand, nx, j).map(([a, b]) => [x0 + (a + 0.5) * cell, x0 + (b + 0.5) * cell] as [number, number]).filter(([a, b]) => b - a >= cell * 0.9 || true);
      // trim runs that begin/end far outside the stock: keep only R beyond the stock edge
      const trimmed: [number, number][] = [];
      for (const [a, b] of runs) {
        const aa = Math.max(a, sx0 - R - 1), bb = Math.min(b, sx1 + R + 1);
        if (bb - aa >= cell * 0.9) trimmed.push([aa, bb]);
      }
      if (trimmed.length) lines.push({ y, spans: trimmed });
    }
    if (!lines.length) continue;
    doneLevels++;
    em.push({ k: 'comment', text: `${P.label}: level Z${r3(L)}` });
    const visit = new Uint8Array(nx * ny);
    let first = true;
    // pocket-by-pocket ordering: sort lines by y, alternating direction
    for (const ln of lines) {
      const spans = dirFlip ? [...ln.spans].reverse() : ln.spans;
      for (const sp of spans) {
        let [xa, xb] = sp;
        if (dirFlip) [xa, xb] = [xb, xa];
        // skip spans where nothing remains
        let hasWork = false;
        const xl = Math.min(xa, xb), xr = Math.max(xa, xb);
        for (let x = xl - R; x <= xr + R + 1e-9 && !hasWork; x += cell) {
          const i = Math.floor((x - x0) / cell);
          if (i < 0 || i >= nx) continue;
          for (const dy2 of [0, -R * 0.8, R * 0.8]) {
            const j = Math.floor((ln.y + dy2 - y0) / cell);
            if (j >= 0 && j < ny && need[j * nx + i]) { hasWork = true; break; }
          }
        }
        if (!hasWork) continue;
        // slot fraction on the leading edge
        let slotN = 0, slotTot = 0;
        for (let x = xl; x <= xr + 1e-9; x += cell * 2) {
          slotTot++;
          const sBack = hfAt({ nx, ny, cell, x0, y0, z: S }, x, ln.y - R + ae * 0.3);
          if (sBack > L + 0.05) slotN++;
        }
        const isSlot = slotTot > 0 && slotN / slotTot > 0.6 && !first;
        const fCut = isSlot ? Math.round(P.feeds.feed * 0.6) : P.feeds.feed;
        // prefer entering at the end that is already in air / cleared ground
        if (!pointFree(fr, S, xa, ln.y, R, L) && pointFree(fr, S, xb, ln.y, R, L)) [xa, xb] = [xb, xa];
        // link from current position
        const startFree = pointFree(fr, S, xa, ln.y, R, L);
        const here = { x: em.x, y: em.y, z: em.z };
        const sameLevel = !first && Math.abs(here.z - L) < 0.05;
        let linked = false;
        if (sameLevel) {
          const gap = Math.hypot(xa - here.x, ln.y - here.y);
          if (gap < Math.max(2.5 * ae, R * 2.5)) {
            let ok = true;
            const n = Math.max(2, Math.ceil(gap / cell));
            for (let q = 1; q <= n && ok; q++) {
              const px = here.x + ((xa - here.x) * q) / n, py = here.y + ((ln.y - here.y) * q) / n;
              const i = Math.floor((px - x0) / cell), j = Math.floor((py - y0) / cell);
              if (i < 0 || j < 0 || i >= nx || j >= ny || !A[j * nx + i]) ok = false;
            }
            if (ok) { em.feed(r3(xa), r3(ln.y), undefined, fCut); linked = true; }
          }
        }
        if (!linked) {
          // retract (hop as low as safely possible), reposition, enter
          let hop = fr.zSafe;
          if (!first) {
            let zmax = L + ap;
            const gap = Math.hypot(xa - here.x, ln.y - here.y);
            const n = Math.max(2, Math.ceil(gap / cell));
            let ok = true;
            for (let q = 0; q <= n; q++) {
              const px = here.x + ((xa - here.x) * q) / n, py = here.y + ((ln.y - here.y) * q) / n;
              const i = Math.floor((px - x0) / cell), j = Math.floor((py - y0) / cell);
              if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
              const k = j * nx + i;
              const tm = Math.max(TdilPart[k], TdilFix[k], Sdil[k]);
              if (tm > zmax - 0.8) zmax = tm + 0.8;
              if (zmax > fr.zSafe) { ok = false; break; }
            }
            if (ok) hop = Math.min(fr.zSafe, Math.max(L + 1, zmax + 0.5));
          }
          if (!first || em.haveXY) { if (em.z < hop - 1e-6) em.rapid(undefined, undefined, hop); }
          else em.rapid(undefined, undefined, fr.zSafe);
          em.rapid(r3(xa), r3(ln.y), undefined);
          const iS = Math.floor((xa - x0) / cell), jS = Math.floor((ln.y - y0) / cell);
          const discTop = iS >= 0 && jS >= 0 && iS < nx && jS < ny ? Sdil[jS * nx + iS] : -Infinity;
          const zStart = Math.min(hfAt({ nx, ny, cell, x0, y0, z: S }, xa, ln.y), L + ap, 0);
          const zAbove = Math.max(L, Number.isFinite(discTop) ? discTop : L, Number.isFinite(zStart) ? zStart : L) + 1.0;
          if (em.z > zAbove + 0.01) em.rapid(undefined, undefined, r3(zAbove));
          if (startFree || !(zStart > L + 0.02)) {
            em.feed(undefined, undefined, r3(L), Math.round(P.feeds.plunge));
          } else {
            const len = Math.abs(xb - xa);
            if (len >= 2 * R && len > 2) {
              // ramp zig-zag along the span
              const tanA = Math.tan((3 * Math.PI) / 180);
              let z = Math.min(zStart, L + ap);
              let cx = xa, ox = xb;
              let guard = 0;
              ctx.ramps++;
              em.feed(undefined, undefined, r3(z), Math.round(P.feeds.plunge));
              while (z > L + 1e-3 && guard++ < 200) {
                const dz = Math.min(z - L, Math.abs(ox - cx) * tanA);
                z -= dz;
                em.feed(r3(ox), undefined, r3(z), Math.round(P.feeds.plunge * 1.2));
                [cx, ox] = [ox, cx];
              }
              // finish the span flat from wherever the ramp ended
              if (Math.abs(cx - xb) > 1e-6) { em.feed(r3(xb), undefined, undefined, fCut); }
              [xa, xb] = [xb, xa]; // end of span now at the original start
              void xa;
              // mark visited and continue (the span has been cut in one direction by the flat pass)
              for (let x = xl; x <= xr + 1e-9; x += cell * 0.5) {
                const i = Math.floor((x - x0) / cell), j = Math.floor((ln.y - y0) / cell);
                if (i >= 0 && j >= 0 && i < nx && j < ny) visit[j * nx + i] = 1;
              }
              totalLen += len;
              first = false;
              continue;
            }
            ctx.plunges++;
            em.feed(undefined, undefined, r3(L), Math.round(P.feeds.plunge * 0.6));
          }
        }
        em.feed(r3(xb), r3(ln.y), r3(L), fCut);
        totalLen += Math.abs(xb - xa);
        for (let x = xl; x <= xr + 1e-9; x += cell * 0.5) {
          const i = Math.floor((x - x0) / cell), j = Math.floor((ln.y - y0) / cell);
          if (i >= 0 && j >= 0 && i < nx && j < ny) visit[j * nx + i] = 1;
        }
        first = false;
      }
      dirFlip = !dirFlip;
    }
    // update the stock model: everything within R of the visited centres is now at (at most) L
    const cleared = dilateMask(visit, nx, ny, R, cell);
    for (let k = 0; k < S.length; k++) if (cleared[k] && S[k] > L && fr.inStock[k]) S[k] = L;
    // profile pass: the raster lines stop a fraction of a step short of the wall allowance, trim that ring
    {
      const rem = new Uint8Array(nx * ny);
      let anyRem = false;
      for (let k = 0; k < rem.length; k++) if (need[k] && S[k] > L + 0.02) { rem[k] = 1; anyRem = true; }
      if (anyRem) {
        const nearRem = dilateMask(rem, nx, ny, R + 1.5 * cell, cell);
        const sdA = signedDistance(cand, nx, ny, cell);
        const loops = isoContours(sdA, nx, ny, cell * 0.5, cell, x0, y0);
        for (const lp0 of loops) {
          const lp = simplifyClosed(lp0, 0.02);
          let cur: P2[] = [];
          const pieces: P2[][] = [];
          const flush = () => { if (cur.length > 1 && polyLen(cur) > 0.8) pieces.push(cur); cur = []; };
          for (const p of lp) {
            const i = Math.floor((p[0] - x0) / cell), j = Math.floor((p[1] - y0) / cell);
            if (i < 0 || j < 0 || i >= nx || j >= ny) { flush(); continue; }
            if (nearRem[j * nx + i]) cur.push(p); else flush();
          }
          flush();
          for (const pc of pieces) {
            // the stretch outside the stock gains nothing
            if (em.z < fr.zSafe - 1e-6) em.rapid(undefined, undefined, fr.zSafe);
            em.rapid(r3(pc[0][0]), r3(pc[0][1]), undefined);
            entryTo(ctx, pc[0][0], pc[0][1], R, L, Math.round(P.feeds.plunge * 0.7));
            for (let q = 1; q < pc.length; q++) em.feed(r3(pc[q][0]), r3(pc[q][1]), r3(L), P.feeds.feed);
            totalLen += polyLen(pc);
            for (const p of pc) {
              const i = Math.floor((p[0] - x0) / cell), j = Math.floor((p[1] - y0) / cell);
              if (i >= 0 && j >= 0 && i < nx && j < ny) visit[j * nx + i] = 1;
            }
          }
        }
        const cleared2 = dilateMask(visit, nx, ny, R, cell);
        for (let k = 0; k < S.length; k++) if (cleared2[k] && S[k] > L && fr.inStock[k]) S[k] = L;
      }
    }
    em.rapid(undefined, undefined, fr.zSafe);
  }
  return { length: totalLen, levels: doneLevels };
}

// ---------------------------------------------------------------------------
// Floors (flat faces) — raster at the exact height

function floorPass(ctx: RoughCtx, tool: Tool, feeds: Feeds, flats: number[]): { length: number; count: number } {
  const { fr, em } = ctx;
  const { cell, nx, ny, x0, y0 } = fr;
  const R = tool.d / 2;
  const obs = new Float32Array(nx * ny);
  for (let k = 0; k < obs.length; k++) obs[k] = fr.inStock[k] ? fr.Tplan[k] : -Infinity;
  const Tdil = dilateFlat(obs, nx, ny, (R + 0.0) / cell);
  const Tfix = dilateFlat(fr.fixTop, nx, ny, (R + 1.0) / cell);
  const holderR = tool.holderD / 2;
  const Thold = dilateFlat(obs, nx, ny, (holderR + 1) / cell);
  let len = 0, count = 0;
  const ae = feeds.ae;
  for (const F of flats) {
    const region = new Uint8Array(nx * ny);
    let n = 0;
    for (let k = 0; k < region.length; k++) if (fr.inStock[k] && Math.abs(fr.Tplan[k] - F) < 0.04 && Math.abs(fr.T[k] - F) < 0.04) { region[k] = 1; n++; }
    if (n * cell * cell < 6) continue;
    const near = dilateMask(region, nx, ny, R, cell);
    const A = new Uint8Array(nx * ny);
    for (let k = 0; k < A.length; k++) A[k] = near[k] && Tdil[k] <= F + 1e-3 && Tfix[k] <= F + 1e-3 && Thold[k] <= F + tool.stickout ? 1 : 0;
    // keep only centres that cover at least one region cell within R and are inside the grid
    const yv = region; void yv;
    let minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < A.length; k++) if (A[k]) { const j = Math.floor(k / nx); if (j < minY) minY = j; if (j > maxY) maxY = j; }
    if (minY > maxY) continue;
    const ys0 = y0 + (minY + 0.5) * cell, ys1 = y0 + (maxY + 0.5) * cell;
    const step = Math.max(ae, cell);
    em.push({ k: 'comment', text: `Floor Z${r3(F)}` });
    let flip = false, any = false;
    for (let y = ys0; y <= ys1 + 1e-6; y += step) {
      const j = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
      let runs = runsInRow(A, nx, j).map(([a, b]) => [x0 + (a + 0.5) * cell, x0 + (b + 0.5) * cell] as [number, number]);
      if (flip) runs = runs.reverse().map(([a, b]) => [b, a] as [number, number]);
      for (const [xa, xb] of runs) {
        if (Math.abs(xb - xa) < cell * 0.5) continue;
        if (any && em.z === F && Math.hypot(xa - em.x, y - em.y) < R * 2) {
          // adjacent link inside the accessible set
          let ok = true;
          const nn = Math.max(2, Math.ceil(Math.hypot(xa - em.x, y - em.y) / cell));
          for (let q = 1; q <= nn && ok; q++) {
            const px = em.x + ((xa - em.x) * q) / nn, py = em.y + ((y - em.y) * q) / nn;
            const i = Math.floor((px - x0) / cell), jj = Math.floor((py - y0) / cell);
            if (!A[jj * nx + i]) ok = false;
          }
          if (ok) em.feed(r3(xa), r3(y), undefined, feeds.feed);
          else { em.rapid(undefined, undefined, fr.zSafe); em.rapid(r3(xa), r3(y), undefined); entryTo(ctx, xa, y, R, F, feeds.plunge); }
        } else {
          if (em.z < fr.zSafe - 1e-6) em.rapid(undefined, undefined, fr.zSafe);
          em.rapid(r3(xa), r3(y), undefined);
          entryTo(ctx, xa, y, R, F, feeds.plunge);
        }
        em.feed(r3(xb), r3(y), undefined, feeds.feed);
        len += Math.abs(xb - xa); any = true;
      }
      flip = !flip;
    }
    if (any) { count++; em.rapid(undefined, undefined, fr.zSafe); }
  }
  return { length: len, count };
}

// ---------------------------------------------------------------------------
// Wall contouring

function wallPass(ctx: RoughCtx, tool: Tool, feeds: Feeds): { length: number; levels: number } {
  const { fr, em } = ctx;
  const { cell, nx, ny, x0, y0 } = fr;
  const R = tool.d / 2;
  let zTop = -Infinity, zBot = Infinity;
  for (let k = 0; k < fr.T.length; k++) if (fr.inStock[k]) { if (fr.Tplan[k] > zTop) zTop = fr.Tplan[k]; if (fr.Tplan[k] < zBot) zBot = fr.Tplan[k]; }
  const apW = Math.max(1, Math.min(tool.fluteLen * 0.85, 12, feeds.ap));
  const levels: number[] = [];
  for (let z = zTop - apW; z > zBot + apW * 0.1; z -= apW) levels.push(z);
  levels.push(zBot);
  const fixD = dilateFlat(fr.fixTop, nx, ny, (R + 1.0) / cell);
  const holderR = tool.holderD / 2;
  const obs = new Float32Array(nx * ny);
  for (let k = 0; k < obs.length; k++) obs[k] = fr.inStock[k] ? fr.Tplan[k] : -Infinity;
  const holdD = dilateFlat(obs, nx, ny, (holderR + 1) / cell);
  let len = 0, nlev = 0;
  const sd: Float32Array = new Float32Array(nx * ny);
  for (const L of levels) {
    const P = new Uint8Array(nx * ny);
    let n = 0;
    for (let k = 0; k < P.length; k++) if (fr.inStock[k] && fr.Tplan[k] > L + 0.02) { P[k] = 1; n++; }
    if (n < 6) continue;
    // distance from the material region (mm); the tool-centre path is its R level set
    const inv = new Uint8Array(P.length);
    for (let k = 0; k < inv.length; k++) inv[k] = P[k] ? 0 : 1;
    const dd = distToZero(inv, nx, ny);
    for (let k = 0; k < sd.length; k++) sd[k] = -(dd[k] * cell - cell * 0.5); // negative distance: level -R is the offset curve
    // contour of "closeness": region where distance <= R  -> level set on -dist at -R
    const loops = isoContours(sd, nx, ny, -R, cell, x0, y0);
    // skip loops that are the outer edge of the grid (stock boundary far from material)
    const pieces: P2[][] = [];
    const sample = (x: number, y: number): number => {
      const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell);
      if (i < 0 || j < 0 || i >= nx || j >= ny) return Infinity;
      return -sd[j * nx + i];
    };
    for (const lp0 of loops) {
      const lp = simplifyClosed(lp0, 0.03);
      if (lp.length < 4) continue;
      // split where the position collides with a fixture / holder reach / lies far outside the stock
      let cur: P2[] = [];
      const flush = () => { if (cur.length > 1) pieces.push(cur); cur = []; };
      const closedAll = true;
      for (const p of lp) {
        const i = Math.floor((p[0] - x0) / cell), j = Math.floor((p[1] - y0) / cell);
        const k = j * nx + i;
        const bad = i < 0 || j < 0 || i >= nx || j >= ny || fixD[k] > L + 1e-3 || holdD[k] > L + tool.stickout;
        if (bad) flush(); else cur.push(p);
      }
      if (closedAll && cur.length && pieces.length && lp.length === cur.length + 0) { /* whole loop kept */ }
      const kept = cur.length === lp.length;
      if (kept) { cur.push(lp[0]); }
      flush();
      void kept;
    }
    if (!pieces.length) continue;
    // climb direction: material on the right of travel
    const oriented = pieces.map((pc) => {
      const m = Math.floor(pc.length / 2);
      const a = pc[Math.max(0, m - 1)], b = pc[Math.min(pc.length - 1, m + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const rx = ty / tl, ry = -tx / tl; // right-hand normal
      const probe = 2.5 * cell;
      const dRight = sample(pc[m][0] + rx * probe, pc[m][1] + ry * probe), dLeft = sample(pc[m][0] - rx * probe, pc[m][1] - ry * probe);
      return dRight < dLeft ? pc : [...pc].reverse();
    });
    // order pieces nearest-first from the current position
    const todo = [...oriented];
    em.push({ k: 'comment', text: `Wall finish: level Z${r3(L)}` });
    let any = false;
    while (todo.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < todo.length; i++) {
        const d = Math.hypot(todo[i][0][0] - em.x, todo[i][0][1] - em.y);
        if (d < bd) { bd = d; bi = i; }
      }
      const pc = todo.splice(bi, 1)[0];
      if (polyLen(pc) < 1.0) continue;
      if (em.z < fr.zSafe - 1e-6) em.rapid(undefined, undefined, fr.zSafe);
      em.rapid(r3(pc[0][0]), r3(pc[0][1]), undefined);
      entryTo(ctx, pc[0][0], pc[0][1], R, L, Math.round(feeds.plunge));
      for (let i = 1; i < pc.length; i++) em.feed(r3(pc[i][0]), r3(pc[i][1]), undefined, feeds.feed);
      len += polyLen(pc);
      any = true;
    }
    if (any) { nlev++; em.rapid(undefined, undefined, fr.zSafe); }
  }
  return { length: len, levels: nlev };
}
const polyLen = (p: P2[]) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };

// ---------------------------------------------------------------------------
// Ball-nose surface finishing (3-axis drop cutter, or 5-axis lead/tilt)

function surfacePass(ctx: RoughCtx, tool: Tool, feeds: Feeds, cusp: number, five: boolean, mach: MachineDef): { length: number; lines: number; maxTilt: number } {
  const { fr, em } = ctx;
  const { cell, nx, ny, x0, y0 } = fr;
  const R = tool.d / 2;
  const cls = classifySurface({ nx, ny, cell, x0, y0, z: fr.T } as HF, fr.footprint);
  const region = new Uint8Array(nx * ny);
  let n = 0;
  const flatLv = flatLevels({ nx, ny, cell, x0, y0, z: fr.T0 } as HF, fr.footprint);
  const isFlat = (z: number) => flatLv.some((f) => Math.abs(z - f) < 0.06);
  for (let k = 0; k < region.length; k++) {
    if (!fr.footprint[k] || !Number.isFinite(fr.T0[k])) continue;
    const sl = cls.slopeDeg[k];
    if (sl >= 78) continue;
    if (sl >= 4 || !isFlat(fr.T0[k] - fr.partBox.z1 * 0 - 0)) { if (sl >= 4 || !isFlat(fr.T0[k] + 0)) { region[k] = 1; n++; } }
  }
  if (n < 12) return { length: 0, lines: 0, maxTilt: 0 };
  const reg = dilateMask(region, nx, ny, Math.max(1.0, R * 0.35), cell);
  const step = Math.max(0.15, 2 * Math.sqrt(2 * R * cusp - cusp * cusp));
  // footprint offsets for the drop cutter
  const rc = Math.ceil(R / cell);
  const offs: { dx: number; dy: number; h: number }[] = [];
  for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
    const dx = i * cell, dy = j * cell, rr = Math.hypot(dx, dy);
    if (rr <= R) offs.push({ dx, dy, h: Math.sqrt(Math.max(0, R * R - rr * rr)) - R });
  }
  const tipAt = (x: number, y: number): number => {
    let best = -Infinity;
    const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell);
    for (const o of offs) {
      const i = ci + Math.round(o.dx / cell), j = cj + Math.round(o.dy / cell);
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const k = j * nx + i;
      if (!fr.inStock[k]) continue;
      const t = fr.T[k];
      const f = fr.fixTop[k];
      const v = Math.max(t, f) + o.h;
      if (v > best) best = v;
    }
    return best;
  };
  const normalAt = (x: number, y: number): V3 => {
    const g = (xx: number, yy: number) => { const v = hfAt({ nx, ny, cell, x0, y0, z: fr.T }, xx, yy); return Number.isFinite(v) ? v : 0; };
    const e = Math.max(cell, 0.3);
    const gx = (g(x + e, y) - g(x - e, y)) / (2 * e), gy = (g(x, y + e) - g(x, y - e)) / (2 * e);
    const l = Math.hypot(gx, gy, 1);
    return [-gx / l, -gy / l, 1 / l];
  };
  let len = 0, lines = 0, maxTilt = 0;
  const sx0 = fr.stockBox.x0, sx1 = fr.stockBox.x1, sy0 = fr.stockBox.y0, sy1 = fr.stockBox.y1;
  em.push({ k: 'comment', text: five ? 'Simultaneous 5-axis finishing (TCP active)' : `Parallel finishing, stepover ${step.toFixed(2)} mm` });
  let flip = false;
  const margin = 1.5;
  for (let y = sy0 + margin; y <= sy1 - margin + 1e-6; y += step) {
    const j = Math.floor((y - y0) / cell);
    let runs = runsInRow(reg, nx, j).map(([a, b]) => [x0 + (a + 0.5) * cell, x0 + (b + 0.5) * cell] as [number, number]);
    runs = runs.map(([a, b]) => [Math.max(sx0 + margin, a - 1.0), Math.min(sx1 - margin, b + 1.0)] as [number, number]).filter(([a, b]) => b - a > cell);
    if (flip) runs = runs.reverse().map(([a, b]) => [b, a] as [number, number]);
    for (const [xa, xb] of runs) {
      const L = Math.abs(xb - xa), nseg = Math.max(2, Math.ceil(L / (cell * 0.8)));
      const prof: { x: number; z: number; a?: number; c?: number; px?: number; py?: number; pz?: number; k?: number }[] = [];
      for (let q = 0; q <= nseg; q++) {
        const x = xa + ((xb - xa) * q) / nseg;
        const z = tipAt(x, y);
        if (!Number.isFinite(z)) continue;
        if (five) {
          const nrm = normalAt(x, y);
          // lead / tilt: blend vertical with the surface normal, limited to 35°
          let ax = nrm[0] * 0.75, ay = nrm[1] * 0.75, az = nrm[2] * 0.75 + 0.25;
          let al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
          const maxT = Math.cos((35 * Math.PI) / 180);
          if (az < maxT) { const s2 = Math.sqrt((1 - maxT * maxT) / Math.max(1e-9, ax * ax + ay * ay)); ax *= s2; ay *= s2; az = maxT; al = 1; }
          // the ball centre comes from the drop cutter (gouge-free on edges and concave corners); only the axis tilts
          prof.push({ x, z, px: x, py: y, pz: z + R, a: ax, c: ay, k: az });
        } else prof.push({ x, z });
      }
      if (prof.length < 2) continue;
      if (five) {
        // prof.px/py/pz = ball centre; a/c/k = wanted axis. Check shank clearance, limit the tilt rate, then place the tip.
        const hfT = { nx, ny, cell, x0, y0, z: fr.T };
        const free = (q: { px?: number; py?: number; pz?: number }, d: V3): boolean => {
          for (let s2 = R * 1.5; s2 <= tool.stickout; s2 += cell * 2) {
            const tt = hfAt(hfT, q.px! + s2 * d[0], q.py! + s2 * d[1]);
            if (Number.isFinite(tt) && tt > q.pz! + s2 * d[2] - R * 0.2) return false;
          }
          return true;
        };
        const ax: V3[] = prof.map((q) => { const d: V3 = [q.a!, q.c!, q.k!]; return free(q, d) ? d : [0, 0, 1]; });
        const maxStep = (7 * Math.PI) / 180;
        const limit = (from: V3, to: V3): V3 => {
          const ang = Math.acos(Math.min(1, Math.max(-1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2])));
          if (ang <= maxStep) return to;
          const t = maxStep / ang;
          const v: V3 = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
          const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l];
        };
        for (let q = 1; q < ax.length; q++) ax[q] = limit(ax[q - 1], ax[q]);
        for (let q = ax.length - 2; q >= 0; q--) ax[q] = limit(ax[q + 1], ax[q]);
        let cPrev = 0;
        for (let q = 0; q < prof.length; q++) {
          let d = ax[q];
          if (!free(prof[q], d)) d = [0, 0, 1];
          const pq = prof[q];
          pq.px = pq.px! - R * d[0]; pq.py = pq.py! - R * d[1]; pq.pz = pq.pz! - R * d[2];
          const tilt = (Math.acos(Math.min(1, d[2])) * 180) / Math.PI;
          let cd = Math.hypot(d[0], d[1]) > 1e-4 ? 90 - (Math.atan2(d[1], d[0]) * 180) / Math.PI : cPrev;
          while (cd - cPrev > 180) cd -= 360;
          while (cd - cPrev < -180) cd += 360;
          cPrev = cd;
          pq.a = tilt; pq.c = cd; maxTilt = Math.max(maxTilt, tilt);
        }
      }
      // thin the profile in (x,z)
      let pts: P2[] = prof.map((p) => [p.x, p.z]);
      if (!five) pts = simplify(pts, 0.008);
      const keep = five ? prof : pts.map((p) => prof.find((q) => q.x === p[0])!);
      if (em.z < fr.zSafe - 1e-6) em.rapid(undefined, undefined, fr.zSafe);
      const p0 = keep[0];
      em.rapid(r3(five ? p0.px! : p0.x), r3(five ? p0.py! : y), undefined);
      if (five) em.rapid5(r3(p0.a!), r3(p0.c!));
      {
        const near = maxDisc(fr, fr.Tplan, p0.x, y, five ? R * 1.7 + fr.cell : R + fr.cell);
        em.rapid(undefined, undefined, r3(Math.max((five ? p0.pz! : p0.z) + 1.5, Number.isFinite(near) ? near + 1.5 : -Infinity)));
      }
      em.feed(undefined, undefined, r3(five ? p0.pz! : p0.z), Math.round(feeds.plunge));
      for (let i = 1; i < keep.length; i++) {
        const p = keep[i];
        if (five) em.feed5(r3(p.px!), r3(p.py!), r3(p.pz!), r3(p.a!), r3(p.c!), feeds.feed);
        else em.feed(r3(p.x), r3(y), r3(p.z), feeds.feed);
      }
      len += L; lines++;
    }
    flip = !flip;
  }
  if (lines) {
    em.rapid(undefined, undefined, fr.zSafe);
    if (five) em.rapid5(0, 0);
  }
  void mach;
  return { length: len, lines, maxTilt };
}

// ---------------------------------------------------------------------------
// Drilling

// ---------------------------------------------------------------------------
// Tool selection

function chooseTools(req: MillRequest, fr: Frame, wide: number): { rough: Tool; finish: Tool; ball: Tool; rest: Tool | null; assigns: ToolAssign[] } {
  const m = req.machine;
  const pw = (m.powerKw ?? 5);
  const machineCap = pw < 3 ? 10 : pw < 8 ? 12 : 20;
  const sizeCap = Math.max(5, 0.3 * Math.min(fr.stockSize[0], fr.stockSize[1]));
  const pocketCap = Math.max(6, 0.75 * wide);
  const cap = Math.min(machineCap, sizeCap, pocketCap, 20);
  const pick = (list: Tool[], max: number, min = 0) => [...list].filter((t) => t.d <= max + 1e-9 && t.d >= min).sort((a, b) => b.d - a.d)[0] ?? list[0];
  const over = req.tools ?? {};
  let rough = (over.rough && toolById(over.rough)) || pick(FLATS, cap, 3);
  let finish = (over.finish && toolById(over.finish)) || pick(FLATS, Math.min(10, Math.max(4, rough.d * 0.65)), 3);
  let rest = pick(FLATS, Math.max(3, rough.d * 0.45), 2);
  let ball = (over.ball && toolById(over.ball)) || pick(BALLS, Math.min(8, Math.max(3, fr.stockSize[0] > 60 ? 6 : 4)), 3);
  // lowest point of the finished part below the stock top: every end mill needs flutes at least this long
  let depth = 0;
  for (let k = 0; k < fr.Tplan.length; k++) if (fr.inStock[k] && fr.Tplan[k] > -Infinity && -fr.Tplan[k] > depth) depth = -fr.Tplan[k];
  const longer = (t: Tool): Tool => {
    if (depth + 1 <= t.fluteLen) return t;
    const fl = Math.ceil((depth + 1) / 5) * 5;
    return { ...t, id: `${t.id}-L${fl}`, name: `${t.name} (long, ${fl} mm flutes)`, fluteLen: fl, stickout: Math.max(t.stickout, fl + 20) };
  };
  if (!over.rough) rough = longer(rough);
  if (!over.finish) finish = longer(finish);
  rest = longer(rest);
  if (!over.ball) ball = longer(ball);
  const assigns: ToolAssign[] = [
    { role: 'Roughing', tool: rough, reason: `Largest flat end mill that fits pockets of ≈${wide.toFixed(0)} mm and the ${m.powerKw ?? '?'} kW spindle.` },
    { role: 'Rest roughing', tool: rest, reason: 'Clears corners and slots the roughing tool cannot reach.' },
    { role: 'Floor / wall finishing', tool: finish, reason: 'Shorter-reach flat end mill for flat faces and vertical walls.' },
    { role: 'Surface finishing', tool: ball, reason: 'Ball nose for sculpted faces; diameter keeps cusp height below the target.' },
  ];
  return { rough, finish, ball, rest: rest.d < rough.d ? rest : null, assigns };
}

function pocketWidth(fr: Frame): number {
  const { nx, ny, cell } = fr;
  // pocket = footprint cells lying at least 1 mm below something higher within 10 mm
  const t = new Float32Array(nx * ny).fill(-Infinity);
  for (let k = 0; k < t.length; k++) if (fr.footprint[k] && fr.T0[k] > -Infinity) t[k] = fr.T0[k];
  const hi = dilateFlat(t, nx, ny, 10 / cell);
  const m = new Uint8Array(nx * ny);
  for (let k = 0; k < m.length; k++) m[k] = t[k] > -Infinity && hi[k] - t[k] > 1.0 ? 1 : 0;
  const d = distToZero(m, nx, ny);
  const best: number[] = [];
  for (const c of components(m, nx, ny, 12)) {
    let mx = 0;
    for (const k of c.cells) if (d[k] > mx) mx = d[k];
    best.push(mx * 2 * cell);
  }
  best.sort((a, b) => b - a);
  return best.length ? Math.max(6, best[0]) : 40;
}

// ---------------------------------------------------------------------------

function holeGroups(frH: DrillHole[]) {
  const g = new Map<number, DrillHole[]>();
  for (const h of frH) if (h.drill) { const k = h.drill.d; (g.get(k) ?? g.set(k, []).get(k)!).push(h); }
  return g;
}

export function analyseMill(req: MillRequest): MillAnalysis {
  const [ra, rc] = ROT[req.up ?? '+Z'];
  const mesh = ra || rc ? rotateAC(req.mesh, ra, rc) : req.mesh;
  const fr = buildFrame(req, mesh, 'Top', 0, 0, true, true);
  const stats = meshStats(req.mesh);
  const levels = flatLevels({ nx: fr.nx, ny: fr.ny, cell: fr.cell, x0: fr.x0, y0: fr.y0, z: fr.T0 } as HF, fr.footprint);
  const cls = classifySurface({ nx: fr.nx, ny: fr.ny, cell: fr.cell, x0: fr.x0, y0: fr.y0, z: fr.T0 } as HF, fr.footprint);
  const wide = pocketWidth(fr);
  const tools = chooseTools(req, fr, wide);
  const groups = holeGroups(fr.drillHoles);
  const warnings = [...fr.warnings];
  const env = req.machine.envelope;
  const [SX, SY, SZ] = fr.stockSize;
  if (req.machine.kind === 'subtractive' && req.machine.envelope[1] > 0 && (SX > env[0] + 1e-6 || SY > env[1] + 1e-6 || SZ > env[2] + 1e-6)) {
    warnings.push(`Stock ${SX.toFixed(0)} × ${SY.toFixed(0)} × ${SZ.toFixed(0)} mm exceeds the ${req.machine.model} travels (${env.join(' × ')} mm).`);
  }
  let removal = 0;
  for (let k = 0; k < fr.T.length; k++) if (fr.inStock[k]) removal += (0 - Math.max(fr.T[k], fr.partBottom)) * fr.cell * fr.cell;
  const sideSetups: MillAnalysis['sideSetups'] = [];
  if (req.process === 'mill5i' || req.allSides) {
    for (const s of sideSetupsFor()) {
      const rm = rotateAC(mesh, s.a, s.c);
      const n = countSideHoles(req, rm);
      sideSetups.push({ ...s, holes: n });
    }
  }
  const top = fr.partTop;
  const hasSlope = cls.stats.slope > 0.012;
  const strategy: StrategyItem[] = [];
  const f1 = millFeeds(tools.rough, req.material, req.machine, 'rough', { apOverride: req.opts.apRough ?? (cls.stats.slope > 0.012 ? 3 : undefined), aeOverride: req.opts.aeRough });
  strategy.push({
    id: 'rough', on: req.opts.rough, title: 'Adaptive-style roughing',
    detail: `Z-level raster with ${f1.ae.toFixed(1)} mm radial / ${f1.ap.toFixed(1)} mm axial engagement (light radial, deep axial) to hold constant load. Leaves ${req.opts.allowRadial} mm walls / ${req.opts.allowAxial} mm floors.`,
    tool: tools.rough.name, metric: `${Math.round(removal / 1000 * 10) / 10} cm³ to remove`,
  });
  strategy.push({ id: 'rest', on: req.opts.rough, title: 'Rest roughing', detail: 'A smaller end mill runs only where the roughing tool left material (inside corners, narrow slots). Skipped automatically if nothing is left.', tool: tools.rest?.name });
  if (groups.size) {
    const n = [...groups.values()].reduce((s, a) => s + a.length, 0);
    strategy.push({ id: 'drill', on: req.opts.drill, title: `Hole drilling cycles (${n} holes)`, detail: `${[...groups.entries()].map(([d, l]) => `${l.length}× Ø${d}`).join(', ')}. Peck cycle (G83) when depth exceeds 3×D, plain G81 otherwise; through holes break through by the drill point.`, tool: [...groups.values()].map((l) => l[0].drill!.name).join(', ') });
  } else strategy.push({ id: 'drill', on: false, title: 'Hole drilling cycles', detail: 'No round holes between 2.5 and 13.5 mm were recognised in the model.' });
  strategy.push({ id: 'floor', on: req.opts.finish && levels.length > 0, title: `Flat-face finishing (${levels.length} level${levels.length === 1 ? '' : 's'})`, detail: `Raster at exact face height at ${levels.map((l) => 'Z' + l.toFixed(1)).join(', ') || '—'}.`, tool: tools.finish.name });
  strategy.push({ id: 'wall', on: req.opts.finish && cls.stats.wall > 0.002, title: 'Vertical wall finishing', detail: 'Climb-milling contours at each depth step, path from the distance field offset by the tool radius; segments that would touch fixtures are dropped.', tool: tools.finish.name });
  strategy.push({
    id: req.process === 'mill5s' ? 'five' : 'surface', on: req.opts.finish && hasSlope,
    title: req.process === 'mill5s' ? '5-axis simultaneous finishing' : 'Surface finishing (ball nose)',
    detail: hasSlope
      ? `${(cls.stats.slope * 100).toFixed(1)} % of the footprint is sloped or curved. ${req.process === 'mill5s' ? 'The tool axis is tilted along the surface normal (≤35°) with TCP.' : `Parallel raster with a ${req.opts.cusp} mm cusp target.`}`
      : 'No sculpted surfaces found: ball-nose finishing is skipped.',
    tool: tools.ball.name,
  });
  if (sideSetups.length) strategy.push({ id: 'index', on: true, title: '3+2 indexed side setups', detail: sideSetups.map((s) => `${s.name}: ${s.holes} hole${s.holes === 1 ? '' : 's'}`).join(' · ') + '. Setups with round holes are added; other side features are not machined.' });
  void top;
  return {
    size: stats.size, volume: stats.volume, tris: stats.tris, watertight: stats.watertight, holes: fr.holes, levels, surface: cls.stats,
    stockBox: fr.stockSize, removalVolume: removal, holeGroups: [...fr.holes].reduce((acc: MillAnalysis['holeGroups'], h) => {
      const dd = nearestDrill(h.d);
      const e = acc.find((g) => Math.abs(g.d - Math.round(h.d * 2) / 2) < 0.01);
      if (e) { e.count++; if (h.through) e.through++; } else acc.push({ d: Math.round(h.d * 2) / 2, drill: dd ? dd.d : null, count: 1, through: h.through ? 1 : 0 });
      return acc;
    }, []), sideSetups, toolAssign: tools.assigns, strategy, warnings, cell: fr.cell,
  };
}

function countSideHoles(req: MillRequest, rotated: Mesh): number {
  const r2: MillRequest = { ...req, stock: { ...req.stock, auto: true } };
  const fr = buildFrame(r2, rotated, 'probe', 0, 0, false, false);
  return fr.drillHoles.filter((h) => h.drill).length;
}

// ---------------------------------------------------------------------------
// Main planner

export function planMill(req: MillRequest): MillResult {
  const analysis = analyseMill(req);
  const [ra, rc] = ROT[req.up ?? '+Z'];
  const baseMesh = ra || rc ? rotateAC(req.mesh, ra, rc) : req.mesh;
  const machine = req.machine, mat = req.material, opts = req.opts;
  const em = new Emitter(machine.rapid ?? 20000);
  const ops: OpSummary[] = [];
  const sims: SimSetup[] = [];
  const toolUse = new Map<number, ToolUse>();
  const toolNumbers = new Map<string, number>();
  const warnings: string[] = [...analysis.warnings];
  const toolNo = (t: Tool) => {
    let n = toolNumbers.get(t.id);
    if (!n) { n = toolNumbers.size + 1; toolNumbers.set(t.id, n); toolUse.set(n, { n, tool: t, rpm: 0, minutes: 0, ops: 0 }); }
    return n;
  };
  const setupDefs: { name: string; a: number; c: number; mesh: Mesh; holesOnly: boolean; wcs: string }[] = [
    { name: 'Top', a: 0, c: 0, mesh: baseMesh, holesOnly: false, wcs: req.stock.wcs },
  ];
  if (req.process === 'mill5i' || req.allSides) {
    let widx = WCS_LIST.indexOf(req.stock.wcs);
    for (const s of sideSetupsFor()) {
      const rm = rotateAC(baseMesh, s.a, s.c);
      const info = analysis.sideSetups.find((x) => x.name === s.name);
      if ((info?.holes ?? 0) > 0 || req.allSides) {
        widx = Math.min(WCS_LIST.length - 1, widx + 1);
        setupDefs.push({ name: s.name, a: s.a, c: s.c, mesh: rm, holesOnly: true, wcs: WCS_LIST[widx] });
      }
    }
  }
  let opId = 0;
  let totalRemoved = 0;
  let setupIdx = 0;
  for (const sd of setupDefs) {
    const fr = buildFrame(req, sd.mesh, sd.name, sd.a, sd.c, !sd.holesOnly, !sd.holesOnly);
    if (sd.holesOnly && (sd.name === 'Side −X' || sd.name === 'Side −Y') && setupDefs.some((q) => q.name === (sd.name === 'Side −X' ? 'Side +X' : 'Side +Y'))) {
      // a hole that goes through is drilled from the first side only
      for (const h of fr.drillHoles) if (h.through) h.drill = null;
    }
    if (sd.holesOnly) fr.warnings.forEach((w) => warnings.push(`${sd.name}: ${w}`));
    const startCmd = em.cmds.length;
    em.push({ k: 'setup', name: sd.name, a: sd.a, c: sd.c, wcs: sd.wcs, index: sd.holesOnly || sd.a !== 0 || sd.c !== 0 });
    em.haveXY = false;
    const wide = pocketWidth(fr);
    const tools = chooseTools(req, fr, wide);
    const ctx: RoughCtx = { fr, em, S: Float32Array.from(fr.S0), warn: warnings, plunges: 0, ramps: 0 };
    const flats = flatLevels({ nx: fr.nx, ny: fr.ny, cell: fr.cell, x0: fr.x0, y0: fr.y0, z: fr.T0 } as HF, fr.footprint).filter((z) => z >= fr.partBottom - 0.01);
    const floorLevels = [...new Set([...flats.map((z) => +z.toFixed(2)), +fr.partBottom.toFixed(2)])].filter((z) => z <= fr.partTop + 0.01);

    const beginOp = (name: string, strategy: string, tool: Tool, f: Feeds, note?: string) => {
      const tn = toolNo(tool);
      const mk = em.mark();
      em.push({ k: 'op', name, tool: tn, rpm: f.rpm, coolant: mat.coolant !== 'dry', spindle: true, note });
      em.haveXY = em.haveXY;
      return { tn, mk, name, strategy, tool, f };
    };
    const endOp = (h: ReturnType<typeof beginOp>, notes: string[] = []) => {
      const mk2 = em.mark();
      const feedMin = mk2.fm - h.mk.fm, rapidMin = mk2.rm - h.mk.rm;
      const time = feedMin + rapidMin + 0.1;
      ops.push({
        id: ++opId, name: h.name, strategy: h.strategy, toolNo: h.tn, toolName: h.tool.name, rpm: h.f.rpm, feed: h.f.feed, ap: h.f.ap, ae: h.f.ae,
        mrr: h.f.mrr, powerKw: h.f.powerKw, length: mk2.fl - h.mk.fl, time, startCmd: h.mk.cmd, endCmd: em.cmds.length, setup: setupIdx, notes: [...h.f.notes, ...notes],
      });
      const tu = toolUse.get(h.tn)!; tu.rpm = h.f.rpm; tu.minutes += time; tu.ops++;
    };

    if (!sd.holesOnly) {
      if (opts.rough) {
        const f = millFeeds(tools.rough, mat, machine, 'rough', { apOverride: opts.apRough ?? (analysis.surface.slope > 0.012 ? 3 : undefined), aeOverride: opts.aeRough });
        const h = beginOp('Adaptive roughing', 'Z-level raster, light radial engagement', tools.rough, f, `Leaves ${opts.allowRadial} mm radial / ${opts.allowAxial} mm axial`);
        const p0 = ctx.plunges + ctx.ramps;
        const res = roughPass(ctx, { tool: tools.rough, feeds: f, allowRadial: opts.allowRadial, allowAxial: opts.allowAxial, label: 'Rough', restOnly: false }, floorLevels);
        endOp(h, [`${res.levels} depth levels`, `${ctx.ramps} ramp entries`, `${ctx.plunges} plunge entries`]);
        if (res.levels === 0) { ops.pop(); em.cmds.splice(h.mk.cmd, em.cmds.length - h.mk.cmd); toolUse.get(h.tn)!.ops--; }
        void p0;
        const lo = leftoverVolume(fr, ctx.S, opts.allowAxial, opts.allowRadial, f.ap);
        const left = lo.vol;
        if (tools.rest && left > Math.max(80, 0.004 * Math.abs(analysis.removalVolume))) {
          const f2 = millFeeds(tools.rest, mat, machine, 'rest', { apOverride: opts.apRough, aeOverride: opts.aeRough });
          const h2 = beginOp('Rest roughing', `Ø${tools.rest.d} where Ø${tools.rough.d} could not reach`, tools.rest, f2);
          const r2 = roughPass(ctx, { tool: tools.rest, feeds: f2, allowRadial: opts.allowRadial, allowAxial: opts.allowAxial, label: 'Rest', restOnly: true }, floorLevels);
          endOp(h2, [`${(left / 1000).toFixed(1)} cm³ left by the first tool`, `${r2.levels} depth levels`]);
          if (r2.levels === 0) { ops.pop(); em.cmds.splice(h2.mk.cmd, em.cmds.length - h2.mk.cmd); toolUse.get(h2.tn)!.ops--; }
        }
        let rem = 0;
        for (let k = 0; k < ctx.S.length; k++) if (fr.inStock[k]) rem += (0 - ctx.S[k]) * fr.cell * fr.cell;
        const volLeft = leftoverVolume(fr, ctx.S, opts.allowAxial, opts.allowRadial, f.ap).vol;
        totalRemoved += rem;
        if (ctx.plunges) warnings.push(`${sd.name}: ${ctx.plunges} entr${ctx.plunges === 1 ? 'y' : 'ies'} plunge straight into material (no room to ramp): use centre-cutting tools or pre-drill start holes.`);
        if (volLeft > 150) warnings.push(`${sd.name}: about ${(volLeft / 1000).toFixed(1)} cm³ of stock stays above the allowance (blocked by fixtures, holder reach or inside corners).`);
      }
    }

    // drilling
    const groups = holeGroups(fr.drillHoles);
    if (opts.drill && groups.size) {
      const ordered = [...groups.entries()].sort((a, b) => b[0] - a[0]);
      for (const [, list] of ordered) {
        let tool = list[0].drill!;
        const needReach = Math.max(...list.map((q) => q.depth)) + 0.3 * tool.d + 4;
        if (needReach > tool.fluteLen) {
          const fl = Math.ceil(needReach / 5) * 5;
          tool = { ...tool, id: `${tool.id}-L${fl}`, name: `${tool.name} (long, ${fl} mm flutes)`, fluteLen: fl, stickout: fl + 20 };
          if (fl / tool.d > 12) warnings.push(`${sd.name}: Ø${tool.d} holes are ${(fl / tool.d).toFixed(0)}×D deep: use a gun drill or drill from both sides.`);
        }
        const f = millFeeds(tool, mat, machine, 'drill');
        const h = beginOp(`${sd.holesOnly ? sd.name + ' · ' : ''}Drill Ø${tool.d}`, `${list.length} hole${list.length === 1 ? '' : 's'}${list.some((x) => x.depth > tool.d * 3) ? ', peck cycle' : ', standard cycle'}`, tool, f);
        // nearest-neighbour order
        const todo = [...list]; let cx = 0, cy = 0;
        while (todo.length) {
          let bi = 0, bd = Infinity;
          todo.forEach((p, i) => { const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; bi = i; } });
          const p = todo.splice(bi, 1)[0]; cx = p.x; cy = p.y;
          const zTop = p.fillZ;
          const tip = 0.3 * tool.d;
          let zBot = p.through ? p.zBottom - tip : p.zBottom;
          if (zBot < fr.stockBottom + 1.5) { zBot = fr.stockBottom + 1.5; warnings.push(`${sd.name}: Ø${tool.d} hole at X${r3(p.x)} Y${r3(p.y)} stops ${r3(zBot - fr.stockBottom)} mm above the stock bottom so the drill does not touch the vise.`); }
          const depth = zTop - zBot;
          const q = peckFor(tool.d, depth, mat);
          em.rapid(undefined, undefined, fr.zSafe);
          em.rapid(r3(p.x), r3(p.y), undefined);
          em.cmds.push({ k: 'drill', x: r3(p.x), y: r3(p.y), z: r3(zBot), r: r3(zTop + 2), q, f: f.feed });
          em.x = p.x; em.y = p.y; em.z = zTop + 2;
          const L = depth;
          em.feedLen += L; em.feedMin += L / f.feed + (q ? (depth / q) * 0.003 : 0);
        }
        em.rapid(undefined, undefined, fr.zSafe);
        endOp(h, [list.some((x) => x.through) ? 'Breaks through by 0.3×D' : 'Blind', list.some((x) => x.counterbore) ? 'Counterbore pocketed with the roughing tool' : '']);
      }
    }

    if (!sd.holesOnly && opts.finish) {
      // floors
      const ff = millFeeds(tools.finish, mat, machine, 'floor');
      const hF = beginOp('Flat-face finishing', 'Raster at exact face height', tools.finish, ff);
      const fl = floorPass(ctx, tools.finish, ff, floorLevels);
      endOp(hF, [`${fl.count} face${fl.count === 1 ? '' : 's'}`]);
      if (!fl.count) { ops.pop(); em.cmds.splice(hF.mk.cmd, em.cmds.length - hF.mk.cmd); toolUse.get(hF.tn)!.ops--; }
      // walls
      const fw = millFeeds(tools.finish, mat, machine, 'wall');
      const hW = beginOp('Wall finishing', 'Z-level climb contours', tools.finish, fw);
      const wl = wallPass(ctx, tools.finish, fw);
      endOp(hW, [`${wl.levels} contour level${wl.levels === 1 ? '' : 's'}`]);
      if (!wl.levels) { ops.pop(); em.cmds.splice(hW.mk.cmd, em.cmds.length - hW.mk.cmd); toolUse.get(hW.tn)!.ops--; }
      // surfaces
      const fb = millFeeds(tools.ball, mat, machine, 'finish');
      const five = req.process === 'mill5s' && !!machine.processes.includes('mill5s');
      if (req.process === 'mill5s' && !machine.processes.includes('mill5s')) warnings.push(`${machine.model} has no simultaneous 5-axis capability: surface finishing falls back to 3-axis.`);
      const hS = beginOp(five ? '5-axis simultaneous finishing' : 'Surface finishing', five ? 'Ball nose with lead/tilt, TCP active' : 'Parallel drop-cutter raster', tools.ball, fb);
      if (five) em.cmds.splice(em.cmds.length, 0, { k: 'tcp', on: true });
      const sf = surfacePass(ctx, tools.ball, fb, opts.cusp, five, machine);
      if (five) em.cmds.push({ k: 'tcp', on: false });
      endOp(hS, [`${sf.lines} passes`, five ? `max tilt ${sf.maxTilt.toFixed(0)}°` : `cusp ≤ ${opts.cusp} mm`]);
      if (!sf.lines) { ops.pop(); em.cmds.splice(hS.mk.cmd, em.cmds.length - hS.mk.cmd); toolUse.get(hS.tn)!.ops--; }
    }

    em.rapid(undefined, undefined, fr.zSafe);
    const endCmd = em.cmds.length;
    sims.push({
      name: sd.name, a: sd.a, c: sd.c, cell: fr.cell, nx: fr.nx, ny: fr.ny, x0: fr.x0, y0: fr.y0,
      stock: sd.holesOnly ? fr.Tplan : fr.S0, target: fr.T, fixtures: fr.fixtures, stockBox: fr.stockBox, partBox: fr.partBox, startCmd, endCmd,
    });
    setupIdx++;
    // travel check in the setup frame
    const env = machine.envelope;
    const maxX = Math.max(fr.stockBox.x1 - fr.stockBox.x0, 0), maxY = Math.max(fr.stockBox.y1 - fr.stockBox.y0, 0);
    if (!sd.holesOnly && (maxX > env[0] || maxY > env[1])) warnings.push('Stock is larger than the machine X / Y travel.');
  }

  // drop empty setups (e.g. nothing to drill) and totals
  const used = new Set<number>(ops.map((o) => o.setup));
  void used;
  const stockInfo = (() => {
    const fr0 = sims[0];
    return { ...req.stock, box: [fr0.stockBox.x1 - fr0.stockBox.x0, fr0.stockBox.y1 - fr0.stockBox.y0, fr0.stockBox.zTop - fr0.stockBox.zBottom] as [number, number, number] };
  })();
  ops.forEach((o, i) => { o.id = i + 1; });
  const tools = [...toolUse.values()];
  const toolChange = tools.length * 0.15;
  const totalTime = ops.reduce((s, o) => s + o.time, 0) + toolChange;
  const stats = meshStats(req.mesh);
  const program: Program = {
    kind: 'mill', process: req.process, controller: req.controller, machine, name: 'FAELYX_CAM', unit: 'mm',
    cmds: em.cmds, ops, tools, stock: stockInfo, sims, warnings: [...new Set(warnings)], totalTime,
    rapidLength: em.rapidLen, feedLength: em.feedLen, partVolume: stats.volume, removedVolume: totalRemoved,
  };
  return { program, analysis };
}

export type { ProcessId };
