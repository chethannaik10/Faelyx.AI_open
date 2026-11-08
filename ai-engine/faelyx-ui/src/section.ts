// Cross-section of the 3D Design part: a cutting plane (an X / Y / Z plane that slides, or a free plane drawn as a line on screen),
// the cut face ("cap") with its outline, and the section properties (area, centroid, second moments of area).
//
// The part is a triangle soup (STL). The plane is intersected with every triangle, the segments are chained into closed loops,
// the loops are nested (outer boundary / holes) and the cap is triangulated from them. Everything is computed on the CPU so the
// numbers shown next to the picture are exact for the mesh that is drawn.
import * as THREE from 'three';

export type SectionAxis = 'x' | 'y' | 'z' | 'free';

export type SectionCfg = {
  on: boolean;
  /** What a left-button drag does: slide the plane along its normal, or draw the line the plane passes through. */
  mode: 'slide' | 'line';
  axis: SectionAxis;
  /** Position along the axis in model coordinates (mm); null = the middle of the part. Axis planes only. */
  pos: number | null;
  /** Which side of the plane is cut away. Default: the +side is removed, so the cut face looks toward +axis. */
  flip: boolean;
  /** Free plane (axis === 'free'): model-space unit normal and a point on the plane. */
  normal: [number, number, number];
  point: [number, number, number];
};

export const SECTION_DEFAULT: SectionCfg = { on: false, mode: 'slide', axis: 'z', pos: null, flip: false, normal: [0, 0, 1], point: [0, 0, 0] };

export type SectionInfo = {
  empty: boolean;
  /** Slide range and the current position along the plane normal (model coordinates, mm). */
  min: number; max: number; pos: number;
  area: number; perimeter: number;
  centroid: [number, number, number];
  /** Second moments of area about the centroid: iu = ∫v² dA (about the u axis), iv = ∫u² dA (about the v axis). */
  iu: number; iv: number;
  width: number; height: number;
  loops: number; holes: number; open: boolean;
  uName: string; vName: string;
};

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;
const BASIS = {
  x: { u: [0, 1, 0], v: [0, 0, 1], un: 'Y', vn: 'Z' },
  y: { u: [1, 0, 0], v: [0, 0, 1], un: 'X', vn: 'Z' },
  z: { u: [1, 0, 0], v: [0, 1, 0], un: 'X', vn: 'Y' },
} as const;

export type SectionPlane = {
  /** Unit normal pointing to the side that is cut away (scene coordinates; the scene is the model shifted by the part offset). */
  n: THREE.Vector3;
  /** The un-flipped normal: the direction in which "position" grows. */
  base: THREE.Vector3;
  O: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3;
  uName: string; vName: string;
  min: number; max: number; pos: number;
};

/** The plane for a configuration, in scene coordinates. `box` is the part's bounding box in scene coordinates, `offset` the model-to-scene shift. */
export function planeOf(cfg: SectionCfg, box: THREE.Box3, offset: THREE.Vector3): SectionPlane {
  const base = new THREE.Vector3();
  const O = new THREE.Vector3();
  let u: THREE.Vector3; let v: THREE.Vector3; let uName = 'u'; let vName = 'v';
  let min: number; let max: number; let pos: number;
  const center = box.getCenter(new THREE.Vector3());
  if (cfg.axis === 'free') {
    base.fromArray(cfg.normal);
    if (base.lengthSq() < 1e-12) base.set(0, 0, 1);
    base.normalize();
    O.fromArray(cfg.point).sub(offset);
    u = new THREE.Vector3(0, 1, 0).cross(base);
    if (u.lengthSq() < 1e-6) u = new THREE.Vector3(1, 0, 0);
    u.normalize();
    v = base.clone().cross(u).normalize();
    min = Infinity; max = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).add(offset);
      const d = c.dot(base);
      if (d < min) min = d; if (d > max) max = d;
    }
    pos = new THREE.Vector3().fromArray(cfg.point).dot(base);
  } else {
    const a = AXIS_INDEX[cfg.axis];
    base.setComponent(a, 1);
    const b = BASIS[cfg.axis];
    u = new THREE.Vector3().fromArray(b.u as unknown as number[]); v = new THREE.Vector3().fromArray(b.v as unknown as number[]);
    uName = b.un; vName = b.vn;
    min = box.min.getComponent(a) + offset.getComponent(a); max = box.max.getComponent(a) + offset.getComponent(a);
    pos = cfg.pos == null || !Number.isFinite(cfg.pos) ? (min + max) / 2 : cfg.pos;
    O.copy(center).setComponent(a, pos - offset.getComponent(a));
  }
  return { n: cfg.flip ? base.clone().negate() : base.clone(), base, O, u, v, uName, vName, min, max, pos };
}

