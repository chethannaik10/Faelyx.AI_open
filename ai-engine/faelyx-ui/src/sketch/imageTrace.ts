// Image to Sketch: turns a raster picture into editable 2D sketch geometry.
//
//   raster ─▶ grey ─▶ blur ─▶ threshold ─▶ clean mask ─┬▶ outline tracing (filled shapes)  ─┐
//                                                       └▶ thinning + graph tracing (strokes) ┴▶ paths ─▶ fitting ─▶ sketch entities
//
// Everything here is plain TypeScript over typed arrays (no DOM, no React), so it runs the same in the browser and under Node.
// Coordinates are image pixels with y pointing down, the same orientation as the sketch canvas (SVG), so no flip is ever needed.

export type P = [number, number];
export type Raster = { w: number; h: number; data: Uint8Array };
export type Mask = Raster; // 1 = foreground
export type Path = { pts: P[]; closed: boolean };

// ───────────────────────────── raster basics ─────────────────────────────

/** RGBA → grey, compositing transparent pixels over white so a transparent background reads as paper. */
export function toGray(rgba: ArrayLike<number>, w: number, h: number): Raster {
  const data = new Uint8Array(w * h);
  for (let i = 0, k = 0; i < w * h; i++, k += 4) {
    const a = rgba[k + 3] / 255;
    const r = rgba[k] * a + 255 * (1 - a); const g = rgba[k + 1] * a + 255 * (1 - a); const b = rgba[k + 2] * a + 255 * (1 - a);
    data[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { w, h, data };
}

function blur1d(src: Float32Array, dst: Float32Array, len: number, stride: number, count: number, step: number, r: number) {
  const pre = new Float64Array(len + 1);
  for (let line = 0; line < count; line++) {
    const base = line * step;
    for (let i = 0; i < len; i++) pre[i + 1] = pre[i] + src[base + i * stride];
    for (let i = 0; i < len; i++) {
      const lo = Math.max(0, i - r); const hi = Math.min(len - 1, i + r);
      dst[base + i * stride] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1);
    }
  }
}

/** Two box-blur passes in each direction: close enough to a Gaussian, and fast. radius in pixels. */
export function blur(r: Raster, radius: number): Raster {
  const rad = Math.round(radius);
  if (rad <= 0) return r;
  const { w, h } = r;
  let a = new Float32Array(w * h); let b = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = r.data[i];
  for (let pass = 0; pass < 2; pass++) {
    blur1d(a, b, w, 1, h, w, rad);
    blur1d(b, a, h, w, w, 1, rad);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(a[i])));
  return { w, h, data: out };
}

/** Otsu's threshold: the grey level that best separates a dark class from a light class. */
export function otsu(r: Raster): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < r.data.length; i++) hist[r.data[i]]++;
  const total = r.data.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0; let sumB = 0; let best = 0; let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (wB === 0) continue;
    const wF = total - wB; if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB; const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

export type MaskOpts = {
  /** Grey level 0-255, or null for Otsu's automatic choice. */
  threshold: number | null;
  /** Local (adaptive) threshold: copes with shadows and uneven lighting in photos. */
  adaptive: boolean;
  /** Which side is the part: 'dark' ink on light paper, 'light' on dark, or decide from which is the smaller class. */
  polarity: 'auto' | 'dark' | 'light';
};

export function makeMask(r: Raster, o: MaskOpts): { mask: Mask; threshold: number; polarity: 'dark' | 'light' } {
  const { w, h, data } = r;
  const dark = new Uint8Array(w * h);
  const thr = o.threshold ?? otsu(r);
  if (o.adaptive) {
    const rad = Math.max(8, Math.round(Math.max(w, h) / 24));
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += data[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    const c = Math.max(4, (255 - thr) * 0.06 + 6);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - rad); const y1 = Math.min(h - 1, y + rad);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - rad); const x1 = Math.min(w - 1, x + rad);
        const s = I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        const mean = s / ((x1 - x0 + 1) * (y1 - y0 + 1));
        dark[y * w + x] = data[y * w + x] < mean - c ? 1 : 0;
      }
    }
  } else {
    for (let i = 0; i < dark.length; i++) dark[i] = data[i] < thr ? 1 : 0;
  }
  let nd = 0; for (let i = 0; i < dark.length; i++) nd += dark[i];
  const polarity = o.polarity === 'auto' ? (nd <= dark.length / 2 ? 'dark' : 'light') : o.polarity;
  if (polarity === 'light') for (let i = 0; i < dark.length; i++) dark[i] = dark[i] ? 0 : 1;
  return { mask: { w, h, data: dark }, threshold: thr, polarity };
}

/** Drops foreground specks smaller than minArea pixels and fills background pockets smaller than that (pinholes). */
export function cleanMask(m: Mask, minArea: number): Mask {
  const { w, h } = m;
  const out = new Uint8Array(m.data);
  const label = new Int32Array(w * h);
  const stack: number[] = [];
  const flood = (value: number, minA: number, fillTo: number, skipBorder: boolean) => {
    label.fill(0);
    let id = 0;
    for (let s = 0; s < w * h; s++) {
      if (out[s] !== value || label[s] !== 0) continue;
      id++;
      let count = 0; let border = false;
      const members: number[] = [];
      stack.length = 0; stack.push(s); label[s] = id;
      while (stack.length) {
        const p = stack.pop() as number; members.push(p); count++;
        const x = p % w; const y = (p - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        if (x > 0 && out[p - 1] === value && label[p - 1] === 0) { label[p - 1] = id; stack.push(p - 1); }
        if (x < w - 1 && out[p + 1] === value && label[p + 1] === 0) { label[p + 1] = id; stack.push(p + 1); }
        if (y > 0 && out[p - w] === value && label[p - w] === 0) { label[p - w] = id; stack.push(p - w); }
        if (y < h - 1 && out[p + w] === value && label[p + w] === 0) { label[p + w] = id; stack.push(p + w); }
      }
      if (count < minA && !(skipBorder && border)) for (const p of members) out[p] = fillTo;
    }
  };
  if (minArea >= 2) {
    flood(1, minArea, 0, false); // specks of foreground
    flood(0, minArea, 1, true);  // pinholes inside the foreground (background that does not reach the edge)
  }
  return { w, h, data: out };
}

/** Mean stroke/feature thickness in pixels: 2·area / perimeter. Thin (a few px) means line art, large means a filled shape. */
export function thickness(m: Mask): { area: number; perimeter: number; thickness: number } {
  const { w, h, data } = m;
  let area = 0; let per = 0;
  const fg = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!data[y * w + x]) continue;
    area++;
    if (!fg(x - 1, y)) per++; if (!fg(x + 1, y)) per++; if (!fg(x, y - 1)) per++; if (!fg(x, y + 1)) per++;
  }
  return { area, perimeter: per, thickness: per ? (2 * area) / per : 0 };
}

// ───────────────────────────── thinning (Zhang-Suen) ─────────────────────────────

