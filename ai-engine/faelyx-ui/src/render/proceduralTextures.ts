// RenderX Engine — tileable procedural textures drawn on canvases, so metals,
// wood, carbon fibre and fabrics have real relief and colour without bundling
// image files. Every pattern wraps seamlessly (periodic noise, whole numbers of
// weave cells) so the UV scale / rotation controls never show a seam.

import type { ColorMapKind, ReliefKind } from './renderData';

const hash = (x: number, y: number, seed: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number, p: number) => ((a % p) + p) % p;

/** Periodic value noise: repeats every `px` cells in x and `py` cells in y. */
function vnoise(x: number, y: number, px: number, py: number, seed: number) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const u = smooth(x - xi); const v = smooth(y - yi);
  const a = hash(wrap(xi, px), wrap(yi, py), seed); const b = hash(wrap(xi + 1, px), wrap(yi, py), seed);
  const c = hash(wrap(xi, px), wrap(yi + 1, py), seed); const d = hash(wrap(xi + 1, px), wrap(yi + 1, py), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(u: number, v: number, px: number, py: number, octaves: number, seed: number) {
  let sum = 0; let amp = 0.5; let total = 0; let fx = px; let fy = py;
  for (let o = 0; o < octaves; o++) { sum += amp * vnoise(u * fx, v * fy, fx, fy, seed + o * 17); total += amp; amp *= 0.5; fx *= 2; fy *= 2; }
  return sum / total;
}
const frac = (x: number) => x - Math.floor(x);

type Pattern = (u: number, v: number) => number;

const weaveCells = 8;
function weaveHeight(u: number, v: number, twill: boolean) {
  const cx = Math.floor(u * weaveCells); const cy = Math.floor(v * weaveCells);
  const fu = frac(u * weaveCells); const fv = frac(v * weaveCells);
  const over = twill ? wrap(cx - cy, 4) < 2 : (cx + cy) % 2 === 0;
  const ridge = Math.pow(Math.sin(Math.PI * (over ? fv : fu)), 0.7);
  return 0.25 + 0.75 * ridge * (over ? 1 : 0.88);
}

const HEIGHT_PATTERNS: Record<Exclude<ReliefKind, 'none' | 'custom'>, Pattern> = {
  brushed: (u, v) => 0.25 + 0.75 * fbm(u, v, 3, 192, 2, 11),
  weave: (u, v) => weaveHeight(u, v, false),
  twill: (u, v) => weaveHeight(u, v, true),
  grain: (u, v) => { const warp = 2.6 * fbm(u, v, 3, 6, 3, 5); return 0.5 + 0.5 * Math.sin((v * 16 + warp) * Math.PI * 2) * (0.7 + 0.3 * fbm(u, v, 2, 40, 2, 9)); },
  dimple: (u, v) => 0.1 + 0.9 * Math.pow((0.5 + 0.5 * Math.cos(u * 14 * Math.PI * 2)) * (0.5 + 0.5 * Math.cos(v * 14 * Math.PI * 2)), 0.6) * (0.85 + 0.15 * fbm(u, v, 14, 14, 2, 3)),
  noise: (u, v) => fbm(u, v, 48, 48, 3, 21),
  knurl: (u, v) => Math.abs(Math.sin((u + v) * Math.PI * 12)) * Math.abs(Math.sin((u - v) * Math.PI * 12)),
};

function paint(size: number, fn: (u: number, v: number) => [number, number, number]) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn((x + 0.5) / size, (y + 0.5) / size);
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Grey-scale height map (white = high). */
export function heightCanvas(kind: Exclude<ReliefKind, 'none' | 'custom'>, size = 256): HTMLCanvasElement {
  const pat = HEIGHT_PATTERNS[kind];
  return paint(size, (u, v) => { const h = Math.max(0, Math.min(1, pat(u, v))) * 255; return [h, h, h]; });
}

/** Tangent-space normal map derived from a height canvas (wraps at the edges). */
export function normalCanvasFrom(height: HTMLCanvasElement, strength = 3): HTMLCanvasElement {
  const size = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, size, size).data;
  const h = (x: number, y: number) => src[(wrap(y, size) * size + wrap(x, size)) * 4] / 255;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!; const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = (h(x - 1, y) - h(x + 1, y)) * strength; let ny = (h(x, y + 1) - h(x, y - 1)) * strength; let nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const mix = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c: number[], k: number): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k];

const WOOD: Record<'oak' | 'walnut' | 'maple', [number[], number[]]> = {
  oak: [[214, 172, 112], [160, 112, 60]],
  walnut: [[110, 74, 50], [56, 34, 22]],
  maple: [[232, 208, 168], [200, 166, 118]],
};

/** Albedo maps (used with a white-ish material colour, or tinted by it). */
export function colorCanvas(kind: Exclude<ColorMapKind, 'none'>, size = 512): HTMLCanvasElement {
  if (kind === 'oak' || kind === 'walnut' || kind === 'maple') {
    const [light, dark] = WOOD[kind];
    return paint(size, (u, v) => {
      const warp = 2.8 * fbm(u, v, 3, 6, 3, 5);
      const ring = 0.5 + 0.5 * Math.sin((v * 12 + warp) * Math.PI * 2);
      const fibre = fbm(u, v, 2, 120, 2, 31);
      const t = Math.min(1, Math.max(0, ring * 0.75 + fibre * 0.35 - 0.1));
      return scale(mix(light, dark, t), 0.92 + 0.12 * fibre);
    });
  }
  if (kind === 'carbon-twill' || kind === 'carbon-plain') {
    const twill = kind === 'carbon-twill';
    return paint(size, (u, v) => {
      const h = weaveHeight(u, v, twill);
      const sheen = Math.pow(h, 2.2);
      const fibre = 0.85 + 0.15 * fbm(u, v, 4, 220, 2, 7);
      const k = (10 + 62 * sheen) * fibre;
      return [k, k * 1.02, k * 1.08];
    });
  }
  if (kind === 'denim') {
    return paint(size, (u, v) => {
      const cx = Math.floor(u * weaveCells); const cy = Math.floor(v * weaveCells);
      const warp = wrap(cx - cy, 4) < 2; // blue warp threads show on top
      const h = weaveHeight(u, v, true);
      const base = warp ? [38, 66, 118] : [196, 206, 222];
      const n = 0.88 + 0.24 * fbm(u, v, 64, 64, 2, 13);
      return scale(base, (0.55 + 0.6 * h) * n);
    });
  }
  if (kind === 'felt') {
    return paint(size, (u, v) => { const n = fbm(u, v, 96, 96, 3, 23); return scale([128, 128, 132], 0.7 + 0.6 * n); });
  }
  // nylon
  return paint(size, (u, v) => { const h = weaveHeight(u, v, false); const n = 0.9 + 0.2 * fbm(u, v, 64, 64, 2, 41); return scale([30, 30, 33], (0.5 + 0.9 * h) * n); });
}

/** An uploaded image drawn onto a (power-of-two-friendly) canvas. */
export function imageCanvas(img: CanvasImageSource & { width: number; height: number }, max = 1024): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * k)); canvas.height = Math.max(1, Math.round(img.height * k));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