/** A copy of cfg with the plane moved to `pos` along its normal (clamped to the part). */
export function withPos(cfg: SectionCfg, pos: number, info: Pick<SectionInfo, 'min' | 'max' | 'pos'>): SectionCfg {
  const p = Math.min(info.max, Math.max(info.min, pos));
  if (cfg.axis !== 'free') return { ...cfg, pos: p };
  const n = new THREE.Vector3().fromArray(cfg.normal).normalize();
  const pt = new THREE.Vector3().fromArray(cfg.point).addScaledVector(n, p - info.pos);
  return { ...cfg, point: pt.toArray() as [number, number, number] };
}

export type SectionGeometry = {
  info: SectionInfo;
  /** Cap triangles (positions, uv, index) and the outline segments, in scene coordinates. */
  capPos: Float32Array; capUv: Float32Array; capIdx: number[];
  linePos: Float32Array;
  /** 2D extent of the cut in the plane's (u, v) frame. */
  box2: [number, number, number, number];
};

type P2 = [number, number];

function area2(loop: P2[]): number {
  let s = 0;
  for (let i = 0, n = loop.length; i < n; i++) { const a = loop[i], b = loop[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s;
}

function inside(pt: P2, loop: P2[]): boolean {
  let c = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Cut the triangle soup `pos` (9 floats per triangle, scene coordinates) with the plane. */
export function computeSection(pos: ArrayLike<number>, plane: SectionPlane, offset: THREE.Vector3, tile: number): SectionGeometry {
  const { n, O, u, v } = plane;
  const nT = Math.floor(pos.length / 9);
  const sx: number[] = []; const sy: number[] = []; const ex: number[] = []; const ey: number[] = [];
  const ska: string[] = []; const skb: string[] = [];
  const lines: number[] = [];
  const dd = new Float64Array(3);
  const q = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const cut = (ia: number, ib: number, da: number, db: number, out: number[]) => {
    // Always interpolate from the lexicographically smaller vertex so both triangles sharing an edge get the same point.
    const swap = pos[ia] > pos[ib] || (pos[ia] === pos[ib] && (pos[ia + 1] > pos[ib + 1] || (pos[ia + 1] === pos[ib + 1] && pos[ia + 2] > pos[ib + 2])));
    const a = swap ? ib : ia; const b = swap ? ia : ib; const dA = swap ? db : da; const dB = swap ? da : db;
    const t = dA / (dA - dB);
    out.push(pos[a] + (pos[b] - pos[a]) * t, pos[a + 1] + (pos[b + 1] - pos[a + 1]) * t, pos[a + 2] + (pos[b + 2] - pos[a + 2]) * t);
  };
  const pts: number[] = [];
  for (let t = 0; t < nT; t++) {
    const i = t * 9;
    for (let k = 0; k < 3; k++) {
      const d = (pos[i + 3 * k] - O.x) * n.x + (pos[i + 3 * k + 1] - O.y) * n.y + (pos[i + 3 * k + 2] - O.z) * n.z;
      dd[k] = Math.abs(d) < 1e-9 ? 1e-9 : d;
    }
    const s0 = dd[0] > 0; const s1 = dd[1] > 0; const s2 = dd[2] > 0;
    if (s0 === s1 && s1 === s2) continue;
    pts.length = 0;
    if (s0 !== s1) cut(i, i + 3, dd[0], dd[1], pts);
    if (s1 !== s2) cut(i + 3, i + 6, dd[1], dd[2], pts);
    if (s2 !== s0) cut(i + 6, i, dd[2], dd[0], pts);
    if (pts.length < 6) continue;
    const ax = (pts[0] - O.x) * u.x + (pts[1] - O.y) * u.y + (pts[2] - O.z) * u.z; const ay = (pts[0] - O.x) * v.x + (pts[1] - O.y) * v.y + (pts[2] - O.z) * v.z;
    const bx = (pts[3] - O.x) * u.x + (pts[4] - O.y) * u.y + (pts[5] - O.z) * u.z; const by = (pts[3] - O.x) * v.x + (pts[4] - O.y) * v.y + (pts[5] - O.z) * v.z;
    const ka = q(ax, ay); const kb = q(bx, by);
    if (ka === kb) continue;
    sx.push(ax); sy.push(ay); ex.push(bx); ey.push(by); ska.push(ka); skb.push(kb);
    lines.push(pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]);
  }
  const nSeg = sx.length;
  const info: SectionInfo = {
    empty: nSeg === 0, min: plane.min, max: plane.max, pos: plane.pos, area: 0, perimeter: 0, centroid: [0, 0, 0], iu: 0, iv: 0,
    width: 0, height: 0, loops: 0, holes: 0, open: false, uName: plane.uName, vName: plane.vName,
  };
  const empty: SectionGeometry = { info, capPos: new Float32Array(0), capUv: new Float32Array(0), capIdx: [], linePos: new Float32Array(0), box2: [0, 0, 0, 0] };
  if (nSeg === 0) return empty;

  // Chain the segments into loops.
  const ends = new Map<string, number[]>();
  const add = (k: string, s: number) => { const l = ends.get(k); if (l) l.push(s); else ends.set(k, [s]); };
  for (let s = 0; s < nSeg; s++) { add(ska[s], s); add(skb[s], s); }
  const used = new Uint8Array(nSeg);
  const loops: P2[][] = [];
  let open = false;
  for (let s = 0; s < nSeg; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const loop: P2[] = [[sx[s], sy[s]], [ex[s], ey[s]]];
    const start = ska[s]; let cur = skb[s]; let closed = false;
    for (;;) {
      if (cur === start) { closed = true; loop.pop(); break; }
      const cand = ends.get(cur);
      let nx = -1;
      if (cand) for (const c of cand) if (!used[c]) { nx = c; break; }
      if (nx < 0) break;
      used[nx] = 1;
      if (ska[nx] === cur) { loop.push([ex[nx], ey[nx]]); cur = skb[nx]; } else { loop.push([sx[nx], sy[nx]]); cur = ska[nx]; }
    }
    if (closed && loop.length >= 3) loops.push(loop); else open = true;
  }
  info.open = open;
  if (loops.length === 0) { info.empty = true; return { ...empty, linePos: new Float32Array(lines) }; }

  // Nesting: a loop inside an even number of larger loops is a boundary, inside an odd number it is a hole.
  const order = loops.map((l, i) => ({ l, i, a: Math.abs(area2(l)) / 2 })).sort((p, r) => r.a - p.a);
  const depth: number[] = []; const parent: number[] = [];
  for (let i = 0; i < order.length; i++) {
    let d = 0; let par = -1;
    for (let j = 0; j < i; j++) if (inside(order[i].l[0], order[j].l)) { d++; par = j; }
    depth.push(d); parent.push(par);
  }

  let A = 0; let Sx = 0; let Sy = 0; let Ixx = 0; let Iyy = 0; let perim = 0; let holes = 0;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  order.forEach((o, i) => {
    const L = o.l; const sgn = (depth[i] % 2 === 0 ? 1 : -1);
    if (sgn < 0) holes++;
    let a = 0; let sx_ = 0; let sy_ = 0; let ixx = 0; let iyy = 0;
    for (let k = 0, m = L.length; k < m; k++) {
      const p = L[k], r = L[(k + 1) % m];
      const cr = p[0] * r[1] - r[0] * p[1];
      a += cr; sx_ += (p[0] + r[0]) * cr; sy_ += (p[1] + r[1]) * cr;
      ixx += (p[1] * p[1] + p[1] * r[1] + r[1] * r[1]) * cr; iyy += (p[0] * p[0] + p[0] * r[0] + r[0] * r[0]) * cr;
      perim += Math.hypot(r[0] - p[0], r[1] - p[1]);
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    const s = Math.sign(a) || 1;
    A += sgn * s * a / 2; Sx += sgn * s * sx_ / 6; Sy += sgn * s * sy_ / 6; Ixx += sgn * s * ixx / 12; Iyy += sgn * s * iyy / 12;
  });
  info.loops = order.length; info.holes = holes; info.perimeter = perim;
  info.width = x1 - x0; info.height = y1 - y0;
  if (A > 1e-12) {
    const cx = Sx / A; const cy = Sy / A;
    info.area = A;
    info.iu = Ixx - A * cy * cy; info.iv = Iyy - A * cx * cx;
    const c = O.clone().addScaledVector(u, cx).addScaledVector(v, cy).add(offset);
    info.centroid = [c.x, c.y, c.z];
  }

  // Cap: every boundary loop with the holes directly inside it.
  const capPos: number[] = []; const capUv: number[] = []; const capIdx: number[] = [];
  order.forEach((o, i) => {
    if (depth[i] % 2 !== 0) return;
    const hs: THREE.Vector2[][] = [];
    for (let j = 0; j < order.length; j++) if (parent[j] === i && depth[j] === depth[i] + 1) hs.push(order[j].l.map((p) => new THREE.Vector2(p[0], p[1])));
    const contour = o.l.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    const all = contour.concat(...hs);
    const base = capPos.length / 3;
    for (const p of all) {
      capPos.push(O.x + u.x * p.x + v.x * p.y, O.y + u.y * p.x + v.y * p.y, O.z + u.z * p.x + v.z * p.y);
      capUv.push(p.x / tile, p.y / tile);
    }
    for (const t of tris) capIdx.push(base + t[0], base + t[1], base + t[2]);
  });
  return { info, capPos: new Float32Array(capPos), capUv: new Float32Array(capUv), capIdx, linePos: new Float32Array(lines), box2: [x0, y0, x1, y1] };
}

/** Diagonal hatching on an amber ground: the engineering drawing convention for a cut face. */
export function hatchTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2a65a'; g.fillRect(0, 0, 32, 32);
  g.strokeStyle = '#a2561b'; g.lineWidth = 2.2;
  g.beginPath();
  for (const o of [-32, 0, 32]) { g.moveTo(o, 32); g.lineTo(o + 32, 0); }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** The scene objects for a computed section: hatched cap, outline, and a faint frame showing where the plane is. */
export function buildSectionGroup(sec: SectionGeometry, plane: SectionPlane, hatch: THREE.Texture, margin: number): THREE.Group {
  const g = new THREE.Group();
  g.userData.section = true;
  if (sec.capIdx.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(sec.capPos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(sec.capUv, 2));
    geo.setIndex(sec.capIdx);
    const mat = new THREE.MeshBasicMaterial({ map: hatch, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const cap = new THREE.Mesh(geo, mat);
    cap.renderOrder = 3; cap.raycast = () => undefined;
    g.add(cap);
  }
  if (sec.linePos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(sec.linePos, 3));
    const ln = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3a1a05, depthTest: true }));
    ln.renderOrder = 4; ln.raycast = () => undefined;
    g.add(ln);
  }
  // Frame around the cut (or around the part when the plane misses it).
  const { O, u, v } = plane;
  const [x0, y0, x1, y1] = sec.info.empty ? [-margin, -margin, margin, margin] : sec.box2;
  const m = Math.max(margin, 1e-6);
  const corner = (a: number, b: number) => new THREE.Vector3().copy(O).addScaledVector(u, a).addScaledVector(v, b);
  const c = [corner(x0 - m, y0 - m), corner(x1 + m, y0 - m), corner(x1 + m, y1 + m), corner(x0 - m, y1 + m)];
  const fgeo = new THREE.BufferGeometry().setFromPoints(c);
  fgeo.setIndex([0, 1, 2, 0, 2, 3]);
  const quad = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  quad.renderOrder = 2; quad.raycast = () => undefined;
  g.add(quad);
  const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c), new THREE.LineBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.8 }));
  frame.renderOrder = 4; frame.raycast = () => undefined;
  g.add(frame);
  return g;
}

export function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | undefined;
    if (mat) mat.dispose();
  });
}