/** Skeleton of the mask: one-pixel-wide centre lines of every stroke. */
export function thin(m: Mask): Mask {
  const { w, h } = m;
  const W = w + 2; const H = h + 2;
  const d = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y + 1) * W + x + 1] = m.data[y * w + x];
  const rem: number[] = [];
  let changed = true; let guard = 0;
  while (changed && guard++ < 400) {
    changed = false;
    for (let sub = 0; sub < 2; sub++) {
      rem.length = 0;
      for (let y = 1; y <= h; y++) {
        for (let x = 1; x <= w; x++) {
          const i = y * W + x;
          if (!d[i]) continue;
          const p2 = d[i - W], p3 = d[i - W + 1], p4 = d[i + 1], p5 = d[i + W + 1], p6 = d[i + W], p7 = d[i + W - 1], p8 = d[i - 1], p9 = d[i - W - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (p2 === 0 && p3 === 1 ? 1 : 0) + (p3 === 0 && p4 === 1 ? 1 : 0) + (p4 === 0 && p5 === 1 ? 1 : 0) + (p5 === 0 && p6 === 1 ? 1 : 0)
            + (p6 === 0 && p7 === 1 ? 1 : 0) + (p7 === 0 && p8 === 1 ? 1 : 0) + (p8 === 0 && p9 === 1 ? 1 : 0) + (p9 === 0 && p2 === 1 ? 1 : 0);
          if (A !== 1) continue;
          if (sub === 0) { if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue; } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          rem.push(i);
        }
      }
      if (rem.length) { changed = true; for (const i of rem) d[i] = 0; }
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = d[(y + 1) * W + x + 1];
  return { w, h, data: out };
}

// ───────────────────────────── tracing ─────────────────────────────

/**
 * Every boundary of the foreground as a closed loop (outer outlines and the outlines of holes alike).
 * Pixel edges are chained into loops; collinear steps are dropped, so a loop is the corner list of a staircase.
 */
export function traceContours(m: Mask): Path[] {
  const { w, h, data } = m;
  const W = w + 1;
  const fg = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  const out0 = new Int32Array(W * (h + 1)).fill(-1);
  const out1 = new Int32Array(W * (h + 1)).fill(-1);
  const used0 = new Uint8Array(W * (h + 1));
  const used1 = new Uint8Array(W * (h + 1));
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const a = y0 * W + x0; const b = y1 * W + x1;
    if (out0[a] < 0) out0[a] = b; else out1[a] = b;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!data[y * w + x]) continue;
    if (!fg(x, y - 1)) add(x, y, x + 1, y);
    if (!fg(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!fg(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!fg(x - 1, y)) add(x, y + 1, x, y);
  }
  const dirOf = (a: number, b: number) => { const d = b - a; return d === 1 ? 0 : d === W ? 1 : d === -1 ? 2 : 3; };
  const paths: Path[] = [];
  for (let s = 0; s < out0.length; s++) {
    for (let which = 0; which < 2; which++) {
      const first = which === 0 ? out0[s] : out1[s];
      const usedS = which === 0 ? used0 : used1;
      if (first < 0 || usedS[s]) continue;
      usedS[s] = 1;
      const pts: P[] = [];
      let prev = s; let cur = first; let dir = dirOf(s, first);
      let lastDir = -1;
      const startDir = dir;
      pts.push([s % W, Math.floor(s / W)]);
      lastDir = dir;
      let guard = 0;
      while (cur !== s && guard++ < 50_000_000) {
        // choose the outgoing edge: at a pinch point (two choices) turn left, which keeps diagonal pixels joined
        let next: number; let use: Uint8Array;
        const a = out0[cur]; const b = out1[cur];
        const availA = a >= 0 && !used0[cur]; const availB = b >= 0 && !used1[cur];
        if (availA && availB) {
          if (dirOf(cur, a) === (dir + 3) % 4) { next = a; use = used0; } else { next = b; use = used1; }
        } else if (availA) { next = a; use = used0; } else if (availB) { next = b; use = used1; } else break;
        use[cur] = 1;
        const nd = dirOf(cur, next);
        if (nd !== lastDir) { pts.push([cur % W, Math.floor(cur / W)]); lastDir = nd; }
        prev = cur; cur = next; dir = nd;
      }
      void prev; void startDir;
      if (pts.length >= 3) paths.push({ pts, closed: true });
    }
  }
  return paths;
}

/** Centre lines of a skeleton as open paths (and closed ones for rings), cut at junctions and end points. */
export function traceSkeleton(sk: Mask, spurLen: number): Path[] {
  const { w, h, data } = sk;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? data[y * w + x] : 0);
  const NB: P[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  // crossing number: how many separate runs of foreground neighbours surround a pixel (1 end, 2 line, 3+ junction)
  const cn = new Uint8Array(w * h);
  const nbCount = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!data[y * w + x]) continue;
    let runs = 0; let n = 0;
    for (let k = 0; k < 8; k++) {
      const a = at(x + NB[k][0], y + NB[k][1]); const b = at(x + NB[(k + 1) % 8][0], y + NB[(k + 1) % 8][1]);
      if (a) n++;
      if (!a && b) runs++;
    }
    cn[y * w + x] = runs; nbCount[y * w + x] = n;
  }
  const isNode = (i: number) => cn[i] !== 2 || nbCount[i] <= 1;
  const visited = new Uint8Array(w * h);
  const paths: Path[] = [];
  const meta: { startNode: boolean; endNode: boolean; startFree: boolean; endFree: boolean }[] = [];
  const nodeKind = (i: number) => (nbCount[i] <= 1 ? 'free' : cn[i] >= 3 ? 'junction' : 'line');
  const walk = (sx: number, sy: number, fx: number, fy: number) => {
    const pts: P[] = [[sx, sy], [fx, fy]];
    const si = sy * w + sx;
    let prevI = si; let cx = fx; let cy = fy;
    let endKind = 'line';
    for (;;) {
      const ci = cy * w + cx;
      if (isNode(ci)) { endKind = nodeKind(ci); break; }
      visited[ci] = 1;
      let best = -1; let bx = 0; let by = 0; let bd = 9;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NB[k][0]; const ny = cy + NB[k][1];
        if (!at(nx, ny)) continue;
        const ni = ny * w + nx;
        if (ni === prevI) continue;
        if (visited[ni] && !isNode(ni)) continue;
        const dd = k % 2 === 0 ? 0 : 1; // prefer 4-connected steps
        if (dd < bd) { bd = dd; best = ni; bx = nx; by = ny; }
      }
      if (best < 0) { endKind = 'free'; break; }
      prevI = ci; cx = bx; cy = by;
      pts.push([cx, cy]);
    }
    const sk0 = nodeKind(si);
    paths.push({ pts, closed: false });
    meta.push({ startNode: true, endNode: true, startFree: sk0 === 'free', endFree: endKind === 'free' });
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!data[i] || !isNode(i)) continue;
    for (let k = 0; k < 8; k++) {
      const nx = x + NB[k][0]; const ny = y + NB[k][1];
      if (!at(nx, ny)) continue;
      const ni = ny * w + nx;
      if (visited[ni] && !isNode(ni)) continue;
      if (isNode(ni)) { if (ni > i && k % 2 === 0) { paths.push({ pts: [[x, y], [nx, ny]], closed: false }); meta.push({ startNode: true, endNode: true, startFree: nbCount[i] <= 1, endFree: nbCount[ni] <= 1 }); } continue; }
      walk(x, y, nx, ny);
    }
  }
  // rings: line pixels never reached from a node
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!data[i] || visited[i] || isNode(i)) continue;
    const pts: P[] = [[x, y]]; visited[i] = 1;
    let cx = x; let cy = y; let closed = false;
    for (let guard = 0; guard < w * h; guard++) {
      let moved = false;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NB[k][0]; const ny = cy + NB[k][1];
        if (!at(nx, ny)) continue;
        const ni = ny * w + nx;
        if (ni === y * w + x && pts.length > 4) { closed = true; break; }
        if (visited[ni]) continue;
        visited[ni] = 1; pts.push([nx, ny]); cx = nx; cy = ny; moved = true; break;
      }
      if (closed || !moved) break;
    }
    if (pts.length > 3) { paths.push({ pts, closed }); meta.push({ startNode: false, endNode: false, startFree: false, endFree: false }); }
  }
  // spurs: short branches that end free next to a junction are thinning whiskers, not drawing
  return paths.filter((p, i) => !(!p.closed && pathLength(p.pts, false) < spurLen && (meta[i].startFree !== meta[i].endFree)));
}

// ───────────────────────────── polyline utilities ─────────────────────────────

export function pathLength(pts: P[], closed: boolean): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 1) s += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return s;
}

