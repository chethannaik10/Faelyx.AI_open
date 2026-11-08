// partDesign.ts
//
// CATIA V5 Part Design in the 3D Design tab: how a 2D sketch maps onto a
// 3D plane, the Part Design tool catalogue (toolbars, dialog fields), and
// buildOperation(), which turns one tool's dialog values plus the sketch
// geometry into the feature/modifier cad_server.py's /build_part replays.
// Pure data and functions, no React, so it can be unit-tested. The tool
// set and parameters follow CATIA_PART_DESIGN_TOOLS.md.

import type { PathSegment, ProfileLoop } from './profileLoops';
import { loopOutline, mirrorLoop, positionLoop } from './profileLoops';
import { SKETCH_ORIGIN_SVG } from './config';
import type { Plane as SketchPlane, SketchProjectData } from './sketch/types';

export type { SketchPlane };
export type Vec3 = [number, number, number];
// A sketch support as /build_part reads it (PartFeature.plane): the sketch
// H axis is xDir, V is normal × xDir, and a Pad grows along normal.
export type Frame = { origin: number[]; xDir: number[]; normal: number[] };
export type OpenPath = { start: [number, number]; segments: PathSegment[] };
export type Form = Record<string, string | boolean>;

// ---------------------------------------------------------------------------
// Sketch plane → 3D plane, as the Sketch & 2D plane picker labels them.
// ---------------------------------------------------------------------------
export const PLANE_BASIS: Record<SketchPlane, { x: Vec3; y: Vec3; n: Vec3; label: string }> = {
  Top: { x: [1, 0, 0], y: [0, 1, 0], n: [0, 0, 1], label: 'Top (XY)' },
  Front: { x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0], label: 'Front (XZ)' },
  Right: { x: [0, 1, 0], y: [0, 0, 1], n: [1, 0, 0], label: 'Right (YZ)' },
};
// Reference planes are named by the axes they contain; their offset runs
// along the missing axis (+Z for XY, +Y for XZ, +X for YZ), the same way
// StlViewport draws them.
export type RefPlaneAxis = 'XY' | 'XZ' | 'YZ';
export const REF_PLANE: Record<RefPlaneAxis, { sketch: SketchPlane; axis: Vec3 }> = {
  XY: { sketch: 'Top', axis: [0, 0, 1] },
  XZ: { sketch: 'Front', axis: [0, 1, 0] },
  YZ: { sketch: 'Right', axis: [1, 0, 0] },
};

const add = (a: number[], b: number[]): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: number[], k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: number[], b: number[]): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clean = (v: number[]): Vec3 => v.map((c) => (Math.abs(c) < 1e-12 ? 0 : c)) as Vec3;

// Sketch-local coordinates: H/V measured from the sketch origin marker, V
// up. The frame's origin is where that marker sits in 3D, so the sketch's
// H/V axes (a Shaft's axis, a hole's position) are the plane's own axes,
// as in CATIA. Traced profiles come out of the sketcher as (canvas x,
// −canvas y); toLocal() shifts them by the marker (O.x, −O.y).
export function frameFor(plane: SketchPlane, originPoint: number[]): Frame {
  const b = PLANE_BASIS[plane];
  return { origin: clean(originPoint), xDir: [...b.x], normal: [...b.n] };
}
export const toLocal = (loop: ProfileLoop): ProfileLoop => positionLoop(loop, -SKETCH_ORIGIN_SVG.x, SKETCH_ORIGIN_SVG.y, 0);
// A sketch plane pushed `offset` mm along its own normal.
export const sketchPlaneFrame = (plane: SketchPlane, offset: number) => frameFor(plane, mul(PLANE_BASIS[plane].n, offset));
// A reference plane at `offset` along its axis.
export const refPlaneFrame = (axis: RefPlaneAxis, offset: number) => frameFor(REF_PLANE[axis].sketch, mul(REF_PLANE[axis].axis, offset));

// What a new Reference Plane is offset from. A source value is '' (nothing picked yet), 'XY' / 'XZ' / 'YZ' (a primary plane),
// a Reference Plane's id, or `face:AXIS:coord:dir` (a planar face of the part parallel to a primary plane, `dir` = +1 / -1 along
// the axis the face looks toward). `base` is the source's position along its axis; the new plane runs along `dir` from there.
export type PlaneSource = { axis: RefPlaneAxis; base: number; dir: 1 | -1; label: string; /** set when the source is a custom (not X/Y/Z-parallel) Reference Plane */ frame?: Frame };
const PRIMARY_LABEL: Record<RefPlaneAxis, string> = { XY: 'Top plane (XY)', XZ: 'Front plane (XZ)', YZ: 'Right plane (YZ)' };
export function parsePlaneSource(value: string, refs: { id: string; name: string; kind: string; axis: string; offset: number; frame?: Frame }[]): PlaneSource | null {
  if (!value) return null;
  if (value === 'XY' || value === 'XZ' || value === 'YZ') return { axis: value, base: 0, dir: 1, label: PRIMARY_LABEL[value] };
  if (value.startsWith('face:')) {
    const [, axis, coord, dir] = value.split(':');
    const c = Number(coord);
    if ((axis === 'XY' || axis === 'XZ' || axis === 'YZ') && Number.isFinite(c)) return { axis, base: c, dir: Number(dir) < 0 ? -1 : 1, label: `planar face (${axis}, ${Math.round(c * 100) / 100} mm)` };
    return null;
  }
  const r = refs.find((x) => x.id === value && x.kind === 'plane');
  return r ? { axis: r.axis as RefPlaneAxis, base: r.offset, dir: 1, label: r.name, ...(r.frame ? { frame: r.frame } : {}) } : null;
}
/** Positions (along the source's axis) of the `count` planes a Reference Plane action creates, `distance` apart, the first `distance` from the source. */
export const referencePlanePositions = (src: PlaneSource, distance: number, flip: boolean, count: number): number[] =>
  Array.from({ length: count }, (_, i) => Math.round((src.base + src.dir * (flip ? -1 : 1) * distance * (i + 1)) * 1e6) / 1e6);

// A sketch-local point on a frame, in world coordinates.
export function toWorld(frame: Frame, [x, y]: [number, number]): Vec3 {
  const yDir = cross(frame.normal, frame.xDir);
  return clean(add(add(frame.origin, mul(frame.xDir, x)), mul(yDir, y)));
}
// Sketch wireframes in the 3D viewport are drawn this far off their plane,
// along its normal, so they don't lie flush in the plane, the grid or a
// face. Display only: frames and the geometry sent to the backend are not
// shifted.
export const SKETCH_LIFT_MM = 0.5;
export function toWorldLifted(frame: Frame, pt: [number, number], lift: number = SKETCH_LIFT_MM): Vec3 {
  return clean(add(toWorld(frame, pt), mul(frame.normal, lift)));
}
// The three primary planes as drawn in the 3D viewport (edge length, mm).
export const PRIMARY_PLANE_SIZE_MM = 50;

// A sketch-local displacement (no origin) in world coordinates.
export function vecToWorld(frame: Frame, [dx, dy]: [number, number]): Vec3 {
  const yDir = cross(frame.normal, frame.xDir);
  return clean(add(mul(frame.xDir, dx), mul(yDir, dy)));
}

// ---------------------------------------------------------------------------
// Open sketch geometry: the center curve of a Rib/Slot, the profile of a
// Stiffener, and standalone points for a User Pattern.
// ---------------------------------------------------------------------------
const sweepOf = (a: { start: number; end: number }) => (((a.end - a.start) % 360) + 360) % 360 || 360;

// The first open chain of (non-construction) lines and arcs in the sketch,
// walked from one free end to the other, in sketch-local coordinates with
// the sketch's positioning applied. Null when the sketch has no open chain.
export function extractOpenPath(data: SketchProjectData | null | undefined): OpenPath | null {
  if (!data) return null;
  const byId = new Map(data.points.map((p) => [p.id, p]));
  type E = { a: string; b: string; mid?: [number, number] };
  const edges: E[] = [];
  for (const l of data.lines) if (!l.style && byId.has(l.p1) && byId.has(l.p2) && l.p1 !== l.p2) edges.push({ a: l.p1, b: l.p2 });
  for (const arc of data.arcs ?? []) {
    if (!arc.p1 || !arc.p2 || arc.p1 === arc.p2 || !byId.has(arc.p1) || !byId.has(arc.p2) || !byId.has(arc.center)) continue;
    const c = byId.get(arc.center)!;
    const ang = ((arc.start + sweepOf(arc) / 2) * Math.PI) / 180;
    edges.push({ a: arc.p1, b: arc.p2, mid: [c.x + arc.r * Math.cos(ang), -(c.y + arc.r * Math.sin(ang))] });
  }
  // Points drawn on top of each other are one node.
  const key = (id: string) => { const p = byId.get(id)!; return `${Math.round(p.x * 1e6)}:${Math.round(p.y * 1e6)}`; };
  const adj = new Map<string, number[]>();
  edges.forEach((e, i) => { for (const k of [key(e.a), key(e.b)]) adj.set(k, [...(adj.get(k) ?? []), i]); });
  const startKey = [...adj.keys()].find((k) => adj.get(k)!.length === 1);
  if (!startKey) return null;
  const used = new Set<number>();
  const at = (k: string): [number, number] => { const [x, y] = k.split(':').map(Number); return [x / 1e6, -y / 1e6]; };
  const segments: PathSegment[] = [];
  let cur = startKey;
  for (;;) {
    const next = (adj.get(cur) ?? []).find((i) => !used.has(i));
    if (next === undefined) break;
    used.add(next);
    const e = edges[next];
    const other = key(e.a) === cur ? key(e.b) : key(e.a);
    segments.push(e.mid ? { kind: 'arc', mid: e.mid, end: at(other) } : { kind: 'line', end: at(other) });
    cur = other;
    if ((adj.get(cur) ?? []).length !== 2) break; // a free end or a branch
  }
  if (!segments.length) return null;
  const local = toLocal({ kind: 'path', start: at(startKey), segments });
  const pos = data.positioning;
  const placed = pos ? positionLoop(local, pos.originH, pos.originV, pos.angle) : local;
  return placed.kind === 'path' ? { start: placed.start, segments: placed.segments } : null;
}

// Points not used by any line, arc or circle (a User Pattern's positions),
// in sketch-local coordinates.
export function standalonePoints(data: SketchProjectData | null | undefined): [number, number][] {
  if (!data) return [];
  const used = new Set<string>();
  for (const l of data.lines) { used.add(l.p1); used.add(l.p2); }
  for (const c of data.circles) used.add(c.center);
  for (const a of data.arcs ?? []) { used.add(a.center); if (a.p1) used.add(a.p1); if (a.p2) used.add(a.p2); }
  return data.points.filter((p) => !used.has(p.id)).map((p) => [p.x - SKETCH_ORIGIN_SVG.x, SKETCH_ORIGIN_SVG.y - p.y]);
}

// A 2D open path on a frame → the 3D center curve /build_part's Rib/Slot reads.
export function pathTo3D(path: OpenPath, frame: Frame) {
  return {
    start: toWorld(frame, path.start),
    segments: path.segments.map((s) => (s.kind === 'arc'
      ? { kind: 'arc', mid: toWorld(frame, s.mid), end: toWorld(frame, s.end) }
      : { kind: 'line', end: toWorld(frame, s.end) })),
  };
}

// Mirror Feature: reflect a loop across the sketch's own H or V axis.
// Sketch-local loops mirror about the sketch origin marker.
export const mirrorFeatureLoop = (loop: ProfileLoop, axis: 'X' | 'Y'): ProfileLoop => mirrorLoop(loop, axis);

// ---------------------------------------------------------------------------
// Tool catalogue — CATIA Part Design toolbars.
// ---------------------------------------------------------------------------
export type ToolKind = 'feature' | 'modifier' | 'reference' | 'body' | 'boolean' | 'inspect' | 'mirror-feature' | 'image-3d' | 'unavailable';
type Show = (f: Form) => boolean;
export type Field =
  | { key: string; label: string | ((f: Form) => string); type: 'number' | 'text'; def: string; show?: Show; placeholder?: string }
  | { key: string; label: string | ((f: Form) => string); type: 'select'; options: [string, string][]; def: string; show?: Show }
  | { key: string; label: string | ((f: Form) => string); type: 'check'; def: boolean; show?: Show }
  | { key: string; label: string | ((f: Form) => string); type: 'sketch' | 'sketches' | 'body' | 'feature' | 'refpoint' | 'refpoints' | 'refline' | 'refseg' | 'refplane' | 'refsource'; def: string; show?: Show };
export type ToolSpec = {
  name: string; description: string; kind: ToolKind; shortcut?: string;
  fields?: Field[];
  // Faces picked in the viewport: optional (else a default) or required.
  faces?: 'optional' | 'required';
  /** Takes individual edges picked in the 3D view (Fillet, Chamfer, Variable Fillet). */
  edges?: boolean;
  /** Takes one point on a surface of the part, with its normal, picked in the 3D view (Reference Line · Normal to surface, Reference Point · On surface). */
  surface?: boolean;
  facesHint?: string;
  // What it takes from the current sketch in Sketch & 2D.
  sketch?: 'profile' | 'circles' | 'open' | 'points';
  reason?: string; // kind 'unavailable': why
};
export type ToolGroup = { label: string; tools: ToolSpec[] };

