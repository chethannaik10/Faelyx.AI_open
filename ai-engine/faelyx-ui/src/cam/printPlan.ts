// Additive planner: raster slicer. Each layer is filled by a scan-line parity test, turned into a
// signed distance field, and the distance field is contoured at the wall offsets (perimeters),
// at the infill boundary and at the brim offsets. Top / bottom skin, overhangs and supports come
// from comparing neighbouring layer masks. Works for FDM and for laser / resin scan-vector output.

import { type Mesh, type V3, type P2, rotateAC, transformMesh, signedDistance, distToZero, isoContours, simplifyClosed, components, meshStats } from './geometry';
import { type MachineDef, type PrintMaterial, type PrintSettings, type ControllerId, type ProcessId } from './camData';
import type { UpAxis } from './millPlan';

export const PT = { travel: 0, skirt: 1, outer: 2, inner: 3, solid: 4, infill: 5, support: 6, scan: 7, hatch: 8, interface: 9 } as const;
export type PathTypeId = typeof PT[keyof typeof PT];
export const PT_NAMES = ['Travel', 'Skirt / brim', 'Outer wall', 'Inner wall', 'Top / bottom skin', 'Infill', 'Support', 'Contour scan', 'Hatch scan', 'Interface'];

export interface PrintRequest {
  mesh: Mesh; process: 'fdm' | 'sla' | 'sls' | 'dmls'; machine: MachineDef; controller: ControllerId;
  material: PrintMaterial; s: PrintSettings; up?: UpAxis;
}
export interface Overhang { layer: number; x: number; y: number; z: number; area: number; supported: boolean }
export interface LayerInfo { n: number; z: number; h: number; segStart: number; segEnd: number; areaMm2: number; timeS: number }
export interface PrintProgram {
  kind: 'print'; process: PrintRequest['process']; controller: ControllerId; machine: MachineDef; material: PrintMaterial; s: PrintSettings;
  layers: LayerInfo[];
  /** Flat segment buffers (bed coordinates, mm): x0 y0 z0 x1 y1 z1 per segment */
  segs: Float32Array; segType: Uint8Array; segLayer: Uint16Array; segE: Float32Array; segF: Float32Array; segFlag: Uint8Array;
  segCount: number;
  size: V3; offset: [number, number]; bed: V3;
  overhangs: Overhang[]; supportVolume: number;
  time: number; filamentMm: number; massG: number; partVolume: number;
  warnings: string[]; notes: string[];
  hatchUsed: number;
}
export const FLAG_RETRACT = 1, FLAG_HOP = 2;

class Seg {
  x0: number[] = []; y0: number[] = []; z0: number[] = []; x1: number[] = []; y1: number[] = []; z1: number[] = [];
  type: number[] = []; layer: number[] = []; e: number[] = []; f: number[] = []; flag: number[] = [];
  get n() { return this.type.length; }
}

export function polyLen(p: P2[]) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }

const ROT: Record<UpAxis, [number, number]> = { '+Z': [0, 0], '-Z': [180, 0], '+X': [90, 90], '-X': [90, -90], '+Y': [90, 0], '-Y': [90, 180] };