export function polygonArea(pts: P[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** Points evenly spaced `step` apart along the path (closed paths wrap; open paths keep both ends). */
export function resample(pts: P[], closed: boolean, step: number): P[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const src = closed ? [...pts, pts[0]] : pts;
  const total = pathLength(src, false);
  if (total < 1e-9) return [pts[0]];
  const count = Math.max(closed ? 3 : 2, Math.round(total / step));
  const out: P[] = [];
  const stepLen = total / (closed ? count : count - 1);
  let seg = 0; let acc = 0;
  const last = closed ? count : count;
  for (let k = 0; k < last; k++) {
    const target = k * stepLen;
    while (seg < src.length - 2 && acc + Math.hypot(src[seg + 1][0] - src[seg][0], src[seg + 1][1] - src[seg][1]) < target - 1e-9) {
      acc += Math.hypot(src[seg + 1][0] - src[seg][0], src[seg + 1][1] - src[seg][1]); seg++;
    }
    const l = Math.hypot(src[seg + 1][0] - src[seg][0], src[seg + 1][1] - src[seg][1]) || 1;
    const t = Math.min(1, Math.max(0, (target - acc) / l));
    out.push([src[seg][0] + (src[seg + 1][0] - src[seg][0]) * t, src[seg][1] + (src[seg + 1][1] - src[seg][1]) * t]);
  }
  return out;
}

/** Gaussian smoothing along the path. Open paths keep their end points. */
export function smooth(pts: P[], closed: boolean, sigma: number): P[] {
  if (sigma <= 0.05 || pts.length < 4) return pts.slice();
  const n = pts.length;
  const half = Math.min(Math.ceil(sigma * 3), Math.floor((n - 1) / 2));
  const wts: number[] = []; let ws = 0;
  for (let k = -half; k <= half; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); wts.push(v); ws += v; }
  const get = (i: number): P => {
    if (closed) return pts[((i % n) + n) % n];
    if (i < 0) return [2 * pts[0][0] - pts[Math.min(-i, n - 1)][0], 2 * pts[0][1] - pts[Math.min(-i, n - 1)][1]];
    if (i > n - 1) { const j = Math.max(0, 2 * (n - 1) - i); return [2 * pts[n - 1][0] - pts[j][0], 2 * pts[n - 1][1] - pts[j][1]]; }
    return pts[i];
  };
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    let x = 0; let y = 0;
    for (let k = -half; k <= half; k++) { const q = get(i + k); const wv = wts[k + half]; x += q[0] * wv; y += q[1] * wv; }
    out.push([x / ws, y / ws]);
  }
  if (!closed) { out[0] = pts[0]; out[n - 1] = pts[n - 1]; }
  return out;
}

/** Ramer-Douglas-Peucker. Returns the indices kept. */
export function rdp(pts: P[], eps: number, i0 = 0, i1 = pts.length - 1): number[] {
  const keep = new Uint8Array(pts.length);
  keep[i0] = 1; keep[i1] = 1;
  const stack: [number, number][] = [[i0, i1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    if (b <= a + 1) continue;
    let md = -1; let mi = -1;
    const dx = pts[b][0] - pts[a][0]; const dy = pts[b][1] - pts[a][1]; const L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - pts[a][0], pts[i][1] - pts[a][1]) : Math.abs((pts[i][0] - pts[a][0]) * dy - (pts[i][1] - pts[a][1]) * dx) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out: number[] = [];
  for (let i = i0; i <= i1; i++) if (keep[i]) out.push(i);
  return out;
}

/** The manual smoothing brush: points under a stroke are pulled toward the average of their neighbours along the path. */
export type BrushStroke = { x: number; y: number; r: number };
export function applyBrush(pts: P[], closed: boolean, strokes: BrushStroke[]): P[] {
  if (!strokes.length || pts.length < 5) return pts;
  let cur = pts.map((p) => [p[0], p[1]] as P);
  const n = cur.length;
  for (const s of strokes) {
    const win = Math.max(2, Math.round(s.r * 0.6));
    for (let iter = 0; iter < 3; iter++) {
      const next = cur.map((p) => [p[0], p[1]] as P);
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(cur[i][0] - s.x, cur[i][1] - s.y);
        if (d > s.r) continue;
        if (!closed && (i === 0 || i === n - 1)) continue;
        let ax = 0; let ay = 0; let c = 0;
        for (let k = -win; k <= win; k++) {
          let j = i + k;
          if (closed) j = ((j % n) + n) % n; else if (j < 0 || j >= n) continue;
          ax += cur[j][0]; ay += cur[j][1]; c++;
        }
        const wgt = Math.min(1, (1 - d / s.r) * 1.6 + 0.15);
        next[i] = [cur[i][0] + (ax / c - cur[i][0]) * wgt, cur[i][1] + (ay / c - cur[i][1]) * wgt];
      }
      cur = next;
    }
  }
  return cur;
}

// ───────────────────────────── primitive fitting ─────────────────────────────