const AXES: [string, string][] = [['X', 'X'], ['Y', 'Y'], ['Z', 'Z']];
const DIRS: [string, string][] = [['+Z', '+Z'], ['-Z', '−Z'], ['+X', '+X'], ['-X', '−X'], ['+Y', '+Y'], ['-Y', '−Y']];
const PLANES: [string, string][] = [['XY', 'XY plane'], ['XZ', 'XZ (zx) plane'], ['YZ', 'YZ plane']];
const EDGES: [string, string][] = [['all', 'All edges'], ['vertical', 'Vertical edges'], ['horizontal', 'Horizontal edges'], ['curved', 'Curved edges (circles, arcs, splines)']];

const limitFields = (verb: string): Field[] => [
  { key: 'type', label: 'Type', type: 'select', options: [['dimension', 'Dimension'], ['up_to_last', 'Up to last']], def: 'dimension' },
  { key: 'length', label: `${verb} (mm)`, type: 'number', def: '20', show: (f) => f.type === 'dimension' },
  { key: 'reverse', label: 'Reverse direction', type: 'check', def: false },
  { key: 'mirrored', label: 'Mirrored extent', type: 'check', def: false, show: (f) => f.type === 'dimension' },
  { key: 'second', label: 'Second limit', type: 'check', def: false, show: (f) => !f.mirrored },
  { key: 'length2', label: 'Second limit length (mm)', type: 'number', def: '10', show: (f) => !!f.second && !f.mirrored },
  { key: 'thick', label: 'Thick', type: 'check', def: false },
  { key: 'thin1', label: 'Thickness 1 — inward (mm)', type: 'number', def: '1', show: (f) => !!f.thick },
  { key: 'thin2', label: 'Thickness 2 — outward (mm)', type: 'number', def: '0', show: (f) => !!f.thick },
];
const revolveFields: Field[] = [
  { key: 'angle1', label: 'First angle (°)', type: 'number', def: '360' },
  { key: 'angle2', label: 'Second angle (°)', type: 'number', def: '0' },
  { key: 'axis', label: 'Axis', type: 'select', options: [['X', 'Sketch H axis'], ['Y', 'Sketch V axis']], def: 'X' },
  { key: 'thick', label: 'Thick', type: 'check', def: false },
  { key: 'thin1', label: 'Thickness 1 (mm)', type: 'number', def: '1', show: (f) => !!f.thick },
  { key: 'thin2', label: 'Thickness 2 (mm)', type: 'number', def: '0', show: (f) => !!f.thick },
];
const sweepFields: Field[] = [
  { key: 'centerType', label: 'Center curve from', type: 'select', options: [['sketch', 'A kept sketch (open chain of lines / arcs)'], ['refline', 'A Reference Line (a line between points on any planes)']], def: 'sketch' },
  { key: 'center', label: 'Center curve — a kept sketch with an open chain', type: 'sketch', def: '', show: (f) => f.centerType !== 'refline' },
  { key: 'centerRef', label: 'Center curve — a Reference Line', type: 'refseg', def: '', show: (f) => f.centerType === 'refline' },
  { key: 'control', label: 'Profile control', type: 'select', options: [['keep_angle', 'Keep angle'], ['pulling', 'Pulling direction'], ['refsurface', 'Reference surface'], ['frenet', 'Keep Frenet (follow the curve)']], def: 'keep_angle' },
  { key: 'pdir', label: 'Pulling direction', type: 'select', options: DIRS, def: '+Z', show: (f) => f.control === 'pulling' },
  { key: 'refSurface', label: 'Reference surface (a plane)', type: 'refplane', def: 'XY', show: (f) => f.control === 'refsurface' },
  { key: 'moveProfile', label: 'Move profile to path (put the profile at the start of the curve, normal to it)', type: 'check', def: false },
  { key: 'transition', label: 'Transition at corners', type: 'select', options: [['round', 'Round'], ['right', 'Right (sharp)']], def: 'round' },
  { key: 'thick', label: 'Thick profile', type: 'check', def: false },
  { key: 'neutral', label: 'Neutral fiber (split the thickness equally on both sides)', type: 'check', def: false, show: (f) => !!f.thick },
  { key: 'thin1', label: (f) => (f.neutral ? 'Thickness (mm)' : 'Thickness 1 — inward (mm)'), type: 'number', def: '1', show: (f) => !!f.thick },
  { key: 'thin2', label: 'Thickness 2 — outward (mm)', type: 'number', def: '0', show: (f) => !!f.thick && !f.neutral },
];
const planeOffsetFields = (label: string): Field[] => [
  { key: 'plane', label, type: 'select', options: PLANES, def: 'XY' },
  { key: 'offset', label: 'Offset along the plane normal (mm)', type: 'number', def: '0' },
];

// Reference element definition types, as CATIA's Plane / Line / Point Definition boxes list them.
const PLANE_TYPES: [string, string][] = [
  ['offset', 'Offset from plane'], ['parallel_point', 'Parallel through point'], ['angle_normal', 'Angle/Normal to plane'], ['three_points', 'Through three points'],
  ['two_lines', 'Through two lines'], ['point_line', 'Through point and line'], ['planar_curve', 'Through planar curve'], ['normal_curve', 'Normal to curve'],
  ['tangent_surface', 'Tangent to surface'], ['equation', 'Equation'], ['mean_points', 'Mean through points'],
];
// A Reference Plane form saved before the types existed has no ptype: it is the offset plane.
const isPlaneType = (t: string): Show => (f) => (f.ptype ?? 'offset') === t;
/** A point chosen from the Reference Points (or typed / clicked in the view): a select plus a coordinate box. */
const pointPick = (key: string, label: string, show: Show, def = '0, 0, 0'): Field[] => [
  { key, label, type: 'refpoint', def: 'coords', show },
  { key: `${key}XYZ`, label: `${label} (x, y, z) in mm`, type: 'text', def, show: (f) => show(f) && f[key] === 'coords' },
];