/** Scan-line parity fill of a mesh slice at height z onto a mask. */
export function sliceMask(m: Mesh, ids: Int32Array, from: number, to: number, z: number, nx: number, ny: number, cell: number, x0: number, y0: number, mask: Uint8Array, rows: number[][]) {
  for (let j = 0; j < ny; j++) rows[j].length = 0;
  const t = m.tris;
  for (let q = from; q < to; q++) {
    const f = ids[q] * 9;
    // classify vertices against the plane (>= z counts as above)
    const a = t[f + 2] >= z, b = t[f + 5] >= z, c = t[f + 8] >= z;
    if (a === b && b === c) continue;
    const pts: number[] = [];
    const edge = (i0: number, i1: number, s0: boolean, s1: boolean) => {
      if (s0 === s1) return;
      const za = t[f + i0 * 3 + 2], zb = t[f + i1 * 3 + 2];
      const u = (z - za) / (zb - za);
      pts.push(t[f + i0 * 3] + u * (t[f + i1 * 3] - t[f + i0 * 3]), t[f + i0 * 3 + 1] + u * (t[f + i1 * 3 + 1] - t[f + i0 * 3 + 1]));
    };
    edge(0, 1, a, b); edge(1, 2, b, c); edge(2, 0, c, a);
    if (pts.length !== 4) continue;
    let [px, py, qx, qy] = pts;
    if (py === qy) continue;
    if (py > qy) { [px, py, qx, qy] = [qx, qy, px, py]; }
    // rows whose centre y satisfies py <= yc < qy
    const j0 = Math.max(0, Math.ceil((py - y0) / cell - 0.5)), j1 = Math.min(ny - 1, Math.ceil((qy - y0) / cell - 0.5) - 1);
    for (let j = j0; j <= j1; j++) {
      const yc = y0 + (j + 0.5) * cell;
      const u = (yc - py) / (qy - py);
      rows[j].push(px + u * (qx - px));
    }
  }
  mask.fill(0);
  for (let j = 0; j < ny; j++) {
    const r = rows[j];
    if (r.length < 2) continue;
    r.sort((p, q) => p - q);
    for (let i = 0; i + 1 < r.length; i += 2) {
      const i0 = Math.max(0, Math.ceil((r[i] - x0) / cell - 0.5)), i1 = Math.min(nx - 1, Math.ceil((r[i + 1] - x0) / cell - 0.5) - 1);
      for (let k = i0; k <= i1; k++) mask[j * nx + k] = 1;
    }
  }
}

function dilateByDist(mask: Uint8Array, nx: number, ny: number, rMm: number, cell: number): Uint8Array {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const d = distToZero(inv, nx, ny);
  const out = new Uint8Array(mask.length);
  const lim = rMm / cell + 0.5;
  for (let i = 0; i < out.length; i++) out[i] = d[i] <= lim ? 1 : 0;
  return out;
}

/** Straight scan lines at angle `ang` (deg) and spacing `sp` through a region mask; returns polylines (each 2 points) in zig-zag order. */
function fillLines(region: Uint8Array, nx: number, ny: number, cell: number, x0: number, y0: number, ang: number, sp: number, phase = 0): P2[][] {
  const th = (ang * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th);
  const W = nx * cell, H = ny * cell;
  const cx = x0 + W / 2, cy = y0 + H / 2, R = Math.hypot(W, H) / 2;
  const out: P2[][] = [];
  const step = cell * 0.5;
  let flip = false;
  const sample = (x: number, y: number) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell);
    return i >= 0 && j >= 0 && i < nx && j < ny && region[j * nx + i] === 1;
  };
  for (let u = -R + phase; u <= R; u += sp) {
    const spans: [number, number][] = [];
    let s = -1;
    for (let v = -R; v <= R; v += step) {
      const x = cx + u * -sn + v * cs, y = cy + u * cs + v * sn;
      const inside = sample(x, y);
      if (inside && s < 0) s = v;
      if (!inside && s >= 0) { spans.push([s, v - step]); s = -1; }
    }
    if (s >= 0) spans.push([s, R]);
    const good = spans.filter(([a, b]) => b - a > 0.6);
    const ordered = flip ? [...good].reverse() : good;
    for (const [a, b] of ordered) {
      const p: P2 = [cx + u * -sn + a * cs, cy + u * cs + a * sn], q: P2 = [cx + u * -sn + b * cs, cy + u * cs + b * sn];
      out.push(flip ? [q, p] : [p, q]);
    }
    if (good.length) flip = !flip;
  }
  return out;
}

const ACCEL_DEFAULT = 3000;