type LineFit = { cx: number; cy: number; dx: number; dy: number; maxDev: number };
export function fitLine(pts: P[], a: number, b: number): LineFit {
  const n = b - a + 1;
  let mx = 0; let my = 0;
  for (let i = a; i <= b; i++) { mx += pts[i][0]; my += pts[i][1]; }
  mx /= n; my /= n;
  let sxx = 0; let syy = 0; let sxy = 0;
  for (let i = a; i <= b; i++) { const x = pts[i][0] - mx; const y = pts[i][1] - my; sxx += x * x; syy += y * y; sxy += x * y; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dx = Math.cos(th); const dy = Math.sin(th);
  let md = 0;
  for (let i = a; i <= b; i++) md = Math.max(md, Math.abs((pts[i][0] - mx) * dy - (pts[i][1] - my) * dx));
  return { cx: mx, cy: my, dx, dy, maxDev: md };
}

type CircleFit = { cx: number; cy: number; r: number; maxDev: number; rms: number };
export function fitCircle(pts: P[], a: number, b: number): CircleFit | null {
  const n = b - a + 1;
  if (n < 3) return null;
  let mx = 0; let my = 0;
  for (let i = a; i <= b; i++) { mx += pts[i][0]; my += pts[i][1]; }
  mx /= n; my /= n;
  // Kåsa: x² + y² + Dx + Ey + F = 0, solved by least squares on centred coordinates
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (let i = a; i <= b; i++) {
    const u = pts[i][0] - mx; const v = pts[i][1] - my;
    suu += u * u; suv += u * v; svv += v * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const uc = ((suuu + suvv) * svv - (svvv + svuu) * suv) / (2 * det);
  const vc = ((svvv + svuu) * suu - (suuu + suvv) * suv) / (2 * det);
  let cx = mx + uc; let cy = my + vc;
  // a few Gauss-Newton steps on the true geometric distance
  for (let it = 0; it < 6; it++) {
    let r = 0;
    for (let i = a; i <= b; i++) r += Math.hypot(pts[i][0] - cx, pts[i][1] - cy);
    r /= n;
    let gx = 0; let gy = 0; let hxx = 0; let hxy = 0; let hyy = 0;
    for (let i = a; i <= b; i++) {
      const dx = cx - pts[i][0]; const dy = cy - pts[i][1]; const d = Math.hypot(dx, dy) || 1e-9;
      const res = d - r; const jx = dx / d; const jy = dy / d;
      gx += jx * res; gy += jy * res; hxx += jx * jx; hxy += jx * jy; hyy += jy * jy;
    }
    const dt = hxx * hyy - hxy * hxy;
    if (Math.abs(dt) < 1e-9) break;
    cx -= (hyy * gx - hxy * gy) / dt; cy -= (hxx * gy - hxy * gx) / dt;
  }
  let r = 0;
  for (let i = a; i <= b; i++) r += Math.hypot(pts[i][0] - cx, pts[i][1] - cy);
  r /= n;
  let md = 0; let ss = 0;
  for (let i = a; i <= b; i++) { const e = Math.abs(Math.hypot(pts[i][0] - cx, pts[i][1] - cy) - r); md = Math.max(md, e); ss += e * e; }
  if (!Number.isFinite(r) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { cx, cy, r, maxDev: md, rms: Math.sqrt(ss / n) };
}

/** Signed angle (radians) the points sweep around a circle, positive when increasing image angle (clockwise on screen). */
function sweepOf(pts: P[], a: number, b: number, c: CircleFit): number {
  let total = 0;
  let prev = Math.atan2(pts[a][1] - c.cy, pts[a][0] - c.cx);
  for (let i = a + 1; i <= b; i++) {
    const cur = Math.atan2(pts[i][1] - c.cy, pts[i][0] - c.cx);
    let d = cur - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d; prev = cur;
  }
  return total;
}

// ───────────────────────────── sketch result ─────────────────────────────

export type FitPoint = { id: string; x: number; y: number };
export type FitLine = { id: string; p1: string; p2: string };
export type FitCircle = { id: string; center: string; r: number };
export type FitArc = { id: string; center: string; r: number; start: number; end: number; p1: string; p2: string };
export type FitSpline = { id: string; controlIds: string[] };
export type FitConstraint = { type: string; args: Record<string, unknown>; label: string };
export type Fit = {
  points: FitPoint[]; lines: FitLine[]; circles: FitCircle[]; arcs: FitArc[]; splines: FitSpline[]; constraints: FitConstraint[];
  /** What the fitter found, for the summary line. */
  stats: { paths: number; rects: number; circles: number; arcs: number; lines: number; splines: number; joints: number; constraints: Record<string, number>; dropped: number };
  warnings: string[];
};

export type FitOpts = {
  /** 'outline' follows the traced contour; 'geometric' also recognises circles and rectangles and adds constraints. */
  mode: 'outline' | 'geometric';
  output: 'lines_arcs' | 'splines' | 'polylines';
  /** Largest allowed distance between the traced outline and the entities (pixels). */
  tol: number;
  /** A change of direction bigger than this (degrees) is a corner. */
  cornerDeg: number;
  /** Shortest feature kept (pixels). */
  minLen: number;
  /** Lines within this many degrees of horizontal / vertical are made exactly so. */
  hvDeg: number;
  /** Which constraints to add. */
  cons: { hv: boolean; parallelPerp: boolean; equal: boolean; tangent: boolean; symmetric: boolean; dims: boolean; fix: boolean };
  /** True when the sketch will be centred on its origin, so symmetry can be tested against the V and H axes. */
  centered: boolean;
  /** Axis line ids for symmetric constraints (the sketch's VDirection / HDirection). */
  vAxis: string; hAxis: string;
};

class Weld {
  pts: FitPoint[] = [];
  private byId = new Map<string, FitPoint>();
  get(id: string): FitPoint { return this.byId.get(id) as FitPoint; }
  private grid = new Map<string, number[]>();
  constructor(private tol: number, private prefix = 'ip') {}
  private key(cx: number, cy: number) { return `${cx},${cy}`; }
  add(x: number, y: number): string {
    const cx = Math.floor(x / this.tol); const cy = Math.floor(y / this.tol);
    let best = -1; let bd = this.tol;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = this.grid.get(this.key(cx + dx, cy + dy));
      if (!l) continue;
      for (const i of l) { const d = Math.hypot(this.pts[i].x - x, this.pts[i].y - y); if (d <= bd) { bd = d; best = i; } }
    }
    if (best >= 0) return this.pts[best].id;
    const id = `${this.prefix}${this.pts.length + 1}`;
    const np = { id, x, y };
    this.pts.push(np); this.byId.set(id, np);
    const k = this.key(cx, cy); const l = this.grid.get(k);
    if (l) l.push(this.pts.length - 1); else this.grid.set(k, [this.pts.length - 1]);
    return id;
  }
  /** A point that is never merged (circle / arc centres). */
  addFree(x: number, y: number): string { const id = `${this.prefix}${this.pts.length + 1}`; const np = { id, x, y }; this.pts.push(np); this.byId.set(id, np); return id; }
}

type Seg =
  | { t: 'line'; a: number; b: number; fit: LineFit }
  | { t: 'arc'; a: number; b: number; c: CircleFit; sweep: number }
  | { t: 'spline'; a: number; b: number; ctrl: number[] };

const norm360 = (d: number) => ((d % 360) + 360) % 360;
const deg = (rad: number) => (rad * 180) / Math.PI;

/** Largest end index in [i+1, e] for which test(i, end) holds (approximately monotone: grow by doubling, then bisect). */
function farthest(i: number, e: number, test: (a: number, b: number) => boolean): number {
  let lo = i + 1;
  let step = 4;
  while (lo < e) {
    const hi = Math.min(e, lo + step);
    if (test(i, hi)) { lo = hi; step *= 2; } else break;
  }
  while (step > 1 && lo < e) {
    step = Math.ceil(step / 2);
    const hi = Math.min(e, lo + step);
    if (hi > lo && test(i, hi)) lo = hi;
    if (step === 1) break;
  }
  return lo;
}

/** Like farthest(), but for arcs: a short stretch of an arc looks straight and fails to fit one, so the search starts from a longer span. */
function farthestArc(i: number, e: number, test: (a: number, b: number) => boolean): number {
  const cands: number[] = [];
  let span = 16;
  for (let b = i + span; b < e; b = i + Math.round((span *= 1.5))) cands.push(b);
  cands.push(e);
  let best = -1;
  for (const b of cands) {
    if (b <= i + 5) continue;
    if (test(i, b)) best = b;
    else if (best >= 0) {
      let lo = best; let hi = b;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (test(i, mid)) lo = mid; else hi = mid; }
      return lo;
    }
  }
  return best < 0 ? i : best;
}

function arcOk(P: P[], a: number, b: number, tol: number, maxR: number): { c: CircleFit; sweep: number } | null {
  if (b - a < 5) return null;
  const c = fitCircle(P, a, b);
  if (!c || c.maxDev > tol * 1.15 || c.r > maxR || c.r < tol * 1.5) return null;
  const sw = sweepOf(P, a, b, c);
  const span = Math.abs(sw);
  if (span < (8 * Math.PI) / 180 || span > (340 * Math.PI) / 180) return null;
  // the points must be spread along the arc (not bunched at one end)
  return { c, sweep: sw };
}

/** Corner indices of a smoothed, evenly resampled path: local maxima of the turning angle over a window. */
function findCorners(P: P[], closed: boolean, deg0: number, k: number): number[] {
  const n = P.length;
  if (n < 2 * k + 2) return [];
  const ang = new Float64Array(n);
  const idx = (i: number) => (closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i)));
  for (let i = 0; i < n; i++) {
    if (!closed && (i < k || i > n - 1 - k)) { ang[i] = 0; continue; }
    const a = P[idx(i - k)]; const b = P[i]; const c = P[idx(i + k)];
    const v1x = b[0] - a[0], v1y = b[1] - a[1], v2x = c[0] - b[0], v2y = c[1] - b[1];
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-9 || l2 < 1e-9) { ang[i] = 0; continue; }
    ang[i] = deg(Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)))));
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (ang[i] < deg0) continue;
    let isMax = true;
    for (let j = -k; j <= k && isMax; j++) { if (j === 0) continue; const q = idx(i + j); if (!closed && (i + j < 0 || i + j > n - 1)) continue; if (ang[q] > ang[i] || (ang[q] === ang[i] && j < 0)) isMax = false; }
    if (isMax) out.push(i);
  }
  return out;
}

function intersectLines(a: LineFit, b: LineFit): P | null {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((b.cx - a.cx) * b.dy - (b.cy - a.cy) * b.dx) / det;
  return [a.cx + a.dx * t, a.cy + a.dy * t];
}

/**
 * Turns traced paths into sketch entities (points, lines, circles, arcs, splines, constraints), all in image-pixel coordinates.
 * Corners split each path; every stretch between corners becomes a line, an arc (or a spline / polyline, per `output`).
 */