export const TOOL_GROUPS: ToolGroup[] = [
  { label: 'SKETCH-BASED FEATURES', tools: [
    { name: 'Pad', kind: 'feature', sketch: 'profile', shortcut: 'E', description: 'Extrude the sketch profile to add material (Dimension / Up to last, mirrored, second limit, thick).', fields: limitFields('Length') },
    { name: 'Pocket', kind: 'feature', sketch: 'profile', shortcut: 'K', description: 'Extrude the sketch profile to remove material.', fields: limitFields('Depth') },
    { name: 'Shaft', kind: 'feature', sketch: 'profile', shortcut: 'R', description: 'Revolve the sketch profile around the sketch H or V axis to add material.', fields: revolveFields },
    { name: 'Groove', kind: 'feature', sketch: 'profile', description: 'Revolve the sketch profile around an axis to remove material.', fields: revolveFields },
    { name: 'Hole', kind: 'feature', sketch: 'circles', shortcut: 'H', description: 'Drill holes at the sketch circles: simple, counterbored, countersunk; flat or V bottom; threaded.', fields: [
      { key: 'type', label: 'Type', type: 'select', options: [['simple', 'Simple'], ['counterbored', 'Counterbored'], ['countersunk', 'Countersunk']], def: 'simple' },
      { key: 'extension', label: 'Extension', type: 'select', options: [['blind', 'Blind'], ['up_to_last', 'Up to last']], def: 'blind' },
      { key: 'diameter', label: 'Diameter (mm) — blank: circle size, or thread core', type: 'number', def: '' },
      { key: 'depth', label: 'Depth (mm)', type: 'number', def: '20', show: (f) => f.extension === 'blind' },
      { key: 'bottom', label: 'Bottom', type: 'select', options: [['flat', 'Flat'], ['v_bottom', 'V-bottom']], def: 'flat', show: (f) => f.extension === 'blind' },
      { key: 'bottomAngle', label: 'V-bottom angle (°)', type: 'number', def: '118', show: (f) => f.extension === 'blind' && f.bottom === 'v_bottom' },
      { key: 'cbDiameter', label: 'Counterbore diameter (mm)', type: 'number', def: '16', show: (f) => f.type === 'counterbored' },
      { key: 'cbDepth', label: 'Counterbore depth (mm)', type: 'number', def: '5', show: (f) => f.type === 'counterbored' },
      { key: 'csDiameter', label: 'Countersink diameter (mm)', type: 'number', def: '16', show: (f) => f.type === 'countersunk' },
      { key: 'csAngle', label: 'Countersink angle (°)', type: 'number', def: '90', show: (f) => f.type === 'countersunk' },
      { key: 'threaded', label: 'Threaded', type: 'check', def: false },
      { key: 'designation', label: 'Thread (ISO metric coarse, e.g. M10)', type: 'text', def: 'M10', show: (f) => !!f.threaded },
    ] },
    { name: 'Rib', kind: 'feature', sketch: 'profile', description: 'Sweep the sketch profile along a center curve (a kept open sketch or a Reference Line) to add material.', fields: sweepFields },
    { name: 'Slot', kind: 'feature', sketch: 'profile', description: 'Sweep the sketch profile along a center curve (a kept open sketch or a Reference Line) to remove material.', fields: sweepFields },
    { name: 'Stiffener', kind: 'feature', sketch: 'open', description: 'Thicken an open sketch profile into a web that fills up to the existing material.', fields: [
      { key: 'thickness', label: 'Thickness (mm)', type: 'number', def: '4' },
      { key: 'mirrored', label: 'Mirrored extent (symmetric about the sketch plane)', type: 'check', def: true },
      { key: 'reverse', label: 'Reverse direction', type: 'check', def: false, show: (f) => !f.mirrored },
    ] },
    { name: 'Multi-sections Solid', kind: 'feature', description: 'Solid through two or more kept sketches (sections), in order.', fields: [
      { key: 'sections', label: 'Sections (kept sketches, in order)', type: 'sketches', def: '' },
      { key: 'ruled', label: 'Ruled (straight coupling)', type: 'check', def: false },
    ] },
    { name: 'Removed Multi-sections Solid', kind: 'feature', description: 'Remove the material swept through two or more kept sketches.', fields: [
      { key: 'sections', label: 'Sections (kept sketches, in order)', type: 'sketches', def: '' },
      { key: 'ruled', label: 'Ruled (straight coupling)', type: 'check', def: false },
    ] },
    { name: 'Drafted Filleted Pad', kind: 'unavailable', description: 'Pad + draft + fillets in one step.', reason: 'Not available yet — build it as Pad, then Draft and Edge Fillet.' },
  ]},
  { label: 'DRESS-UP FEATURES', tools: [
    { name: 'Edge Fillet', kind: 'modifier', shortcut: 'F', faces: 'optional', edges: true, facesHint: 'Picked faces: all their edges are filleted. Picked edges (above) win over faces. Nothing picked: the edge filter below is used.', description: 'Round edges with a constant radius — the edges you pick, the edges of picked faces, or an edge filter.', fields: [
      { key: 'radius', label: 'Radius (mm)', type: 'number', def: '2' },
      { key: 'edges', label: 'Edges (when nothing is picked)', type: 'select', options: EDGES, def: 'all' },
    ] },
    { name: 'Variable Fillet', kind: 'modifier', faces: 'optional', edges: true, facesHint: 'Or pick faces: all their edges get the variable fillet. Pick at least one edge or face.', description: 'Fillet whose radius varies from Radius 1 to Radius 2 along each edge.', fields: [
      { key: 'radius', label: 'Radius 1 (mm)', type: 'number', def: '1' },
      { key: 'radius2', label: 'Radius 2 (mm)', type: 'number', def: '3' },
    ] },
    { name: 'Chamfer', kind: 'modifier', shortcut: 'C', faces: 'optional', edges: true, facesHint: 'Picked faces: all their edges are chamfered. Picked edges (above) win over faces. Nothing picked: the edge filter below is used.', description: 'Bevel edges: Length + angle (CATIA default) or two lengths.', fields: [
      { key: 'mode', label: 'Chamfer mode', type: 'select', options: [['equal', 'Equal distance'], ['angle', 'Length + angle'], ['lengths', 'Two lengths']], def: 'angle' },
      { key: 'length', label: (f) => (f.mode === 'equal' ? 'Distance (mm)' : 'Length 1 (mm)'), type: 'number', def: '2' },
      { key: 'edges', label: 'Edges (when nothing is picked)', type: 'select', options: EDGES, def: 'all' },
      { key: 'angle', label: 'Angle (°) — from the first face, 0–90', type: 'number', def: '45', show: (f) => f.mode === 'angle' },
      { key: 'reverse', label: 'Reverse — measure the length and angle from the other face', type: 'check', def: false, show: (f) => f.mode === 'angle' },
      { key: 'length2', label: 'Length 2 (mm)', type: 'number', def: '2', show: (f) => f.mode === 'lengths' },
    ] },
    { name: 'Draft', kind: 'modifier', faces: 'optional', facesHint: 'Picked faces are drafted. None picked: every side face (parallel to the pull direction).', description: 'Tilt faces by a draft angle relative to a pull direction, pivoting on a neutral element.', fields: [
      { key: 'angle', label: 'Draft angle (°)', type: 'number', def: '5' },
      { key: 'pull', label: 'Pull direction', type: 'select', options: DIRS, def: '+Z' },
      { key: 'neutral', label: 'Neutral element', type: 'select', options: [['auto', 'Face the part stands on'], ...PLANES], def: 'auto' },
      { key: 'neutralOffset', label: 'Neutral plane offset (mm)', type: 'number', def: '0', show: (f) => f.neutral !== 'auto' },
    ] },
    { name: 'Shell', kind: 'modifier', faces: 'optional', facesHint: 'Picked faces are removed (left open). None picked: the top (+Z) face.', description: 'Hollow the part, leaving walls; the faces to remove stay open.', fields: [
      { key: 'thickness', label: 'Inside thickness (mm)', type: 'number', def: '2' },
      { key: 'outside', label: 'Outside thickness (mm)', type: 'number', def: '0' },
    ] },
    { name: 'Thickness', kind: 'modifier', faces: 'required', facesHint: 'Pick the faces to thicken.', description: 'Add (positive) or remove (negative) material on picked faces.', fields: [
      { key: 'thickness', label: 'Thickness (mm) — negative removes', type: 'number', def: '2' },
    ] },
    { name: 'Thread/Tap', kind: 'modifier', faces: 'required', facesHint: 'Pick the cylindrical face to thread.', description: 'Cosmetic thread (shaft) or tap (hole), checked against the picked cylinder.', fields: [
      { key: 'threadType', label: 'Type', type: 'select', options: [['thread', 'Thread (external)'], ['tap', 'Tap (internal)']], def: 'thread' },
      { key: 'designation', label: 'Designation (e.g. M10, M10x1.25)', type: 'text', def: 'M10' },
      { key: 'depth', label: 'Depth (mm) — blank: whole face', type: 'number', def: '' },
    ] },
    { name: 'Remove Face', kind: 'modifier', faces: 'required', facesHint: 'Pick the faces to remove; neighbours are extended to close the gap.', description: 'Remove faces and heal the part (defeaturing).' },
    { name: 'Face-Face Fillet', kind: 'unavailable', description: 'Fillet between two faces without a common edge.', reason: 'Not available yet — needs a two-face blend in the backend.' },
    { name: 'Tritangent Fillet', kind: 'unavailable', description: 'Fillet tangent to three faces, removing one.', reason: 'Not available yet — needs a tritangent blend in the backend.' },
  ]},
  { label: 'SURFACE-BASED FEATURES', tools: [
    { name: 'Split', kind: 'modifier', description: 'Cut the part with a plane and keep one side.', fields: [
      ...planeOffsetFields('Splitting plane'),
      { key: 'keep', label: 'Side to keep', type: 'select', options: [['+', 'Positive side of the normal'], ['-', 'Negative side']], def: '+' },
    ] },
    { name: 'Thick Surface', kind: 'unavailable', description: 'Add material to a surface.', reason: 'Not available — Faelyx has no surface-modelling layer yet.' },
    { name: 'Close Surface', kind: 'unavailable', description: 'Fill a closed surface into a solid.', reason: 'Not available — Faelyx has no surface-modelling layer yet.' },
    { name: 'Sew Surface', kind: 'unavailable', description: 'Join a surface to the body.', reason: 'Not available — Faelyx has no surface-modelling layer yet.' },
  ]},
  { label: 'TRANSFORMATION FEATURES', tools: [
    { name: 'Translation', kind: 'modifier', description: 'Move the body along a direction.', fields: [
      { key: 'dir', label: 'Direction', type: 'select', options: AXES, def: 'X' },
      { key: 'distance', label: 'Distance (mm)', type: 'number', def: '20' },
    ] },
    { name: 'Rotation', kind: 'modifier', description: 'Rotate the body about an axis.', fields: [
      { key: 'axis', label: 'Axis direction', type: 'select', options: AXES, def: 'Z' },
      { key: 'origin', label: 'Axis passes through (x, y, z)', type: 'text', def: '0, 0, 0' },
      { key: 'angle', label: 'Angle (°)', type: 'number', def: '90' },
    ] },
    { name: 'Symmetry', kind: 'modifier', description: 'Mirror the body about a plane; the original is not kept.', fields: planeOffsetFields('Symmetry plane') },
    { name: 'Mirror', kind: 'modifier', description: 'Duplicate the body by symmetry (original kept).', fields: [
      { key: 'plane', label: 'Mirror plane', type: 'select', options: [['XY', 'XY'], ['YZ', 'YZ'], ['XZ', 'XZ']], def: 'YZ' },
    ] },
    { name: 'Mirror Feature', kind: 'mirror-feature', description: 'Copy one feature, reflected across its sketch H or V axis.', fields: [
      { key: 'feature', label: 'Feature to mirror', type: 'feature', def: '' },
      { key: 'axis', label: 'Mirror across', type: 'select', options: [['X', 'Sketch H axis (flip top/bottom)'], ['Y', 'Sketch V axis (flip left/right)']], def: 'Y' },
    ] },
    { name: 'Rectangular Pattern', kind: 'modifier', description: 'Repeat the body in one or two directions.', fields: [
      { key: 'dir1', label: 'First direction', type: 'select', options: AXES, def: 'X' },
      { key: 'count', label: 'Instances', type: 'number', def: '3' },
      { key: 'spacing', label: 'Spacing (mm)', type: 'number', def: '30' },
      { key: 'second', label: 'Second direction', type: 'check', def: false },
      { key: 'dir2', label: 'Second direction', type: 'select', options: AXES, def: 'Y', show: (f) => !!f.second },
      { key: 'count2', label: 'Instances (second direction)', type: 'number', def: '2', show: (f) => !!f.second },
      { key: 'spacing2', label: 'Spacing (second direction, mm)', type: 'number', def: '30', show: (f) => !!f.second },
    ] },
    { name: 'Circular Pattern', kind: 'modifier', description: 'Repeat the body around an axis.', fields: [
      { key: 'axis', label: 'Reference axis', type: 'select', options: AXES, def: 'Z' },
      { key: 'origin', label: 'Axis passes through (x, y, z)', type: 'text', def: '0, 0, 0' },
      { key: 'count', label: 'Instances', type: 'number', def: '4' },
      { key: 'mode', label: 'Axial reference', type: 'select', options: [['crown', 'Complete crown (360°)'], ['spacing', 'Instances & angular spacing']], def: 'crown' },
      { key: 'spacing', label: 'Angular spacing (°)', type: 'number', def: '45', show: (f) => f.mode === 'spacing' },
    ] },
    { name: 'User Pattern', kind: 'modifier', sketch: 'points', description: 'Copy the body to positions: the current sketch\'s standalone points (relative to the sketch origin) or typed offsets.', fields: [
      { key: 'source', label: 'Positions', type: 'select', options: [['points', 'Points in the current sketch'], ['typed', 'Typed offsets']], def: 'points' },
      { key: 'offsets', label: 'Offsets dx, dy, dz; …', type: 'text', def: '40, 0, 0; 0, 40, 0', show: (f) => f.source === 'typed' },
    ] },
    { name: 'Scaling', kind: 'modifier', description: 'Resize the body about a point, or along one axis (affinity).', fields: [
      { key: 'mode', label: 'Reference', type: 'select', options: [['point', 'Point (uniform)'], ['axis', 'Along an axis (affinity)']], def: 'point' },
      { key: 'ratio', label: 'Ratio', type: 'number', def: '1.5' },
      { key: 'center', label: 'Reference point (x, y, z)', type: 'text', def: '0, 0, 0' },
      { key: 'axis', label: 'Axis', type: 'select', options: AXES, def: 'X', show: (f) => f.mode === 'axis' },
    ] },
  ]},
  { label: 'BOOLEAN OPERATIONS', tools: [
    { name: 'Insert Body', kind: 'body', description: 'Create a new body and make it the one new features go into.', fields: [
      { key: 'polarity', label: 'Polarity for Assemble', type: 'select', options: [['add', 'Add material'], ['remove', 'Remove material']], def: 'add' },
    ] },
    ...(['Add', 'Remove', 'Intersect', 'Assemble'] as const).map((name): ToolSpec => ({
      name, kind: 'boolean',
      description: { Add: 'Fuse a body into a target body.', Remove: 'Subtract a body from a target body.', Intersect: 'Keep only the volume two bodies share.', Assemble: 'Fuse or subtract a body according to its polarity.' }[name],
      fields: [
        { key: 'tool', label: 'Body', type: 'body', def: '' },
        { key: 'target', label: 'Into / from target body', type: 'body', def: 'PartBody' },
      ],
    })),
    { name: 'Remove Lump', kind: 'boolean', description: 'Keep only the largest lump of a body, dropping disconnected pieces.', fields: [
      { key: 'target', label: 'Body', type: 'body', def: 'PartBody' },
    ] },
    { name: 'Union Trim', kind: 'unavailable', description: 'Union with selected portions trimmed.', reason: 'Not available in the UI yet — needs picking the pieces to keep.' },
  ]},
  { label: 'REFERENCE ELEMENTS', tools: [
    { name: 'Reference Plane', kind: 'reference', surface: true, description: 'A plane defined the CATIA way — pick a Plane type: offset from a plane, parallel through a point, angle / normal to a plane, through three points, two lines, a point and a line or a planar curve, normal to a curve, tangent to a surface, by equation, or the mean plane through points. For an offset, click a plane or a planar face in the 3D view: the new plane appears with its distance, which you can change by double-clicking the value.', fields: [
      { key: 'ptype', label: 'Plane type', type: 'select', options: PLANE_TYPES, def: 'offset' },
      { key: 'source', label: 'Offset from (click a plane or planar face in the 3D view)', type: 'refsource', def: '', show: isPlaneType('offset') },
      { key: 'distance', label: 'Offset distance (mm)', type: 'number', def: '10', show: isPlaneType('offset') },
      { key: 'flip', label: 'Flip direction', type: 'check', def: false, show: isPlaneType('offset') },
      { key: 'count', label: 'Number of planes (equal spacing, one action)', type: 'number', def: '1', show: isPlaneType('offset') },
      { key: 'basePlane', label: (f) => (f.ptype === 'angle_normal' ? 'Reference plane' : 'Reference plane (the new plane stays parallel to it)'), type: 'refplane', def: 'XY', show: (f) => f.ptype === 'parallel_point' || f.ptype === 'angle_normal' },
      ...pointPick('pt', 'Point', (f) => f.ptype === 'parallel_point' || f.ptype === 'point_line'),
      { key: 'axisLine', label: 'Rotation axis (in or parallel to the reference plane)', type: 'refline', def: 'PLANE_H', show: isPlaneType('angle_normal') },
      { key: 'normalTo', label: 'Normal to plane (90°)', type: 'check', def: false, show: isPlaneType('angle_normal') },
      { key: 'angle', label: 'Angle (°)', type: 'number', def: '45', show: (f) => f.ptype === 'angle_normal' && !f.normalTo },
      ...pointPick('p1', 'First point', isPlaneType('three_points'), '0, 0, 0'),
      ...pointPick('p2', 'Second point', isPlaneType('three_points'), '50, 0, 0'),
      ...pointPick('p3', 'Third point', isPlaneType('three_points'), '0, 50, 0'),
      { key: 'line1', label: (f) => (f.ptype === 'point_line' ? 'Line' : 'First line'), type: 'refline', def: 'X', show: (f) => f.ptype === 'two_lines' || f.ptype === 'point_line' },
      { key: 'line2', label: 'Second line (meets the first, or parallel to it)', type: 'refline', def: 'Y', show: isPlaneType('two_lines') },
      { key: 'sketch', label: (f) => (f.ptype === 'normal_curve' ? 'Curve — kept sketch' : 'Planar curve — kept sketch (the plane it lies in)'), type: 'sketch', def: '', show: (f) => f.ptype === 'planar_curve' || f.ptype === 'normal_curve' },
      { key: 'curve', label: 'Outline number in that sketch (closed profiles first, then the open chain)', type: 'number', def: '1', show: isPlaneType('normal_curve') },
      { key: 'ratio', label: 'Position along the curve (0 = start, 1 = end)', type: 'number', def: '0.5', show: isPlaneType('normal_curve') },
      { key: 'eqA', label: 'A in Ax + By + Cz = D', type: 'number', def: '0', show: isPlaneType('equation') },
      { key: 'eqB', label: 'B', type: 'number', def: '0', show: isPlaneType('equation') },
      { key: 'eqC', label: 'C', type: 'number', def: '1', show: isPlaneType('equation') },
      { key: 'eqD', label: 'D (mm)', type: 'number', def: '0', show: isPlaneType('equation') },
      { key: 'meanRefs', label: 'Reference points to fit (tick the ones to use)', type: 'refpoints', def: '', show: isPlaneType('mean_points') },
      { key: 'meanXYZ', label: 'More points (x, y, z; x, y, z; …)', type: 'text', def: '', placeholder: '0, 0, 0; 10, 0, 1; 5, 8, 0', show: isPlaneType('mean_points') },
    ] },
    { name: 'Reference Axis', kind: 'reference', description: 'Axis along X, Y or Z (visual reference).', fields: [
      { key: 'orient', label: 'Along', type: 'select', options: AXES, def: 'Z' },
      { key: 'offset', label: 'Offset from origin (mm)', type: 'number', def: '0' },
    ] },
    { name: 'Coordinate System', kind: 'reference', description: 'Local axis system (visual reference).', fields: [
      { key: 'orient', label: 'Along', type: 'select', options: AXES, def: 'Z' },
      { key: 'offset', label: 'Offset from origin (mm)', type: 'number', def: '0' },
    ] },
    { name: 'Reference Point', kind: 'reference', description: 'A standalone 3D reference point, defined by a Point type: coordinates, on a curve, on a plane, on a surface, a circle\'s center, tangent on a curve, between two points, or where a line meets a plane.', surface: true, fields: [
      { key: 'method', label: 'Creation mode', type: 'select', options: [['coordinates', 'Coordinates'], ['on_curve', 'On curve'], ['on_plane', 'On plane'], ['on_surface', 'On surface'], ['center', 'Circle / sphere / ellipse center'], ['tangent_curve', 'Tangent on curve'], ['between', 'Between'], ['plane_intersection', 'Plane intersection']], def: 'coordinates' },
      { key: 'x', label: 'X (mm)', type: 'number', def: '0', show: (f) => f.method === 'coordinates' },
      { key: 'y', label: 'Y (mm)', type: 'number', def: '0', show: (f) => f.method === 'coordinates' },
      { key: 'z', label: 'Z (mm)', type: 'number', def: '0', show: (f) => f.method === 'coordinates' },
      { key: 'sketch', label: 'Curve — kept sketch', type: 'sketch', def: '', show: (f) => f.method === 'on_curve' || f.method === 'center' || f.method === 'tangent_curve' },
      { key: 'curve', label: 'Outline number in that sketch (closed profiles first, then the open chain)', type: 'number', def: '1', show: (f) => f.method === 'on_curve' || f.method === 'center' || f.method === 'tangent_curve' },
      { key: 'ratio', label: 'Position along the curve (0 = start, 1 = end)', type: 'number', def: '0.5', show: (f) => f.method === 'on_curve' },
      { key: 'onPlane', label: 'Plane', type: 'refplane', def: 'XY', show: (f) => f.method === 'on_plane' },
      { key: 'h', label: 'H — along the plane’s horizontal axis, from its origin (mm)', type: 'number', def: '0', show: (f) => f.method === 'on_plane' },
      { key: 'v', label: 'V — along the plane’s vertical axis, from its origin (mm)', type: 'number', def: '0', show: (f) => f.method === 'on_plane' },
      { key: 'tdir', label: 'Tangent direction', type: 'select', options: [['+X', '+X'], ['+Y', '+Y'], ['+Z', '+Z'], ['custom', 'Custom (x, y, z)']], def: '+X', show: (f) => f.method === 'tangent_curve' },
      { key: 'tdirXYZ', label: 'Direction vector (x, y, z)', type: 'text', def: '1, 0, 0', show: (f) => f.method === 'tangent_curve' && f.tdir === 'custom' },
      { key: 'solution', label: 'Solution number (the curve may be tangent to that direction in several places)', type: 'number', def: '1', show: (f) => f.method === 'tangent_curve' },
      ...pointPick('start', 'First point', (f) => f.method === 'between'),
      ...pointPick('end', 'Second point', (f) => f.method === 'between', '50, 0, 0'),
      { key: 'ratio2', label: 'Ratio between them (0 = first point, 0.5 = middle, 1 = second)', type: 'number', def: '0.5', show: (f) => f.method === 'between' },
      { key: 'line', label: 'Line or axis', type: 'refline', def: 'Z', show: (f) => f.method === 'plane_intersection' },
      { key: 'plane', label: 'Plane', type: 'refplane', def: 'XY', show: (f) => f.method === 'plane_intersection' },
      { key: 'planeOffset', label: 'Offset of that plane from the origin (mm)', type: 'number', def: '0', show: (f) => f.method === 'plane_intersection' && ['XY', 'XZ', 'YZ'].includes(String(f.plane)) },
    ] },
    { name: 'Reference Line', kind: 'reference', description: 'A 3D reference line, defined by a Line type: point to point, point and direction, angle / normal to a curve, tangent to a curve, normal to a surface, or the bisector of two lines.', surface: true, fields: [
      { key: 'method', label: 'Line type', type: 'select', options: [['point_point', 'Point – Point'], ['point_direction', 'Point – Direction'], ['angle_curve', 'Angle / Normal to curve'], ['tangent', 'Tangent to curve'], ['normal_surface', 'Normal to surface'], ['bisecting', 'Bisecting']], def: 'point_point' },
      { key: 'start', label: 'First point', type: 'refpoint', def: 'coords', show: (f) => f.method === 'point_point' || f.method === 'point_direction' },
      { key: 'startXYZ', label: 'First point (x, y, z) in mm', type: 'text', def: '0, 0, 0', show: (f) => (f.method === 'point_point' || f.method === 'point_direction') && f.start === 'coords' },
      { key: 'end', label: 'Second point', type: 'refpoint', def: 'coords', show: (f) => f.method === 'point_point' },
      { key: 'endXYZ', label: 'Second point (x, y, z) in mm', type: 'text', def: '50, 0, 0', show: (f) => f.method === 'point_point' && f.end === 'coords' },
      { key: 'dir', label: 'Direction', type: 'select', options: [['+X', '+X'], ['-X', '−X'], ['+Y', '+Y'], ['-Y', '−Y'], ['+Z', '+Z'], ['-Z', '−Z'], ['custom', 'Custom (x, y, z)']], def: '+Z', show: (f) => f.method === 'point_direction' },
      { key: 'dirXYZ', label: 'Direction vector (x, y, z)', type: 'text', def: '0, 0, 1', show: (f) => f.method === 'point_direction' && f.dir === 'custom' },
      { key: 'sketch', label: 'Curve — kept sketch', type: 'sketch', def: '', show: (f) => f.method === 'tangent' || f.method === 'angle_curve' },
      { key: 'curve', label: 'Outline number in that sketch (closed profiles first, then the open chain)', type: 'number', def: '1', show: (f) => f.method === 'tangent' || f.method === 'angle_curve' },
      { key: 'ratio', label: (f) => (f.method === 'angle_curve' ? 'Point on the curve (0 = start, 1 = end)' : 'Tangent at (0 = start of the curve, 1 = end)'), type: 'number', def: '0.5', show: (f) => f.method === 'tangent' || f.method === 'angle_curve' },
      { key: 'lineAngle', label: 'Angle to the curve’s tangent, in the sketch plane (°) — 90 is normal to the curve', type: 'number', def: '90', show: (f) => f.method === 'angle_curve' },
      { key: 'bis1', label: 'First line', type: 'refline', def: 'X', show: (f) => f.method === 'bisecting' },
      { key: 'bis2', label: 'Second line (must meet the first)', type: 'refline', def: 'Y', show: (f) => f.method === 'bisecting' },
      { key: 'otherBis', label: 'Other bisector (the supplementary angle)', type: 'check', def: false, show: (f) => f.method === 'bisecting' },
      { key: 'length', label: 'Length (mm)', type: 'number', def: '50', show: (f) => f.method !== 'point_point' },
      { key: 'mirrored', label: 'Mirrored extent (the same length on the other side too)', type: 'check', def: false, show: (f) => f.method !== 'point_point' },
    ] },
  ]},
  { label: 'INSPECT', tools: [
    { name: 'Mass Properties', kind: 'inspect', description: 'Volume, surface area and bounding box of the active body.' },
    { name: 'Interference Check', kind: 'inspect', description: 'Find disjoint solids in the active body.' },
    { name: 'Model Validation', kind: 'inspect', description: 'Check the active body is one watertight solid.' },
  ]},
  { label: 'AI GENERATE', tools: [
    { name: 'Image to 3D', kind: 'image-3d', description: 'Upload a picture and Hunyuan3D 2.1 (best quality) or TripoSR (fast draft) builds a 3D mesh from it on this computer — preview it, then add it to the model as a mesh body.' },
  ] },
  { label: 'AI ENGINEERING', tools: [
    { name: 'AI Feature Assist', kind: 'unavailable', description: 'Ask Faelyx AI to recommend the next modeling operation.', reason: 'Not connected yet — use the AI Assistant tab.' },
    { name: 'AI Analyze Model', kind: 'unavailable', description: 'Review geometry, material, mass and manufacturability.', reason: 'Not connected yet.' },
    { name: 'Optimize Design', kind: 'unavailable', description: 'Generate weight, strength and cost-aware alternatives.', reason: 'Not connected yet.' },
  ]},
];