export function planPrint(req: PrintRequest): PrintProgram {
  const { machine: M, material: mat, s } = req;
  const proc = req.process;
  const warnings: string[] = [], notes: string[] = [];
  const [ra, rc] = ROT[req.up ?? '+Z'];
  const base = ra || rc ? rotateAC(req.mesh, ra, rc) : req.mesh;
  const size: V3 = [base.max[0] - base.min[0], base.max[1] - base.min[1], base.max[2] - base.min[2]];
  const bed = M.envelope;
  if (size[0] > bed[0] || size[1] > bed[1] || size[2] > bed[2]) warnings.push(`Part ${size.map((v) => v.toFixed(1)).join(' × ')} mm does not fit the ${M.model} build volume (${bed.join(' × ')} mm).`);
  // place on the bed centre, min z = 0
  const ox = bed[0] / 2 - (base.min[0] + base.max[0]) / 2, oy = bed[1] / 2 - (base.min[1] + base.max[1]) / 2;
  const mesh = transformMesh(base, (x, y, z) => [x + ox, y + oy, z - base.min[2]]);
  const H = size[2];

  const laser = proc !== 'fdm';
  const w = laser ? (mat.spot ?? M.spotMm ?? 0.1) : s.nozzle * s.lineWidthK;
  const h0 = laser ? (s.layer || mat.layer || 0.05) : s.layer;
  const firstH = laser ? h0 : s.firstLayer;
  const nLayers = Math.max(1, Math.ceil((H - firstH) / h0 - 1e-6) + 1);
  if (nLayers > 4000) warnings.push(`${nLayers} layers is a lot: raise the layer height.`);
  const layerTop: number[] = [], layerH: number[] = [];
  for (let k = 0; k < nLayers; k++) { const z = Math.min(H, firstH + k * h0); layerTop.push(z); layerH.push(k === 0 ? Math.min(firstH, H) : z - layerTop[k - 1]); }

  // --- grid
  const margin = (proc === 'fdm' && s.adhesion !== 'none' ? Math.max(6, s.brimMm + 7) : 3) + 2;
  const wantCells = 150000;
  const gw = size[0] + 2 * margin, gh = size[1] + 2 * margin;
  let cell = laser ? Math.max(0.08, Math.sqrt((gw * gh) / wantCells)) : Math.max(0.1, Math.min(0.35, Math.sqrt((gw * gh) / wantCells)));
  if (laser) cell = Math.max(cell, w * 0.5);
  const gx0 = mesh.min[0] - margin, gy0 = mesh.min[1] - margin;
  const nx = Math.ceil(gw / cell), ny = Math.ceil(gh / cell);

  // --- triangle buckets per layer
  const t = mesh.tris;
  const zMid = layerTop.map((z, k) => z - layerH[k] / 2);
  const counts = new Int32Array(nLayers + 1);
  const triRange: [number, number][] = [];
  for (let f = 0; f < t.length; f += 9) {
    const zmin = Math.min(t[f + 2], t[f + 5], t[f + 8]), zmax = Math.max(t[f + 2], t[f + 5], t[f + 8]);
    // layers whose mid-plane lies in (zmin, zmax]
    const k0 = Math.max(0, Math.floor((zmin - firstH) / h0 + 0.5) - 1), k1 = Math.min(nLayers - 1, Math.ceil((zmax - firstH) / h0 + 0.5) + 1);
    triRange.push([k0, k1]);
    for (let k = k0; k <= k1; k++) counts[k + 1]++;
  }
  for (let k = 0; k < nLayers; k++) counts[k + 1] += counts[k];
  const fill = counts.slice();
  const ids = new Int32Array(counts[nLayers]);
  triRange.forEach(([k0, k1], ti) => { for (let k = k0; k <= k1; k++) ids[fill[k]++] = ti; });

  // --- slice every layer
  const masks: Uint8Array[] = [];
  const rows: number[][] = Array.from({ length: ny }, () => []);
  for (let k = 0; k < nLayers; k++) {
    const m = new Uint8Array(nx * ny);
    sliceMask(mesh, ids, counts[k], counts[k + 1], zMid[k], nx, ny, cell, gx0, gy0, m, rows);
    masks.push(m);
  }
  // sanity: drop stray one-cell noise on layers
  let totalArea = 0;
  const areaOf = (m: Uint8Array) => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c * cell * cell; };
  const layerArea = masks.map(areaOf);
  layerArea.forEach((a) => { totalArea += a; });
  if (totalArea === 0) throw new Error('The model produced no sliceable layers: check that it is a closed solid.');

  // consecutive-layer counts above (capped)
  const cap = Math.max(s.topLayers, 1) + 1;
  const above: Uint8Array[] = new Array(nLayers);
  {
    let run = new Uint8Array(nx * ny);
    for (let k = nLayers - 1; k >= 0; k--) {
      above[k] = Uint8Array.from(run);
      const m = masks[k], nr = new Uint8Array(nx * ny);
      for (let i = 0; i < nr.length; i++) nr[i] = m[i] ? Math.min(cap, run[i] + 1) : 0;
      run = nr;
    }
  }

  // --- overhangs and supports
  const needSupport = (proc === 'fdm' ? s.support === 'auto' : proc === 'sls' ? false : true);
  const unsup: (Uint8Array | null)[] = new Array(nLayers).fill(null);
  const overhangs: Overhang[] = [];
  const dmax = h0 * Math.tan(((Math.min(80, Math.max(20, s.overhang)) * Math.PI) / 180));
  const supportMasks: (Uint8Array | null)[] = new Array(nLayers).fill(null);
  let supportVol = 0;
  if (proc !== 'sls') {
    for (let k = 1; k < nLayers; k++) {
      const inv = new Uint8Array(nx * ny);
      const prev = masks[k - 1];
      for (let i = 0; i < inv.length; i++) inv[i] = prev[i] ? 0 : 1;
      const d = distToZero(inv, nx, ny);
      const raw = new Uint8Array(nx * ny);
      let any = false;
      const m = masks[k];
      for (let i = 0; i < raw.length; i++) if (m[i] && d[i] * cell > dmax + cell * 0.6) { raw[i] = 1; any = true; }
      if (!any) continue;
      const keep = new Uint8Array(nx * ny);
      let kept = false;
      for (const c of components(raw, nx, ny, Math.ceil(1.2 / (cell * cell)))) { for (const q of c.cells) keep[q] = 1; kept = true;
        let sx = 0, sy = 0; for (const q of c.cells) { sx += gx0 + ((q % nx) + 0.5) * cell; sy += gy0 + (Math.floor(q / nx) + 0.5) * cell; }
        overhangs.push({ layer: k, x: sx / c.cells.length, y: sy / c.cells.length, z: layerTop[k], area: c.cells.length * cell * cell, supported: needSupport });
      }
      if (kept) unsup[k] = keep;
    }
    if (needSupport) {
      let need = new Uint8Array(nx * ny);
      const gap = 1; // layers of air between support top and part
      for (let k = nLayers - 1; k >= 0; k--) {
        const src = k + gap + 1 < nLayers ? unsup[k + gap + 1] : null;
        if (src) {
          const grown = dilateByDist(src, nx, ny, 0.8, cell);
          for (let i = 0; i < need.length; i++) if (grown[i]) need[i] = 1;
        }
        // clear where the part is (plus xy clearance)
        const clr = dilateByDist(masks[k], nx, ny, 0.45, cell);
        const nk = new Uint8Array(nx * ny);
        let any = false;
        for (let i = 0; i < nk.length; i++) if (need[i] && !clr[i]) { nk[i] = 1; any = true; }
        need = nk;
        if (any) {
          supportMasks[k] = Uint8Array.from(nk);
          supportVol += areaOf(nk) * layerH[k];
        }
      }
    }
  }

  // --- toolpaths
  const seg = new Seg();
  const layers: LayerInfo[] = [];
  let cx = bed[0] / 2, cy = bed[1] / 2, cz = 0;
  let hatchUsed = s.hatch;
  const lineArea = (hh: number) => hh * (w - hh) + (Math.PI * hh * hh) / 4;
  const spdFor = (type: number, k: number, hh: number) => {
    if (laser) return 1;
    let v = s.speed;
    if (type === PT.outer) v *= 0.6; else if (type === PT.inner) v *= 0.9; else if (type === PT.solid) v *= 0.8; else if (type === PT.support) v *= 0.9;
    if (k === 0) v = Math.min(v, s.firstLayerSpeed);
    const qMax = Math.min(mat.maxVolFlow ?? 15, M.maxFlow ?? 40);
    v = Math.min(v, qMax / lineArea(hh));
    return Math.max(5, v);
  };
  const filA = Math.PI * Math.pow((M.filament ?? 1.75) / 2, 2);
  const vecCap = 900000;
  let vecCount = 0;
  const addPath = (pts: P2[], type: number, k: number, z: number, hh: number) => {
    if (pts.length < 2) return;
    // travel to start
    const d = Math.hypot(pts[0][0] - cx, pts[0][1] - cy);
    if (d > 0.05 || z !== cz) {
      let flag = 0;
      if (!laser && d > 1.5) flag = FLAG_RETRACT | (s.zhop > 0 && d > 6 ? FLAG_HOP : 0);
      seg.x0.push(cx); seg.y0.push(cy); seg.z0.push(cz); seg.x1.push(pts[0][0]); seg.y1.push(pts[0][1]); seg.z1.push(z);
      seg.type.push(PT.travel); seg.layer.push(k); seg.e.push(0); seg.f.push(s.travel * 60); seg.flag.push(flag);
    }
    const v = spdFor(type, k, hh);
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (L < 1e-4) continue;
      seg.x0.push(pts[i - 1][0]); seg.y0.push(pts[i - 1][1]); seg.z0.push(z); seg.x1.push(pts[i][0]); seg.y1.push(pts[i][1]); seg.z1.push(z);
      seg.type.push(type); seg.layer.push(k);
      seg.e.push(laser ? 0 : (L * lineArea(hh) * s.flow) / filA);
      seg.f.push(laser ? (type === PT.scan ? s.scan : s.scan) * 60 : v * 60); seg.flag.push(0);
      vecCount++;
    }
    const last = pts[pts.length - 1];
    cx = last[0]; cy = last[1]; cz = z;
  };
  const closeLoop = (p: P2[]) => [...p, p[0]];
  const nearestOrder = <T>(items: T[], first: (t: T) => P2): T[] => {
    const left = [...items], out: T[] = [];
    let px = cx, py = cy;
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) { const f = first(left[i]); const d = Math.hypot(f[0] - px, f[1] - py); if (d < bd) { bd = d; bi = i; } }
      const it = left.splice(bi, 1)[0]; out.push(it); const f = first(it); px = f[0]; py = f[1];
    }
    return out;
  };

  // pre-estimate scan vector count for laser processes and widen the hatch if needed
  if (laser) {
    let hatchLen = 0;
    for (let k = 0; k < nLayers; k++) hatchLen += layerArea[k] / Math.max(0.02, s.hatch);
    const meanLine = Math.max(5, Math.sqrt(totalArea / nLayers));
    const approxLines = hatchLen / meanLine;
    if (approxLines > vecCap * 0.6) {
      hatchUsed = +(s.hatch * (approxLines / (vecCap * 0.6))).toFixed(2);
      notes.push(`Hatch spacing widened from ${s.hatch} to ${hatchUsed} mm so the preview and file stay a workable size.`);
    }
  }

  let belowRun = new Uint8Array(nx * ny);
  for (let k = 0; k < nLayers; k++) {
    const m = masks[k];
    const brun = new Uint8Array(nx * ny);
    for (let i = 0; i < brun.length; i++) brun[i] = m[i] ? Math.min(250, belowRun[i] + 1) : 0;
    belowRun = brun;
    const z = layerTop[k], hh = layerH[k];
    const segStart = seg.n;
    if (layerArea[k] === 0 && !supportMasks[k]) { layers.push({ n: k, z, h: hh, segStart, segEnd: seg.n, areaMm2: 0, timeS: 0 }); continue; }
    const sd = signedDistance(m, nx, ny, cell);
    // adhesion on the first layer
    if (k === 0 && proc === 'fdm' && s.adhesion !== 'none') {
      const loops: P2[][] = [];
      if (s.adhesion === 'brim') {
        const n = Math.max(1, Math.round(s.brimMm / w));
        for (let b = n - 1; b >= 0; b--) for (const lp of isoContours(sd, nx, ny, -(b + 0.5) * w, cell, gx0, gy0)) if (lp.length > 6) loops.push(simplifyClosed(lp, 0.03));
      } else {
        for (const lp of isoContours(sd, nx, ny, -5, cell, gx0, gy0)) if (lp.length > 6) loops.push(simplifyClosed(lp, 0.03));
      }
      // only loops that enclose (are larger than) the part's own outline neighbourhood: keep all, they are short
      for (const lp of nearestOrder(loops, (l) => l[0])) addPath(closeLoop(lp), PT.skirt, k, z, hh);
    }
    if (!laser) {
      // supports first
      const sm = supportMasks[k];
      if (sm) {
        const reg = new Uint8Array(nx * ny);
        const sdS = signedDistance(sm, nx, ny, cell);
        for (let i = 0; i < reg.length; i++) reg[i] = sdS[i] > 0.35 ? 1 : 0;
        for (const lp of isoContours(sdS, nx, ny, w * 0.6, cell, gx0, gy0)) if (lp.length > 8) addPath(closeLoop(simplifyClosed(lp, 0.05)), PT.support, k, z, hh);
        const sp = Math.max(w * 2, (w * 100) / Math.max(5, s.supportDensity));
        const ls = fillLines(reg, nx, ny, cell, gx0, gy0, k % 2 ? 0 : 90, sp);
        for (const l of ls) addPath(l, PT.support, k, z, hh);
      }
      // perimeters
      const P = Math.max(1, s.perimeters);
      const wallLoops: { lp: P2[]; type: number }[] = [];
      for (let p = P - 1; p >= 0; p--) {
        const lv = (p + 0.5) * w;
        for (const lp of isoContours(sd, nx, ny, lv, cell, gx0, gy0)) {
          if (lp.length < 5 || polyLen(lp) < w * 2) continue;
          wallLoops.push({ lp: simplifyClosed(lp, 0.02), type: p === 0 ? PT.outer : PT.inner });
        }
      }
      // inner walls first, outer last, nearest-neighbour inside each group
      for (const typ of [PT.inner, PT.outer]) {
        const grp = wallLoops.filter((q) => q.type === typ);
        for (const it of nearestOrder(grp, (q) => q.lp[0])) addPath(closeLoop(it.lp), typ, k, z, hh);
      }
      // skin and infill
      const inner = P * w - 0.1 * w;
      const region = new Uint8Array(nx * ny);
      const solid = new Uint8Array(nx * ny);
      let anySolid = false, anySparse = false;
      const ab = above[k];
      for (let i = 0; i < region.length; i++) {
        if (sd[i] < inner || !m[i]) continue;
        const isSolid = (s.infill >= 100) || ab[i] < s.topLayers || brun[i] <= s.bottomLayers;
        if (isSolid) { solid[i] = 1; anySolid = true; } else { region[i] = 1; anySparse = true; }
      }
      // dilate solid slightly so the skin overlaps the sparse infill
      const ang = k % 2 ? 135 : 45;
      if (anySolid) {
        for (const l of fillLines(solid, nx, ny, cell, gx0, gy0, ang, w * 0.98)) addPath(l, PT.solid, k, z, hh);
      }
      if (anySparse && s.infill > 0) {
        const sp = (w * 100) / Math.max(3, s.infill);
        const lines = fillLines(region, nx, ny, cell, gx0, gy0, ang, s.pattern === 'grid' ? sp * 2 : sp);
        for (const l of lines) addPath(l, PT.infill, k, z, hh);
        if (s.pattern === 'grid') for (const l of fillLines(region, nx, ny, cell, gx0, gy0, ang + 90, sp * 2)) addPath(l, PT.infill, k, z, hh);
      }
    } else {
      // laser / resin scan vectors: contour then hatch, rotating 67° per layer
      for (const lp of nearestOrder(isoContours(sd, nx, ny, w * 0.5, cell, gx0, gy0).filter((l) => l.length > 5).map((l) => simplifyClosed(l, 0.02)), (l) => l[0])) addPath(closeLoop(lp), PT.scan, k, z, hh);
      const reg = new Uint8Array(nx * ny);
      for (let i = 0; i < reg.length; i++) reg[i] = sd[i] > w ? 1 : 0;
      if (vecCount < vecCap) for (const l of fillLines(reg, nx, ny, cell, gx0, gy0, (k * 67) % 180, Math.max(hatchUsed, w * 0.8))) addPath(l, PT.hatch, k, z, hh);
      const sm = supportMasks[k];
      if (sm) {
        const sdS = signedDistance(sm, nx, ny, cell);
        const rr = new Uint8Array(nx * ny);
        for (let i = 0; i < rr.length; i++) rr[i] = sdS[i] > 0.25 ? 1 : 0;
        for (const lp of isoContours(sdS, nx, ny, 0.25, cell, gx0, gy0)) if (lp.length > 8) addPath(closeLoop(simplifyClosed(lp, 0.05)), PT.support, k, z, hh);
        for (const l of fillLines(rr, nx, ny, cell, gx0, gy0, (k * 90) % 180, Math.max(0.6, hatchUsed * 6))) addPath(l, PT.support, k, z, hh);
      }
    }
    layers.push({ n: k, z, h: hh, segStart, segEnd: seg.n, areaMm2: layerArea[k], timeS: 0 });
  }

  // --- pack buffers and statistics
  const N = seg.n;
  const segs = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { segs[i * 6] = seg.x0[i]; segs[i * 6 + 1] = seg.y0[i]; segs[i * 6 + 2] = seg.z0[i]; segs[i * 6 + 3] = seg.x1[i]; segs[i * 6 + 4] = seg.y1[i]; segs[i * 6 + 5] = seg.z1[i]; }
  const segType = Uint8Array.from(seg.type), segLayer = Uint16Array.from(seg.layer), segE = Float32Array.from(seg.e), segF = Float32Array.from(seg.f), segFlag = Uint8Array.from(seg.flag);
  const accel = M.maxSpeed && M.maxSpeed >= 300 ? Math.max(s.accel, 8000) : s.accel || ACCEL_DEFAULT;
  let time = 0, eTot = 0;
  for (let i = 0; i < N; i++) {
    const L = Math.hypot(segs[i * 6 + 3] - segs[i * 6], segs[i * 6 + 4] - segs[i * 6 + 1], segs[i * 6 + 5] - segs[i * 6 + 2]);
    const v = Math.max(1, segF[i] / 60);
    const dAcc = (v * v) / accel; // distance to accelerate and brake fully
    const dt = L >= dAcc ? L / v + v / accel : 2 * Math.sqrt(L / accel);
    // corners rarely stop the head: credit the blend
    const t2 = dt * 0.75 + (L / v) * 0.25;
    time += t2;
    if (layers[segLayer[i]]) layers[segLayer[i]].timeS += t2;
    eTot += segE[i];
    if (segFlag[i] & FLAG_RETRACT) { time += (s.retract / Math.max(5, s.retractSpeed)) * 2; if (segFlag[i] & FLAG_HOP) time += 0.05; }
  }
  if (laser) {
    const perLayer = proc === 'sla' ? 8 + s.lift / 5 : proc === 'sls' ? 12 : 9;
    time += nLayers * perLayer + (proc === 'sla' ? nLayers * (s.exposure) : 0);
  }
  const filR = (M.filament ?? 1.75) / 2;
  const massG = laser ? (meshStats(mesh).volume * mat.density) / 1000 : (eTot * Math.PI * filR * filR * mat.density) / 1000;
  if (proc === 'fdm') {
    if (mat.nozzleC && M.maxNozzleC && mat.nozzleC > M.maxNozzleC) warnings.push(`${mat.name} needs ${mat.nozzleC} °C but the ${M.model} nozzle tops out at ${M.maxNozzleC} °C.`);
    if (mat.bedC && M.maxBedC && mat.bedC > M.maxBedC) warnings.push(`${mat.name} bed temperature ${mat.bedC} °C is above the ${M.maxBedC} °C bed limit.`);
    if (mat.enclosure && !M.enclosed) warnings.push(`${mat.name} warps without an enclosure; ${M.model} is open-frame.`);
    if (mat.abrasive) notes.push('Abrasive filament: use a hardened nozzle.');
    if (!M.nozzles?.includes(s.nozzle)) warnings.push(`${s.nozzle} mm is not a stock nozzle for ${M.model} (${(M.nozzles ?? []).join(', ')} mm).`);
    if (s.layer > s.nozzle * 0.8) warnings.push('Layer height above 80 % of the nozzle diameter gives poor layer bonding.');
  }
  const bad = overhangs.filter((o) => !o.supported);
  if (bad.length) warnings.push(`${bad.length} unsupported overhang region${bad.length === 1 ? '' : 's'} (beyond ${s.overhang}° from vertical): enable supports or re-orient.`);
  if (supportVol > 0) notes.push(`Supports add ${(supportVol / 1000).toFixed(1)} cm³ of material.`);
  if (M.vendorLocked) notes.push(`${M.brand} ${M.model} normally prints through vendor software; this output is reference G-code.`);
  return {
    kind: 'print', process: proc, controller: req.controller, machine: M, material: mat, s, layers, segs, segType, segLayer, segE, segF, segFlag, segCount: N,
    size, offset: [ox, oy], bed, overhangs, supportVolume: supportVol, time, filamentMm: eTot, massG, partVolume: meshStats(mesh).volume, warnings, notes, hatchUsed,
  };
}