export function fitPaths(paths: Path[], o: FitOpts, size: { w: number; h: number }): Fit {
  const tol = Math.max(0.4, o.tol);
  const weld = new Weld(Math.max(1.5, tol * 1.1));
  const maxR = Math.max(size.w, size.h) * 4;
  const lines: FitLine[] = []; const circles: FitCircle[] = []; const arcs: FitArc[] = []; const splines: FitSpline[] = [];
  const warnings: string[] = [];
  let rects = 0; let dropped = 0;
  const lineKeys = new Set<string>();
  const addLine = (p1: string, p2: string) => {
    if (p1 === p2) return null;
    const key = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
    if (lineKeys.has(key)) return null;
    lineKeys.add(key);
    const id = `il${lines.length + 1}`; const l = { id, p1, p2 }; lines.push(l); return l;
  };
  const P_ = (id: string) => weld.get(id);

  // A traced stroke that leaves a junction and comes back to it (a ring with a tail, say) is a loop.
  const asLoop = (p: Path): Path => {
    if (p.closed || p.pts.length < 16) return p;
    const a = p.pts[0]; const b = p.pts[p.pts.length - 1];
    const gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (gap <= Math.max(3, tol * 2.5) && pathLength(p.pts, false) > 8 * Math.max(gap, 1)) return { pts: p.pts, closed: true };
    return p;
  };
  for (const path0 of paths) {
    const path = asLoop(path0);
    const len = pathLength(path.pts, path.closed);
    if (len < o.minLen) { dropped++; continue; }
    if (path.closed && Math.abs(polygonArea(path.pts)) < o.minLen * o.minLen * 0.5) { dropped++; continue; }
    let pts = resample(path.pts, path.closed, 1);
    const smoothSigma = Math.min(1.4, Math.max(0.6, tol * 0.6));
    pts = smooth(pts, path.closed, smoothSigma);
    const n0 = pts.length;
    if (n0 < 4) { dropped++; continue; }

    // whole-loop circle
    if (path.closed && o.mode === 'geometric') {
      const c = fitCircle(pts, 0, n0 - 1);
      if (c && c.maxDev <= tol * 1.3 && c.rms <= tol * 0.8 && c.r >= o.minLen / 3 && c.r <= maxR) {
        const sw = Math.abs(sweepOf([...pts, pts[0]], 0, n0, c));
        if (sw > 1.9 * Math.PI) {
          const cid = weld.addFree(c.cx, c.cy);
          circles.push({ id: `ic${circles.length + 1}`, center: cid, r: c.r });
          continue;
        }
      }
    }

    const k = Math.max(3, Math.min(9, Math.round(tol * 2.2 + 1)));
    let corners = findCorners(pts, path.closed, o.cornerDeg, k);
    // Open path ends are always joints. For a closed path, start at a corner so the first run begins on one.
    let P: P[] = pts;
    if (path.closed) {
      if (corners.length > 0) {
        const s = corners[0];
        P = [...pts.slice(s), ...pts.slice(0, s), pts[s]];
        corners = corners.map((c) => (c - s + n0) % n0).sort((a, b) => a - b).filter((c) => c > 0);
      } else P = [...pts, pts[0]];
    }
    const N = P.length;
    const bounds = [0, ...corners.filter((c) => c > 0 && c < N - 1), N - 1];

    // segment every run between consecutive bounds
    const segs: Seg[] = [];
    for (let bi = 0; bi + 1 < bounds.length; bi++) {
      const s = bounds[bi]; const e = bounds[bi + 1];
      if (e - s < 1) continue;
      segmentRun(P, s, e, o, tol, maxR, segs, Math.ceil(smoothSigma * 2.5) + 1, !path.closed && bi === 0, !path.closed && bi + 2 === bounds.length);
    }
    if (segs.length === 0) { dropped++; continue; }

    // joints between consecutive segments: corner restoration for line-line, else the sample point
    const joints: P[] = [];
    const jointIdx: number[] = [segs[0].a, ...segs.map((sg) => sg.b)];
    for (let j = 0; j < jointIdx.length; j++) joints.push([P[jointIdx[j]][0], P[jointIdx[j]][1]]);
    const refit = (sg: Seg): LineFit | null => {
      if (sg.t !== 'line') return null;
      const a = sg.a; const b = sg.b; const trim = Math.min(2, Math.floor((b - a) / 6));
      return fitLine(P, a + trim, b - trim);
    };
    const jEnd = path.closed ? segs.length : segs.length - 1;
    for (let j = 1; j <= jEnd; j++) {
      const sa = segs[j - 1]; const sb = segs[j % segs.length];
      if (sa.t !== 'line' || sb.t !== 'line') continue;
      const la = refit(sa); const lb = refit(sb);
      if (!la || !lb) continue;
      const cosang = Math.abs(la.dx * lb.dx + la.dy * lb.dy);
      if (cosang > Math.cos((12 * Math.PI) / 180)) continue;
      const ip = intersectLines(la, lb);
      if (!ip) continue;
      if (Math.hypot(ip[0] - joints[j][0], ip[1] - joints[j][1]) <= Math.max(3 * tol, 6)) { joints[j] = ip; if (j === segs.length) joints[0] = ip; }
    }
    if (path.closed) joints[joints.length - 1] = joints[0];

    const jid = joints.map((q) => weld.add(q[0], q[1]));
    if (path.closed) jid[jid.length - 1] = jid[0];
    let nLines = 0;
    segs.forEach((sg, si) => {
      const a = jid[si]; const b = jid[si + 1];
      if (sg.t === 'line') { if (addLine(a, b)) nLines++; } else if (sg.t === 'arc') {
        if (a === b) return;
        const pa = P_(a), pb = P_(b);
        // centre on the perpendicular bisector of the chord, nearest the fitted centre, so both ends are exactly r from it
        const mx = (pa.x + pb.x) / 2; const my = (pa.y + pb.y) / 2;
        let nx = -(pb.y - pa.y); let ny = pb.x - pa.x; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const tproj = (sg.c.cx - mx) * nx + (sg.c.cy - my) * ny;
        const cx = mx + nx * tproj; const cy = my + ny * tproj;
        const r = Math.hypot(pa.x - cx, pa.y - cy);
        let a1 = norm360(deg(Math.atan2(pa.y - cy, pa.x - cx))); let a2 = norm360(deg(Math.atan2(pb.y - cy, pb.x - cx)));
        let p1 = a; let p2 = b;
        if (sg.sweep < 0) { [a1, a2] = [a2, a1]; [p1, p2] = [p2, p1]; }
        const cid = weld.addFree(cx, cy);
        arcs.push({ id: `ia${arcs.length + 1}`, center: cid, r, start: a1, end: a2, p1, p2 });
      } else {
        const ids = sg.ctrl.map((ci, q) => (q === 0 ? a : q === sg.ctrl.length - 1 ? b : weld.add(P[ci][0], P[ci][1])));
        if (ids.length >= 2 && !(ids.length === 2 && ids[0] === ids[1])) splines.push({ id: `cv${splines.length + 1}`, controlIds: ids });
      }
    });
    if (path.closed && nLines === 4 && segs.length === 4 && segs.every((s) => s.t === 'line') && o.mode === 'geometric') {
      let sq = true;
      for (let q = 0; q < 4; q++) {
        const a = refit(segs[q]); const b = refit(segs[(q + 1) % 4]);
        if (!a || !b || Math.abs(a.dx * b.dx + a.dy * b.dy) > Math.sin((8 * Math.PI) / 180)) sq = false;
      }
      if (sq) rects++;
    }
  }

  // ── geometry clean-up and constraints ──
  const ptsArr = weld.pts;
  const byId = new Map(ptsArr.map((p) => [p.id, p] as const));
  const constraints: FitConstraint[] = [];
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const lenOf = (l: FitLine) => { const a = byId.get(l.p1) as FitPoint; const b = byId.get(l.p2) as FitPoint; return Math.hypot(a.x - b.x, a.y - b.y); };
  const angOf = (l: FitLine) => { const a = byId.get(l.p1) as FitPoint; const b = byId.get(l.p2) as FitPoint; return deg(Math.atan2(b.y - a.y, b.x - a.x)); };

  // make near-horizontal / near-vertical lines exactly so (union-find over the shared coordinates)
  const hv = new Map<string, 'h' | 'v'>();
  if (o.hvDeg > 0 && (o.mode === 'geometric' || o.cons.hv)) {
    const parX = new Map<string, string>(); const parY = new Map<string, string>();
    const inX = new Set<string>(); const inY = new Set<string>();
    const find = (m: Map<string, string>, a: string): string => { let r = a; while ((m.get(r) ?? r) !== r) r = m.get(r) as string; m.set(a, r); return r; };
    const union = (m: Map<string, string>, a: string, b: string) => { const ra = find(m, a), rb = find(m, b); if (ra !== rb) m.set(ra, rb); };
    for (const l of lines) {
      const a = ((angOf(l) % 180) + 180) % 180;
      if (Math.min(a, 180 - a) <= o.hvDeg) { hv.set(l.id, 'h'); union(parY, l.p1, l.p2); inY.add(l.p1); inY.add(l.p2); } else if (Math.abs(a - 90) <= o.hvDeg) { hv.set(l.id, 'v'); union(parX, l.p1, l.p2); inX.add(l.p1); inX.add(l.p2); }
    }
    const group = (m: Map<string, string>, members: Set<string>, key: 'x' | 'y') => {
      const sums = new Map<string, { s: number; n: number }>();
      for (const id of members) { const p = byId.get(id) as FitPoint; const r = find(m, id); const g = sums.get(r) ?? { s: 0, n: 0 }; g.s += p[key]; g.n++; sums.set(r, g); }
      for (const id of members) { const p = byId.get(id) as FitPoint; const g = sums.get(find(m, id)) as { s: number; n: number }; p[key] = g.s / g.n; }
    };
    group(parY, inY, 'y'); group(parX, inX, 'x');
    // arcs and circles keep their centre at the same distance from the (moved) end points
    for (const a of arcs) {
      const c = byId.get(a.center) as FitPoint; const p1 = byId.get(a.p1) as FitPoint; const p2 = byId.get(a.p2) as FitPoint;
      const mx = (p1.x + p2.x) / 2; const my = (p1.y + p2.y) / 2;
      let nx = -(p2.y - p1.y); let ny = p2.x - p1.x; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const tp = (c.x - mx) * nx + (c.y - my) * ny;
      c.x = mx + nx * tp; c.y = my + ny * tp;
      a.r = Math.hypot(p1.x - c.x, p1.y - c.y);
      a.start = norm360(deg(Math.atan2(p1.y - c.y, p1.x - c.x))); a.end = norm360(deg(Math.atan2(p2.y - c.y, p2.x - c.x)));
    }
  }
  if (o.mode === 'geometric' && o.cons.hv) {
    for (const l of lines) { const k = hv.get(l.id); if (k) { constraints.push({ type: k === 'h' ? 'horizontal' : 'vertical', args: { line: l.id }, label: `${k === 'h' ? 'Horizontal' : 'Vertical'}: ${l.id}` }); bump(k === 'h' ? 'horizontal' : 'vertical'); } }
  }
  if (o.mode === 'geometric') {
    const longLines = lines.filter((l) => lenOf(l) >= Math.max(o.minLen * 1.5, tol * 6));
    if (o.cons.parallelPerp) {
      const free = longLines.filter((l) => !hv.has(l.id));
      const used = new Set<string>();
      for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
        const d = Math.abs((((angOf(free[i]) - angOf(free[j])) % 180) + 180) % 180);
        const par = Math.min(d, 180 - d) < 1.5; const per = Math.abs(d - 90) < 1.5;
        const key = free[j].id;
        if ((par || per) && !used.has(key)) {
          used.add(key);
          constraints.push({ type: par ? 'parallel' : 'perpendicular', args: { line1: free[i].id, line2: free[j].id }, label: `${par ? 'Parallel' : 'Perpendicular'}: ${free[i].id}, ${free[j].id}` });
          bump(par ? 'parallel' : 'perpendicular');
        }
      }
    }
    if (o.cons.equal) {
      const sorted = [...longLines].sort((a, b) => lenOf(a) - lenOf(b));
      const comp = new Map<string, number>(); // connected loop of each line, so two sides of one rectilinear loop are not "equal" twice over
      { const adj = new Map<string, FitLine[]>(); for (const l of lines) for (const p of [l.p1, l.p2]) { const q = adj.get(p) ?? []; q.push(l); adj.set(p, q); }
        let cid = 0; for (const l0 of lines) { if (comp.has(l0.id)) continue; cid++; const st = [l0]; comp.set(l0.id, cid); while (st.length) { const l = st.pop() as FitLine; for (const p of [l.p1, l.p2]) for (const m of adj.get(p) ?? []) if (!comp.has(m.id)) { comp.set(m.id, cid); st.push(m); } } } }
      for (let i = 1; i < sorted.length; i++) {
        const a = lenOf(sorted[i - 1]); const b = lenOf(sorted[i]);
        if (Math.abs(a - b) / Math.max(a, b) < 0.015 && !(comp.get(sorted[i - 1].id) === comp.get(sorted[i].id) && hv.has(sorted[i - 1].id) && hv.has(sorted[i].id))) {
          constraints.push({ type: 'equal_length', args: { line1: sorted[i - 1].id, line2: sorted[i].id }, label: `Equal length: ${sorted[i - 1].id}, ${sorted[i].id}` }); bump('equal');
        }
      }
      const cs = [...circles].sort((a, b) => a.r - b.r);
      for (let i = 1; i < cs.length; i++) {
        if (Math.abs(cs[i].r - cs[i - 1].r) / cs[i].r < 0.02) { constraints.push({ type: 'equal_radius', args: { circle1: cs[i - 1].id, circle2: cs[i].id }, label: `Equal radius: ${cs[i - 1].id}, ${cs[i].id}` }); bump('equal'); }
      }
    }
    if (o.cons.tangent) {
      for (const a of arcs) {
        const c = byId.get(a.center) as FitPoint;
        for (const [pid, atStart] of [[a.p1, true], [a.p2, false]] as const) {
          const p = byId.get(pid) as FitPoint;
          const ln = lines.find((l) => (l.p1 === pid || l.p2 === pid) && lenOf(l) > tol * 3);
          if (!ln) continue;
          const other = byId.get(ln.p1 === pid ? ln.p2 : ln.p1) as FitPoint;
          const ta = Math.atan2(p.y - c.y, p.x - c.x) + Math.PI / 2; // tangent direction at p
          const lx = other.x - p.x; const ly = other.y - p.y; const ll = Math.hypot(lx, ly) || 1;
          const cosd = Math.abs((lx * Math.cos(ta) + ly * Math.sin(ta)) / ll);
          void atStart;
          if (cosd > Math.cos((7 * Math.PI) / 180)) { constraints.push({ type: 'tangent_line_curve', args: { line: ln.id, curve: a.id }, label: `Tangent: ${ln.id}, ${a.id}` }); bump('tangent'); }
        }
      }
    }
    if (o.cons.symmetric && o.centered && ptsArr.length >= 4) {
      const bb = fitBounds({ points: ptsArr, circles, arcs } as unknown as Fit) as { x0: number; y0: number; x1: number; y1: number };
      const bx0 = bb.x0; const bx1 = bb.x1; const by0 = bb.y0; const by1 = bb.y1;
      const tryAxis = (vertical: boolean) => {
        const mid = vertical ? (bx0 + bx1) / 2 : (by0 + by1) / 2;
        const pairs: [FitPoint, FitPoint][] = []; let matched = 0; const used = new Set<string>();
        const members = ptsArr.filter((p) => !arcs.some((a) => a.center === p.id) && !circles.some((c) => c.center === p.id));
        for (const p of members) {
          const mx = vertical ? 2 * mid - p.x : p.x; const my = vertical ? p.y : 2 * mid - p.y;
          let best: FitPoint | null = null; let bd = Math.max(tol * 1.5, 2);
          for (const q of members) { const d = Math.hypot(q.x - mx, q.y - my); if (d < bd) { bd = d; best = q; } }
          if (best) { matched++; if (best.id !== p.id && !used.has(p.id) && !used.has(best.id)) { used.add(p.id); used.add(best.id); pairs.push([p, best]); } }
        }
        return { ratio: matched / Math.max(1, members.length), pairs, mid };
      };
      for (const vertical of [true, false]) {
        const r = tryAxis(vertical);
        if (r.ratio < 0.92 || r.pairs.length === 0) continue;
        for (const [p, q] of r.pairs) {
          // exact mirror positions before the constraint, so the solver starts satisfied
          if (vertical) { const d = Math.abs(q.x - p.x) / 2; const left = p.x <= q.x ? p : q; const right = left === p ? q : p; left.x = r.mid - d; right.x = r.mid + d; const y = (p.y + q.y) / 2; p.y = y; q.y = y; } else {
            const d = Math.abs(q.y - p.y) / 2; const top = p.y <= q.y ? p : q; const bot = top === p ? q : p; top.y = r.mid - d; bot.y = r.mid + d; const x = (p.x + q.x) / 2; p.x = x; q.x = x;
          }
          constraints.push({ type: 'symmetric', args: { p1: p.id, p2: q.id, line: vertical ? o.vAxis : o.hAxis }, label: `Symmetric: ${p.id}, ${q.id} about ${vertical ? 'V' : 'H'}` });
          bump('symmetric');
        }
      }
    }
    if (o.cons.dims) {
      // radius for every circle; length for H/V lines (all but the closing pair of a rectilinear loop, which the others already fix)
      for (const c of circles) { constraints.push({ type: 'radius', args: { circle: c.id, value: c.r }, label: `Radius: ${c.id}` }); bump('radius'); }
      const adj = new Map<string, FitLine[]>();
      for (const l of lines) for (const p of [l.p1, l.p2]) { const a = adj.get(p) ?? []; a.push(l); adj.set(p, a); }
      const seen = new Set<string>();
      for (const l0 of lines) {
        if (seen.has(l0.id)) continue;
        const comp: FitLine[] = []; const st = [l0]; seen.add(l0.id);
        while (st.length) { const l = st.pop() as FitLine; comp.push(l); for (const p of [l.p1, l.p2]) for (const m of adj.get(p) ?? []) if (!seen.has(m.id)) { seen.add(m.id); st.push(m); } }
        const rectilinear = comp.every((l) => hv.has(l.id));
        const hs = comp.filter((l) => hv.get(l.id) === 'h'); const vs = comp.filter((l) => hv.get(l.id) === 'v');
        const skip = new Set<string>();
        if (rectilinear && comp.length >= 4) { if (hs.length) skip.add(hs[hs.length - 1].id); if (vs.length) skip.add(vs[vs.length - 1].id); }
        for (const l of comp) {
          if (skip.has(l.id) || lenOf(l) < tol * 3) continue;
          constraints.push({ type: 'distance', args: { p1: l.p1, p2: l.p2, value: lenOf(l) }, label: `Distance: ${l.id}` }); bump('dimension');
        }
      }
    }
    if (o.cons.fix && ptsArr.length) {
      // hold one point where it is, so the sketch cannot drift when the solver runs (the lowest-left corner, or a circle centre)
      const anchor = circles.length && lines.length === 0 ? (byId.get(circles[0].center) as FitPoint) : ptsArr.reduce((m, p) => (p.x + p.y * 1e-3 < m.x + m.y * 1e-3 ? p : m), ptsArr[0]);
      constraints.push({ type: 'fixed', args: { point: anchor.id, x: anchor.x, y: anchor.y }, label: `Fixed: ${anchor.id}` }); bump('fixed');
    }
  }

  const used = new Set<string>();
  for (const l of lines) { used.add(l.p1); used.add(l.p2); }
  for (const a of arcs) { used.add(a.p1); used.add(a.p2); used.add(a.center); }
  for (const c of circles) used.add(c.center);
  for (const s of splines) for (const id of s.controlIds) used.add(id);
  const keepPts = ptsArr.filter((p) => used.has(p.id));
  const joints = keepPts.filter((p) => lines.filter((l) => l.p1 === p.id || l.p2 === p.id).length + arcs.filter((a) => a.p1 === p.id || a.p2 === p.id).length >= 2).length;
  if (lines.length + arcs.length + circles.length + splines.length === 0) warnings.push('No outlines were found. Try changing the threshold, flipping the image polarity, or lowering "Ignore small features".');
  if (lines.length + arcs.length + splines.length > 1500) warnings.push('Very many segments: the trace is probably picking up noise. Raise the tolerance or the noise reduction.');
  if (dropped > 0 && lines.length + arcs.length + circles.length === 0 && splines.length === 0) warnings.push(`${dropped} paths were too short to keep.`);
  return {
    points: keepPts, lines, circles, arcs, splines, constraints, warnings,
    stats: { paths: paths.length, rects, circles: circles.length, arcs: arcs.length, lines: lines.length, splines: splines.length, joints, constraints: counts, dropped },
  };
}

