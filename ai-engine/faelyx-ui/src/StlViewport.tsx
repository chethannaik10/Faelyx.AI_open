import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { ProfileLoop } from './SketchWorkspace';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { loopOutline } from './profileLoops';
import { PLANE_BASIS, PRIMARY_PLANE_SIZE_MM, refLineOf, refPlaneFrame, toWorldLifted, type EdgePick, type Frame, type RefLike, type RefPlaneAxis, type SketchPlane } from './partDesign';
import { PLANE_COLORS } from './sketch/constants';
import { DEFAULT_NAV_SETTINGS, NAV_SCHEMES, type NavAction, type NavSettings } from './navigation';
import { buildSectionGroup, computeSection, disposeGroup, hatchTexture, planeOf, withPos, type SectionCfg, type SectionInfo, type SectionPlane } from './section';

// OrbitControls' own mouse actions for each navigation action.
const MOUSE_FOR: Record<NavAction, THREE.MOUSE> = { orbit: THREE.MOUSE.ROTATE, pan: THREE.MOUSE.PAN, zoom: THREE.MOUSE.DOLLY };
type InteractionMode = 'select' | 'orbit' | 'pan' | 'zoom';
// The button map for a left-button tool mode + navigation scheme. Middle is
// re-targeted per press (modifier keys can change it) — this is its default.
function buttonsFor(mode: InteractionMode, scheme: NavSettings['scheme']) {
  const def = NAV_SCHEMES[scheme];
  // 'select': a plain click picks, no camera move. A select-only scheme (Universal) never gives the left button a camera action in any mode.
  const left = def.leftSelectOnly ? undefined : mode === 'orbit' ? THREE.MOUSE.ROTATE : mode === 'pan' ? THREE.MOUSE.PAN : mode === 'zoom' ? THREE.MOUSE.DOLLY : undefined;
  return { LEFT: left, MIDDLE: MOUSE_FOR[def.middle({ shift: false, ctrl: false })], RIGHT: def.right ? MOUSE_FOR[def.right] : undefined };
}
// OrbitControls swaps ROTATE and PAN whenever Ctrl/Cmd/Shift is held at
// press time, so to get `action` while one is held we hand it the other.
function mouseWithMods(action: NavAction, modifierHeld: boolean): THREE.MOUSE {
  if (modifierHeld && action === 'orbit') return THREE.MOUSE.PAN;
  if (modifierHeld && action === 'pan') return THREE.MOUSE.ROTATE;
  return MOUSE_FOR[action];
}

// --- Box (trap / window) selection helpers ---------------------------------
type ScreenRect = { x0: number; y0: number; x1: number; y1: number };
const inRect = (x: number, y: number, r: ScreenRect) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
// Does the screen segment a-b touch the rectangle? (Liang–Barsky clip.)
function segmentTouchesRect(ax: number, ay: number, bx: number, by: number, r: ScreenRect): boolean {
  let t0 = 0; let t1 = 1;
  const dx = bx - ax; const dy = by - ay;
  const p = [-dx, dx, -dy, dy]; const q = [ax - r.x0, r.x1 - ax, ay - r.y0, r.y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
/** How a polyline (already in screen pixels) relates to the box: 'inside' = every point in it, 'touch' = crosses or lies in it, null = misses. */
function polylineVsRect(pts: { x: number; y: number }[], r: ScreenRect): 'inside' | 'touch' | null {
  if (pts.length === 0) return null;
  const all = pts.every((q) => inRect(q.x, q.y, r));
  if (all) return 'inside';
  if (pts.length === 1) return inRect(pts[0].x, pts[0].y, r) ? 'touch' : null;
  for (let i = 0; i + 1 < pts.length; i++) if (segmentTouchesRect(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, r)) return 'touch';
  return null;
}

// Soft radial pool of light used as the "shadow" under the floating planes (on a dark scene a shadow has to be light to be seen).
function radialShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(170,140,255,0.55)'); g.addColorStop(0.4, 'rgba(110,80,210,0.22)'); g.addColorStop(1, 'rgba(60,40,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}
// A blurred white square: tinted with the plane's colour it becomes a glow just beyond the plane's edge.
function squareGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.shadowColor = 'white'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(26, 26, 76, 76);
  }
  return new THREE.CanvasTexture(canvas);
}

// A kept sketch (Sketch.N) as the viewport draws it: its outlines on its
// own plane frame; `selected` draws it in the highlight colour.
export type ViewSketch = { id: string; loops: ProfileLoop[]; frame: Frame; selected?: boolean; points?: [number, number][] };
const PRIMARY_PLANES: SketchPlane[] = ['Front', 'Top', 'Right'];
const KEPT_SKETCH_COLOR = 0xb9a6f5;
const SELECTED_SKETCH_COLOR = 0xffb020;
// Test/debug hook on the viewport's DOM element (see the e2e specs): what
// is drawn, in model coordinates, and where a model point is on screen.
export type ViewportProbe = {
  planes: () => { plane: SketchPlane; color: string; size: number }[];
  sketches: () => { id: string; selected: boolean; points: number[][] }[];
  live: () => number[][];
  screenOf: (point: number[]) => { x: number; y: number };
  camera: () => { position: number[]; target: number[]; up: number[] };
};

// Reference Plane / Axis / Coordinate System (App.tsx's toolbox "REFERENCE
// GEOMETRY" section): visual-only 3D helpers, not sent to the backend since
// nothing cuts against them yet — real, positioned geometry in the scene,
// just not (yet) load-bearing for a feature the way a sketch plane is.
export type ReferenceGeom = RefLike;
/** The live offset plane(s) while a Reference Plane is being created: the anchored source plane and the new one(s) `delta` mm further along the axis, `count` of them at equal steps. */
/** The Reference Line being defined point to point: the picked points (null = not picked yet), shown as markers with a preview line. */
export type LinePreview = { a: number[] | null; b: number[] | null };
export type RefCreatePreview = { axis: 'XY' | 'XZ' | 'YZ'; base: number; delta: number; count: number; label: string };
/** What a plain click may select in the 3D view. */
export type SelectFilter = 'all' | 'points' | 'lines' | 'faces';
type SnapKind = 'end' | 'mid' | 'center' | 'point' | 'origin';
type SnapCand = { p: THREE.Vector3; kind: SnapKind; occludable?: boolean };
const SNAP_LABEL: Record<SnapKind, string> = { end: 'Endpoint', mid: 'Midpoint', center: 'Center', point: 'Point', origin: 'Origin' };

/**
 * The one piece of the Bolt.new mockup that was faking it: the "3D model"
 * in ModelViewport was a hand-drawn SVG polygon that never actually
 * changed. This replaces it with a real Three.js scene that renders
 * whatever STL bytes cad_server.py (the Open Cascade backend) sends back —
 * so when the Extrude depth field and Apply button actually work, this is
 * what draws the real result.
 *
 * `view`/`interactive` extend this for DrawingWorkspace's auto-generated
 * Front/Top/Right/Isometric drawing views: instead of the default free-
 * orbiting perspective camera, a fixed orthographic camera looks straight
 * down one axis (or the isometric corner), matching how a real drafting
 * view is a true projection, not a picture of the part from wherever the
 * user last spun it to. These are real views of the same STL geometry —
 * not a second, fake rendering path — just a different camera on it.
 *
 * The imperative handle (setQuickView/setRenderStyle/setHidden/fitAll/
 * setCompass) is the CATIA-workbook-driven addition: it lets the 3D
 * Design toolbar's Quick View / render-style / Hide / Fit All / Compass
 * buttons actually drive this same live viewport instead of sitting there
 * as decoration. It's only meaningful on the default interactive instance
 * (view/interactive unset) — DrawingWorkspace's fixed per-view instances
 * never receive a ref, so these methods are simply never called on them.
 */
type ViewDirection = 'iso' | 'front' | 'top' | 'right';
export type QuickView = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso';
export type RenderStyle = 'shaded' | 'shaded-edges' | 'wireframe';
export type CompassMode = 'translate' | 'rotate';

// CATIA Workbook's Measure Inertia: volume, surface area and center of
// mass for the current solid. Real numbers computed from the actual STL
// triangle mesh (divergence-theorem / signed-tetrahedron decomposition),
// not the placeholder figures the dock used to show.
export type Inertia = { volumeMm3: number; areaMm2: number; centroid: [number, number, number] };

/**
 * Volume, surface area and centroid of a closed triangle mesh, computed
 * exactly (up to mesh resolution) by decomposing it into signed
 * tetrahedra fanning out from the origin — the standard divergence-theorem
 * technique for solid mesh inertia. Every triangle (a, b, c) contributes a
 * tetrahedron (origin, a, b, c) whose signed volume is dot(a, cross(b, c))/6;
 * summing these signed volumes gives the true enclosed volume regardless of
 * where the origin sits (inside or outside the mesh), and weighting each
 * tetrahedron's own centroid — (a + b + c) / 4 — by its signed volume gives
 * the solid's overall centroid once divided by the total volume.
 */
function computeInertia(geometry: THREE.BufferGeometry): Inertia {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  let volume = 0; let area = 0;
  const centroidSum = new THREE.Vector3();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const getVertex = (triIndex: number, corner: number, out: THREE.Vector3) => {
    const vIdx = index ? index.getX(triIndex * 3 + corner) : triIndex * 3 + corner;
    out.fromBufferAttribute(pos, vIdx);
  };
  for (let t = 0; t < triCount; t++) {
    getVertex(t, 0, a); getVertex(t, 1, b); getVertex(t, 2, c);
    const signedVol = a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    volume += signedVol;
    const triCentroid = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(0.25);
    centroidSum.addScaledVector(triCentroid, signedVol);
    area += new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b, a),
      new THREE.Vector3().subVectors(c, a),
    ).length() * 0.5;
  }
  const centroid = Math.abs(volume) > 1e-9 ? centroidSum.divideScalar(volume) : new THREE.Vector3();
  return { volumeMm3: Math.abs(volume), areaMm2: area, centroid: [centroid.x, centroid.y, centroid.z] };
}

/** A saved camera angle (Named Views): where the camera sits, what it orbits, and which way is up. */
export type CameraState = { position: [number, number, number]; target: [number, number, number]; up: [number, number, number] };

// ---- Edge picking -------------------------------------------------------
// The part is a triangle mesh, but Fillet / Chamfer act on real B-rep edges.
// EdgesGeometry gives the sharp edges as loose segments; they are chained
// into whole edges (through vertices where exactly two segments meet), so a
// box edge or a circular rim is one pick. Each pick carries a few points that
// lie ON the real edge (mesh vertices do), which the server snaps to.
type EdgeChain = { path: THREE.Vector3[]; closed: boolean; length: number };

function buildEdgeChains(geom: THREE.BufferGeometry): { chains: EdgeChain[]; segChain: Int32Array } {
  const pos = geom.getAttribute('position');
  const nSeg = Math.floor(pos.count / 2);
  const keyOf = new Array<string>(pos.count);
  for (let i = 0; i < pos.count; i++) keyOf[i] = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  const adj = new Map<string, number[]>();
  const link = (k: string, seg: number) => { const l = adj.get(k); if (l) l.push(seg); else adj.set(k, [seg]); };
  for (let sIdx = 0; sIdx < nSeg; sIdx++) { if (keyOf[2 * sIdx] !== keyOf[2 * sIdx + 1]) { link(keyOf[2 * sIdx], sIdx); link(keyOf[2 * sIdx + 1], sIdx); } }
  const segChain = new Int32Array(nSeg).fill(-1);
  const visited = new Uint8Array(nSeg);
  const chains: EdgeChain[] = [];
  const vec = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
  for (let start = 0; start < nSeg; start++) {
    if (visited[start] || keyOf[2 * start] === keyOf[2 * start + 1]) continue;
    visited[start] = 1;
    const id = chains.length;
    const members = [start];
    const path = [vec(2 * start), vec(2 * start + 1)];
    let closed = false;
    // Walk on from one end through vertices shared by exactly two segments.
    const walk = (fromKey: string, push: (v: THREE.Vector3) => void) => {
      let curKey = fromKey; let curSeg = start;
      for (;;) {
        const list = adj.get(curKey);
        if (!list || list.length !== 2) return;
        const next = list[0] === curSeg ? list[1] : list[0];
        if (next === start) { closed = true; return; }
        if (visited[next]) return;
        visited[next] = 1; members.push(next);
        const a = keyOf[2 * next]; const b = keyOf[2 * next + 1];
        const forward = a === curKey;
        push(vec(forward ? 2 * next + 1 : 2 * next));
        curKey = forward ? b : a; curSeg = next;
      }
    };
    walk(keyOf[2 * start + 1], (v) => path.push(v));
    if (!closed) walk(keyOf[2 * start], (v) => path.unshift(v));
    for (const m of members) segChain[m] = id;
    let length = 0;
    for (let i = 1; i < path.length; i++) length += path[i].distanceTo(path[i - 1]);
    chains.push({ path, closed, length });
  }
  return { chains, segChain };
}

/** What is sent to the server for a chain (points shifted back to model coordinates). */
function edgePickOf(chain: EdgeChain, offset: THREE.Vector3): EdgePick {
  const { path, closed } = chain;
  const pts: THREE.Vector3[] = [];
  if (!closed && path.length === 2) {
    for (const t of [0.25, 0.5, 0.75]) pts.push(path[0].clone().lerp(path[1], t));
  } else {
    // Vertices (exactly on the true edge) nearest 1/4, 1/2, 3/4 of the way along, each nudged a hair
    // toward the next vertex so a point never sits exactly on a corner shared with a neighbouring edge.
    const first = closed ? 0 : 1; const last = closed ? path.length - 2 : path.length - 2;
    const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
    for (const t of [0.25, 0.5, 0.75]) {
      let best = first; let bestD = Infinity;
      for (let i = first; i <= last; i++) { const d = Math.abs(cum[i] - t * chain.length); if (d < bestD) { bestD = d; best = i; } }
      const a = path[best]; const b = path[best + 1] ?? path[best];
      const nudge = Math.min(0.3, a.distanceTo(b) / 4);
      pts.push(a.clone().lerp(b, a.distanceTo(b) > 0 ? nudge / a.distanceTo(b) : 0));
    }
  }
  const dedup: THREE.Vector3[] = [];
  for (const p of pts) if (!dedup.some((q) => q.distanceTo(p) < 0.05)) dedup.push(p);
  const m = (v: THREE.Vector3) => [v.x + offset.x, v.y + offset.y, v.z + offset.z];
  const mid = m(dedup[Math.min(1, dedup.length - 1)]);
  const a = path[0]; const b = path[path.length - 1];
  const dir = b.clone().sub(a);
  const straight = !closed && path.every((p) => dir.lengthSq() > 0 && p.clone().sub(a).cross(dir).length() / dir.length() < 0.02);
  return {
    key: mid.map((v) => v.toFixed(1)).join(','),
    kind: straight ? 'line' : 'curve',
    length: Math.round(chain.length * 100) / 100,
    points: dedup.map(m),
    path: path.map(m),
  };
}