export interface PrintAnalysis {
  size: V3; volume: number; tris: number; layers: number; fits: boolean; overhangArea: number; massEstimate: number;
  strategy: { id: string; title: string; detail: string; on: boolean }[]; recLayer: number; recInfill: number; recSupport: boolean; warnings: string[];
}
/** Fast analysis for the AI panel: size, overhang fraction, recommendations. */
export function analysePrint(req: PrintRequest): PrintAnalysis {
  const [ra, rc] = ROT[req.up ?? '+Z'];
  const m = ra || rc ? rotateAC(req.mesh, ra, rc) : req.mesh;
  const stats = meshStats(m);
  const size = stats.size;
  const bed = req.machine.envelope;
  const fits = size[0] <= bed[0] && size[1] <= bed[1] && size[2] <= bed[2];
  // overhang estimate from facet normals
  let ov = 0, tot = 0, flatBottom = 0;
  const t = m.tris;
  const lim = Math.cos(((180 - req.s.overhang) * Math.PI) / 180); // normal.z below -cos(overhang) means overhang
  for (let f = 0; f < t.length; f += 9) {
    const ux = t[f + 3] - t[f], uy = t[f + 4] - t[f + 1], uz = t[f + 5] - t[f + 2], vx = t[f + 6] - t[f], vy = t[f + 7] - t[f + 1], vz = t[f + 8] - t[f + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const a = 0.5 * Math.hypot(nx, ny, nz);
    if (a < 1e-9) continue;
    tot += a;
    const z = nz / (2 * a);
    const zc = (t[f + 2] + t[f + 5] + t[f + 8]) / 3 - m.min[2];
    if (z < -0.9 && zc < 0.05) flatBottom += a;
    else if (z < -Math.abs(lim) - 0.0001 && zc > 0.3) ov += a;
  }
  const laser = req.process !== 'fdm';
  const nozzle = req.s.nozzle;
  const recLayer = laser ? req.material.layer ?? 0.05 : +(Math.round(Math.min(nozzle * 0.5, Math.max(0.08, Math.min(size[2], size[0]) / 120)) * 20) / 20).toFixed(2) || 0.2;
  const recInfill = laser ? 100 : size[2] < 8 ? 25 : 15;
  const recSupport = ov > 20 && req.process !== 'sls';
  const layers = Math.ceil(size[2] / (laser ? req.material.layer ?? 0.05 : req.s.layer));
  const strategy = [
    { id: 'orient', title: 'Orientation', detail: `Part is ${size.map((v) => v.toFixed(1)).join(' × ')} mm; ${flatBottom > 30 ? 'it has a flat face on the bed, so bed contact is good.' : 'no large flat face sits on the bed: consider re-orienting or adding a brim.'}`, on: true },
    { id: 'layer', title: `Layer height ${recLayer} mm`, detail: laser ? `Material default for ${req.material.name}.` : `About half the ${nozzle} mm nozzle, capped by part size, for a balance of finish and time. ${layers} layers at the current setting.`, on: true },
    { id: 'infill', title: laser ? 'Solid fill (hatch scan)' : `Infill ${recInfill} %`, detail: laser ? 'Contour pass then hatch at 67° rotation per layer to average residual stress.' : 'Rectilinear lines alternating 45° / 135° each layer; solid skin where the surface faces up or down.', on: true },
    { id: 'support', title: recSupport ? 'Supports on' : req.process === 'sls' ? 'No supports (powder bed)' : 'Supports not needed', detail: `${(ov / Math.max(1, tot) * 100).toFixed(1)} % of the surface overhangs beyond ${req.s.overhang}°.`, on: recSupport },
    { id: 'adhesion', title: laser ? 'Build plate' : `${req.s.adhesion === 'none' ? 'No' : req.s.adhesion} adhesion`, detail: flatBottom > 30 ? 'Large first-layer contact area.' : 'Small contact area: a brim helps.', on: !laser },
  ];
  const warnings: string[] = [];
  if (!fits) warnings.push(`Part ${size.map((v) => v.toFixed(0)).join(' × ')} mm exceeds the ${req.machine.model} build volume.`);
  return { size, volume: stats.volume, tris: stats.tris, layers, fits, overhangArea: ov, massEstimate: (stats.volume * req.material.density) / 1000, strategy, recLayer, recInfill, recSupport, warnings };
}
export type { ProcessId };