export const TOOLS: Record<string, ToolSpec> = Object.fromEntries(TOOL_GROUPS.flatMap((g) => g.tools.map((t) => [t.name, t])));

export function defaultForm(tool: string): Form {
  const out: Form = {};
  for (const f of TOOLS[tool]?.fields ?? []) out[f.key] = f.def;
  return out;
}
export const fieldLabel = (f: Field, form: Form) => (typeof f.label === 'function' ? f.label(form) : f.label);
export const fieldVisible = (f: Field, form: Form) => !f.show || f.show(form);

// ---------------------------------------------------------------------------
// buildOperation: dialog values + sketch geometry → a /build_part entry.
// ---------------------------------------------------------------------------
// What a kept sketch sits on. `plane`: one of the three sketch planes at an
// offset along its normal; `ref`: a Reference Plane; `face`: a picked face
// (the frame is fixed). Sketches kept before supports were stored have none
// and keep their stored frame.
export type SketchSupportRef =
  | { kind: 'plane'; plane: SketchPlane; offset: number }
  | { kind: 'ref'; refId: string; axis: RefPlaneAxis; offset: number; frame?: Frame }
  | { kind: 'face' };
export const supportFrame = (s: SketchSupportRef | undefined, fallback: Frame): Frame =>
  !s || s.kind === 'face' ? fallback : s.kind === 'plane' ? sketchPlaneFrame(s.plane, s.offset) : s.frame ?? refPlaneFrame(s.axis, s.offset);
// `points`: standalone points (User Pattern positions); `data`: the editable
// 2D sketch (geometry + constraints) so it can be reopened in Sketch & 2D;
// `body`: the body that was active when it was kept (absent = PartBody).
export type KeptSketch = {
  id: string; name: string; plane: SketchPlane; frame: Frame; loops: ProfileLoop[]; openPath: OpenPath | null;
  points?: [number, number][]; data?: SketchProjectData; body?: string; support?: SketchSupportRef;
};
// Whether a kept sketch holds what a tool takes from a sketch.
export const sketchFits = (k: KeptSketch, need: ToolSpec['sketch']): boolean =>
  need === 'open' ? !!k.openPath : need === 'circles' ? k.loops.some((l) => l.kind === 'circle') : need === 'points' ? !!k.points?.length : k.loops.length > 0;
export type FacePick = { point: number[]; type: string; normal?: number[] };
/** An edge (a chain of mesh edges ending at corners / branches) picked in the 3D view. `points` lie on the real B-rep edge and are what the server snaps to; `path` is the whole polyline, for drawing it again. */
export type EdgePick = { key: string; kind: 'line' | 'curve'; length: number; points: number[][]; path: number[][] };
export type OpContext = {
  loops: ProfileLoop[];            // current sketch's closed profiles (sketch-local)
  profileError?: string;
  openPath: OpenPath | null;       // current sketch's open chain
  points: [number, number][];      // current sketch's standalone points
  frame: Frame;                    // where the current sketch sits in 3D
  kept: KeptSketch[];
  faces: FacePick[];
  edges?: EdgePick[];
  refs?: RefLike[];                // reference elements (a Rib / Slot may sweep along a Reference Line)
};
export type FeatureOp = { op: string; depth: number; loops: ProfileLoop[]; axis?: string; angle?: number; extra: Record<string, unknown> };
export type ModifierOp = { op: string; extra: Record<string, unknown> };
export type Operation = { kind: 'feature'; feature: FeatureOp; advancesPlane?: number } | { kind: 'modifier'; modifier: ModifierOp };

const DIR_VEC: Record<string, Vec3> = {
  '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1],
  X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1],
};