/** Moves the boundary between a line and an arc (or two arcs) to where both sides fit best: the true tangent point, instead of wherever the tolerance let the first one run on to. */
function relocate(P: P[], segs: Seg[]) {
  const devOf = (sg: Seg, a: number, b: number): number => {
    if (b - a < 3) return 1e9;
    if (sg.t === 'line') return fitLine(P, a, b).maxDev;
    if (sg.t === 'arc') { const c = fitCircle(P, a, b); return c ? c.maxDev : 1e9; }
    return 0;
  };
  for (let k = 0; k + 1 < segs.length; k++) {
    const A = segs[k]; const B = segs[k + 1];
    if ((A.t === 'line' && B.t === 'line') || A.t === 'spline' || B.t === 'spline') continue;
    const m = A.b; const W = 16;
    const lo = Math.max(A.a + 5, m - W); const hi = Math.min(B.b - 5, m + W);
    if (hi <= lo) continue;
    let best = m; let bestE = devOf(A, A.a, m) + devOf(B, m, B.b);
    for (let q = lo; q <= hi; q++) { const e = devOf(A, A.a, q) + devOf(B, q, B.b); if (e < bestE - 1e-6) { bestE = e; best = q; } }
    if (best !== m) { A.b = best; B.a = best; }
  }
  for (const sg of segs) if (sg.t === 'arc') { const c = fitCircle(P, sg.a, sg.b); if (c) { sg.c = c; sg.sweep = sweepOf(P, sg.a, sg.b, c); } }
}