// ---- Drawing (Generative Drafting) views -------------------------------
// Line work for a projected view, the way a drafting package shows it: sharp
// edges plus silhouette edges (where the surface turns away from the viewer,
// which is what outlines a cylinder seen from the side). Which of those are
// hidden behind the part is decided by the depth buffer when drawing.
const VIEW_TOWARD: Record<ViewDirection, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1), top: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0), iso: new THREE.Vector3(1, 0.875, 1).normalize(),
};
function drawingEdgePositions(geom: THREE.BufferGeometry, toward: THREE.Vector3, sharpDeg = 25): Float32Array {
  const pos = geom.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);
  const ids = new Map<string, number>();
  const idOf = (i: number) => {
    const k = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    let id = ids.get(k); if (id === undefined) { id = ids.size; ids.set(k, id); } return id;
  };
  const normals: THREE.Vector3[] = [];
  const edgeFaces = new Map<string, { a: number; b: number; faces: number[] }>();
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i0 + 1); c.fromBufferAttribute(pos, i0 + 2);
    normals.push(b.clone().sub(a).cross(c.clone().sub(a)).normalize());
    const v = [idOf(i0), idOf(i0 + 1), idOf(i0 + 2)];
    for (let e = 0; e < 3; e++) {
      const va = v[e]; const vb = v[(e + 1) % 3];
      if (va === vb) continue;
      const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`;
      const rec = edgeFaces.get(key);
      if (rec) rec.faces.push(t); else edgeFaces.set(key, { a: i0 + e, b: i0 + ((e + 1) % 3), faces: [t] });
    }
  }
  const cosSharp = Math.cos((sharpDeg * Math.PI) / 180);
  const out: number[] = [];
  const push = (i: number) => out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  for (const rec of edgeFaces.values()) {
    const [f1, f2] = rec.faces;
    let draw = false;
    if (f2 === undefined) draw = true; // open boundary
    else {
      const n1 = normals[f1]; const n2 = normals[f2];
      const d1 = n1.dot(toward); const d2 = n2.dot(toward);
      draw = n1.dot(n2) < cosSharp || d1 * d2 < -1e-12;
    }
    if (draw) { push(rec.a); push(rec.b); }
  }
  return new Float32Array(out);
}

/** The primary planes sit exactly on the origin (no floating): sketches, Reference Planes and their offsets are all measured from the same place, so parallel planes read as parallel. */
const PLANE_ELEVATION_MM = 0;

// In-plane axes of the three principal planes (their offset runs along the missing axis).
const planePoint = (axis: string, coord: number, u: number, v: number): THREE.Vector3 =>
  axis === 'XY' ? new THREE.Vector3(u, v, coord) : axis === 'XZ' ? new THREE.Vector3(u, coord, v) : new THREE.Vector3(coord, u, v);
const squareOutline = (axis: string, coord: number, cu = 0, cv = 0, half = PRIMARY_PLANE_SIZE_MM / 2): THREE.Vector3[] =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => planePoint(axis, coord, cu + a * half, cv + b * half));
/** The square outline of a custom Reference Plane (one not parallel to X, Y or Z), from its own frame. */
const frameOutline = (f: { origin: number[]; xDir: number[]; normal: number[] }, half = PRIMARY_PLANE_SIZE_MM / 2): THREE.Vector3[] => {
  const o = new THREE.Vector3(...f.origin); const X = new THREE.Vector3(...f.xDir).normalize();
  const Y = new THREE.Vector3(...f.normal).normalize().cross(X);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => o.clone().addScaledVector(X, a * half).addScaledVector(Y, b * half));
};
/** A line with a real pixel width (WebGL's own lines are always 1 px). The material is registered so a resize can update it. */
function thickLine(pts: THREE.Vector3[], color: number, width: number, res: THREE.Vector2, mats: Set<LineMaterial>, opts: { dashed?: boolean; opacity?: number } = {}): Line2 {
  const geom = new LineGeometry();
  geom.setPositions(pts.flatMap((v) => [v.x, v.y, v.z]));
  const mat = new LineMaterial({ color, linewidth: width, transparent: opts.opacity !== undefined, opacity: opts.opacity ?? 1, dashed: !!opts.dashed, dashSize: 2.2, gapSize: 1.6, depthTest: false });
  mat.resolution.copy(res);
  mats.add(mat);
  const line = new Line2(geom, mat);
  if (opts.dashed) line.computeLineDistances();
  line.renderOrder = 7;
  line.raycast = () => undefined;
  return line;
}
function clearGroup(group: THREE.Group, mats: Set<LineMaterial>) {
  while (group.children.length) {
    const child = group.children.pop() as THREE.Object3D;
    child.traverse((obj) => {
      const o = obj as THREE.Mesh | THREE.Line;
      o.geometry?.dispose();
      const mat = o.material as THREE.Material | THREE.Material[] | undefined;
      const each = (m: THREE.Material) => { if (m instanceof LineMaterial) mats.delete(m); const t = (m as THREE.SpriteMaterial).map; t?.dispose(); m.dispose(); };
      if (Array.isArray(mat)) mat.forEach(each); else if (mat) each(mat);
    });
  }
}
// Centre of the circle through three 2-D points (null when they are collinear).
function circumcenter2(a: [number, number], b: [number, number], c: [number, number]): [number, number] | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const s = (p: [number, number]) => p[0] * p[0] + p[1] * p[1];
  return [(s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d, (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d];
}
// Distance from point (px,py) to the segment a-b, all in screen pixels.
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// X / Y / Z axis colours, shared by the main origin triad and the one on every Reference Plane.
const AXIS_COLORS = { X: 0xff5a5a, Y: 0x5ae07a, Z: 0x5a8dff } as const;
function textSprite(text: string, color: string, wMm: number, hMm: number, px = 22): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = Math.round(256 * (hMm / wMm));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    let size = Math.round(px * 2.2);
    ctx.font = `600 ${size}px Manrope, sans-serif`;
    // Shrink the text until it fits the sprite, so long names are never clipped.
    const fit = (canvas.width - 12) / Math.max(ctx.measureText(text).width, 1);
    if (fit < 1) { size = Math.max(8, Math.floor(size * fit)); ctx.font = `600 ${size}px Manrope, sans-serif`; }
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, 6, canvas.height / 2);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(wMm, hMm, 1);
  sprite.raycast = () => undefined;
  sprite.renderOrder = 6;
  return sprite;
}
/** An X (red), Y (green), Z (blue) axis triad with arrow heads and letters, centred on `origin`. Drawn over the part so it never hides inside it. */
function makeAxisTriad(origin: THREE.Vector3, len: number, tag = ''): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(origin);
  const dirs: [keyof typeof AXIS_COLORS, THREE.Vector3][] = [['X', new THREE.Vector3(1, 0, 0)], ['Y', new THREE.Vector3(0, 1, 0)], ['Z', new THREE.Vector3(0, 0, 1)]];
  for (const [name, dir] of dirs) {
    const color = AXIS_COLORS[name];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(len)]), new THREE.LineBasicMaterial({ color, depthTest: false }));
    line.renderOrder = 6; line.raycast = () => undefined;
    g.add(line);
    const head = new THREE.Mesh(new THREE.ConeGeometry(len * 0.045, len * 0.14, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    head.position.copy(dir).multiplyScalar(len - len * 0.07);
    head.renderOrder = 6; head.raycast = () => undefined;
    g.add(head);
    const label = textSprite(`${name}${tag}`, `#${new THREE.Color(color).getHexString()}`, len * 0.3, len * 0.15);
    label.position.copy(dir).multiplyScalar(len + len * 0.1).add(new THREE.Vector3(len * 0.07, len * 0.04, 0));
    g.add(label);
  }
  return g;
}

export type StlViewportHandle = {
  /** Pick the mouse navigation scheme (CATIA / SolidWorks / Blender / Autodesk) and whether the wheel zooms toward the cursor. */
  setNavigation: (settings: NavSettings) => void;
  /** Drop the picked face (and its marker), as Esc does. */
  clearPick: () => void;
  /** Snapshot the current camera angle (for Named Views). */
  getCameraState: () => CameraState | null;
  /** Restore a snapshot taken with getCameraState. */
  setCameraState: (state: CameraState) => void;
  /** Snap the (perspective, interactive) camera to one of CATIA's Quick View directions, keeping current zoom distance. */
  setQuickView: (view: QuickView) => void;
  /** Shaded / Shaded with Edges / Wireframe — CATIA's Render Style menu. */
  setRenderStyle: (style: RenderStyle) => void;
  /** Hide/Show the whole part. There's one body client-side right now, so this is part-level, not per-feature. */
  setHidden: (hidden: boolean) => void;
  /** Fit All In — reframe the camera so the whole bounding sphere of the part is visible. */
  fitAll: () => void;
  /** Toggle the draggable XYZ compass (Three.js TransformControls) for repositioning/reorienting the part in the viewport. Visual only — it does not feed back into the feature history or the backend. */
  setCompass: (enabled: boolean, mode?: CompassMode) => void;
  /** Orbit the camera azimuthally around the current target by this many degrees — the ViewCube's ‹ › arrows. */
  rotateAzimuth: (degrees: number) => void;
  /**
   * CATIA's Select/Orbit/Pan/Zoom toolbar is four distinct tool *modes* —
   * only one left-button mouse behavior is active at a time. OrbitControls
   * normally binds all three to different mouse buttons at once, so this
   * remaps the left mouse button per mode instead: 'select' leaves it
   * unbound (a plain click doesn't spin the camera, it picks a face), the
   * other three each give left-drag that one behavior, matching the
   * workbook's toolbar. Right-drag always pans and scroll always zooms
   * regardless of mode, and — regardless of mode — Alt+Left-drag always
   * orbits too (see the capture-phase listener in the setup effect above),
   * so pan/zoom/rotate by mouse are never locked behind switching modes.
   */
  setInteractionMode: (mode: 'select' | 'orbit' | 'pan' | 'zoom') => void;
  /**
   * CATIA Workbook's Normal View: rotates the camera so it looks squarely
   * down the normal of the last face the user clicked in the viewport
   * (see the picking listener below), matching how CATIA requires you to
   * select a planar face first, then invoke Normal View. A no-op with no
   * face picked yet.
   */
  setNormalView: () => void;
  /** The last face picked in 'select' mode (hit point + outward normal), for Sketch on Face. */
  getPickedFace: () => { point: [number, number, number]; normal: [number, number, number] } | null;
  /** Look squarely at the cut face of the cross-section from the removed side. */
  viewSection: () => void;
};

// Unit direction the camera sits along (relative to its target) for each
// Quick View, plus the up-vector needed so top/bottom don't hit gimbal
// lock (looking straight down/up needs an up vector that isn't parallel
// to the view direction).
const QUICK_VIEW_DIRS: Record<QuickView, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
  iso: new THREE.Vector3(1, 0.875, 1).normalize(),
};
const QUICK_VIEW_UPS: Record<QuickView, THREE.Vector3> = {
  front: new THREE.Vector3(0, 1, 0),
  back: new THREE.Vector3(0, 1, 0),
  right: new THREE.Vector3(0, 1, 0),
  left: new THREE.Vector3(0, 1, 0),
  top: new THREE.Vector3(0, 0, -1),
  bottom: new THREE.Vector3(0, 0, 1),
  iso: new THREE.Vector3(0, 1, 0),
};