export function num(form: Form, key: string, label: string, opts: { positive?: boolean; nonzero?: boolean; min?: number } = {}): number {
  const raw = String(form[key] ?? '').trim();
  const v = Number(raw);
  if (!raw || !Number.isFinite(v)) throw new Error(`${label} must be a number.`);
  if (opts.positive && !(v > 0)) throw new Error(`${label} must be greater than 0.`);
  if (opts.nonzero && v === 0) throw new Error(`${label} must not be 0.`);
  if (opts.min !== undefined && v < opts.min) throw new Error(`${label} must be at least ${opts.min}.`);
  return v;
}
function vec3(text: string, label: string): Vec3 {
  const parts = String(text).split(/[,\s]+/).filter(Boolean).map(Number);
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) throw new Error(`${label} must be three numbers, e.g. 0, 0, 0.`);
  return parts as Vec3;
}
const planeSpec = (form: Form, offsetKey = 'offset') => {
  const axis = REF_PLANE[(form.plane as RefPlaneAxis) ?? 'XY'].axis;
  const off = num(form, offsetKey, 'Offset');
  return { origin: clean(mul(axis, off)), normal: [...axis] };
};
const facePoints = (ctx: OpContext) => ctx.faces.map((f) => f.point);
const edgePoints = (ctx: OpContext) => (ctx.edges ?? []).flatMap((e) => e.points);
/** Explicit edges win; otherwise the faces whose edges are meant (if any). */
function edgeOrFaceRefs(ctx: OpContext, extra: Record<string, unknown>) {
  if (ctx.edges?.length) extra.edgePoints = edgePoints(ctx);
  else if (ctx.faces.length) extra.facePoints = facePoints(ctx);
}
function requireFaces(ctx: OpContext, what: string) {
  if (!ctx.faces.length) throw new Error(`Pick at least one face first: choose Select in the viewport and click the ${what}.`);
  return facePoints(ctx);
}
function requireProfile(ctx: OpContext) {
  if (!ctx.loops.length) throw new Error(ctx.profileError ?? 'Sketch a closed profile in Sketch & 2D first.');
  return ctx.loops;
}
const keptById = (ctx: OpContext, id: string) => ctx.kept.find((k) => k.id === id);

export function buildOperation(tool: string, form: Form, ctx: OpContext): Operation {
  switch (tool) {
    case 'Pad':
    case 'Pocket': {
      const loops = requireProfile(ctx);
      const upToLast = form.type === 'up_to_last';
      const length = upToLast ? 0 : num(form, 'length', tool === 'Pad' ? 'Length' : 'Depth', { positive: true });
      const extra: Record<string, unknown> = { limit: upToLast ? 'up_to_last' : 'dimension' };
      if (form.reverse) extra.reverse = true;
      if (form.mirrored && !upToLast) extra.mirrored = true;
      if (form.second && !form.mirrored) extra.depth2 = num(form, 'length2', 'Second limit length', { positive: true });
      if (form.thick) {
        extra.thin1 = num(form, 'thin1', 'Thickness 1', { min: 0 });
        extra.thin2 = num(form, 'thin2', 'Thickness 2', { min: 0 });
        if (!extra.thin1 && !extra.thin2) throw new Error('Thick needs Thickness 1 or Thickness 2 above 0.');
      }
      // Like the old XY stack: a plain pad raises the next sketch's plane to its top.
      const advances = tool === 'Pad' && !upToLast && !form.reverse && !form.mirrored ? length : undefined;
      return { kind: 'feature', feature: { op: tool === 'Pad' ? 'pad' : 'pocket', depth: length || 1, loops, extra }, advancesPlane: advances };
    }
    case 'Shaft':
    case 'Groove': {
      const loops = requireProfile(ctx);
      const a1 = num(form, 'angle1', 'First angle', { min: 0 });
      const a2 = num(form, 'angle2', 'Second angle', { min: 0 });
      if (a1 + a2 <= 0 || a1 + a2 > 360) throw new Error('First angle + second angle must be between 0° and 360°.');
      const extra: Record<string, unknown> = {};
      if (a2) extra.angle2 = a2;
      if (form.thick) { extra.thin1 = num(form, 'thin1', 'Thickness 1', { min: 0 }); extra.thin2 = num(form, 'thin2', 'Thickness 2', { min: 0 }); }
      return { kind: 'feature', feature: { op: tool === 'Shaft' ? 'revolve' : 'groove', depth: 0, loops, axis: String(form.axis || 'X'), angle: a1 || 360, extra } };
    }
    case 'Hole': {
      const circles = ctx.loops.filter((l) => l.kind === 'circle');
      if (!circles.length) throw new Error('Sketch at least one circle in Sketch & 2D — each circle is a hole position (and its default diameter).');
      const hole: Record<string, unknown> = { type: form.type || 'simple' };
      if (String(form.diameter ?? '').trim()) hole.diameter = num(form, 'diameter', 'Diameter', { positive: true });
      const blind = form.extension !== 'up_to_last';
      if (blind) {
        hole.depth = num(form, 'depth', 'Depth', { positive: true });
        hole.bottom = form.bottom || 'flat';
        if (form.bottom === 'v_bottom') hole.bottomAngle = num(form, 'bottomAngle', 'V-bottom angle', { positive: true });
      } else hole.depth = 1; // replaced by a through length in the backend
      if (form.type === 'counterbored') { hole.cbDiameter = num(form, 'cbDiameter', 'Counterbore diameter', { positive: true }); hole.cbDepth = num(form, 'cbDepth', 'Counterbore depth', { positive: true }); }
      if (form.type === 'countersunk') { hole.csDiameter = num(form, 'csDiameter', 'Countersink diameter', { positive: true }); hole.csAngle = num(form, 'csAngle', 'Countersink angle', { positive: true }); }
      if (form.threaded) {
        const d = String(form.designation ?? '').trim();
        if (!d) throw new Error('Enter a thread designation such as M10.');
        hole.thread = { designation: d };
      }
      return { kind: 'feature', feature: { op: 'hole', depth: 0, loops: circles, extra: { hole, limit: blind ? 'dimension' : 'up_to_last' } } };
    }
    case 'Rib':
    case 'Slot': {
      const loops = requireProfile(ctx);
      let path: { start: number[]; segments: Record<string, unknown>[] };
      if (form.centerType === 'refline') {
        const r = (ctx.refs ?? []).find((x) => x.id === String(form.centerRef ?? '') && x.kind === 'line');
        if (!r?.a || !r.b) throw new Error('Choose the center curve: a Reference Line (made with the Reference Line tool, between points on any planes).');
        if (Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]) < 1e-6) throw new Error(`${r.name} has no length to sweep along.`);
        path = { start: [...r.a], segments: [{ kind: 'line', end: [...r.b] }] };
      } else {
        const center = keptById(ctx, String(form.center ?? ''));
        if (!center) throw new Error('Choose the center curve: a kept sketch (sketches are kept automatically when you leave Sketch & 2D) holding an open chain of lines/arcs, or switch to a Reference Line.');
        if (!center.openPath) throw new Error(`${center.name} has no open chain of lines/arcs to use as a center curve.`);
        path = pathTo3D(center.openPath, center.frame);
      }
      const extra: Record<string, unknown> = { path, profileControl: 'keep_angle', transition: form.transition === 'right' ? 'right' : 'round' };
      if (form.control === 'frenet') extra.profileControl = 'frenet';
      else if (form.control === 'pulling') { extra.profileControl = 'pulling_direction'; extra.pullingDirection = [...(DIR_VEC[String(form.pdir ?? '+Z')] ?? DIR_VEC['+Z'])]; }
      else if (form.control === 'refsurface') {
        // A plane's normal never changes, so "keep the angle to the surface" is a fixed direction for the profile.
        const key = String(form.refSurface ?? 'XY');
        const rp = (ctx.refs ?? []).find((x) => x.id === key && x.kind === 'plane');
        const axisKey = (rp ? rp.axis : key) as RefPlaneAxis;
        if (!REF_PLANE[axisKey]) throw new Error('Choose the reference surface: one of the three planes or a Reference Plane.');
        extra.profileControl = 'reference_surface';
        extra.pullingDirection = rp?.frame ? [...rp.frame.normal] : [...REF_PLANE[axisKey].axis];
      }
      if (form.moveProfile) extra.moveProfile = true;
      if (form.thick) {
        const t1 = num(form, 'thin1', form.neutral ? 'Thickness' : 'Thickness 1', { min: 0 });
        if (form.neutral) { if (!(t1 > 0)) throw new Error('Thickness must be greater than 0.'); extra.thin1 = t1 / 2; extra.thin2 = t1 / 2; }
        else {
          const t2 = num(form, 'thin2', 'Thickness 2', { min: 0 });
          if (!t1 && !t2) throw new Error('Thick profile needs Thickness 1 or Thickness 2 above 0.');
          extra.thin1 = t1; extra.thin2 = t2;
        }
      }
      return { kind: 'feature', feature: { op: tool === 'Rib' ? 'rib' : 'slot', depth: 0, loops, extra } };
    }
    case 'Stiffener': {
      if (!ctx.openPath) throw new Error('Sketch an open profile (a line or chain of lines/arcs, not closed) in Sketch & 2D for the stiffener.');
      const extra: Record<string, unknown> = { openPath: ctx.openPath, thickness: num(form, 'thickness', 'Thickness', { positive: true }), mirrored: !!form.mirrored };
      if (!form.mirrored && form.reverse) extra.reverse = true;
      return { kind: 'feature', feature: { op: 'stiffener', depth: 0, loops: [], extra } };
    }
    case 'Multi-sections Solid':
    case 'Removed Multi-sections Solid': {
      const ids = String(form.sections ?? '').split(',').filter(Boolean);
      const secs = ids.map((id) => keptById(ctx, id)).filter((k): k is KeptSketch => !!k);
      if (secs.length < 2) throw new Error('Choose at least two kept sketches as sections (draw each one in Sketch & 2D and exit the workbench; it is kept automatically).');
      for (const s of secs) if (s.loops.length !== 1) throw new Error(`${s.name} must hold exactly one closed profile to be a section (it has ${s.loops.length}).`);
      return { kind: 'feature', feature: { op: tool === 'Multi-sections Solid' ? 'loft' : 'removed_loft', depth: 0, loops: [], extra: { sections: secs.map((s) => ({ loops: s.loops, plane: s.frame })), ruled: !!form.ruled } } };
    }
    case 'Edge Fillet': {
      const extra: Record<string, unknown> = { radius: num(form, 'radius', 'Radius', { positive: true }), edgeFilter: form.edges || 'all' };
      edgeOrFaceRefs(ctx, extra);
      return { kind: 'modifier', modifier: { op: 'fillet', extra } };
    }
    case 'Variable Fillet': {
      const extra: Record<string, unknown> = { radius: num(form, 'radius', 'Radius 1', { positive: true }), radius2: num(form, 'radius2', 'Radius 2', { positive: true }) };
      if (!ctx.edges?.length && !ctx.faces.length) throw new Error('Pick at least one edge (or face) first: click edges of the part in the 3D view.');
      edgeOrFaceRefs(ctx, extra);
      return { kind: 'modifier', modifier: { op: 'variable_fillet', extra } };
    }
    case 'Chamfer': {
      let length = num(form, 'length', form.mode === 'equal' ? 'Distance' : 'Length 1', { positive: true });
      const extra: Record<string, unknown> = { edgeFilter: form.edges || 'all' };
      if (form.mode === 'angle') {
        const a = num(form, 'angle', 'Angle');
        if (!(a > 0 && a < 90)) throw new Error('Chamfer angle must be between 0° and 90° (45° is an equal-distance chamfer).');
        // Reverse measures from the other face: the same bevel is length L·tan(a) at 90° − a.
        if (form.reverse) { length *= Math.tan((a * Math.PI) / 180); extra.chamferAngle = 90 - a; } else extra.chamferAngle = a;
      } else if (form.mode === 'lengths') extra.length2 = num(form, 'length2', 'Length 2', { positive: true });
      extra.radius = length;
      edgeOrFaceRefs(ctx, extra);
      return { kind: 'modifier', modifier: { op: 'chamfer', extra } };
    }
    case 'Draft': {
      const extra: Record<string, unknown> = { draftAngle: num(form, 'angle', 'Draft angle', { nonzero: true }), pullDirection: DIR_VEC[String(form.pull || '+Z')] };
      if (form.neutral && form.neutral !== 'auto') extra.neutralPlane = planeSpec({ plane: form.neutral, offset: form.neutralOffset ?? '0' });
      if (ctx.faces.length) extra.facePoints = facePoints(ctx); else extra.faceSelector = 'side';
      return { kind: 'modifier', modifier: { op: 'draft', extra } };
    }
    case 'Shell': {
      const extra: Record<string, unknown> = { thickness: num(form, 'thickness', 'Inside thickness', { min: 0 }) };
      const out = num(form, 'outside', 'Outside thickness', { min: 0 });
      if (out) extra.thicknessOutside = out;
      if (!extra.thickness && !out) throw new Error('Shell needs an inside or outside thickness above 0.');
      if (ctx.faces.length) extra.facePoints = facePoints(ctx);
      return { kind: 'modifier', modifier: { op: 'shell', extra } };
    }
    case 'Thickness':
      return { kind: 'modifier', modifier: { op: 'thickness', extra: { thickness: num(form, 'thickness', 'Thickness', { nonzero: true }), facePoints: requireFaces(ctx, 'faces to thicken') } } };
    case 'Thread/Tap': {
      const d = String(form.designation ?? '').trim();
      if (!d) throw new Error('Enter a thread designation such as M10.');
      const extra: Record<string, unknown> = { designation: d, threadType: form.threadType || 'thread', facePoints: requireFaces(ctx, 'cylindrical face') };
      if (String(form.depth ?? '').trim()) extra.threadDepth = num(form, 'depth', 'Depth', { positive: true });
      return { kind: 'modifier', modifier: { op: 'thread', extra } };
    }
    case 'Remove Face':
      return { kind: 'modifier', modifier: { op: 'remove_face', extra: { facePoints: requireFaces(ctx, 'faces to remove') } } };
    case 'Split':
      return { kind: 'modifier', modifier: { op: 'split_body', extra: { planeSpec: planeSpec(form), keep: form.keep === '-' ? '-' : '+' } } };
    case 'Translation':
      return { kind: 'modifier', modifier: { op: 'translate_body', extra: { vector: mul(DIR_VEC[String(form.dir || 'X')], num(form, 'distance', 'Distance', { nonzero: true })) } } };
    case 'Rotation':
      return { kind: 'modifier', modifier: { op: 'rotate_body', extra: { axisOrigin: vec3(String(form.origin), 'Axis point'), axisDirection: DIR_VEC[String(form.axis || 'Z')], angle: num(form, 'angle', 'Angle', { nonzero: true }) } } };
    case 'Symmetry':
      return { kind: 'modifier', modifier: { op: 'symmetry_body', extra: { planeSpec: planeSpec(form) } } };
    case 'Mirror':
      return { kind: 'modifier', modifier: { op: 'mirror_body', extra: { plane: form.plane || 'YZ' } } };
    case 'Rectangular Pattern': {
      const count = Math.round(num(form, 'count', 'Instances', { min: 2 }));
      const extra: Record<string, unknown> = { axis: form.dir1 || 'X', count, spacing: num(form, 'spacing', 'Spacing', { positive: true }) };
      if (form.second) {
        if (form.dir2 === form.dir1) throw new Error('The second direction must differ from the first.');
        Object.assign(extra, { axis2: form.dir2 || 'Y', count2: Math.round(num(form, 'count2', 'Instances (second direction)', { min: 2 })), spacing2: num(form, 'spacing2', 'Spacing (second direction)', { positive: true }) });
      }
      return { kind: 'modifier', modifier: { op: 'linear_pattern_body', extra } };
    }
    case 'Circular Pattern': {
      const count = Math.round(num(form, 'count', 'Instances', { min: 2 }));
      // The backend spaces instances by angle / count.
      const angle = form.mode === 'spacing' ? num(form, 'spacing', 'Angular spacing', { positive: true }) * count : 360;
      return { kind: 'modifier', modifier: { op: 'circular_pattern_body', extra: { count, angle, axisOrigin: vec3(String(form.origin), 'Axis point'), axisDirection: DIR_VEC[String(form.axis || 'Z')] } } };
    }
    case 'User Pattern': {
      let offsets: Vec3[];
      if (form.source === 'typed') {
        offsets = String(form.offsets ?? '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => vec3(s, 'Each offset'));
      } else {
        offsets = ctx.points.map((p) => vecToWorld(ctx.frame, p));
        if (!offsets.length) throw new Error('Place standalone points in the current sketch (Point tool) — each one is an instance, measured from the sketch origin.');
      }
      if (!offsets.length) throw new Error('Enter at least one offset.');
      return { kind: 'modifier', modifier: { op: 'user_pattern_body', extra: { offsets } } };
    }
    case 'Scaling': {
      const ratio = num(form, 'ratio', 'Ratio', { positive: true });
      const center = vec3(String(form.center), 'Reference point');
      if (form.mode === 'axis') {
        const v: Vec3 = [1, 1, 1];
        v['XYZ'.indexOf(String(form.axis || 'X'))] = ratio;
        return { kind: 'modifier', modifier: { op: 'scale_body', extra: { factor: ratio, scaleCenter: center, scaleVector: v } } };
      }
      return { kind: 'modifier', modifier: { op: 'scale_body', extra: { factor: ratio, scaleCenter: center } } };
    }
    default:
      throw new Error(`${tool} is not an operation that builds geometry.`);
  }
}

