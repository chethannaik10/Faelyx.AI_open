// Small solid-primitive mesh builders (closed, outward-facing triangles) used by the sample models and the tests.
import { meshFromTris, type Mesh } from '../cam/geometry';

type V = [number, number, number];

export function boxMesh(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh {
  const p: V[] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  const t: number[] = [];
  for (const q of quads) { t.push(...p[q[0]], ...p[q[1]], ...p[q[2]], ...p[q[0]], ...p[q[2]], ...p[q[3]]); }
  return meshFromTris(new Float32Array(t));
}

/** Cylinder along axis 0/1/2 (x/y/z), centre c (the two other coordinates), from a to b along the axis */
export function cylinderMesh(axis: 0 | 1 | 2, c1: number, c2: number, r: number, a: number, b: number, seg = 48): Mesh {
  const u = (axis + 1) % 3, v = (axis + 2) % 3;
  const P = (ang: number, along: number, rr = r): V => { const o: V = [0, 0, 0]; o[axis] = along; o[u] = c1 + rr * Math.cos(ang); o[v] = c2 + rr * Math.sin(ang); return o; };
  const t: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const A = P(a0, a), B = P(a1, a), C = P(a1, b), D = P(a0, b);
    t.push(...A, ...B, ...C, ...A, ...C, ...D);
    const ca = P(0, a, 0), cb = P(0, b, 0);
    t.push(...ca, ...B, ...A, ...cb, ...D, ...C);
  }
  return meshFromTris(new Float32Array(t));
}

export function sphereMesh(cx: number, cy: number, cz: number, r: number, seg = 32): Mesh {
  const t: number[] = [];
  const P = (th: number, ph: number): V => [cx + r * Math.sin(th) * Math.cos(ph), cy + r * Math.sin(th) * Math.sin(ph), cz + r * Math.cos(th)];
  for (let i = 0; i < seg; i++) for (let j = 0; j < seg * 2; j++) {
    const th0 = (i / seg) * Math.PI, th1 = ((i + 1) / seg) * Math.PI, ph0 = (j / (seg * 2)) * Math.PI * 2, ph1 = ((j + 1) / (seg * 2)) * Math.PI * 2;
    const a = P(th0, ph0), b = P(th0, ph1), c = P(th1, ph1), d = P(th1, ph0);
    if (i > 0) t.push(...a, ...d, ...b);
    if (i < seg - 1) t.push(...b, ...d, ...c);
  }
  return meshFromTris(new Float32Array(t));
}

/** Convex polygon (x,y) extruded along z from z0 to z1 — polygon must be counter-clockwise */
export function prismMesh(poly: [number, number][], z0: number, z1: number): Mesh {
  const t: number[] = [];
  const n = poly.length;
  for (let i = 1; i < n - 1; i++) {
    t.push(poly[0][0], poly[0][1], z0, poly[i + 1][0], poly[i + 1][1], z0, poly[i][0], poly[i][1], z0);
    t.push(poly[0][0], poly[0][1], z1, poly[i][0], poly[i][1], z1, poly[i + 1][0], poly[i + 1][1], z1);
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    t.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1, a[0], a[1], z0, b[0], b[1], z1, a[0], a[1], z1);
  }
  return meshFromTris(new Float32Array(t));
}

/** Swaps the y and z axes (keeps the surface orientation by reversing the winding). */
export function swapYZ(m: Mesh): Mesh {
  const t = new Float32Array(m.tris.length);
  for (let i = 0; i < m.tris.length; i += 9) {
    const a = [m.tris[i], m.tris[i + 2], m.tris[i + 1]], b = [m.tris[i + 3], m.tris[i + 5], m.tris[i + 4]], c = [m.tris[i + 6], m.tris[i + 8], m.tris[i + 7]];
    t.set([...a, ...c, ...b], i);
  }
  return meshFromTris(t);
}

/** Rectangular wing with a symmetric NACA 00xx section: chord along x, span along y, thickness along z. */
export function wingMesh(chord: number, tc: number, span: number, x0 = 0, y0 = 0, z0 = 0, n = 28): Mesh {
  const yt = (x: number) => 5 * tc * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) xs.push(0.5 * (1 - Math.cos((Math.PI * i) / n)));
  const poly: [number, number][] = [];
  for (let i = 0; i <= n; i++) poly.push([x0 + xs[i] * chord, z0 - yt(xs[i]) * chord]);                  // lower surface, LE → TE
  for (let i = n - 1; i >= 1; i--) poly.push([x0 + xs[i] * chord, z0 + yt(xs[i]) * chord]);              // upper surface, TE → LE
  const m = swapYZ(prismMesh(poly, y0, y0 + span));
  return m;
}