const StlViewport = forwardRef<StlViewportHandle, {
  stlData: ArrayBuffer | null;
  view?: ViewDirection;
  interactive?: boolean;
  /** Fired with real Measure Inertia numbers every time the geometry (re)loads, and with null when there's nothing loaded. */
  onInertia?: (inertia: Inertia | null) => void;
  /**
   * The CURRENT Sketch & 2D profile (same traced loops Extrude/Pocket would
   * consume), drawn as a live purple outline at Z = sketchZ. This is what
   * "links" 2D and 3D: instead of the 3D view sitting empty until you
   * Apply changes, it shows the actual profile you're sketching, right now,
   * on the plane it will be extruded from — so you see the connection
   * before committing a feature, not just the result after.
   */
  sketchLoops?: ProfileLoop[];
  /** Z height of the sketch plane the preview outline sits on (App.tsx's `stackTop`). */
  sketchZ?: number;
  /** A picked-face sketch support; when set, the outline is drawn on that plane instead of at Z = sketchZ. */
  sketchPlane?: { origin: number[]; xDir: number[]; normal: number[] } | null;
  /** Fired when a face is picked in 'select' mode (or the pick is cleared: an empty click, new geometry). */
  onFacePicked?: (face: { point: [number, number, number]; normal: [number, number, number] } | null) => void;
  /** Reference Plane/Axis/Coordinate System entries — see ReferenceGeom above. */
  referenceGeoms?: ReferenceGeom[];
  /** Kept sketches, drawn as wireframes on their own planes. */
  keptSketches?: ViewSketch[];
  /** How far sketch wireframes (live and kept) are drawn off their plane, along its normal. Display only. */
  sketchLift?: number;
  /** Draw the three primary planes (Front, Top, Right) at the origin. */
  showPlanes?: boolean;
  /** Draw the X, Y, Z axes at the origin (Reference Planes always carry their own). */
  showAxes?: boolean;
  /** The Reference Plane being created (live preview with its dimension callout), or null. */
  refCreate?: RefCreatePreview | null;
  /** Reference Line · Point – Point: the points picked so far, drawn as markers with the line between them. */
  linePreview?: LinePreview | null;
  /** Reference Plane creation mode: a click on a plane or a planar face picks the plane to offset from (`value` as partDesign's parsePlaneSource reads it; `note` explains a refusal). */
  refPickEnabled?: boolean;
  onRefSourcePicked?: (value: string | null, note?: string) => void;
  /** The callout's value was typed (negative = the other side). */
  onRefDistanceEdit?: (distance: number) => void;
  onRefFlip?: () => void;
  /** The new plane's drag handle moved: its signed offset along the fixed axis, from the source plane. */
  onRefDelta?: (delta: number) => void;
  /** A tool wants a 3D point (Reference Line / Point): a click on a snap indicator reports that point. */
  snapPickEnabled?: boolean;
  onSnapPicked?: (point: number[]) => void;
  /** Reference elements drawn highlighted (selected in the tree or the view), and a click on one. */
  selectedRefIds?: string[];
  onRefPicked?: (id: string | null, additive: boolean) => void;
  /** What a plain click selects: everything, only points, only lines (reference lines, sketch curves, edges), or only faces. */
  selectFilter?: SelectFilter;
  /** Double-click on a primary plane / a kept sketch's wireframe, in 'select' mode. A sketch under the cursor wins over a plane. */
  onPlaneDoubleClick?: (plane: SketchPlane) => void;
  onSketchDoubleClick?: (id: string) => void;
  /** Two quick middle-button clicks in place (Fit to screen). */
  onMiddleDoubleClick?: () => void;
  /** An edge tool is active: edges highlight under the cursor and a click picks them. */
  edgePickEnabled?: boolean;
  /** Edges picked so far (drawn amber). The viewport only reports clicks; the owner keeps the list. */
  selectedEdges?: EdgePick[];
  /** Drawing sheet mode (with `view`): paper-white background, hidden-line views at a real drawing scale. `pxPerMm` is screen pixels per model mm, `scale` the drawing ratio (0.5 = 1:2). */
  drawing?: { pxPerMm: number; scale: number; hidden: boolean };
  /** A click on an edge (additive with Shift/Ctrl/Cmd), or null for a click on empty space. */
  onEdgePicked?: (edge: EdgePick | null, additive: boolean) => void;
  /** A single click on a kept sketch's wireframe. */
  onSketchPicked?: (id: string) => void;
  /** Double-click on a Reference Plane (not a primary one): the owner opens Sketch Mode on it. */
  onReferencePlaneDoubleClick?: (refId: string) => void;
  /** A left-button drag draws a selection box. Left-to-right = window (only what lies fully inside), right-to-left = crossing (whatever touches). Kept sketches are always selectable; edges too while an edge tool is active. */
  onBoxSelect?: (hit: { sketchIds: string[]; edges: EdgePick[]; additive: boolean; crossing: boolean }) => void;
  /** Cross-section tool: the cutting plane, what the user drags, and the numbers for the cut face. */
  section?: SectionCfg;
  onSectionChange?: (cfg: SectionCfg) => void;
  onSectionInfo?: (info: SectionInfo | null) => void;
}>(function StlViewport({ stlData, view, interactive = true, onInertia, sketchLoops, sketchZ = 0, sketchPlane = null, referenceGeoms, onFacePicked, keptSketches, sketchLift = 0, showPlanes = false, showAxes = true, refCreate = null, linePreview = null, refPickEnabled = false, onRefSourcePicked, onRefDistanceEdit, onRefFlip, onRefDelta, snapPickEnabled = false, onSnapPicked, selectedRefIds, onRefPicked, selectFilter = 'all', onPlaneDoubleClick, onSketchDoubleClick, onMiddleDoubleClick, edgePickEnabled = false, selectedEdges, onEdgePicked, onSketchPicked, onReferencePlaneDoubleClick, onBoxSelect, drawing, section, onSectionChange, onSectionInfo }, ref) {
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const applyOrthoRef = useRef<() => void>(() => {});
  const drawLinesRef = useRef<{ visible: THREE.LineSegments; hidden: THREE.LineSegments } | null>(null);
  const onEdgePickedRef = useRef(onEdgePicked);
  onEdgePickedRef.current = onEdgePicked;
  const onSketchPickedRef = useRef(onSketchPicked);
  onSketchPickedRef.current = onSketchPicked;
  const onReferencePlaneDoubleClickRef = useRef(onReferencePlaneDoubleClick);
  onReferencePlaneDoubleClickRef.current = onReferencePlaneDoubleClick;
  const onBoxSelectRef = useRef(onBoxSelect);
  onBoxSelectRef.current = onBoxSelect;
  const sectionRef = useRef(section); sectionRef.current = section;
  const onSectionChangeRef = useRef(onSectionChange); onSectionChangeRef.current = onSectionChange;
  const onSectionInfoRef = useRef(onSectionInfo); onSectionInfoRef.current = onSectionInfo;
  const sectionGroupRef = useRef<THREE.Group | null>(null);
  const sectionPlaneRef = useRef<SectionPlane | null>(null);
  const sectionInfoRef = useRef<SectionInfo | null>(null);
  const sectionClipRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, -1), 0));
  const sectionHatchRef = useRef<THREE.Texture | null>(null);
  const partBoxRef = useRef<THREE.Box3 | null>(null);
  const edgePickEnabledRef = useRef(edgePickEnabled);
  edgePickEnabledRef.current = edgePickEnabled;
  // Whole edges built from the mesh's sharp edges, which segment belongs to which, the hovered one, and the drawn highlights.
  const chainsRef = useRef<{ chains: EdgeChain[]; segChain: Int32Array }>({ chains: [], segChain: new Int32Array(0) });
  const hoverChainRef = useRef(-1);
  const edgeOverlayRef = useRef<THREE.Group | null>(null);
  const selectedEdgesRef = useRef<EdgePick[]>([]);
  const redrawEdgeOverlayRef = useRef<() => void>(() => {});
  const onPlaneDoubleClickRef = useRef(onPlaneDoubleClick);
  onPlaneDoubleClickRef.current = onPlaneDoubleClick;
  const onMiddleDoubleClickRef = useRef(onMiddleDoubleClick);
  onMiddleDoubleClickRef.current = onMiddleDoubleClick;
  const onSketchDoubleClickRef = useRef(onSketchDoubleClick);
  onSketchDoubleClickRef.current = onSketchDoubleClick;
  // The setup effect's listeners are registered once, so read the latest
  // callback through a ref.
  const onFacePickedRef = useRef(onFacePicked);
  onFacePickedRef.current = onFacePicked;
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const edgesRef = useRef<THREE.LineSegments | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // Normal View's picked face (world-space point + normal) and the small
  // marker sphere that shows the user what got picked. Raycasting only
  // runs in 'select' interaction mode (see the click listener below), so
  // it never fights with orbit/pan/zoom's own left-drag behavior.
  const pickedFaceRef = useRef<{ point: THREE.Vector3; normal: THREE.Vector3 } | null>(null);
  const pickMarkerRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const interactionModeRef = useRef<InteractionMode>('orbit');
  const renderStyleRef = useRef<RenderStyle>('shaded');
  const navRef = useRef<NavSettings>(DEFAULT_NAV_SETTINGS);
  // Live outline of the current Sketch & 2D profile — see sketchLoops prop.
  const sketchGroupRef = useRef<THREE.Group | null>(null);
  // Reference Plane/Axis/Coordinate System helpers — see referenceGeoms prop.
  const referenceGroupRef = useRef<THREE.Group | null>(null);
  // Kept sketches' wireframes and the three primary planes.
  const keptGroupRef = useRef<THREE.Group | null>(null);
  const planesGroupRef = useRef<THREE.Group | null>(null);
  const axesGroupRef = useRef<THREE.Group | null>(null);
  const refPreviewGroupRef = useRef<THREE.Group | null>(null);
  const hlGroupRef = useRef<THREE.Group | null>(null);
  const calloutRef = useRef<{ el: HTMLDivElement; render: () => void } | null>(null);
  const calloutAnchorRef = useRef<THREE.Vector3 | null>(null);
  const snapGlyphRef = useRef<{ el: HTMLDivElement; show: (x: number, y: number, c: SnapCand | null) => void } | null>(null);
  const snapCacheRef = useRef<SnapCand[] | null>(null);
  const lastSnapRef = useRef<{ kind: SnapKind; point: number[] } | null>(null);
  const lineMatsRef = useRef<Set<LineMaterial>>(new Set());
  const lineResRef = useRef(new THREE.Vector2(800, 600));
  const hoverRefIdRef = useRef<string | null>(null);
  const hoverSketchIdRef = useRef<string | null>(null);
  const pickHoverRef = useRef<{ axis: string; coord: number; cu: number; cv: number } | null>(null);
  const redrawHighlightsRef = useRef<() => void>(() => {});
  const refCreateRef = useRef(refCreate); refCreateRef.current = refCreate;
  const linePreviewRef = useRef<LinePreview | null>(linePreview); linePreviewRef.current = linePreview;
  const refPickEnabledRef = useRef(refPickEnabled); refPickEnabledRef.current = refPickEnabled;
  const onRefSourcePickedRef = useRef(onRefSourcePicked); onRefSourcePickedRef.current = onRefSourcePicked;
  const onRefDistanceEditRef = useRef(onRefDistanceEdit); onRefDistanceEditRef.current = onRefDistanceEdit;
  const onRefFlipRef = useRef(onRefFlip); onRefFlipRef.current = onRefFlip;
  const onRefDeltaRef = useRef(onRefDelta); onRefDeltaRef.current = onRefDelta;
  const snapPickEnabledRef = useRef(snapPickEnabled); snapPickEnabledRef.current = snapPickEnabled;
  const onSnapPickedRef = useRef(onSnapPicked); onSnapPickedRef.current = onSnapPicked;
  const sketchVisGroupRef = useRef<THREE.Group | null>(null);
  const onRefPickedRef = useRef(onRefPicked); onRefPickedRef.current = onRefPicked;
  const selectedRefIdsRef = useRef<string[]>(selectedRefIds ?? []); selectedRefIdsRef.current = selectedRefIds ?? [];
  const selectFilterRef = useRef(selectFilter); selectFilterRef.current = selectFilter;
  const referenceGeomsRef = useRef<ReferenceGeom[]>(referenceGeoms ?? []); referenceGeomsRef.current = referenceGeoms ?? [];
  const keptSketchesRef = useRef<ViewSketch[]>(keptSketches ?? []); keptSketchesRef.current = keptSketches ?? [];
  const sketchLiftRef = useRef(sketchLift); sketchLiftRef.current = sketchLift;
  const probeRef = useRef<{ live: number[][]; sketches: { id: string; selected: boolean; points: number[][] }[] }>({ live: [], sketches: [] });
  // The part mesh is re-centered on the origin for viewing; this is the
  // model-space point that now sits at the origin. Picks are converted back
  // by adding it, and the sketch outline / reference geometry (drawn in
  // model coordinates) are shifted by it so they line up with the part.
  const modelOffsetRef = useRef(new THREE.Vector3());

  // Scene, camera, renderer, lights, grid, controls — set up once.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    // Match the app's own background (--bg / .sketch-svg's #090910), so the
    // 3D viewport reads as the same workspace as Sketch & 2D rather than a
    // differently-toned "3D viewer" bolted on the side.
    scene.background = new THREE.Color(drawingRef.current ? 0xffffff : 0x09080f);
    sceneRef.current = scene;

    const aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    // A drawing view (view is set) is a fixed, non-orbiting orthographic
    // projection along a real axis — front/top/right are true elevations,
    // not a perspective snapshot, and isometric here means the actual
    // isometric corner (equal angles to all 3 axes), same convention as
    // the "ISO" viewcube corner already used elsewhere in this app.
    const frustum = 90;
    const orthoPositions: Record<ViewDirection, [number, number, number]> = {
      front: [0, 0, 220],
      top: [0, 220, 0.001],
      right: [220, 0, 0],
      iso: [160, 140, 160],
    };
    if (view) {
      const ortho = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, drawingRef.current ? 20000 : 5000);
      const [px, py, pz] = drawingRef.current ? VIEW_TOWARD[view].clone().multiplyScalar(8000).toArray() as [number, number, number] : orthoPositions[view];
      ortho.position.set(px, py, pz);
      ortho.lookAt(0, 0, 0);
      ortho.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0);
      ortho.lookAt(0, 0, 0);
      camera = ortho;
    } else {
      const persp = new THREE.PerspectiveCamera(50, aspect, 0.1, 5000);
      persp.position.set(120, 100, 140);
      camera = persp;
    }
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(150, 200, 100);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8f76cc, 0.3);
    fill.position.set(-100, 50, -100);
    scene.add(fill);

    // No ground grid or floor: the modeling view is open dark space, and the
    // only thing under the origin planes is their soft light shadow (below).

    let planeShadow: THREE.Mesh | null = null;
    if (!view) {
      const sketchGroup = new THREE.Group();
      scene.add(sketchGroup);
      sketchGroupRef.current = sketchGroup;
      const referenceGroup = new THREE.Group();
      scene.add(referenceGroup);
      referenceGroupRef.current = referenceGroup;
      const keptGroup = new THREE.Group();
      scene.add(keptGroup);
      keptGroupRef.current = keptGroup;
      const refPreviewGroup = new THREE.Group();
      scene.add(refPreviewGroup);
      refPreviewGroupRef.current = refPreviewGroup;
      const hlGroup = new THREE.Group();
      scene.add(hlGroup);
      hlGroupRef.current = hlGroup;
      const sketchVisGroup = new THREE.Group();
      scene.add(sketchVisGroup);
      sketchVisGroupRef.current = sketchVisGroup;

      // The three primary planes: a compact square each, at the origin, in
      // the Sketch & 2D plane colours, with its name at one corner.
      const planesGroup = new THREE.Group();
      const size = PRIMARY_PLANE_SIZE_MM;
      const planeGlow = squareGlowTexture();
      // The planes' shadow on the ground grid; follows the group (see animate) and fades with height.
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.9, size * 1.9), new THREE.MeshBasicMaterial({ map: radialShadowTexture(), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.05;
      shadow.renderOrder = 1;
      shadow.visible = false;
      shadow.raycast = () => undefined;
      scene.add(shadow);
      planeShadow = shadow;
      for (const name of PRIMARY_PLANES) {
        const b = PLANE_BASIS[name];
        const color = new THREE.Color(PLANE_COLORS[name]);
        const geometry = new THREE.PlaneGeometry(size, size);
        const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
        face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...b.x), new THREE.Vector3(...b.y), new THREE.Vector3(...b.n)));
        face.userData.plane = name;
        // Lift the face (local to planesGroup, so it survives the group's
        // model-centering moves) above the ground grid, which stays at Y=0.
        face.position.set(0, PLANE_ELEVATION_MM, 0);
        // A soft glow just beyond the plane's edge, so it reads as a lit sheet floating over the grid.
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.7, size * 1.7), new THREE.MeshBasicMaterial({ color, map: planeGlow, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        halo.position.z = -0.05;
        halo.raycast = () => undefined; // never picked: only the face itself opens a sketch
        face.add(halo);
        face.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })));
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = '500 22px Manrope, sans-serif';
          ctx.fillStyle = `#${color.clone().lerp(new THREE.Color(0xffffff), 0.45).getHexString()}`;
          ctx.textBaseline = 'middle';
          ctx.fillText(name, 4, 20);
        }
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
        label.scale.set(16, 5, 1);
        label.position.set(-size / 2 + 9, size / 2 - 4, 0);
        face.add(label);
        planesGroup.add(face);
      }
      planesGroup.visible = false;
      scene.add(planesGroup);
      planesGroupRef.current = planesGroup;
      // The main X, Y, Z axes through the origin.
      const axesGroup = new THREE.Group();
      axesGroup.add(makeAxisTriad(new THREE.Vector3(), PRIMARY_PLANE_SIZE_MM * 0.75));
      scene.add(axesGroup);
      axesGroupRef.current = axesGroup;
    }

    const controls = interactive ? new OrbitControls(camera, renderer.domElement) : null;
    controlsRef.current = controls;
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      // The wheel zooms about the point under the cursor; middle-drag pans.
      controls.zoomToCursor = navRef.current.zoomToCursor;
      controls.mouseButtons = buttonsFor(interactionModeRef.current, navRef.current.scheme);
    }

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls?.update();
      const planes = planesGroupRef.current;
      if (planeShadow && planes) {
        // Height of the planes over the grid (the group is shifted by the model's centering offset).
        const height = PLANE_ELEVATION_MM + planes.position.y;
        planeShadow.visible = planes.visible && height > 2;
        if (planeShadow.visible) {
          planeShadow.position.set(planes.position.x, 0.05, planes.position.z);
          (planeShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.6 - height / 250);
        }
      }
      // The dimension callout follows its anchor on the 3D dimension line.
      const callout = calloutRef.current; const anchor = calloutAnchorRef.current;
      if (callout) {
        if (anchor && refCreateRef.current) {
          const v = anchor.clone().sub(modelOffsetRef.current).project(camera);
          if (v.z > 1 || v.z < -1) callout.el.style.display = 'none';
          else { callout.el.style.display = 'flex'; callout.el.style.left = `${((v.x + 1) / 2) * mount.clientWidth}px`; callout.el.style.top = `${((1 - v.y) / 2) * mount.clientHeight}px`; }
        } else callout.el.style.display = 'none';
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth;
      const h = Math.max(mount.clientHeight, 1);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = w / h;
      } else {
        const d = drawingRef.current;
        if (d) { camera.left = -w / 2 / d.pxPerMm; camera.right = w / 2 / d.pxPerMm; camera.top = h / 2 / d.pxPerMm; camera.bottom = -h / 2 / d.pxPerMm; }
        else {
          const a = w / h;
          camera.left = -frustum * a; camera.right = frustum * a;
          camera.top = frustum; camera.bottom = -frustum;
        }
      }
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      lineResRef.current.set(w, h);
      for (const m of lineMatsRef.current) m.resolution.set(w, h);
    };
    applyOrthoRef.current = handleResize;
    if (drawingRef.current) handleResize();
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // Face picking for Normal View: a plain click (not a drag-orbit) in
    // 'select' interaction mode raycasts against the current mesh and
    // remembers the hit point + face normal. Only fires on a genuine
    // click (pointerup within a few pixels of pointerdown) so it doesn't
    // also fire at the end of an orbit/pan drag.
    let downX = 0; let downY = 0;
    const handlePointerDown = (event: PointerEvent) => { downX = event.clientX; downY = event.clientY; };
    // Which whole edge (index into chainsRef) is under the pointer, ignoring edges hidden behind the part.
    const edgeAt = (event: { clientX: number; clientY: number }): number => {
      const cam = cameraRef.current; const edges = edgesRef.current;
      const { segChain } = chainsRef.current;
      if (!cam || !edges || segChain.length === 0) return -1;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = raycasterRef.current;
      ray.setFromCamera(ndc, cam);
      const dist = cam.position.distanceTo(controls?.target ?? new THREE.Vector3());
      ray.params.Line = { threshold: dist * 0.012 };
      const hits = ray.intersectObject(edges, false);
      if (!hits.length) return -1;
      const mesh = meshRef.current;
      let meshDist = Infinity;
      if (mesh && mesh.visible && !(mesh.material as THREE.MeshStandardMaterial).wireframe) meshDist = ray.intersectObject(mesh, false)[0]?.distance ?? Infinity;
      for (const h of hits) if (h.distance <= meshDist + dist * 0.02) return segChain[Math.floor((h.index ?? 0) / 2)] ?? -1;
      return -1;
    };

    // --- Overlays: the dimension callout of a Reference Plane being created, and the snap indicator ---------------
    if (!view) {
      if (getComputedStyle(mount).position === 'static') mount.style.position = 'relative';
      const callout = document.createElement('div');
      callout.className = 'ref-callout';
      callout.style.display = 'none';
      const flipBtn = document.createElement('button');
      flipBtn.className = 'rc-flip'; flipBtn.type = 'button'; flipBtn.textContent = '⇅'; flipBtn.title = 'Flip the offset direction'; flipBtn.setAttribute('aria-label', 'Flip the offset direction');
      const valEl = document.createElement('span');
      valEl.className = 'rc-val'; valEl.title = 'Double-click to type the offset';
      const noteEl = document.createElement('span');
      noteEl.className = 'rc-note';
      callout.append(flipBtn, valEl, noteEl);
      mount.appendChild(callout);
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'dblclick', 'click', 'contextmenu']) callout.addEventListener(type, (e) => e.stopPropagation());
      flipBtn.addEventListener('click', () => onRefFlipRef.current?.());
      const shown = () => { const c = refCreateRef.current; return c ? `${Math.round(Math.abs(c.delta) * 1000) / 1000} mm` : ''; };
      const render = () => {
        const c = refCreateRef.current;
        if (!c) return;
        if (!valEl.querySelector('input')) valEl.textContent = shown();
        noteEl.textContent = c.count > 1 ? `× ${c.count}` : '';
        flipBtn.textContent = c.delta >= 0 ? '⇅' : '⇵';
      };
      valEl.addEventListener('dblclick', () => {
        const c = refCreateRef.current;
        if (!c || valEl.querySelector('input')) return;
        const input = document.createElement('input');
        input.className = 'rc-input'; input.type = 'text'; input.value = String(Math.round(Math.abs(c.delta) * 1000) / 1000);
        valEl.textContent = ''; valEl.appendChild(input);
        input.focus(); input.select();
        let done = false;
        const finish = (apply: boolean) => {
          if (done) return; done = true;
          const n = Number(input.value.replace(',', '.'));
          valEl.textContent = shown();
          if (apply && Number.isFinite(n) && n !== 0) onRefDistanceEditRef.current?.(n);
          render();
        };
        input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
        input.addEventListener('blur', () => finish(true));
      });
      calloutRef.current = { el: callout, render };

      const glyph = document.createElement('div');
      glyph.className = 'snap-glyph'; glyph.style.display = 'none';
      const shape = document.createElement('span'); shape.className = 'snap-shape';
      const label = document.createElement('span'); label.className = 'snap-label';
      glyph.append(shape, label);
      mount.appendChild(glyph);
      snapGlyphRef.current = {
        el: glyph,
        show: (x, y, c) => {
          if (!c) { glyph.style.display = 'none'; lastSnapRef.current = null; return; }
          glyph.style.display = 'block'; glyph.style.left = `${x}px`; glyph.style.top = `${y}px`;
          shape.className = `snap-shape snap-${c.kind}`; label.textContent = SNAP_LABEL[c.kind];
          const o = modelOffsetRef.current;
          lastSnapRef.current = { kind: c.kind, point: [c.p.x + o.x, c.p.y + o.y, c.p.z + o.z] };
        },
      };
    }

    // Reference points / lines / axes under the cursor, by distance on screen.
    const screenOfModel = (v: number[], rect: DOMRect, cam: THREE.Camera) => {
      const o = modelOffsetRef.current;
      const q = new THREE.Vector3(v[0] - o.x, v[1] - o.y, v[2] - o.z).project(cam);
      return { x: ((q.x + 1) / 2) * rect.width, y: ((1 - q.y) / 2) * rect.height, behind: q.z > 1 };
    };
    const refAt = (event: { clientX: number; clientY: number }, filter: SelectFilter): string | null => {
      const cam = cameraRef.current; const refs = referenceGeomsRef.current;
      if (!cam || !refs.length || filter === 'faces') return null;
      cam.updateMatrixWorld();
      const rect = renderer.domElement.getBoundingClientRect();
      const px = event.clientX - rect.left; const py = event.clientY - rect.top;
      let best: string | null = null; let bestD = Infinity;
      for (const r of refs) {
        let d = Infinity;
        if (r.kind === 'point' && r.a && filter !== 'lines') {
          const a = screenOfModel(r.a, rect, cam);
          if (!a.behind) d = Math.hypot(px - a.x, py - a.y) - 3; // points win a close tie against a line through them
          if (d > 10) d = Infinity;
        } else if ((r.kind === 'line' || r.kind === 'axis') && filter !== 'points') {
          const L = r.kind === 'line' ? (r.a && r.b ? { a: r.a, b: r.b } : null) : (() => { const l = refLineOf(r); return l ? { a: [l.p[0] - l.d[0] * 100, l.p[1] - l.d[1] * 100, l.p[2] - l.d[2] * 100], b: [l.p[0] + l.d[0] * 100, l.p[1] + l.d[1] * 100, l.p[2] + l.d[2] * 100] } : null; })();
          if (L) {
            const a = screenOfModel(L.a, rect, cam); const b = screenOfModel(L.b, rect, cam);
            if (!a.behind && !b.behind) d = distToSegment(px, py, a.x, a.y, b.x, b.y);
            if (d > 7) d = Infinity;
          }
        }
        if (d < bestD) { bestD = d; best = r.id; }
      }
      return best;
    };
    // A kept sketch's wireframe under the cursor (by raycast, like the click that picks it).
    const sketchAt = (event: { clientX: number; clientY: number }): string | null => {
      const cam = cameraRef.current; const kept = keptGroupRef.current;
      if (!cam || !kept || !kept.children.length) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = raycasterRef.current;
      ray.setFromCamera(ndc, cam);
      ray.params.Line = { threshold: cam.position.distanceTo(controls?.target ?? new THREE.Vector3()) * 0.012 };
      const hit = ray.intersectObjects(kept.children, false)[0];
      return hit ? String(hit.object.userData.sketchId) : null;
    };
    // Reference Plane creation: what a click would offset from — a primary plane, a Reference Plane, or a planar face of the part.
    type SourcePick = { value: string | null; note?: string; axis?: string; coord?: number; cu?: number; cv?: number };
    const refSourceAt = (event: { clientX: number; clientY: number }): SourcePick | null => {
      const cam = cameraRef.current;
      if (!cam) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = raycasterRef.current;
      ray.setFromCamera(ndc, cam);
      const cands: (SourcePick & { dist: number })[] = [];
      const planes = planesGroupRef.current;
      const ph = planes && planes.visible ? ray.intersectObjects(planes.children, false)[0] : undefined;
      if (ph) { const name = ph.object.userData.plane as SketchPlane; const axis = name === 'Top' ? 'XY' : name === 'Front' ? 'XZ' : 'YZ'; cands.push({ dist: ph.distance, value: axis, axis, coord: 0, cu: 0, cv: 0 }); }
      const rg = referenceGroupRef.current;
      const rh = rg ? ray.intersectObjects(rg.children, false).find((h) => h.object.userData.refId) : undefined;
      if (rh) { const r = referenceGeomsRef.current.find((x) => x.id === rh.object.userData.refId); if (r) cands.push({ dist: rh.distance, value: r.id, axis: r.frame ? undefined : r.axis, coord: r.offset, cu: 0, cv: 0 }); }
      const mesh = meshRef.current;
      const mh = mesh && mesh.visible ? ray.intersectObject(mesh, false)[0] : undefined;
      if (mh && mh.face) {
        const n = mh.face.normal.clone().transformDirection(mesh!.matrixWorld).normalize();
        const o = modelOffsetRef.current;
        const ax = Math.abs(n.x) > 0.9995 ? 'YZ' : Math.abs(n.y) > 0.9995 ? 'XZ' : Math.abs(n.z) > 0.9995 ? 'XY' : null;
        if (ax) {
          const hp = mh.point.clone().add(o);
          const coord = Math.round((ax === 'YZ' ? hp.x : ax === 'XZ' ? hp.y : hp.z) * 1e4) / 1e4;
          const sign = (ax === 'YZ' ? n.x : ax === 'XZ' ? n.y : n.z) >= 0 ? 1 : -1;
          cands.push({ dist: mh.distance, value: `face:${ax}:${coord}:${sign}`, axis: ax, coord, cu: ax === 'XY' ? hp.x : ax === 'XZ' ? hp.x : hp.y, cv: ax === 'XY' ? hp.y : hp.z });
        } else cands.push({ dist: mh.distance, value: null, note: 'That face is not parallel to the XY, XZ or YZ plane. Pick a plane, a Reference Plane, or a face aligned with one of them.' });
      }
      if (!cands.length) return null;
      cands.sort((a, b) => a.dist - b.dist);
      return cands[0];
    };

    // --- 3D snapping: end points, midpoints and centres of wireframe geometry --------------------------------
    const snapCands = (): SnapCand[] => {
      if (snapCacheRef.current) return snapCacheRef.current;
      const out: SnapCand[] = [];
      const off = modelOffsetRef.current;
      const sc = (v: number[]) => new THREE.Vector3(v[0] - off.x, v[1] - off.y, v[2] - off.z);
      out.push({ p: sc([0, 0, 0]), kind: 'origin' });
      for (const sk of keptSketchesRef.current) {
        const W = (p: [number, number]) => sc(toWorldLifted(sk.frame, p, 0)); // the real geometry, not the display lift
        const mid2 = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        for (const pt of sk.points ?? []) out.push({ p: W(pt), kind: 'point' });
        for (const loop of sk.loops) {
          if (loop.kind === 'circle') { out.push({ p: W(loop.center), kind: 'center' }); continue; }
          if (loop.kind === 'polygon') {
            const pts = loop.points;
            for (let i = 0; i < pts.length; i++) { out.push({ p: W(pts[i]), kind: 'end' }); out.push({ p: W(mid2(pts[i], pts[(i + 1) % pts.length])), kind: 'mid' }); }
            continue;
          }
          let cur = loop.start; out.push({ p: W(cur), kind: 'end' });
          for (const seg of loop.segments) {
            if (seg.kind === 'arc') {
              const c = circumcenter2(cur, seg.mid, seg.end);
              if (c) out.push({ p: W(c), kind: 'center' });
              out.push({ p: W(seg.mid), kind: 'mid' });
            } else out.push({ p: W(mid2(cur, seg.end)), kind: 'mid' });
            out.push({ p: W(seg.end), kind: 'end' });
            cur = seg.end;
          }
        }
      }
      for (const r of referenceGeomsRef.current) {
        if (r.kind === 'point' && r.a) out.push({ p: sc(r.a), kind: 'point' });
        else if (r.kind === 'line' && r.a && r.b) { out.push({ p: sc(r.a), kind: 'end' }); out.push({ p: sc(r.b), kind: 'end' }); out.push({ p: sc([(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, (r.a[2] + r.b[2]) / 2]), kind: 'mid' }); }
      }
      for (const chain of chainsRef.current.chains) {
        const path = chain.path;
        if (path.length < 2) continue;
        if (!chain.closed) { out.push({ p: path[0].clone(), kind: 'end', occludable: true }); out.push({ p: path[path.length - 1].clone(), kind: 'end', occludable: true }); }
        // Midpoint: half-way along the chain's length.
        let acc = 0; const half = chain.length / 2;
        for (let i = 0; i + 1 < path.length; i++) {
          const l = path[i].distanceTo(path[i + 1]);
          if (acc + l >= half) { out.push({ p: path[i].clone().lerp(path[i + 1], l > 0 ? (half - acc) / l : 0), kind: 'mid', occludable: true }); break; }
          acc += l;
        }
        // A closed round chain (a hole, a boss, a fillet end) has a centre.
        if (chain.closed && path.length >= 8) {
          const c = path.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / path.length);
          const rs = path.map((v) => v.distanceTo(c)); const rm = rs.reduce((a, b) => a + b, 0) / rs.length;
          if (rm > 1e-6 && rs.every((r) => Math.abs(r - rm) < rm * 0.02)) out.push({ p: c, kind: 'center', occludable: true });
        }
      }
      snapCacheRef.current = out;
      return out;
    };
    const updateSnap = (event: { clientX: number; clientY: number }) => {
      const glyph = snapGlyphRef.current; const cam = cameraRef.current;
      if (!glyph || !cam) return;
      const cands = snapCands();
      if (!cands.length) { glyph.show(0, 0, null); return; }
      cam.updateMatrixWorld();
      const rect = renderer.domElement.getBoundingClientRect();
      const px = event.clientX - rect.left; const py = event.clientY - rect.top;
      let best: SnapCand | null = null; let bestScore = 13; let bx = 0; let by = 0;
      const v = new THREE.Vector3();
      for (const c of cands) {
        v.copy(c.p).project(cam);
        if (v.z > 1 || v.z < -1) continue;
        const sx = ((v.x + 1) / 2) * rect.width; const sy = ((1 - v.y) / 2) * rect.height;
        const d = Math.hypot(px - sx, py - sy);
        const score = d - (c.kind === 'end' || c.kind === 'point' || c.kind === 'origin' ? 3 : c.kind === 'center' ? 1.5 : 0); // end points beat midpoints on a near tie
        if (score < bestScore) { bestScore = score; best = c; bx = sx; by = sy; }
      }
      if (best && best.occludable) {
        const mesh = meshRef.current;
        if (mesh && mesh.visible && !(mesh.material as THREE.MeshStandardMaterial).wireframe) {
          const dir = best.p.clone().sub(cam.position); const dist = dir.length();
          raycasterRef.current.set(cam.position, dir.normalize());
          const h = raycasterRef.current.intersectObject(mesh, false)[0];
          if (h && h.distance < dist - Math.max(dist * 0.02, 0.5)) best = null;
        }
      }
      glyph.show(bx, by, best);
    };
    // --- Reference Plane drag handle: slide the new plane along its fixed axis --------------------------------
    const axisVec = (axis: string) => (axis === 'XY' ? new THREE.Vector3(0, 0, 1) : axis === 'XZ' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
    const nearHandle = (e: { clientX: number; clientY: number }): boolean => {
      const c = refCreateRef.current; const cam = cameraRef.current;
      if (!c || !cam || !refPickEnabledRef.current) return false;
      cam.updateMatrixWorld();
      const rect = renderer.domElement.getBoundingClientRect();
      const h = screenOfModel(planePoint(c.axis, c.base + c.delta, 0, 0).toArray(), rect, cam);
      return !h.behind && Math.hypot(e.clientX - rect.left - h.x, e.clientY - rect.top - h.y) <= 16;
    };
    // Where along the fixed axis the pointer is: the point of the axis closest to the pointer's ray.
    const axisParam = (e: { clientX: number; clientY: number }): number | null => {
      const cam = cameraRef.current; const c = refCreateRef.current;
      if (!cam || !c) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = raycasterRef.current;
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), cam);
      const o = ray.ray.origin.clone().add(modelOffsetRef.current); const d = ray.ray.direction.clone();
      const n = axisVec(c.axis);
      const b = d.dot(n); const denom = 1 - b * b;
      if (denom < 1e-4) return null;
      return (n.dot(o) - b * d.dot(o)) / denom;
    };
    let handleDrag: { grab: number } | null = null;
    let swallowUp = false;
    const handleRefDown = (e: PointerEvent) => {
      if (e.button !== 0 || !nearHandle(e)) return;
      const c = refCreateRef.current; const t = axisParam(e);
      if (!c || t === null) return;
      handleDrag = { grab: t - (c.base + c.delta) };
      e.stopImmediatePropagation(); e.preventDefault();
      renderer.domElement.style.cursor = 'grabbing';
    };
    const handleRefMove = (e: PointerEvent) => {
      if (!handleDrag) return;
      const c = refCreateRef.current; const t = axisParam(e);
      if (!c || t === null) return;
      // Whole millimetres while dragging; hold Shift for hundredths.
      const raw = t - handleDrag.grab - c.base;
      const delta = e.shiftKey ? Math.round(raw * 100) / 100 : Math.round(raw);
      if (delta !== 0 && delta !== c.delta) onRefDeltaRef.current?.(delta);
    };
    const handleRefUp = () => {
      if (!handleDrag) return;
      handleDrag = null; swallowUp = true;
      setTimeout(() => { swallowUp = false; }, 0);
      renderer.domElement.style.cursor = '';
    };
    renderer.domElement.addEventListener('pointerdown', handleRefDown, true);
    window.addEventListener('pointermove', handleRefMove);
    window.addEventListener('pointerup', handleRefUp);
    const handlePointerUp = (event: PointerEvent) => {
      if (handleDrag || swallowUp) return;
      if (event.button !== 0 || event.altKey) return;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 4) return;
      const cam = cameraRef.current;
      if (!cam) return;
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      // 0a. A tool wants a 3D point: a click on a snap indicator (origin, centre, end, midpoint, sketch / reference point) gives it.
      // (With a plane to pick as well, e.g. Parallel through point, a snap indicator under the cursor wins and anything else is the plane.)
      if (snapPickEnabledRef.current) {
        updateSnap(event);
        const sn = lastSnapRef.current;
        if (sn) { onSnapPickedRef.current?.(sn.point.map((v) => Math.round(v * 1000) / 1000)); return; }
      }
      // 0. Reference Plane creation: a click on a plane or a planar face picks what to offset from.
      if (refPickEnabledRef.current) {
        const s = refSourceAt(event);
        if (s) onRefSourcePickedRef.current?.(s.value, s.note);
        return;
      }
      const filter = selectFilterRef.current;
      // 1. An edge tool is active: a click on an edge picks it.
      if (edgePickEnabledRef.current) {
        const c = edgeAt(event);
        if (c >= 0) { onEdgePickedRef.current?.(edgePickOf(chainsRef.current.chains[c], modelOffsetRef.current), additive); return; }
      }
      // 1b. Reference points, lines and axes (the selection filter decides which kinds count).
      const refId = refAt(event, filter);
      if (refId) { onRefPickedRef.current?.(refId, additive); return; }
      const clearRefs = () => { if (!additive) onRefPickedRef.current?.(null, false); };
      // 2. A click on a kept sketch's wireframe picks that sketch (the profile for Pad and the other sketch-based tools).
      if ((filter === 'all' || filter === 'lines') && onSketchPickedRef.current && keptGroupRef.current && keptGroupRef.current.children.length) {
        const ray = raycasterRef.current;
        ray.setFromCamera(ndc, cam);
        ray.params.Line = { threshold: cam.position.distanceTo(controls?.target ?? new THREE.Vector3()) * 0.012 };
        const sketchHit = ray.intersectObjects(keptGroupRef.current.children, false)[0];
        if (sketchHit) { onSketchPickedRef.current(String(sketchHit.object.userData.sketchId)); return; }
      }
      // 2b. A click on a Reference Plane in front of the part (or with no part behind it) selects that plane.
      if (filter === 'all' || filter === 'faces') {
        const rg = referenceGroupRef.current;
        if (rg && rg.children.length) {
          const ray = raycasterRef.current;
          ray.setFromCamera(ndc, cam);
          const planeHit = ray.intersectObjects(rg.children, false).find((h) => h.object.userData.refId);
          const m = meshRef.current;
          const partHit = m && m.visible ? ray.intersectObject(m, false)[0] : undefined;
          if (planeHit && (!partHit || planeHit.distance < partHit.distance)) { onRefPickedRef.current?.(String(planeHit.object.userData.refId), additive); return; }
        }
      }
      // 3. Otherwise a click on the part picks a face (Select mode only); an empty click clears the picks.
      // The left button only selects in Universal, whatever toolbar mode is lit, so a click there always picks.
      const selectMode = interactionModeRef.current === 'select' || !!NAV_SCHEMES[navRef.current.scheme].leftSelectOnly;
      const mesh = meshRef.current;
      if (!mesh) { clearRefs(); return; }
      // With the Points or Lines filter a click never picks a face (or the body), so it cannot grab one next to a line by accident.
      if (filter === 'points' || filter === 'lines') { clearRefs(); return; }
      raycasterRef.current.setFromCamera(ndc, cam);
      // Part that the cross-section has cut away cannot be picked.
      const sectionPl = sectionRef.current?.on ? sectionPlaneRef.current : null;
      const hits = raycasterRef.current.intersectObject(mesh, false).filter((h) => !sectionPl || sectionPl.n.dot(h.point.clone().sub(sectionPl.O)) <= 1e-6);
      const hit = hits[0];
      if (!hit || !hit.face) {
        clearRefs();
        if (edgePickEnabledRef.current && !additive) onEdgePickedRef.current?.(null, false);
        if (!selectMode) return;
        // Clicking empty space clears the pick, as in CATIA.
        pickedFaceRef.current = null;
        if (pickMarkerRef.current) pickMarkerRef.current.visible = false;
        onFacePickedRef.current?.(null);
        return;
      }
      clearRefs();
      if (!selectMode) return;
      const worldNormal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
      pickedFaceRef.current = { point: hit.point.clone(), normal: worldNormal };
      const mp = hit.point.clone().add(modelOffsetRef.current);
      onFacePickedRef.current?.({ point: [mp.x, mp.y, mp.z], normal: [worldNormal.x, worldNormal.y, worldNormal.z] });
      if (!pickMarkerRef.current) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(1.6, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xffb020 }),
        );
        scene.add(marker);
        pickMarkerRef.current = marker;
      }
      pickMarkerRef.current.position.copy(hit.point);
      pickMarkerRef.current.visible = true;
    };
    // Hover: highlight what a click would pick (an edge while an edge tool is active, reference points / lines, a sketch, the plane
    // a new Reference Plane would offset from) and show the snap indicator on wireframe geometry.
    const handleHover = (event: PointerEvent) => {
      const el = renderer.domElement;
      const clearHover = () => {
        if (hoverChainRef.current !== -1) { hoverChainRef.current = -1; redrawEdgeOverlayRef.current(); }
        if (hoverRefIdRef.current || hoverSketchIdRef.current || pickHoverRef.current) {
          hoverRefIdRef.current = null; hoverSketchIdRef.current = null; pickHoverRef.current = null;
          redrawHighlightsRef.current();
        }
        snapGlyphRef.current?.show(0, 0, null);
        el.style.cursor = '';
      };
      if (event.buttons !== 0 || view) { clearHover(); return; }
      if (refPickEnabledRef.current) {
        if (nearHandle(event)) {
          if (pickHoverRef.current) { pickHoverRef.current = null; redrawHighlightsRef.current(); }
          el.style.cursor = 'grab';
          return;
        }
        if (snapPickEnabledRef.current) {
          updateSnap(event);
          if (lastSnapRef.current) {
            if (pickHoverRef.current) { pickHoverRef.current = null; redrawHighlightsRef.current(); }
            el.style.cursor = 'crosshair';
            return;
          }
        }
        const s = refSourceAt(event);
        const next = s && s.value !== null && s.axis ? { axis: s.axis, coord: s.coord ?? 0, cu: s.cu ?? 0, cv: s.cv ?? 0 } : null;
        const prev = pickHoverRef.current;
        if (!prev !== !next || (prev && next && (prev.axis !== next.axis || prev.coord !== next.coord || prev.cu !== next.cu || prev.cv !== next.cv))) { pickHoverRef.current = next; redrawHighlightsRef.current(); }
        snapGlyphRef.current?.show(0, 0, null);
        el.style.cursor = s ? (s.value !== null ? 'crosshair' : 'not-allowed') : '';
        return;
      }
      const filter = selectFilterRef.current;
      let c = -1;
      if (edgePickEnabledRef.current) c = edgeAt(event);
      if (c !== hoverChainRef.current) { hoverChainRef.current = c; redrawEdgeOverlayRef.current(); }
      const rid = refAt(event, filter);
      const sid = !rid && (filter === 'all' || filter === 'lines') ? sketchAt(event) : null;
      if (rid !== hoverRefIdRef.current || sid !== hoverSketchIdRef.current) { hoverRefIdRef.current = rid; hoverSketchIdRef.current = sid; redrawHighlightsRef.current(); }
      el.style.cursor = c >= 0 || rid || sid ? 'pointer' : '';
      updateSnap(event);
    };
    renderer.domElement.addEventListener('pointerleave', () => { hoverRefIdRef.current = null; hoverSketchIdRef.current = null; pickHoverRef.current = null; redrawHighlightsRef.current(); snapGlyphRef.current?.show(0, 0, null); });
    const edgeOverlay = new THREE.Group();
    scene.add(edgeOverlay);
    edgeOverlayRef.current = edgeOverlay;
    renderer.domElement.addEventListener('pointermove', handleHover);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    // Cross-section: with the Section tool on, a left-button drag moves the cutting plane (Slide) or draws the line the plane
    // passes through (Line). The middle and right buttons (pan, zoom, orbit and their chords) are not touched, and a plain
    // left click still selects as usual.
    const secRubber = document.createElement('div');
    secRubber.className = 'section-rubber'; secRubber.style.display = 'none';
    if (getComputedStyle(mount).position === 'static') mount.style.position = 'relative';
    mount.appendChild(secRubber);
    let secDrag: { x0: number; y0: number; moved: boolean; cfg: SectionCfg; info: SectionInfo | null; dx: number; dy: number; L: number } | null = null;
    const secCancel = () => { secDrag = null; secRubber.style.display = 'none'; };
    const secDown = (e: PointerEvent) => {
      const cfg = sectionRef.current;
      if (!cfg?.on || view || e.button !== 0 || e.buttons !== 1 || e.altKey || !meshRef.current) return;
      if (refPickEnabledRef.current || snapPickEnabledRef.current) return;
      const cam = cameraRef.current; const pl = sectionPlaneRef.current; const info = sectionInfoRef.current;
      if (!cam || !pl) return;
      e.stopImmediatePropagation();
      downX = e.clientX; downY = e.clientY;
      const rect = renderer.domElement.getBoundingClientRect();
      const prj = (p: THREE.Vector3) => { const q = p.clone().project(cam); return [((q.x + 1) / 2) * rect.width, ((1 - q.y) / 2) * rect.height]; };
      const L = info ? Math.max((info.max - info.min) / 4, 1e-3) : 10;
      const a = prj(pl.O); const b = prj(pl.O.clone().addScaledVector(pl.base, L));
      secDrag = { x0: e.clientX, y0: e.clientY, moved: false, cfg, info, dx: b[0] - a[0], dy: b[1] - a[1], L };
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* not capturable: the drag still works while the pointer stays over the view */ }
    };
    const secMove = (e: PointerEvent) => {
      const d = secDrag;
      if (!d) return;
      if ((e.buttons & 1) === 0 || (e.buttons & 6) !== 0) { secCancel(); return; }
      const mx = e.clientX - d.x0; const my = e.clientY - d.y0;
      if (!d.moved && Math.hypot(mx, my) <= 4) return;
      d.moved = true;
      if (d.cfg.mode === 'line') {
        const b = renderer.domElement.getBoundingClientRect();
        secRubber.style.display = 'block';
        secRubber.style.left = `${d.x0 - b.left}px`; secRubber.style.top = `${d.y0 - b.top}px`;
        secRubber.style.width = `${Math.hypot(mx, my)}px`;
        secRubber.style.transform = `rotate(${Math.atan2(my, mx)}rad)`;
        return;
      }
      if (!d.info) return;
      // The plane follows the mouse along the on-screen direction of its normal; edge-on, vertical motion takes over.
      const len2 = d.dx * d.dx + d.dy * d.dy;
      const delta = len2 > 36 ? ((mx * d.dx + my * d.dy) / len2) * d.L : (-my * (d.info.max - d.info.min)) / 250;
      onSectionChangeRef.current?.(withPos(d.cfg, d.info.pos + delta, d.info));
    };
    const secUp = (e: PointerEvent) => {
      const d = secDrag;
      if (!d || e.button !== 0) return;
      secCancel();
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      if (!d.moved || d.cfg.mode !== 'line') return;
      const ddx = e.clientX - d.x0; const ddy = e.clientY - d.y0;
      const cam = cameraRef.current;
      if (!cam || Math.hypot(ddx, ddy) < 8) return;
      cam.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const upv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const fwd = cam.getWorldDirection(new THREE.Vector3());
      // The cut is a plane that contains the drawn line and the viewing direction; the part to its left is removed.
      const nrm = right.multiplyScalar(ddy).add(upv.multiplyScalar(ddx)).normalize();
      const b = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2((((d.x0 + e.clientX) / 2 - b.left) / b.width) * 2 - 1, -((((d.y0 + e.clientY) / 2) - b.top) / b.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
      const depth = cam.position.distanceTo(controls?.target ?? new THREE.Vector3());
      const P = ray.ray.origin.clone().addScaledVector(ray.ray.direction, depth / Math.max(ray.ray.direction.dot(fwd), 1e-3));
      const pm = P.clone().add(modelOffsetRef.current);
      // A line that runs along a model axis (as in the Front / Top / Right views) gives the clean X / Y / Z plane.
      const axes = ['x', 'y', 'z'] as const;
      const k = [Math.abs(nrm.x), Math.abs(nrm.y), Math.abs(nrm.z)];
      const best = k.indexOf(Math.max(...k));
      if (k[best] > 0.9986) {
        const a = axes[best];
        onSectionChangeRef.current?.({ ...d.cfg, axis: a, pos: pm.getComponent(best), flip: nrm.getComponent(best) < 0 });
      } else {
        onSectionChangeRef.current?.({ ...d.cfg, axis: 'free', normal: nrm.toArray() as [number, number, number], point: pm.toArray() as [number, number, number], pos: null, flip: false });
      }
    };
    renderer.domElement.addEventListener('pointerdown', secDown, true);
    renderer.domElement.addEventListener('pointermove', secMove);
    renderer.domElement.addEventListener('pointerup', secUp, true);
    renderer.domElement.addEventListener('pointercancel', secCancel);

    // Left-drag box selection (trap / window). Only while the left button has no camera action: Universal never gives it one,
    // other schemes only in Select mode (and Alt+drag there still orbits). Left-to-right = window, right-to-left = crossing.
    const boxEl = document.createElement('div');
    boxEl.className = 'box-select-rect';
    boxEl.style.display = 'none';
    if (getComputedStyle(mount).position === 'static') mount.style.position = 'relative';
    mount.appendChild(boxEl);
    let boxStart: { x: number; y: number } | null = null;
    let boxLive = false;
    const boxRectOf = (e: { clientX: number; clientY: number }) => {
      const b = renderer.domElement.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX, b.left), b.right); const y = Math.min(Math.max(e.clientY, b.top), b.bottom);
      return { b, x, y };
    };
    const boxCancel = () => { boxStart = null; boxLive = false; boxEl.style.display = 'none'; };
    const boxDown = (event: PointerEvent) => {
      boxCancel();
      if (event.button !== 0 || !onBoxSelectRef.current || view || sectionRef.current?.on) return;
      const def = NAV_SCHEMES[navRef.current.scheme];
      if (!def.leftSelectOnly && (event.altKey || interactionModeRef.current !== 'select')) return;
      boxStart = { x: event.clientX, y: event.clientY };
    };
    const boxMove = (event: PointerEvent) => {
      if (!boxStart) return;
      if ((event.buttons & 1) === 0 || (event.buttons & 6) !== 0) { boxCancel(); return; }
      if (!boxLive && Math.hypot(event.clientX - boxStart.x, event.clientY - boxStart.y) <= 4) return;
      boxLive = true;
      const { b, x, y } = boxRectOf(event);
      const sx = Math.min(Math.max(boxStart.x, b.left), b.right); const sy = Math.min(Math.max(boxStart.y, b.top), b.bottom);
      const crossing = x < sx;
      boxEl.style.display = 'block';
      boxEl.style.left = `${Math.min(sx, x) - b.left}px`; boxEl.style.top = `${Math.min(sy, y) - b.top}px`;
      boxEl.style.width = `${Math.abs(x - sx)}px`; boxEl.style.height = `${Math.abs(y - sy)}px`;
      boxEl.classList.toggle('crossing', crossing);
    };
    const boxUp = (event: PointerEvent) => {
      const start = boxStart; const live = boxLive;
      boxCancel();
      if (!start || !live || event.button !== 0) return;
      const cam = cameraRef.current;
      if (!cam) return;
      const { b, x, y } = boxRectOf(event);
      const sx = Math.min(Math.max(start.x, b.left), b.right); const sy = Math.min(Math.max(start.y, b.top), b.bottom);
      const crossing = x < sx;
      const r: ScreenRect = { x0: Math.min(sx, x), y0: Math.min(sy, y), x1: Math.max(sx, x), y1: Math.max(sy, y) };
      cam.updateMatrixWorld();
      const toScreen = (v: THREE.Vector3) => { const p = v.clone().project(cam); return { x: b.left + ((p.x + 1) / 2) * b.width, y: b.top + ((1 - p.y) / 2) * b.height, behind: p.z > 1 }; };
      const want = (rel: 'inside' | 'touch' | null) => (crossing ? rel !== null : rel === 'inside');
      const sketchIds: string[] = [];
      const kept = keptGroupRef.current;
      if (kept) {
        const rel = new Map<string, 'inside' | 'touch' | null>();
        for (const child of kept.children as THREE.Line[]) {
          const id = String(child.userData.sketchId);
          const posAttr = child.geometry.getAttribute('position');
          const pts: { x: number; y: number }[] = [];
          let behind = false;
          for (let i = 0; i < posAttr.count; i++) { const sp = toScreen(child.localToWorld(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)))); if (sp.behind) behind = true; pts.push(sp); }
          const r1 = behind ? null : polylineVsRect(pts, r);
          const prev = rel.get(id);
          // A sketch is a set of outlines: window needs all of them inside, crossing needs any touching.
          if (prev === undefined) rel.set(id, r1);
          else if (crossing) rel.set(id, prev ?? r1);
          else rel.set(id, prev === 'inside' && r1 === 'inside' ? 'inside' : null);
        }
        for (const [id, v] of rel) if (want(v)) sketchIds.push(id);
      }
      const edges: EdgePick[] = [];
      if (edgePickEnabledRef.current) {
        const mesh = meshRef.current;
        const solid = !!mesh && mesh.visible && !(mesh.material as THREE.MeshStandardMaterial).wireframe;
        const ray = raycasterRef.current;
        for (const chain of chainsRef.current.chains) {
          const sp = chain.path.map(toScreen);
          if (sp.some((q) => q.behind)) continue;
          if (!want(polylineVsRect(sp, r))) continue;
          if (solid && mesh) {
            // Skip edges hidden behind the part: look at the middle of the chain.
            const mid = chain.path[Math.floor(chain.path.length / 2)];
            const dir = mid.clone().sub(cam.position);
            const dist = dir.length();
            ray.set(cam.position, dir.normalize());
            const h = ray.intersectObject(mesh, false)[0];
            if (h && h.distance < dist - Math.max(dist * 0.02, 0.5)) continue;
          }
          edges.push(edgePickOf(chain, modelOffsetRef.current));
        }
      }
      onBoxSelectRef.current?.({ sketchIds, edges, additive: event.shiftKey || event.ctrlKey || event.metaKey, crossing });
    };
    renderer.domElement.addEventListener('pointerdown', boxDown);
    window.addEventListener('pointermove', boxMove);
    window.addEventListener('pointerup', boxUp);

    // Double-click (any mode): a kept sketch's wireframe opens that
    // sketch, otherwise a primary plane starts a sketch on it.
    const handleDoubleClick = (event: MouseEvent) => {
      const cam = cameraRef.current;
      if (!cam) return;
      // While a Reference Plane is being created a double-click is just two picks; sketch mode is entered explicitly afterwards.
      if (refPickEnabledRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = raycasterRef.current;
      ray.setFromCamera(ndc, cam);
      // A line is a few pixels wide to the pointer, whatever the zoom.
      ray.params.Line = { threshold: cam.position.distanceTo(controls?.target ?? new THREE.Vector3()) * 0.012 };
      const sketchHit = keptGroupRef.current ? ray.intersectObjects(keptGroupRef.current.children, false)[0] : undefined;
      if (sketchHit) { onSketchDoubleClickRef.current?.(String(sketchHit.object.userData.sketchId)); return; }
      // Primary planes and Reference Planes: the nearer one under the cursor wins.
      const planes = planesGroupRef.current;
      const planeHit = planes?.visible ? ray.intersectObjects(planes.children, false)[0] : undefined;
      const refGroup = referenceGroupRef.current;
      const refHit = refGroup ? ray.intersectObjects(refGroup.children, false).find((h) => h.object.userData.refId) : undefined;
      if (refHit && (!planeHit || refHit.distance < planeHit.distance)) { onReferencePlaneDoubleClickRef.current?.(String(refHit.object.userData.refId)); return; }
      if (planeHit) onPlaneDoubleClickRef.current?.(planeHit.object.userData.plane as SketchPlane);
    };
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);

    if (!view) {
      const probe: ViewportProbe = {
        planes: () => (planesGroupRef.current?.visible ? PRIMARY_PLANES.map((plane) => ({ plane, color: PLANE_COLORS[plane], size: PRIMARY_PLANE_SIZE_MM })) : []),
        sketches: () => probeRef.current.sketches,
        live: () => probeRef.current.live,
        screenOf: (point) => {
          const v = new THREE.Vector3(point[0], point[1], point[2]).sub(modelOffsetRef.current).project(camera);
          const rect = renderer.domElement.getBoundingClientRect();
          return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
        },
        camera: () => ({ position: camera.position.toArray(), target: (controls?.target ?? new THREE.Vector3()).toArray(), up: camera.up.toArray() }),
      };
      (mount as HTMLDivElement & { __faelyx3d?: ViewportProbe }).__faelyx3d = probe;
    }

    // Alt+Left-drag always orbits the camera, no matter which
    // Select/Orbit/Pan/Zoom mode is active — the same convention Sketch &
    // 2D already uses (Alt+drag to rotate the view regardless of the
    // active drawing tool). Pan (right-drag) and Zoom (scroll) are already
    // unconditional in every mode via controls.mouseButtons below; this is
    // what makes Rotate consistently available by mouse too, instead of
    // being locked behind first clicking the Orbit toolbar button. A
    // capture-phase listener so it runs before OrbitControls' own
    // pointerdown handler and can retarget the left button just in time;
    // pointerup restores whatever the active mode's left-button action is.
    const handleAltOrbitDown = (event: PointerEvent) => {
      if (!controls) return;
      // What a middle-drag does depends on the navigation scheme and the
      // modifier keys held — retargeted just before OrbitControls reads it.
      if (event.button === 1) {
        const ctrl = event.ctrlKey || event.metaKey;
        controls.mouseButtons.MIDDLE = mouseWithMods(NAV_SCHEMES[navRef.current.scheme].middle({ shift: event.shiftKey, ctrl }), ctrl || event.shiftKey);
      }
      if (event.button !== 0 || !event.altKey) return;
      // Select-only schemes: the left button never rotates, Alt or not.
      if (NAV_SCHEMES[navRef.current.scheme].leftSelectOnly) return;
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    };
    const restoreLeftButtonAction = () => {
      if (!controls) return;
      controls.mouseButtons.LEFT = buttonsFor(interactionModeRef.current, navRef.current.scheme).LEFT;
    };
    renderer.domElement.addEventListener('pointerdown', handleAltOrbitDown, true);
    window.addEventListener('pointerup', restoreLeftButtonAction);

    // Middle + right buttons held together orbit. OrbitControls has no
    // two-button chord (the second button arrives as a pointermove, not a
    // pointerdown), so while both are down this capture-phase listener
    // turns the camera about the orbit target itself and keeps the move
    // from OrbitControls. Its drag origins are kept in step so the single
    // button left held afterwards carries on from here without a jump.
    let chordActive = false; let chordX = 0; let chordY = 0;
    // Universal scheme: a right-click (press + release in place) while the middle button is held latches
    // zoom until the middle button lets go; moving the mouse while the right button is held orbits instead.
    let prevButtons = 0; let zoomLatched = false; let chordMoved = false; let chordStartX = 0; let chordStartY = 0;
    const handleChordMove = (event: PointerEvent) => {
      const def = NAV_SCHEMES[navRef.current.scheme];
      const was = prevButtons; prevButtons = event.buttons;
      if (!controls || !def.chord) { chordActive = false; return; }
      if ((event.buttons & 4) === 0) { zoomLatched = false; chordMoved = false; }
      const syncStarts = () => {
        const starts = controls as unknown as Record<'_panStart' | '_rotateStart' | '_dollyStart', THREE.Vector2 | undefined>;
        starts._panStart?.set(event.clientX, event.clientY);
        starts._rotateStart?.set(event.clientX, event.clientY);
        starts._dollyStart?.set(event.clientX, event.clientY);
      };
      if (def.chordZoom && (event.buttons & 4) !== 0) {
        if ((event.buttons & 2) !== 0 && (was & 2) === 0) { chordMoved = false; chordStartX = event.clientX; chordStartY = event.clientY; }
        if ((event.buttons & 2) === 0 && (was & 2) !== 0 && !chordMoved) zoomLatched = true;
        if (zoomLatched) {
          event.stopImmediatePropagation();
          if (chordActive) {
            const offset = camera.position.clone().sub(controls.target);
            const next = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * Math.exp((event.clientY - chordY) * 0.006)));
            camera.position.copy(controls.target).add(offset.setLength(next));
            camera.lookAt(controls.target);
          }
          chordActive = true; chordX = event.clientX; chordY = event.clientY; syncStarts();
          return;
        }
        // Right pressed but not moved far yet: hold off, so it is neither a pan nor an orbit until it is clear which.
        if ((event.buttons & 2) !== 0 && !chordMoved) {
          if (Math.hypot(event.clientX - chordStartX, event.clientY - chordStartY) <= 3) { event.stopImmediatePropagation(); chordActive = false; chordX = event.clientX; chordY = event.clientY; syncStarts(); return; }
          chordMoved = true;
        }
      }
      if ((event.buttons & 6) !== 6) { chordActive = false; return; }
      event.stopImmediatePropagation();
      if (chordActive) {
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        const turn = (2 * Math.PI) / Math.max(renderer.domElement.clientHeight, 1);
        spherical.theta -= (event.clientX - chordX) * turn;
        spherical.phi -= (event.clientY - chordY) * turn;
        spherical.makeSafe();
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
        camera.lookAt(controls.target);
      }
      chordActive = true; chordX = event.clientX; chordY = event.clientY; syncStarts();
    };
    renderer.domElement.addEventListener('pointermove', handleChordMove, true);
    // A fresh press / any release starts the chord state over (the latch lasts only while the middle button is held).
    const resetChord = (event: PointerEvent) => { if (event.type === 'pointerdown' || event.button === 1) { zoomLatched = false; chordMoved = false; chordActive = false; prevButtons = event.type === 'pointerdown' ? event.buttons : 0; } };
    renderer.domElement.addEventListener('pointerdown', resetChord, true);
    window.addEventListener('pointerup', resetChord);

    // Two middle clicks in place, close together: Fit to screen. Also stops
    // the browser's middle-click autoscroll over the viewport.
    let middleAt = 0; let middleX = 0; let middleY = 0;
    const handleMiddleDown = (event: PointerEvent) => {
      if (event.button !== 1) return;
      const now = performance.now();
      if (now - middleAt < 400 && Math.hypot(event.clientX - middleX, event.clientY - middleY) < 6) { middleAt = 0; onMiddleDoubleClickRef.current?.(); return; }
      middleAt = now; middleX = event.clientX; middleY = event.clientY;
    };
    const handleMiddleMouseDown = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
    renderer.domElement.addEventListener('pointerdown', handleMiddleDown);
    renderer.domElement.addEventListener('mousedown', handleMiddleMouseDown);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerdown', secDown, true);
      renderer.domElement.removeEventListener('pointermove', secMove);
      renderer.domElement.removeEventListener('pointerup', secUp, true);
      renderer.domElement.removeEventListener('pointercancel', secCancel);
      secRubber.remove();
      renderer.domElement.removeEventListener('pointerdown', boxDown);
      window.removeEventListener('pointermove', boxMove);
      window.removeEventListener('pointerup', boxUp);
      boxEl.remove();
      calloutRef.current?.el.remove(); calloutRef.current = null;
      snapGlyphRef.current?.el.remove(); snapGlyphRef.current = null;
      renderer.domElement.removeEventListener('pointermove', handleHover);
      renderer.domElement.removeEventListener('pointerdown', handleRefDown, true);
      window.removeEventListener('pointermove', handleRefMove);
      window.removeEventListener('pointerup', handleRefUp);
      scene.remove(edgeOverlay);
      edgeOverlayRef.current = null;
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);
      renderer.domElement.removeEventListener('pointerdown', handleAltOrbitDown, true);
      window.removeEventListener('pointerup', restoreLeftButtonAction);
      renderer.domElement.removeEventListener('pointermove', handleChordMove, true);
      renderer.domElement.removeEventListener('pointerdown', resetChord, true);
      window.removeEventListener('pointerup', resetChord);
      renderer.domElement.removeEventListener('pointerdown', handleMiddleDown);
      renderer.domElement.removeEventListener('mousedown', handleMiddleMouseDown);
      transformRef.current?.dispose();
      controls?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // Camera type (ortho vs perspective) and controls (interactive) are
    // fixed for the lifetime of a given StlViewport instance in practice
    // (DrawingWorkspace mounts a separate one per view rather than
    // flipping an existing one's `view` prop), so re-running this setup
    // only on stlData-independent mount is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap in a new mesh whenever fresh STL bytes arrive from the backend —
  // and, now that this component stays mounted even with no part built yet
  // (see ModelViewport), tear down any existing mesh when stlData goes back
  // to null (a "New part" reset) instead of leaving a stale solid on screen.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = null;
    }
    if (drawLinesRef.current) {
      for (const l of [drawLinesRef.current.visible, drawLinesRef.current.hidden]) { scene.remove(l); l.geometry.dispose(); (l.material as THREE.Material).dispose(); }
      drawLinesRef.current = null;
    }
    if (edgesRef.current) {
      scene.remove(edgesRef.current);
      edgesRef.current.geometry.dispose();
      (edgesRef.current.material as THREE.Material).dispose();
      edgesRef.current = null;
    }
    // New geometry: the old pick no longer refers to a real face.
    if (pickedFaceRef.current) onFacePickedRef.current?.(null);
    pickedFaceRef.current = null;
    if (pickMarkerRef.current) pickMarkerRef.current.visible = false;

    chainsRef.current = { chains: [], segChain: new Int32Array(0) };
    hoverChainRef.current = -1;
    if (!stlData) {
      partBoxRef.current = null;
      modelOffsetRef.current.set(0, 0, 0);
      for (const g of [sketchGroupRef, referenceGroupRef, keptGroupRef, planesGroupRef, axesGroupRef, refPreviewGroupRef, hlGroupRef, sketchVisGroupRef]) g.current?.position.set(0, 0, 0);
      onInertia?.(null);
      return;
    }

    const geometry = new STLLoader().parse(stlData);
    geometry.computeBoundingBox();
    const modelCenter = geometry.boundingBox!.getCenter(new THREE.Vector3());
    geometry.translate(-modelCenter.x, -modelCenter.y, -modelCenter.z);
    modelOffsetRef.current.copy(modelCenter);
    for (const g of [sketchGroupRef, referenceGroupRef, keptGroupRef, planesGroupRef, axesGroupRef, refPreviewGroupRef, hlGroupRef, sketchVisGroupRef]) g.current?.position.copy(modelCenter).negate();
    snapCacheRef.current = null;
    partBoxRef.current = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const drawingMode = !!(view && drawingRef.current);
    const material = drawingMode
      // Paper-white faces that only hide what is behind them; the drawn line work is added below.
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
      : new THREE.MeshStandardMaterial({
        color: 0x8f76cc,
        metalness: 0.35,
        roughness: 0.45,
      });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    if (drawingMode && view) {
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(drawingEdgePositions(geometry, VIEW_TOWARD[view]), 3));
      const visible = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0x111111 }));
      visible.renderOrder = 2;
      const dashMm = 2 / Math.max(drawingRef.current?.scale ?? 1, 1e-6);
      const hiddenMaterial = new THREE.LineDashedMaterial({ color: 0x6b6b6b, dashSize: dashMm, gapSize: dashMm * 0.6, depthFunc: THREE.GreaterDepth, depthWrite: false });
      const hidden = new THREE.LineSegments(lineGeometry.clone(), hiddenMaterial);
      hidden.computeLineDistances();
      hidden.renderOrder = 1;
      hidden.visible = drawingRef.current?.hidden !== false;
      scene.add(visible); scene.add(hidden);
      drawLinesRef.current = { visible, hidden };
      chainsRef.current = { chains: [], segChain: new Int32Array(0) };
      hoverChainRef.current = -1;
      onInertia?.(null);
      return;
    }

    // Built once alongside the mesh and toggled visible/invisible by
    // setRenderStyle('shaded-edges') — cheaper than rebuilding it on every
    // render-style change, and it always matches the current geometry.
    const edgesGeometry = new THREE.EdgesGeometry(geometry, 25);
    const edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: 0x0c0a14 }));
    edges.visible = renderStyleRef.current === 'shaded-edges';
    scene.add(edges);
    edgesRef.current = edges;
    chainsRef.current = buildEdgeChains(edgesGeometry);
    hoverChainRef.current = -1;

    // Centroid back in model coordinates (the mesh itself was re-centered).
    const inertia = computeInertia(geometry);
    onInertia?.({ ...inertia, centroid: [inertia.centroid[0] + modelCenter.x, inertia.centroid[1] + modelCenter.y, inertia.centroid[2] + modelCenter.z] });
    // onInertia is a fresh callback identity on every App.tsx render in
    // practice; keying this effect on it would re-run mesh setup for no
    // geometry reason, so it's intentionally read via closure, not listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stlData]);

  // Cross-section: clip the part at the plane, draw the hatched cut face, and report the section properties.
  useEffect(() => {
    const scene = sceneRef.current; const mesh = meshRef.current; const mount = mountRef.current;
    const mats = [mesh?.material, edgesRef.current?.material].filter(Boolean) as (THREE.Material & { clippingPlanes: THREE.Plane[] | null })[];
    const cfg = section; const box = partBoxRef.current;
    mount?.classList.toggle('section-slide', !!cfg?.on && cfg.mode === 'slide');
    mount?.classList.toggle('section-line', !!cfg?.on && cfg.mode === 'line');
    sectionPlaneRef.current = null;
    if (!scene || !mesh || !cfg?.on || view || !box) {
      for (const m of mats) if (m.clippingPlanes && m.clippingPlanes.length) { m.clippingPlanes = []; m.needsUpdate = true; }
      sectionInfoRef.current = null;
      onSectionInfoRef.current?.(null);
      return;
    }
    const off = modelOffsetRef.current;
    const plane = planeOf(cfg, box, off);
    const diag = Math.max(box.getSize(new THREE.Vector3()).length(), 1e-3);
    const sec = computeSection(mesh.geometry.getAttribute('position').array, plane, off, diag / 30);
    sectionClipRef.current.set(plane.n.clone().negate(), plane.n.dot(plane.O));
    for (const m of mats) { if (!m.clippingPlanes || m.clippingPlanes.length === 0) { m.clippingPlanes = [sectionClipRef.current]; m.needsUpdate = true; } }
    if (!sectionHatchRef.current) sectionHatchRef.current = hatchTexture();
    const group = buildSectionGroup(sec, plane, sectionHatchRef.current, diag * 0.05);
    scene.add(group);
    sectionGroupRef.current = group;
    sectionPlaneRef.current = plane;
    sectionInfoRef.current = sec.info;
    onSectionInfoRef.current?.(sec.info);
    return () => { scene.remove(group); disposeGroup(group); if (sectionGroupRef.current === group) sectionGroupRef.current = null; };
  }, [section, stlData, view]);

  // Redraw the live sketch-profile outline whenever App.tsx's polling
  // (see its sketchPreview effect) hands over fresh loops or the sketch
  // plane's height changes. Circles are approximated as 64-segment rings;
  // polygons are drawn exactly as traced. This is the "link" between
  // Sketch & 2D and 3D Design: the same real geometry Extrude/Pocket would
  // consume, shown live on the plane it sits on, before you've applied
  // anything.
  useEffect(() => {
    const group = sketchGroupRef.current;
    if (!group) return;
    clearGroup(group, lineMatsRef.current);
    probeRef.current.live = [];
    if (!sketchLoops || sketchLoops.length === 0) return;
    for (const loop of sketchLoops) {
      // Sketch H/V along the plane's xDir / (normal × xDir), floated off
      // the plane by sketchLift.
      const pts: THREE.Vector3[] = loopOutline(loop).map(([x, y]) => (sketchPlane
        ? new THREE.Vector3(...toWorldLifted(sketchPlane, [x, y], sketchLift))
        : new THREE.Vector3(x, y, sketchZ + sketchLift)));
      probeRef.current.live.push(...pts.map((p) => p.toArray()));
      group.add(thickLine(pts, 0xa98bff, 2.6, lineResRef.current, lineMatsRef.current, { opacity: 0.95 }));
    }
  }, [sketchLoops, sketchZ, sketchPlane, sketchLift]);

  // Kept sketches: one wireframe per outline, on the sketch's own frame,
  // floated off it like the live outline. The selected one is highlighted.
  useEffect(() => {
    const group = keptGroupRef.current;
    if (!group) return;
    while (group.children.length) {
      const child = group.children.pop() as THREE.Line;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    probeRef.current.sketches = [];
    snapCacheRef.current = null;
    // The thin lines below only carry picking (ray / box select); what is seen is drawn thick, in a group of its own.
    const vis = sketchVisGroupRef.current;
    if (vis) clearGroup(vis, lineMatsRef.current);
    for (const sk of keptSketches ?? []) {
      const all: number[][] = [];
      const W = (p: [number, number]) => new THREE.Vector3(...toWorldLifted(sk.frame, p, sketchLift));
      for (const loop of sk.loops) {
        const pts = loopOutline(loop).map((p) => W(p));
        all.push(...pts.map((p) => p.toArray()));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: sk.selected ? SELECTED_SKETCH_COLOR : KEPT_SKETCH_COLOR, visible: false }));
        line.userData.sketchId = sk.id;
        group.add(line);
        if (vis) {
          vis.add(thickLine(pts, sk.selected ? SELECTED_SKETCH_COLOR : 0xece6ff, sk.selected ? 3.4 : 2.6, lineResRef.current, lineMatsRef.current));
          // A circle's centre is marked, so it can be seen and picked from any angle.
          if (loop.kind === 'circle') { const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); dot.position.copy(W(loop.center)); dot.renderOrder = 8; dot.raycast = () => undefined; vis.add(dot); }
        }
      }
      if (vis) for (const pt of sk.points ?? []) { const dot = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false })); dot.position.copy(W(pt)); dot.renderOrder = 8; dot.raycast = () => undefined; vis.add(dot); }
      probeRef.current.sketches.push({ id: sk.id, selected: !!sk.selected, points: all });
    }
  }, [keptSketches, sketchLift]);

  // Draws the hovered edge (cyan) and the picked edges (amber) as thin tubes lying on the part.
  const redrawEdgeOverlay = () => {
    const group = edgeOverlayRef.current;
    if (!group) return;
    while (group.children.length) {
      const child = group.children.pop() as THREE.Mesh;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    const off = modelOffsetRef.current;
    const radius = Math.max((meshRef.current?.geometry.boundingSphere?.radius ?? 50) * 0.006, 0.25);
    const tube = (pts: THREE.Vector3[], color: number, r: number) => {
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < pts.length; i++) if (pts[i].distanceToSquared(pts[i - 1]) > 1e-9) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      if (!path.curves.length) return;
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(path.curves.length * 2, 2), r, 6, false), new THREE.MeshBasicMaterial({ color }));
      group.add(mesh);
    };
    const picked = selectedEdgesRef.current;
    for (const e of picked) tube(e.path.map((p) => new THREE.Vector3(p[0] - off.x, p[1] - off.y, p[2] - off.z)), 0xffb020, radius);
    const hover = chainsRef.current.chains[hoverChainRef.current];
    if (hover && !picked.some((e) => e.key === edgePickOf(hover, off).key)) tube(hover.path, 0x5eead4, radius * 0.9);
  };
  redrawEdgeOverlayRef.current = redrawEdgeOverlay;

  // While an edge tool is active the part's sharp edges are shown (lighter, so they read on the dark shaded solid).
  useEffect(() => {
    const edges = edgesRef.current;
    hoverChainRef.current = -1;
    if (edges) {
      const mat = edges.material as THREE.LineBasicMaterial;
      if (edgePickEnabled) { edges.visible = true; mat.color.set(0xcfc4ff); mat.transparent = true; mat.opacity = 0.5; }
      else { edges.visible = renderStyleRef.current === 'shaded-edges'; mat.color.set(0x0c0a14); mat.transparent = false; mat.opacity = 1; }
      mat.needsUpdate = true;
    }
    if (rendererRef.current) rendererRef.current.domElement.style.cursor = '';
    redrawEdgeOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgePickEnabled, stlData]);
  useEffect(() => {
    selectedEdgesRef.current = selectedEdges ?? [];
    redrawEdgeOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEdges, stlData]);

  // Drawing sheet: re-fit the orthographic frustum when the scale or sheet size changes; hidden-line toggle; dash length stays 2 mm on paper.
  useEffect(() => {
    applyOrthoRef.current();
    const lines = drawLinesRef.current;
    if (lines && drawing) {
      lines.hidden.visible = drawing.hidden;
      const dash = 2 / Math.max(drawing.scale, 1e-6);
      const m = lines.hidden.material as THREE.LineDashedMaterial;
      m.dashSize = dash; m.gapSize = dash * 0.6; m.needsUpdate = true;
    }
  }, [drawing?.pxPerMm, drawing?.scale, drawing?.hidden, stlData]);

  // The primary planes also show while a Reference Plane is being created, so there is something to click.
  useEffect(() => {
    if (planesGroupRef.current) planesGroupRef.current.visible = showPlanes || refPickEnabled;
    if (rendererRef.current) rendererRef.current.domElement.style.cursor = '';
  }, [showPlanes, refPickEnabled]);
  useEffect(() => {
    if (axesGroupRef.current) axesGroupRef.current.visible = showAxes;
  }, [showAxes]);

  // Draws every Reference Plane/Axis/Coordinate System/Point/Line entry as real, positioned 3D geometry: a plane as a translucent
  // square with its own X/Y/Z triad and the H / V directions a sketch on it will take, an axis as a dashed line, points and lines in
  // bright colours with a real pixel width so they read against the part. Rebuilt from the current props on every change.
  useEffect(() => {
    const group = referenceGroupRef.current;
    if (!group) return;
    clearGroup(group, lineMatsRef.current);
    snapCacheRef.current = null;
    if (!referenceGeoms || referenceGeoms.length === 0) { redrawHighlightsRef.current(); return; }
    const res = lineResRef.current; const mats = lineMatsRef.current;
    const half = PRIMARY_PLANE_SIZE_MM / 2;
    for (const ref of referenceGeoms) {
      if (ref.kind === 'plane') {
        // Same size as the primary planes, and positioned from the same origin, so a Reference Plane lines up with the plane it is parallel to.
        const geometry = new THREE.PlaneGeometry(PRIMARY_PLANE_SIZE_MM, PRIMARY_PLANE_SIZE_MM);
        const material = new THREE.MeshBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.refId = ref.id;
        if (ref.frame) {
          // A custom plane: oriented by its own frame (local X = its H direction, local Y = its V direction, local Z = its normal).
          const fx = new THREE.Vector3(...ref.frame.xDir).normalize(); const fn = new THREE.Vector3(...ref.frame.normal).normalize();
          mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fx, fn.clone().cross(fx), fn));
          mesh.position.set(ref.frame.origin[0], ref.frame.origin[1], ref.frame.origin[2]);
        }
        else if (ref.axis === 'YZ') { mesh.rotation.y = Math.PI / 2; mesh.position.x = ref.offset; }
        else if (ref.axis === 'XZ') { mesh.rotation.x = Math.PI / 2; mesh.position.y = ref.offset; }
        else { mesh.position.z = ref.offset; }
        const tag = textSprite(ref.name, '#8ff0e4', 20, 4.5);
        tag.position.set(-half + 11, half - 3.5, 0);
        mesh.add(tag);
        group.add(mesh);
        group.add(thickLine(ref.frame ? frameOutline(ref.frame) : squareOutline(ref.axis, ref.offset), 0x4fd1c5, 1.8, res, mats));
        // The plane's own X, Y, Z axes, at the point where it crosses the offset axis.
        const originOf = ref.frame ? new THREE.Vector3(...ref.frame.origin) : planePoint(ref.axis, ref.offset, 0, 0);
        group.add(makeAxisTriad(originOf, PRIMARY_PLANE_SIZE_MM * 0.6));
        // Sketch support indicator: the origin ring and the H (horizontal) / V (vertical) directions a sketch on this plane will use.
        const frame = ref.frame ?? refPlaneFrame(ref.axis as RefPlaneAxis, ref.offset);
        const H = new THREE.Vector3(...frame.xDir);
        const V = new THREE.Vector3(...frame.normal).cross(H);
        const corner = originOf.clone().addScaledVector(H, -half + 6).addScaledVector(V, -half + 6);
        const ring: THREE.Vector3[] = [];
        for (let i = 0; i <= 32; i++) { const t = (i / 32) * Math.PI * 2; ring.push(originOf.clone().addScaledVector(H, Math.cos(t) * 2.6).addScaledVector(V, Math.sin(t) * 2.6)); }
        group.add(thickLine(ring, 0xe6fffb, 1.6, res, mats));
        for (const [dir, name] of [[H, 'H'], [V, 'V']] as const) {
          const tip = corner.clone().addScaledVector(dir, 15);
          group.add(thickLine([corner, tip], 0xe6fffb, 2, res, mats));
          const head = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 10), new THREE.MeshBasicMaterial({ color: 0xe6fffb, depthTest: false }));
          head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          head.position.copy(tip); head.renderOrder = 7; head.raycast = () => undefined;
          group.add(head);
          const lab = textSprite(name, '#e6fffb', 6, 3.2, 26);
          lab.position.copy(tip).addScaledVector(dir, 4.2); group.add(lab);
        }
      } else if (ref.kind === 'axis') {
        // A straight line through a point offset from the origin, running along whichever principal direction was chosen.
        const dirVec = ref.axis === 'Y' ? new THREE.Vector3(0, 1, 0) : ref.axis === 'Z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const base = ref.axis === 'Z' ? new THREE.Vector3(ref.offset, 0, 0) : new THREE.Vector3(0, 0, ref.offset);
        const hl = 100;
        group.add(thickLine([base.clone().addScaledVector(dirVec, -hl), base.clone().addScaledVector(dirVec, hl)], 0xffb020, 2.4, res, mats, { dashed: true }));
      } else if (ref.kind === 'point' && ref.a) {
        // A standalone point: a solid dot with a halo and a three-axis cross, so it reads at any angle and on any background.
        const pt = new THREE.Group();
        pt.position.set(ref.a[0], ref.a[1], ref.a[2]);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 14), new THREE.MeshBasicMaterial({ color: 0x1b1530, transparent: true, opacity: 0.75, depthTest: false }));
        halo.renderOrder = 6; halo.raycast = () => undefined; pt.add(halo);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false }));
        dot.renderOrder = 8; dot.raycast = () => undefined; pt.add(dot);
        for (const c of [[-4.5, 0, 0], [0, -4.5, 0], [0, 0, -4.5]]) pt.add(thickLine([new THREE.Vector3(c[0], c[1], c[2]), new THREE.Vector3(-c[0], -c[1], -c[2])], 0xffd23f, 1.6, res, mats));
        group.add(pt);
      } else if (ref.kind === 'line' && ref.a && ref.b) {
        const a = new THREE.Vector3(ref.a[0], ref.a[1], ref.a[2]); const b = new THREE.Vector3(ref.b[0], ref.b[1], ref.b[2]);
        group.add(thickLine([a, b], 0x7dff6b, 3.2, res, mats));
        for (const e of [a, b]) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 12), new THREE.MeshBasicMaterial({ color: 0x7dff6b, depthTest: false }));
          dot.position.copy(e); dot.renderOrder = 8; dot.raycast = () => undefined; group.add(dot);
        }
      } else if (ref.kind === 'csys') {
        const csys = new THREE.Group();
        csys.position.z = ref.offset;
        const axes = [[new THREE.Vector3(30, 0, 0), 0xff5555], [new THREE.Vector3(0, 30, 0), 0x55ff55], [new THREE.Vector3(0, 0, 30), 0x5588ff]] as const;
        for (const [end, color] of axes) csys.add(thickLine([new THREE.Vector3(0, 0, 0), end], color, 2.2, res, mats));
        group.add(csys);
      }
    }
    redrawHighlightsRef.current();
  }, [referenceGeoms]);

  // Highlights over everything pickable in 3D: reference elements and sketches that are selected (amber) or under the cursor (white),
  // and the plane a click would offset a new Reference Plane from (cyan). Thick lines drawn over the part, so they stay visible.
  const redrawHighlights = () => {
    const group = hlGroupRef.current;
    if (!group) return;
    clearGroup(group, lineMatsRef.current);
    const res = lineResRef.current; const mats = lineMatsRef.current;
    const selected = new Set(selectedRefIdsRef.current);
    const hov = hoverRefIdRef.current;
    for (const r of referenceGeomsRef.current) {
      const isSel = selected.has(r.id); const isHov = hov === r.id;
      if (!isSel && !isHov) continue;
      const color = isSel ? 0xffb020 : 0xffffff;
      if (r.kind === 'point' && r.a) {
        const ring = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthTest: false }));
        ring.position.set(r.a[0], r.a[1], r.a[2]); ring.renderOrder = 9; ring.raycast = () => undefined; group.add(ring);
      } else if (r.kind === 'line' && r.a && r.b) {
        group.add(thickLine([new THREE.Vector3(...r.a), new THREE.Vector3(...r.b)], color, 5.5, res, mats, { opacity: 0.9 }));
      } else if (r.kind === 'axis') {
        const l = refLineOf(r);
        if (l) group.add(thickLine([new THREE.Vector3(l.p[0] - l.d[0] * 100, l.p[1] - l.d[1] * 100, l.p[2] - l.d[2] * 100), new THREE.Vector3(l.p[0] + l.d[0] * 100, l.p[1] + l.d[1] * 100, l.p[2] + l.d[2] * 100)], color, 5, res, mats, { opacity: 0.9 }));
      } else if (r.kind === 'plane') {
        group.add(thickLine(r.frame ? frameOutline(r.frame) : squareOutline(r.axis, r.offset), color, 3.6, res, mats));
      }
    }
    // Reference Line · Point – Point: the picked points as markers and the line they will make (green, dashed) before it is created.
    const lp = linePreviewRef.current;
    if (lp) {
      if (lp.a && lp.b) group.add(thickLine([new THREE.Vector3(...lp.a), new THREE.Vector3(...lp.b)], 0x7dff6b, 3.6, res, mats, { dashed: true }));
      ([[lp.a, 'Start'], [lp.b, 'End']] as const).forEach(([p, text]) => {
        if (!p) return;
        const ring = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 16), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.5, depthTest: false }));
        ring.position.set(p[0], p[1], p[2]); ring.renderOrder = 9; ring.raycast = () => undefined; group.add(ring);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
        dot.position.set(p[0], p[1], p[2]); dot.renderOrder = 10; dot.raycast = () => undefined; group.add(dot);
        const lab = textSprite(text, '#5eead4', 12, 3.2, 24);
        lab.position.set(p[0] + 5, p[1] + 3.5, p[2]); lab.renderOrder = 10; lab.raycast = () => undefined; group.add(lab);
      });
    }
    const hs = hoverSketchIdRef.current;
    if (hs) {
      const sk = keptSketchesRef.current.find((k) => k.id === hs);
      if (sk) for (const loop of sk.loops) group.add(thickLine(loopOutline(loop).map((q) => new THREE.Vector3(...toWorldLifted(sk.frame, q, sketchLiftRef.current))), 0xffffff, 3.4, res, mats, { opacity: 0.9 }));
    }
    const ph = pickHoverRef.current;
    if (ph) {
      group.add(thickLine(squareOutline(ph.axis, ph.coord, ph.cu, ph.cv), 0x5eead4, 3.4, res, mats));
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(PRIMARY_PLANE_SIZE_MM, PRIMARY_PLANE_SIZE_MM), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      if (ph.axis === 'YZ') quad.rotation.y = Math.PI / 2; else if (ph.axis === 'XZ') quad.rotation.x = Math.PI / 2;
      quad.position.copy(planePoint(ph.axis, ph.coord, ph.cu, ph.cv)); quad.raycast = () => undefined; quad.renderOrder = 6;
      group.add(quad);
    }
  };
  redrawHighlightsRef.current = redrawHighlights;
  useEffect(() => {
    redrawHighlights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRefIds, referenceGeoms, keptSketches, sketchLift, refPickEnabled, stlData, linePreview]);

  // The Reference Plane being created: the source plane stays where it is (orange), the new plane(s) are dashed yellow at the
  // offset, with a dimension line between them; the callout (DOM, see the setup effect) rides on the middle of that line.
  useEffect(() => {
    const group = refPreviewGroupRef.current;
    if (!group) return;
    clearGroup(group, lineMatsRef.current);
    calloutAnchorRef.current = null;
    if (!refCreate) { calloutRef.current?.render(); return; }
    const res = lineResRef.current; const mats = lineMatsRef.current;
    const { axis, base, delta, count } = refCreate;
    const size = PRIMARY_PLANE_SIZE_MM;
    group.add(thickLine(squareOutline(axis, base), 0xff9f43, 3, res, mats));
    const n = Math.max(1, Math.min(count, 50));
    for (let i = 1; i <= n; i++) {
      const c = base + delta * i;
      group.add(thickLine(squareOutline(axis, c), 0xffe066, 2.4, res, mats, { dashed: true }));
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      if (axis === 'YZ') quad.rotation.y = Math.PI / 2; else if (axis === 'XZ') quad.rotation.x = Math.PI / 2;
      quad.position.copy(planePoint(axis, c, 0, 0)); quad.raycast = () => undefined; quad.renderOrder = 5;
      group.add(quad);
    }
    // Dimension line (with end ticks) just outside the plane's corner, running from the source to the first new plane.
    const u = size / 2 + 5; const v = size / 2 - 8;
    const p0 = planePoint(axis, base, u, v); const p1 = planePoint(axis, base + delta, u, v);
    group.add(thickLine([p0, p1], 0xffe066, 2, res, mats));
    for (const c of [base, base + delta]) group.add(thickLine([planePoint(axis, c, u - 3.5, v), planePoint(axis, c, u + 3.5, v)], 0xffe066, 2, res, mats));
    // The fixed axis through the plane centres, with the drag handle (arrows both ways) on the new plane.
    const c0 = planePoint(axis, base, 0, 0); const c1 = planePoint(axis, base + delta, 0, 0);
    group.add(thickLine([c0, c1], 0xffe066, 1.6, res, mats, { dashed: true }));
    const dirv = c1.clone().sub(c0).normalize();
    const knob = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe066, depthTest: false }));
    knob.position.copy(c1); knob.renderOrder = 9; knob.raycast = () => undefined; group.add(knob);
    for (const sgn of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 14), new THREE.MeshBasicMaterial({ color: 0xffe066, depthTest: false }));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv.clone().multiplyScalar(sgn));
      cone.position.copy(c1).addScaledVector(dirv, sgn * 6); cone.renderOrder = 9; cone.raycast = () => undefined; group.add(cone);
    }
    const moveTag = textSprite('Drag', '#ffe066', 10, 3.2, 24);
    moveTag.position.copy(planePoint(axis, base + delta, 6, 3.5)); group.add(moveTag);
    calloutAnchorRef.current = p0.clone().add(p1).multiplyScalar(0.5);
    calloutRef.current?.render();
  }, [refCreate, stlData]);

  useImperativeHandle(ref, () => ({
    viewSection() {
      const camera = cameraRef.current; const controls = controlsRef.current; const pl = sectionPlaneRef.current; const info = sectionInfoRef.current;
      if (!camera || !controls || !pl) return;
      const target = info && !info.empty ? new THREE.Vector3().fromArray(info.centroid).sub(modelOffsetRef.current) : pl.O.clone();
      const dist = Math.max(camera.position.distanceTo(controls.target), 40);
      camera.up.copy(pl.v);
      camera.position.copy(target).addScaledVector(pl.n, dist);
      controls.target.copy(target);
      camera.lookAt(target);
      controls.update();
    },
    getCameraState() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return null;
      return { position: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number], up: camera.up.toArray() as [number, number, number] };
    },
    setCameraState(state) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      camera.position.fromArray(state.position);
      camera.up.fromArray(state.up);
      controls.target.fromArray(state.target);
      camera.lookAt(controls.target);
      controls.update();
    },
    setQuickView(dir) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const target = controls.target.clone();
      const distance = Math.max(camera.position.distanceTo(target), 40);
      camera.position.copy(target).add(QUICK_VIEW_DIRS[dir].clone().multiplyScalar(distance));
      camera.up.copy(QUICK_VIEW_UPS[dir]);
      camera.lookAt(target);
      controls.update();
    },
    setRenderStyle(style) {
      const mesh = meshRef.current;
      const edges = edgesRef.current;
      if (mesh) (mesh.material as THREE.MeshStandardMaterial).wireframe = style === 'wireframe';
      renderStyleRef.current = style;
      if (edges) edges.visible = style === 'shaded-edges' || edgePickEnabledRef.current;
    },
    setHidden(hidden) {
      if (meshRef.current) meshRef.current.visible = !hidden;
      if (edgesRef.current) edgesRef.current.visible = !hidden && edgesRef.current.visible;
    },
    fitAll() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const mesh = meshRef.current;
      if (!camera || !controls) return;
      let center = new THREE.Vector3(0, 0, 0);
      let radius = 140;
      if (mesh) {
        mesh.geometry.computeBoundingSphere();
        const sphere = mesh.geometry.boundingSphere;
        if (sphere) { center = sphere.center.clone(); radius = Math.max(sphere.radius, 10); }
      }
      const currentDir = camera.position.clone().sub(controls.target).normalize();
      const dir = currentDir.lengthSq() > 0 ? currentDir : new THREE.Vector3(1, 0.875, 1).normalize();
      controls.target.copy(center);
      camera.position.copy(center).add(dir.multiplyScalar(radius * 2.6));
      camera.lookAt(center);
      controls.update();
    },
    setCompass(enabled, mode = 'translate') {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const controls = controlsRef.current;
      const mesh = meshRef.current;
      if (!scene || !camera || !renderer) return;
      if (!enabled) {
        if (transformRef.current) {
          transformRef.current.detach();
          scene.remove(transformRef.current.getHelper());
          transformRef.current.dispose();
          transformRef.current = null;
        }
        return;
      }
      if (!mesh) return;
      if (!transformRef.current) {
        const t = new TransformControls(camera, renderer.domElement);
        t.addEventListener('dragging-changed', (event) => {
          if (controls) controls.enabled = !event.value;
        });
        scene.add(t.getHelper());
        transformRef.current = t;
      }
      transformRef.current.attach(mesh);
      transformRef.current.setMode(mode);
    },
    setInteractionMode(mode) {
      interactionModeRef.current = mode;
      const controls = controlsRef.current;
      if (!controls) return;
      // 'select' leaves the left button free for face picking (see the pointerup listener above).
      controls.mouseButtons = buttonsFor(mode, navRef.current.scheme);
    },
    setNavigation(settings) {
      navRef.current = settings;
      const controls = controlsRef.current;
      if (!controls) return;
      controls.zoomToCursor = settings.zoomToCursor;
      controls.mouseButtons = buttonsFor(interactionModeRef.current, settings.scheme);
    },
    clearPick() {
      pickedFaceRef.current = null;
      if (pickMarkerRef.current) pickMarkerRef.current.visible = false;
      onFacePickedRef.current?.(null);
    },
    getPickedFace() {
      const picked = pickedFaceRef.current;
      if (!picked) return null;
      const mp = picked.point.clone().add(modelOffsetRef.current);
      return { point: [mp.x, mp.y, mp.z], normal: [picked.normal.x, picked.normal.y, picked.normal.z] };
    },
    setNormalView() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const picked = pickedFaceRef.current;
      if (!camera || !controls || !picked) return;
      const distance = Math.max(camera.position.distanceTo(controls.target), 40);
      // Look straight down the face normal at the picked point, same as
      // CATIA's Normal View rotating the plane/face to true length in
      // your view. Up-vector falls back to world-Z when the normal is
      // nearly vertical, avoiding the same gimbal-lock issue Quick View's
      // top/bottom directions already work around.
      const up = Math.abs(picked.normal.y) > 0.98 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
      controls.target.copy(picked.point);
      camera.position.copy(picked.point).addScaledVector(picked.normal, distance);
      camera.up.copy(up);
      camera.lookAt(picked.point);
      controls.update();
    },
    rotateAzimuth(degrees) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), (degrees * Math.PI) / 180);
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      controls.update();
    },
  }), []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
});

export default StlViewport;