// ---------------------------------------------------------------------------
// Feature ↔ sketch link: a feature records the kept sketch it was built
// from (`sketchId`); a Rib/Slot center curve and Multi-sections sections
// are kept-sketch ids in its definition box.
// ---------------------------------------------------------------------------
export type LinkedFeature = {
  op: string; depth: number; loops: ProfileLoop[]; axis?: string; angle?: number; extra?: Record<string, unknown>;
  plane?: Frame; tool?: string; form?: Form; sketchId?: string;
  source?: { loops: ProfileLoop[]; openPath: OpenPath | null; points: [number, number][] };
};
export function featureSketchIds(f: { sketchId?: string; form?: Form }): string[] {
  const ids = f.sketchId ? [f.sketchId] : [];
  if (f.form?.center && f.form.centerType !== 'refline') ids.push(String(f.form.center));
  if (f.form?.sections) ids.push(...String(f.form.sections).split(',').filter(Boolean));
  return ids;
}
// Re-derive a feature from the current state of the sketches it depends on
// (their geometry and their plane). Throws what buildOperation throws when
// the sketch no longer holds what the tool needs. Features with no stored
// definition box, or whose own sketch was deleted, are returned unchanged.
export function relinkFeature<T extends LinkedFeature>(f: T, kept: KeptSketch[], refs: RefLike[] = []): T {
  if (!f.tool || !f.form || !featureSketchIds(f).length) return f;
  const own = f.sketchId ? kept.find((k) => k.id === f.sketchId) : undefined;
  if (f.sketchId && !own) return f;
  const sk = own ? { loops: own.loops, openPath: own.openPath, points: own.points ?? [] } : f.source ?? { loops: f.loops, openPath: null, points: [] };
  const frame = own ? own.frame : f.plane;
  if (!frame) return f;
  const built = buildOperation(f.tool, f.form, { ...sk, frame, kept, faces: [], refs });
  if (built.kind !== 'feature') return f;
  const { op, depth, loops, axis, angle, extra } = built.feature;
  return { ...f, op, depth, loops, axis, angle, extra, plane: own ? { ...own.frame } : f.plane, source: sk };
}

// ---------------------------------------------------------------------------
// Several bodies in one viewport mesh: concatenate binary STLs (header +
// triangle count + 50-byte triangles). ASCII STLs are joined as text.
// ---------------------------------------------------------------------------
export function mergeStl(parts: ArrayBuffer[]): ArrayBuffer {
  if (parts.length === 1) return parts[0];
  const isBinary = (b: ArrayBuffer) => b.byteLength >= 84 && 84 + 50 * new DataView(b).getUint32(80, true) === b.byteLength;
  if (!parts.every(isBinary)) {
    const text = parts.map((b) => new TextDecoder().decode(b)).join('\n');
    return new TextEncoder().encode(text).buffer as ArrayBuffer;
  }
  const count = parts.reduce((n, b) => n + new DataView(b).getUint32(80, true), 0);
  const out = new Uint8Array(84 + 50 * count);
  new DataView(out.buffer).setUint32(80, count, true);
  let at = 84;
  for (const b of parts) { out.set(new Uint8Array(b, 84), at); at += b.byteLength - 84; }
  return out.buffer;
}

// ---------------------------------------------------------------------------
// Reference Point / Reference Line: pure geometry, no backend. A Reference
// Plane/Axis/Coordinate System stores {axis, offset}; a point stores its
// position in `a`, a line its two ends in `a` and `b`, and `note` says how
// it was defined (shown in the model tree).
// ---------------------------------------------------------------------------
export type RefLike = {
  id: string; name: string; kind: 'plane' | 'axis' | 'csys' | 'point' | 'line'; axis: string; offset: number;
  a?: Vec3; b?: Vec3; note?: string;
  /** A plane that is not parallel to X/Y/Z: where it sits and how a sketch on it is oriented (axis/offset then only name the nearest primary plane). */
  frame?: Frame;
};
const r2 = (n: number) => String(Math.round(n * 100) / 100);
export const refLabel = (r: RefLike): string =>
  r.kind === 'point' && r.a ? `${r.name} (${r.a.map(r2).join(', ')})`
  : r.kind === 'line' && r.a && r.b ? `${r.name} (${r2(Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]))} mm)`
  : r.frame ? `${r.name} (custom plane)`
  : `${r.name} (${r.axis}, ${r.offset} mm)`;

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: number[], b: number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: number[]): Vec3 | null => { const l = Math.hypot(a[0], a[1], a[2]); return l < 1e-12 ? null : [a[0] / l, a[1] / l, a[2] / l]; };
const round6 = (v: number[]): Vec3 => v.map((c) => Math.round(c * 1e6) / 1e6) as Vec3;

/** The infinite line a Reference Axis or Reference Line lies on (the primary axes X, Y, Z pass through the origin). */
export function refLineOf(r: RefLike): { p: Vec3; d: Vec3 } | null {
  if (r.kind === 'line' && r.a && r.b) { const d = norm(sub(r.b, r.a)); return d ? { p: r.a, d } : null; }
  if (r.kind === 'axis') {
    const d: Vec3 = r.axis === 'Y' ? [0, 1, 0] : r.axis === 'Z' ? [0, 0, 1] : [1, 0, 0];
    return { p: r.axis === 'Z' ? [r.offset, 0, 0] : [0, 0, r.offset], d };
  }
  return null;
}
const PLANE_NORMAL: Record<string, Vec3> = { XY: [0, 0, 1], XZ: [0, 1, 0], YZ: [1, 0, 0] };