function segmentRun(P: P[], s: number, e: number, o: FitOpts, tol: number, maxR: number, out: Seg[], trim: number, freeStart: boolean, freeEnd: boolean) {
  const first = out.length;
  segmentRunRaw(P, s, e, o, tol, maxR, out, trim, freeStart, freeEnd);
  if (o.output === 'lines_arcs') relocate(P, out.slice(first));
}

function segmentRunRaw(P: P[], s: number, e: number, o: FitOpts, tol: number, maxR: number, out: Seg[], trim: number, freeStart: boolean, freeEnd: boolean) {
  // Next to a corner the smoothing has rounded the path a little, so the first and last few samples of a run are not held to the tolerance.
  // (The ends of an open path are real ends, not corners, so they are not trimmed.)
  const t = Math.max(0, Math.min(trim, Math.floor((e - s) / 4)));
  const clipA = (a: number) => (a === s && !freeStart ? a + t : a);
  const clipB = (b: number) => (b === e && !freeEnd ? b - t : b);
  const lineTol = o.output === 'splines' ? tol * 0.4 : tol;
  const lineTest = (a: number, b: number) => { const ia = clipA(a); const ib = clipB(b); return ib <= ia + 1 || fitLine(P, ia, ib).maxDev <= lineTol; };
  const lineFitOf = (a: number, b: number) => { const ia = clipA(a); const ib = clipB(b); return fitLine(P, Math.min(ia, b - 1 < ia ? a : ia), Math.max(ib, ia + 1 > ib ? b : ib)); };
  const arcTest = (a: number, b: number) => arcOk(P, clipA(a), clipB(b), tol, maxR) !== null;
  void lineFitOf;
  if (o.output === 'polylines') {
    const keep = rdp(P, tol, s, e);
    for (let q = 0; q + 1 < keep.length; q++) out.push({ t: 'line', a: keep[q], b: keep[q + 1], fit: fitLine(P, keep[q], keep[q + 1]) });
    return;
  }
  if (o.output === 'splines') {
    // In splines mode only long, clearly straight stretches stay lines (about a tenth of the picture); the rest flows into curves.
    const Lmin = Math.max(tol * 24, maxR / 40);
    let i = s; let curveStart = -1;
    const flush = (to: number) => {
      if (curveStart < 0 || to <= curveStart) { curveStart = -1; return; }
      const sub = P.slice(curveStart, to + 1);
      const keep = rdp(sub, tol * 0.7).map((q) => q + curveStart);
      if (keep.length < 3 && to - curveStart > 2) keep.splice(1, 0, Math.round((curveStart + to) / 2));
      out.push({ t: 'spline', a: curveStart, b: to, ctrl: keep });
      curveStart = -1;
    };
    while (i < e) {
      const le = farthest(i, e, lineTest);
      const length = Math.hypot(P[le][0] - P[i][0], P[le][1] - P[i][1]);
      if (length >= Lmin || (le === e && curveStart < 0)) { flush(i); out.push({ t: 'line', a: i, b: le, fit: fitLine(P, clipA(i), Math.max(clipA(i) + 1, clipB(le))) }); i = le; } else {
        if (curveStart < 0) curveStart = i;
        i = Math.max(i + 1, le);
      }
    }
    flush(e);
    return;
  }
  // lines & arcs: grow the longer of a line or an arc from each start
  let i = s;
  while (i < e) {
    const le = farthest(i, e, lineTest);
    let ae = i;
    let arc: { c: CircleFit; sweep: number } | null = null;
    if (le < e || e - i > 6) {
      ae = farthestArc(i, e, arcTest);
      arc = ae > i ? arcOk(P, clipA(i), clipB(ae), tol, maxR) : null;
      if (!arc) ae = i;
    }
    if (arc && ae > le + 2 && ae - i >= 8) { out.push({ t: 'arc', a: i, b: ae, c: arc.c, sweep: arc.sweep }); i = ae; } else {
      out.push({ t: 'line', a: i, b: le, fit: fitLine(P, clipA(i), Math.max(clipA(i) + 1, clipB(le))) }); i = le;
    }
  }
}