function parseXYZ(text: unknown, what: string): Vec3 {
  const parts = String(text ?? '').split(/[\s,;]+/).filter(Boolean).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) throw new Error(`${what} must be three numbers: x, y, z.`);
  return [parts[0], parts[1], parts[2]];
}
const numOf = (v: unknown, what: string): number => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${what} must be a number.`); return n; };

/** A kept sketch's outlines as world-space polylines: each closed profile, then the open chain. */
export function sketchCurves(k: KeptSketch): Vec3[][] {
  const out: Vec3[][] = k.loops.map((l) => loopOutline(l).map((p) => toWorld(k.frame, p)));
  if (k.openPath) out.push(loopOutline({ kind: 'path', ...k.openPath }).map((p) => toWorld(k.frame, p)));
  return out;
}
function pickCurve(kept: KeptSketch[], form: Form): { poly: Vec3[]; sketch: KeptSketch; closedProfile: boolean; loop?: ProfileLoop } {
  const k = kept.find((x) => x.id === form.sketch);
  if (!k) throw new Error('Choose the kept sketch that holds the curve.');
  const curves = sketchCurves(k);
  const i = Math.round(numOf(form.curve, 'The outline number')) - 1;
  if (i < 0 || i >= curves.length) throw new Error(curves.length ? `${k.name} has ${curves.length} outline${curves.length === 1 ? '' : 's'} — choose a number from 1 to ${curves.length}.` : `${k.name} has no curve (it holds no closed profile or open chain).`);
  return { poly: curves[i], sketch: k, closedProfile: i < k.loops.length, loop: k.loops[i] };
}
/** The point at `ratio` (0..1) of a polyline's length, with the direction of travel there. */
function alongPolyline(poly: Vec3[], ratio: number): { p: Vec3; t: Vec3 } {
  const seg: number[] = []; let total = 0;
  for (let i = 0; i + 1 < poly.length; i++) { const l = Math.hypot(...sub(poly[i + 1], poly[i])); seg.push(l); total += l; }
  if (total < 1e-9) throw new Error('That curve has no length.');
  const want = Math.min(1, Math.max(0, ratio)) * total;
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] < 1e-12) continue;
    if (acc + seg[i] >= want - 1e-9 || i === seg.length - 1) {
      const t = norm(sub(poly[i + 1], poly[i])) as Vec3;
      return { p: add(poly[i], mul(t, Math.min(seg[i], want - acc))), t };
    }
    acc += seg[i];
  }
  throw new Error('That curve has no length.');
}
function polygonCentroid(poly: Vec3[]): Vec3 {
  // Average of the outline, weighted by segment length — the centre of the curve itself, exact for circles and symmetric shapes.
  let tot = 0; let c: Vec3 = [0, 0, 0];
  for (let i = 0; i + 1 < poly.length; i++) { const l = Math.hypot(...sub(poly[i + 1], poly[i])); const m = mul(add(poly[i], poly[i + 1]), 0.5); c = add(c, mul(m, l)); tot += l; }
  return tot ? mul(c, 1 / tot) : poly[0];
}


// ---------------------------------------------------------------------------
// General planes (anything not parallel to X, Y or Z) and the CATIA plane
// types that make them.
// ---------------------------------------------------------------------------
const cross3 = (a: number[], b: number[]): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const AXIS_OF: Record<RefPlaneAxis, Vec3> = { XY: [0, 0, 1], XZ: [0, 1, 0], YZ: [1, 0, 0] };
/** The primary plane (XY, XZ, YZ) whose normal is closest to `n`. */
export function nearestPrimary(n: number[]): RefPlaneAxis {
  const a = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
  return a[2] >= a[0] && a[2] >= a[1] ? 'XY' : a[1] >= a[0] ? 'XZ' : 'YZ';
}
/** A sketch frame for a plane at `origin` with normal `n`: planes parallel to a primary plane keep that plane's own H / V directions; others take `xHint` projected into the plane, else the horizontal direction in it. */
export function planeFrame(origin: number[], n0: number[], xHint?: number[] | null): Frame {
  const n = norm(n0);
  if (!n) throw new Error('That does not define a plane — its normal is zero.');
  const ax = nearestPrimary(n);
  if (Math.abs(Math.abs(dot(n, AXIS_OF[ax])) - 1) < 1e-9) {
    const b = PLANE_BASIS[REF_PLANE[ax].sketch];
    return { origin: round6(origin), xDir: [...b.x], normal: round6(n) };
  }
  const proj = (v: number[]) => norm(sub(v, mul(n, dot(v, n))));
  const x = (xHint ? proj(xHint) : null) ?? proj([0, 0, 1]) ?? proj([1, 0, 0]);
  if (!x) throw new Error('That does not define a plane.');
  return { origin: round6(origin), xDir: round6(x), normal: round6(n) };
}
/** What a Reference Plane entry stores for a frame: a plane parallel to X / Y / Z is just its axis and offset (it works everywhere the primary planes do); any other keeps its frame. */
export function planeEntry(frame: Frame): { axis: RefPlaneAxis; offset: number; frame?: Frame } {
  const ax = nearestPrimary(frame.normal);
  const offset = Math.round(dot(frame.origin, AXIS_OF[ax]) * 1e4) / 1e4;
  const aligned = Math.abs(Math.abs(dot(norm(frame.normal) ?? [0, 0, 1], AXIS_OF[ax])) - 1) < 1e-9;
  return aligned ? { axis: ax, offset } : { axis: ax, offset, frame };
}
/** Where a Reference Plane is, whichever way it was defined. */
export const refPlaneFrameOf = (r: { axis: string; offset: number; frame?: Frame }): Frame =>
  r.frame ?? refPlaneFrame((REF_PLANE[r.axis as RefPlaneAxis] ? r.axis : 'XY') as RefPlaneAxis, r.offset);
export const refPlaneLabel = (r: { name: string; axis: string; offset: number; frame?: Frame }): string =>
  (r.frame ? `${r.name} (custom plane)` : `${r.name} (${r.axis}, ${r.offset} mm)`);
/** The planes an Offset from plane action makes when the source is a custom plane: `count` frames, `distance` apart along its normal. */
export function offsetCustomPlanes(src: PlaneSource, distance: number, flip: boolean, count: number): Frame[] {
  const f = src.frame as Frame; const n = norm(f.normal) as Vec3;
  return Array.from({ length: count }, (_, i) => ({ origin: round6(add(f.origin, mul(n, (flip ? -1 : 1) * distance * (i + 1)))), xDir: [...f.xDir], normal: [...f.normal] }));
}

const rotateAbout = (v: number[], axis: number[], deg: number): Vec3 => {
  const k = norm(axis) as Vec3; const t = (deg * Math.PI) / 180; const c = Math.cos(t); const s = Math.sin(t);
  const kv = cross3(k, v); const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
};
/** The eigenvector of the smallest eigenvalue of a symmetric 3×3 matrix (Jacobi rotations), and the eigenvalues in ascending order. */
function smallestEigen(m: number[][]): { vec: Vec3; values: number[] } {
  const a = m.map((r) => [...r]); const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    if (a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2 < 1e-24) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1); const sn = t * c;
      for (let k = 0; k < 3; k++) { const x = a[k][p]; const y = a[k][q]; a[k][p] = c * x - sn * y; a[k][q] = sn * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k]; const y = a[q][k]; a[p][k] = c * x - sn * y; a[q][k] = sn * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = v[k][p]; const y = v[k][q]; v[k][p] = c * x - sn * y; v[k][q] = sn * x + c * y; }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  return { vec: [v[0][idx[0]], v[1][idx[0]], v[2][idx[0]]], values: idx.map((i) => a[i][i]) };
}

/** Where a point comes from: a Reference Point picked from the list, or typed / clicked coordinates. */
function pointFrom(refs: RefLike[], sel: unknown, xyz: unknown, what: string): Vec3 {
  if (!sel || sel === 'coords') return parseXYZ(xyz, what);
  const r = refs.find((x) => x.id === sel && x.kind === 'point');
  if (!r?.a) throw new Error(`${what}: the chosen reference point no longer exists.`);
  return r.a;
}
/** A reference line or axis (X, Y, Z through the origin, a Reference Axis or a Reference Line) as a point and a direction. */
function lineFrom(refs: RefLike[], sel: unknown, what: string, basePlane?: { frame: Frame; name: string }): { p: Vec3; d: Vec3; name: string } {
  const key = String(sel || '');
  // The reference plane's own axes through its origin — so the new plane is built where the picked plane is, not at the world origin.
  if (basePlane && (key === 'PLANE_H' || key === 'PLANE_V')) {
    const f = basePlane.frame;
    return { p: f.origin as Vec3, d: (key === 'PLANE_H' ? f.xDir : cross3(f.normal, f.xDir)) as Vec3, name: `${basePlane.name} ${key === 'PLANE_H' ? 'horizontal' : 'vertical'} axis` };
  }
  if (key === 'PLANE_H' || key === 'PLANE_V') return { p: [0, 0, 0], d: key === 'PLANE_H' ? [1, 0, 0] : [0, 1, 0], name: key === 'PLANE_H' ? 'X axis' : 'Y axis' };
  if (['X', 'Y', 'Z'].includes(key)) return { p: [0, 0, 0], d: key === 'X' ? [1, 0, 0] : key === 'Y' ? [0, 1, 0] : [0, 0, 1], name: `${key} axis` };
  const r = refs.find((x) => x.id === key);
  const l = r ? refLineOf(r) : null;
  if (!r || !l) throw new Error(`${what}: choose a line or an axis.`);
  return { p: l.p, d: l.d, name: r.name };
}
/** One of the three planes or a Reference Plane, as a frame. */
function planeFromChoice(refs: RefLike[], sel: unknown, what: string): { frame: Frame; name: string } {
  const key = String(sel || 'XY');
  if (key === 'XY' || key === 'XZ' || key === 'YZ') return { frame: refPlaneFrame(key, 0), name: PRIMARY_LABEL[key] };
  const r = refs.find((x) => x.id === key && x.kind === 'plane');
  if (!r) throw new Error(`${what}: choose a plane.`);
  return { frame: refPlaneFrameOf(r), name: r.name };
}

/** Reference Plane · every type but the offset (that one is made from the plane or face clicked in the view). */
export function buildReferencePlane(form: Form, ctx: RefContext): { frame: Frame; note: string } {
  const type = String(form.ptype || 'offset');
  const pt = (k: string, what: string) => pointFrom(ctx.refs, form[k], form[`${k}XYZ`], what);
  switch (type) {
    case 'parallel_point': {
      const base = planeFromChoice(ctx.refs, form.basePlane, 'The reference plane');
      const p = pt('pt', 'The point');
      return { frame: planeFrame(p, base.frame.normal, base.frame.xDir), note: `parallel to ${base.name}, through a point` };
    }
    case 'angle_normal': {
      const base = planeFromChoice(ctx.refs, form.basePlane, 'The reference plane');
      const axis = lineFrom(ctx.refs, form.axisLine, 'The rotation axis', base);
      const n = norm(base.frame.normal) as Vec3;
      if (Math.abs(dot(norm(axis.d) as Vec3, n)) > 1e-6) throw new Error('The rotation axis must lie in the reference plane or be parallel to it.');
      const angle = form.normalTo ? 90 : numOf(form.angle, 'The angle');
      return { frame: planeFrame(axis.p, rotateAbout(n, axis.d, angle), axis.d), note: `${form.normalTo ? 'normal to' : `${r2(angle)}° to`} ${base.name}, about ${axis.name}` };
    }
    case 'three_points': {
      const a = pt('p1', 'The first point'); const b = pt('p2', 'The second point'); const c = pt('p3', 'The third point');
      const n = cross3(sub(b, a), sub(c, a));
      if (!norm(n)) throw new Error('The three points are in a line (or two are the same), so they do not define a plane.');
      return { frame: planeFrame(a, n, sub(b, a)), note: 'through three points' };
    }
    case 'two_lines': {
      const l1 = lineFrom(ctx.refs, form.line1, 'The first line'); const l2 = lineFrom(ctx.refs, form.line2, 'The second line');
      const v = sub(l2.p, l1.p); const c = cross3(l1.d, l2.d);
      let n: Vec3 | null;
      if (norm(c) && Math.hypot(...c) > 1e-9) {
        if (Math.abs(dot(v, c)) / Math.hypot(...c) > 1e-6) throw new Error('The two lines do not meet and are not parallel, so no plane contains both.');
        n = norm(c);
      } else n = norm(cross3(l1.d, v));
      if (!n) throw new Error('The two lines are the same line — a plane needs a second direction.');
      return { frame: planeFrame(l1.p, n, l1.d), note: `through ${l1.name} and ${l2.name}` };
    }
    case 'point_line': {
      const p = pt('pt', 'The point'); const l = lineFrom(ctx.refs, form.line1, 'The line');
      const n = norm(cross3(l.d, sub(p, l.p)));
      if (!n) throw new Error('The point lies on the line, so they do not define a plane.');
      return { frame: planeFrame(p, n, l.d), note: `through a point and ${l.name}` };
    }
    case 'planar_curve': {
      const k = ctx.kept.find((x) => x.id === form.sketch);
      if (!k) throw new Error('Choose the kept sketch whose plane the new plane should lie in.');
      if (!k.loops.length && !k.openPath) throw new Error(`${k.name} holds no curve.`);
      return { frame: planeFrame(k.frame.origin, k.frame.normal, k.frame.xDir), note: `through the curves of ${k.name}` };
    }
    case 'normal_curve': {
      const { poly, sketch } = pickCurve(ctx.kept, form);
      const ratio = numOf(form.ratio, 'The position');
      if (ratio < 0 || ratio > 1) throw new Error('The position along the curve must be between 0 and 1.');
      const { p, t } = alongPolyline(poly, ratio);
      return { frame: planeFrame(p, t, sketch.frame.normal), note: `normal to a curve of ${sketch.name}, at ${r2(ratio)}` };
    }
    case 'tangent_surface': {
      if (!ctx.surface) throw new Error('Click a surface of the part in the 3D view first.');
      const n = norm(ctx.surface.normal ?? []);
      if (!n) throw new Error('That surface point has no normal — click the part again.');
      return { frame: planeFrame(ctx.surface.point, n), note: 'tangent to a surface' };
    }
    case 'equation': {
      const A = numOf(form.eqA, 'A'); const B = numOf(form.eqB, 'B'); const C = numOf(form.eqC, 'C'); const D = numOf(form.eqD, 'D');
      const n2 = A * A + B * B + C * C;
      if (n2 < 1e-18) throw new Error('A, B and C cannot all be 0.');
      return { frame: planeFrame(mul([A, B, C], D / n2), [A, B, C]), note: `${r2(A)}x + ${r2(B)}y + ${r2(C)}z = ${r2(D)}` };
    }
    case 'mean_points': {
      const pts: Vec3[] = [];
      for (const id of String(form.meanRefs ?? '').split(',').filter(Boolean)) {
        const r = ctx.refs.find((x) => x.id === id && x.kind === 'point');
        if (r?.a) pts.push(r.a);
      }
      for (const chunk of String(form.meanXYZ ?? '').split(/[;\n]+/).map((t) => t.trim()).filter(Boolean)) pts.push(parseXYZ(chunk, `The point “${chunk}”`));
      if (pts.length < 3) throw new Error('Mean plane: give at least three points (tick Reference Points and / or type x, y, z; x, y, z; …).');
      const cen = mul(pts.reduce((s, q) => add(s, q), [0, 0, 0] as Vec3), 1 / pts.length);
      const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const q of pts) { const d = sub(q, cen); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]; }
      const { vec, values } = smallestEigen(cov);
      if (values[2] < 1e-12 || values[1] < 1e-9 * values[2]) throw new Error('The points lie on a line (or all coincide), so they do not define a plane.');
      return { frame: planeFrame(cen, vec), note: `mean plane through ${pts.length} points` };
    }
    default:
      throw new Error('Offset planes are made from the plane or face you click in the 3D view.');
  }
}

/** One line saying what to do for the chosen Plane / Line / Point type — shown under the type in the definition box. */
export function refTypeHint(tool: string, form: Form): string | null {
  const PLANE: Record<string, string> = {
    offset: 'Click a plane, a Reference Plane or a planar face in the 3D view, then set the distance.',
    parallel_point: 'Click the plane to stay parallel to in the 3D view or the model tree (or pick it below), then the point it passes through (a Reference Point, typed, or clicked in the view).',
    angle_normal: 'Click the reference plane in the 3D view or the model tree (or pick it below). The rotation axis is that plane’s own horizontal axis unless you choose another axis or Reference Line lying in it. Then set the angle — or tick Normal to plane for 90°.',
    three_points: 'Give three points that are not in a line: pick Reference Points, type them, or click points in the view (the picks fill First, Second, Third in turn).',
    two_lines: 'Choose two lines that meet or are parallel (the X, Y, Z axes, Reference Axes or Reference Lines).',
    point_line: 'Choose a line and a point that is not on it.',
    planar_curve: 'Choose a kept sketch: the plane gets that sketch’s plane.',
    normal_curve: 'Choose a kept sketch, the curve in it and a position along it: the plane is perpendicular to the curve there.',
    tangent_surface: 'Click the part in the 3D view: the plane lies flat against the surface at that point.',
    equation: 'Type the plane as A·x + B·y + C·z = D (A, B, C is its normal direction).',
    mean_points: 'Tick Reference Points and/or type three or more points: the plane that fits them best is made.',
  };
  const POINT: Record<string, string> = {
    coordinates: 'Type X, Y, Z — or click the origin, a sketch corner, a centre or an end point in the 3D view.',
    on_curve: 'Choose a kept sketch, the curve in it and a position along it.',
    on_plane: 'Choose a plane, then H and V: the distances along the plane’s own horizontal and vertical axes from its origin.',
    on_surface: 'Click the part in the 3D view where the point should go.',
    center: 'Choose a kept sketch and a circle or other curve: the point goes at its center.',
    tangent_curve: 'Choose a kept sketch, a curve in it and a direction: the point is where the curve runs along that direction.',
    between: 'Give two points (Reference Points, typed or clicked) and a ratio: 0.5 is the middle.',
    plane_intersection: 'Choose a line or axis and a plane: the point is where they meet.',
  };
  const LINE: Record<string, string> = {
    point_point: 'Click, pick or type the two end points — the picks fill Start, then End, with a dashed preview.',
    point_direction: 'Give a point and a direction, then the length.',
    angle_curve: 'Choose a kept sketch, a curve and a point on it: the line leaves that point at the angle you set to the curve’s tangent (90° is normal to the curve).',
    tangent: 'Choose a kept sketch, a curve and a point on it: the line runs along the curve’s tangent there.',
    normal_surface: 'Click the part in the 3D view: the line starts there and runs along the surface normal.',
    bisecting: 'Choose two lines that meet: the line runs through where they meet, halfway between them.',
  };
  if (tool === 'Reference Plane') return PLANE[String(form.ptype ?? 'offset')] ?? null;
  if (tool === 'Reference Point') return POINT[String(form.method ?? 'coordinates')] ?? null;
  if (tool === 'Reference Line') return LINE[String(form.method ?? 'point_point')] ?? null;
  return null;
}

/** The 3D points a Reference Plane / Line / Point type takes by clicking in the view, in order ('xyz' = the X, Y, Z boxes). */
export type SnapSlot = 'xyz' | { sel: string; xyz: string };
export function snapSlots(tool: string, form: Form): SnapSlot[] {
  const pair = (k: string): SnapSlot => ({ sel: k, xyz: `${k}XYZ` });
  if (tool === 'Reference Line') {
    const m = String(form.method ?? 'point_point');
    return m === 'point_point' ? [pair('start'), pair('end')] : m === 'point_direction' ? [pair('start')] : [];
  }
  if (tool === 'Reference Point') {
    const m = String(form.method ?? 'coordinates');
    return m === 'coordinates' ? ['xyz'] : m === 'between' ? [pair('start'), pair('end')] : [];
  }
  if (tool === 'Reference Plane') {
    const t = String(form.ptype ?? 'offset');
    return t === 'parallel_point' || t === 'point_line' ? [pair('pt')] : t === 'three_points' ? [pair('p1'), pair('p2'), pair('p3')] : [];
  }
  return [];
}

export type RefContext = { kept: KeptSketch[]; refs: RefLike[]; surface?: { point: number[]; normal?: number[] } | null };
/** Turns a Reference Point / Reference Line dialog into its geometry. Throws a readable Error when the inputs don't define one. */
export function buildReferenceElement(tool: string, form: Form, ctx: RefContext): { a: Vec3; b?: Vec3; note: string } {
  const pointOf = (sel: unknown, xyz: unknown, what: string): Vec3 => pointFrom(ctx.refs, sel, xyz, what);
  if (tool === 'Reference Point') {
    const method = String(form.method || 'coordinates');
    if (method === 'coordinates') return { a: round6([numOf(form.x, 'X'), numOf(form.y, 'Y'), numOf(form.z, 'Z')]), note: 'by coordinates' };
    if (method === 'on_curve') {
      const { poly, sketch } = pickCurve(ctx.kept, form);
      const ratio = numOf(form.ratio, 'The position');
      if (ratio < 0 || ratio > 1) throw new Error('The position along the curve must be between 0 and 1.');
      return { a: round6(alongPolyline(poly, ratio).p), note: `on a curve of ${sketch.name}, at ${r2(ratio)}` };
    }
    if (method === 'center') {
      const { poly, sketch, loop } = pickCurve(ctx.kept, form);
      const c = loop?.kind === 'circle' ? toWorld(sketch.frame, loop.center) : polygonCentroid(poly);
      return { a: round6(c), note: `center of a curve of ${sketch.name}` };
    }
    if (method === 'on_surface') {
      if (!ctx.surface) throw new Error('Click a surface of the part in the 3D view first.');
      return { a: round6(ctx.surface.point), note: 'on a surface' };
    }
    if (method === 'on_plane') {
      const pl = planeFromChoice(ctx.refs, form.onPlane, 'The plane');
      const h = numOf(form.h, 'H'); const v = numOf(form.v, 'V');
      return { a: round6(toWorld(pl.frame, [h, v])), note: `on ${pl.name}, H ${r2(h)}, V ${r2(v)}` };
    }
    if (method === 'between') {
      const a = pointOf(form.start, form.startXYZ, 'The first point'); const b = pointOf(form.end, form.endXYZ, 'The second point');
      const t = numOf(form.ratio2, 'The ratio');
      if (Math.hypot(...sub(b, a)) < 1e-9) throw new Error('The two points are the same, so nothing lies between them.');
      return { a: round6(add(a, mul(sub(b, a), t))), note: `between two points, at ${r2(t)}` };
    }
    if (method === 'tangent_curve') {
      const { poly, sketch, loop } = pickCurve(ctx.kept, form);
      const key = String(form.tdir || '+X');
      const d = norm(key === 'custom' ? parseXYZ(form.tdirXYZ, 'The direction') : key === '+Y' ? [0, 1, 0] : key === '+Z' ? [0, 0, 1] : [1, 0, 0]);
      if (!d) throw new Error('The tangent direction is zero.');
      const want = Math.round(numOf(form.solution, 'The solution number'));
      // Exact for a circle: the two points whose tangent runs along the direction, either side of the centre, in the sketch plane.
      if (loop?.kind === 'circle') {
        const radial = norm(cross3(sketch.frame.normal, d));
        if (!radial) throw new Error('That direction is perpendicular to the sketch plane, so no point of the circle is tangent to it.');
        const c = toWorld(sketch.frame, loop.center);
        const sols = [add(c, mul(radial, loop.r)), sub(c, mul(radial, loop.r))];
        if (want < 1 || want > sols.length) throw new Error(`This circle has 2 tangent points for that direction — choose solution 1 or 2.`);
        return { a: round6(sols[want - 1]), note: `tangent on a curve of ${sketch.name}, solution ${want}` };
      }
      // Other curves: where the polyline's direction is closest to the given one (a local minimum), in order along the curve.
      const m: number[] = []; const mids: Vec3[] = [];
      for (let i = 0; i + 1 < poly.length; i++) { const t = norm(sub(poly[i + 1], poly[i])); m.push(t ? Math.hypot(...cross3(t, d)) : 9); mids.push(mul(add(poly[i], poly[i + 1]), 0.5)); }
      const sols: number[] = [];
      for (let i = 0; i < m.length; i++) {
        const prev = i > 0 ? m[i - 1] : Infinity; const next = i + 1 < m.length ? m[i + 1] : Infinity;
        if (m[i] < 0.3 && m[i] < prev && m[i] <= next) sols.push(i);
      }
      if (!sols.length) throw new Error('That curve is not tangent to that direction anywhere.');
      if (want < 1 || want > sols.length) throw new Error(`This curve has ${sols.length} tangent point${sols.length === 1 ? '' : 's'} for that direction — choose solution 1${sols.length > 1 ? ` to ${sols.length}` : ''}.`);
      return { a: round6(mids[sols[want - 1]]), note: `tangent on a curve of ${sketch.name}, solution ${want}` };
    }
    // plane_intersection
    const lineSel = String(form.line || 'Z');
    const lr = ['X', 'Y', 'Z'].includes(lineSel)
      ? ({ p: [0, 0, 0] as Vec3, d: (lineSel === 'X' ? [1, 0, 0] : lineSel === 'Y' ? [0, 1, 0] : [0, 0, 1]) as Vec3 })
      : (() => { const r = ctx.refs.find((x) => x.id === lineSel); return r ? refLineOf(r) : null; })();
    if (!lr) throw new Error('Choose the line or axis to intersect with the plane.');
    const planeSel = String(form.plane || 'XY');
    let n: Vec3; let c: number; let planeName: string;
    if (PLANE_NORMAL[planeSel]) { n = PLANE_NORMAL[planeSel]; c = numOf(form.planeOffset, 'The plane offset'); planeName = `${planeSel} plane`; }
    else {
      const pr = ctx.refs.find((x) => x.id === planeSel && x.kind === 'plane');
      if (!pr) throw new Error('Choose the plane to intersect with.');
      const pf = refPlaneFrameOf(pr); n = norm(pf.normal) ?? [0, 0, 1]; c = dot(pf.origin, n); planeName = pr.name;
    }
    const denom = dot(n, lr.d);
    if (Math.abs(denom) < 1e-9) throw new Error('The line is parallel to that plane, so they do not meet at a point.');
    const t = (c - dot(n, lr.p)) / denom;
    return { a: round6(add(lr.p, mul(lr.d, t))), note: `line ∩ ${planeName}` };
  }
  // Reference Line
  const method = String(form.method || 'point_point');
  if (method === 'point_point') {
    const a = pointOf(form.start, form.startXYZ, 'The first point'); const b = pointOf(form.end, form.endXYZ, 'The second point');
    if (Math.hypot(...sub(b, a)) < 1e-9) throw new Error('The two points are the same, so they do not define a line.');
    return { a: round6(a), b: round6(b), note: 'point – point' };
  }
  const length = numOf(form.length, 'The length');
  if (!(length > 0)) throw new Error('The length must be greater than zero.');
  const span = (p: number[], d: number[], note: string) => ({ a: round6(form.mirrored ? sub(p, mul(d, length)) : p), b: round6(add(p, mul(d, length))), note });
  if (method === 'point_direction') {
    const p = pointOf(form.start, form.startXYZ, 'The point');
    const key = String(form.dir || '+Z');
    const dir = key === 'custom' ? parseXYZ(form.dirXYZ, 'The direction') : ([key.endsWith('X') ? 1 : 0, key.endsWith('Y') ? 1 : 0, key.endsWith('Z') ? 1 : 0].map((v) => v * (key[0] === '-' ? -1 : 1)) as Vec3);
    const d = norm(dir);
    if (!d) throw new Error('The direction vector is zero.');
    return span(p, d, 'point – direction');
  }
  if (method === 'tangent') {
    const { poly, sketch } = pickCurve(ctx.kept, form);
    const ratio = numOf(form.ratio, 'The position');
    if (ratio < 0 || ratio > 1) throw new Error('The position along the curve must be between 0 and 1.');
    const { p, t } = alongPolyline(poly, ratio);
    return span(p, t, `tangent to a curve of ${sketch.name}`);
  }
  if (method === 'angle_curve') {
    const { poly, sketch } = pickCurve(ctx.kept, form);
    const ratio = numOf(form.ratio, 'The position');
    if (ratio < 0 || ratio > 1) throw new Error('The position along the curve must be between 0 and 1.');
    const ang = numOf(form.lineAngle, 'The angle');
    const { p, t } = alongPolyline(poly, ratio);
    const d = norm(rotateAbout(t, sketch.frame.normal, ang));
    if (!d) throw new Error('That angle gives no direction.');
    return span(p, d, `${Math.abs(ang % 180) === 90 ? 'normal' : `${r2(ang)}°`} to a curve of ${sketch.name}`);
  }
  if (method === 'bisecting') {
    const l1 = lineFrom(ctx.refs, form.bis1, 'The first line'); const l2 = lineFrom(ctx.refs, form.bis2, 'The second line');
    const c = cross3(l1.d, l2.d); const cl = Math.hypot(...c);
    if (cl < 1e-9) throw new Error('The two lines are parallel, so they have no bisector through a point.');
    const v = sub(l2.p, l1.p);
    if (Math.abs(dot(v, c)) / cl > 1e-4) throw new Error('The two lines do not meet, so they have no bisector.');
    // Where the first line meets the second: p1 + t·d1.
    const t = dot(cross3(v, l2.d), c) / (cl * cl);
    const meet = add(l1.p, mul(l1.d, t));
    const d = norm(form.otherBis ? sub(l1.d, l2.d) : add(l1.d, l2.d));
    if (!d) throw new Error('The lines run in opposite directions — tick “Other bisector”.');
    return span(meet, d, `bisector of ${l1.name} and ${l2.name}`);
  }
  // normal_surface
  if (!ctx.surface) throw new Error('Click a surface of the part in the 3D view first.');
  const nrm = norm(ctx.surface.normal ?? []);
  if (!nrm) throw new Error('That surface point has no normal — click the part again.');
  return span(ctx.surface.point, nrm, 'normal to a surface');
}