// ───────────────────────────── whole pipeline ─────────────────────────────

export type TraceOpts = MaskOpts & {
  /** Box-blur radius (px) applied before thresholding: noise reduction. */
  blur: number;
  /** Smallest feature kept, in pixels of area. */
  minArea: number;
  /** 'shape' traces outlines of filled regions; 'line' thins strokes to centre lines; 'auto' decides from the stroke thickness. */
  kind: 'auto' | 'shape' | 'line';
};

export type TraceResult = {
  mask: Mask; skeleton: Mask | null; paths: Path[];
  kind: 'shape' | 'line'; threshold: number; polarity: 'dark' | 'light'; thickness: number; frameDropped: boolean;
};

export function traceImage(gray: Raster, o: TraceOpts): TraceResult {
  const b = blur(gray, o.blur);
  const { mask: raw, threshold, polarity } = makeMask(b, o);
  // pad a one-pixel background border so shapes touching the edge still close
  const padded: Mask = { w: raw.w + 2, h: raw.h + 2, data: new Uint8Array((raw.w + 2) * (raw.h + 2)) };
  for (let y = 0; y < raw.h; y++) for (let x = 0; x < raw.w; x++) padded.data[(y + 1) * padded.w + x + 1] = raw.data[y * raw.w + x];
  const cleaned = cleanMask(padded, o.minArea);
  const th = thickness(cleaned);
  const kind: 'shape' | 'line' = o.kind === 'auto' ? (th.thickness < Math.max(6, 0.03 * Math.max(gray.w, gray.h)) ? 'line' : 'shape') : o.kind;
  let paths: Path[]; let skeleton: Mask | null = null;
  let frameDropped = false;
  if (kind === 'line') {
    skeleton = thin(cleaned);
    paths = traceSkeleton(skeleton, Math.max(5, Math.min(gray.w, gray.h) * 0.012));
  } else paths = traceContours(cleaned);
  // shift out of the padded frame; drop an outline that is just the image border
  paths = paths.map((p) => ({ closed: p.closed, pts: p.pts.map((q) => [q[0] - 1, q[1] - 1] as P) }));
  paths = paths.filter((p) => {
    if (!p.closed) return true;
    const xs = p.pts.map((q) => q[0]); const ys = p.pts.map((q) => q[1]);
    const bw = Math.max(...xs) - Math.min(...xs); const bh = Math.max(...ys) - Math.min(...ys);
    const frame = bw >= gray.w * 0.985 && bh >= gray.h * 0.985 && Math.abs(Math.abs(polygonArea(p.pts)) - bw * bh) < bw * bh * 0.02;
    if (frame) frameDropped = true;
    return !frame;
  });
  const crop = (m: Mask): Mask => { const out = new Uint8Array(raw.w * raw.h); for (let y = 0; y < raw.h; y++) for (let x = 0; x < raw.w; x++) out[y * raw.w + x] = m.data[(y + 1) * m.w + x + 1]; return { w: raw.w, h: raw.h, data: out }; };
  return { mask: crop(cleaned), skeleton: skeleton ? crop(skeleton) : null, paths, kind, threshold, polarity, thickness: th.thickness, frameDropped };
}

/** Prepares traced paths for fitting: applies the smoothing brush strokes (in the same pixel space) before anything is fitted. */
export function brushPaths(paths: Path[], strokes: BrushStroke[]): Path[] {
  if (!strokes.length) return paths;
  return paths.map((p) => {
    const r = resample(p.pts, p.closed, 1);
    return { closed: p.closed, pts: applyBrush(r, p.closed, strokes) };
  });
}

export type Transform = { s: number; ox: number; oy: number; cx: number; cy: number };

/** Moves a fit from image pixels to sketch units: p' = o + (p - c) · s (no flip: both are y-down). */
export function transformFit(f: Fit, t: Transform): Fit {
  const m = (x: number, y: number): P => [t.ox + (x - t.cx) * t.s, t.oy + (y - t.cy) * t.s];
  return {
    ...f,
    points: f.points.map((p) => { const q = m(p.x, p.y); return { id: p.id, x: q[0], y: q[1] }; }),
    circles: f.circles.map((c) => ({ ...c, r: c.r * t.s })),
    arcs: f.arcs.map((a) => ({ ...a, r: a.r * t.s })),
    constraints: f.constraints.map((c) => {
      if (c.type === 'distance') return { ...c, args: { ...c.args, value: (c.args.value as number) * t.s } };
      if (c.type === 'radius') return { ...c, args: { ...c.args, value: (c.args.value as number) * t.s } };
      if (c.type === 'fixed') { const q = m(c.args.x as number, c.args.y as number); return { ...c, args: { ...c.args, x: q[0], y: q[1] } }; }
      return c;
    }),
  };
}

/** Bounding box of everything a fit contains, in the fit's own coordinates. */
export function fitBounds(f: Fit): { x0: number; y0: number; x1: number; y1: number } | null {
  const xs: number[] = []; const ys: number[] = [];
  const centres = new Set<string>([...f.circles.map((c) => c.center), ...f.arcs.map((a) => a.center)]);
  for (const p of f.points) if (!centres.has(p.id)) { xs.push(p.x); ys.push(p.y); }
  const pm = new Map(f.points.map((p) => [p.id, p] as const));
  for (const c of f.circles) { const p = pm.get(c.center); if (p) { xs.push(p.x - c.r, p.x + c.r); ys.push(p.y - c.r, p.y + c.r); } }
  for (const a of f.arcs) {
    const p = pm.get(a.center); if (!p) continue;
    const sw = ((a.end - a.start) % 360 + 360) % 360 || 360;
    for (let k = 0; k <= 8; k++) { const ang = ((a.start + (sw * k) / 8) * Math.PI) / 180; xs.push(p.x + a.r * Math.cos(ang)); ys.push(p.y + a.r * Math.sin(ang)); }
  }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
