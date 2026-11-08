// Sketch & 2D: the MODIFY tools — Mirror, Translate, Rotate, Offset and Project 3D Element.
// A hook built on useSketchCore's state (assembled in handlers/index.ts, ahead of the canvas click).
//
// Every tool runs the same short conversation: pick the elements (or arrive with a selection already made),
// then give the reference — the axis, the vector, the centre and angle, the side of the offset, or the 3D
// element to project — and the result goes straight into the sketch and through the constraint solver.
//
//  Mirror     copies across a line or axis; Associative keeps the copies tied with Symmetry constraints.
//  Translate  moves or copies by a vector (typed X/Y, distance + angle, or two clicks).
//  Rotate     moves or copies around a centre by an angle (typed, or follow the cursor).
//  Offset     parallel copies at a distance with sharp / round / chained corners; Linked keeps them
//             regenerated from their sources whenever those change (and the distance stays editable).
//  Project 3D picks an edge, face boundary or vertex of the model and lays it on the sketch plane as
//             locked yellow reference geometry that follows the model.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Arc, Circ, Constraint, Ln, Pt, SketchCurve } from '../types';
import type { SketchCore, EntityGeom } from '../useSketchCore';
import type { ViewAndAnnotations } from './viewAndAnnotations';
import type { SnapAndSelect } from './snapAndSelect';
import type { DrawingTools } from './drawingTools';
import type { TrimAndChamfer } from './trimAndChamfer';
import {
  applyPt, ccwToPhi, collect, closureSize, copyEntities, mapAngleDeg, moveEntities, planOffset, sideOfChain, specFor,
  type Closure, type OffsetChain, type OffsetCorner, type OffsetPlan, type OffsetPropagation, type OffsetSpec, type Sk, type XY, type Xform,
} from '../modify';
import {
  frameKey, matchEdge, matchFace, matchVertex, planeCoords, planeDistance, type Model3DEdge, type Model3DFace, type Model3DVertex, type Vec3,
} from '../../modelGeometry';

export const MODIFY_TOOLS = ['mirror-2d', 'translate-2d', 'rotate-2d', 'offset-2d', 'project-3d'] as const;
export type ModifyMode = (typeof MODIFY_TOOLS)[number];
export const isModifyTool = (t: string): t is ModifyMode => (MODIFY_TOOLS as readonly string[]).includes(t);

export type ModifyPreview = {
  /** the result as it would land (dashed) */
  polys: XY[][];
  dots: XY[];
  /** the reference being used — a mirror axis, the offset source, the picked 3D element */
  guides: XY[][];
  marks: XY[];
  arrow: [XY, XY] | null;
  sweep: { c: XY; r: number; from: number; to: number } | null;
  label: { at: XY; text: string } | null;
  warn: string | null;
  /** Project 3D: everything the model offers on this plane (dim), picked from here */
  bgPolys: XY[][];
  bgDots: XY[];
};

const HIT = 3.5;
const DEG = 180 / Math.PI;
const GROUP_TYPES = ['offset_link', 'projection'] as const;

type OffsetArgs = { prefix: string; spec: OffsetSpec; n: { p: number; l: number }; anchor: string };

// ---- helpers shared by the tools --------------------------------------------------------------------------

/** Entities of a plan, with ids made from `prefix` + key. */
function materialize(prefix: string, plan: OffsetPlan, lineStyle?: Ln['style']) {
  const id = (k: string) => `${prefix}${k}`;
  const points: Pt[] = plan.points.map((p) => ({ id: id(p.key), x: p.x, y: p.y }));
  const lines: Ln[] = plan.lines.map((l) => ({ id: id(l.key), p1: id(l.p1), p2: id(l.p2), ...(lineStyle ? { style: lineStyle } : l.style ? { style: l.style } : {}) }));
  const arcs: Arc[] = plan.arcs.map((a) => ({ id: id(a.key), center: id(a.center), r: a.r, start: a.start, end: a.end, p1: id(a.p1), p2: id(a.p2) }));
  const circles: Circ[] = plan.circles.map((c) => ({ id: id(c.key), center: id(c.center), r: c.r }));
  const curves: SketchCurve[] = plan.curves.map((c) => ({ id: id(c.key), kind: 'spline', controlIds: c.ctrl.map(id) }));
  return { points, lines, arcs, circles, curves };
}
type Mat = ReturnType<typeof materialize>;

const near = (a: number, b: number, e = 1e-4) => Math.abs(a - b) < e;
const sameAngle = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) < 1e-3;

/** Whether the live entities carrying `prefix` already are exactly `want`. */
function groupMatches(sk: Sk, prefix: string, want: Mat): boolean {
  const has = (id: string) => id.startsWith(prefix);
  const cp = sk.points.filter((p) => has(p.id)), cl = sk.lines.filter((l) => has(l.id)), ca = sk.arcs.filter((a) => has(a.id)), cc = sk.circles.filter((c) => has(c.id)), cv = sk.curves.filter((c) => has(c.id));
  if (cp.length !== want.points.length || cl.length !== want.lines.length || ca.length !== want.arcs.length || cc.length !== want.circles.length || cv.length !== want.curves.length) return false;
  const pm = new Map(cp.map((p) => [p.id, p]));
  for (const p of want.points) { const o = pm.get(p.id); if (!o || !near(o.x, p.x) || !near(o.y, p.y)) return false; }
  const lm = new Map(cl.map((l) => [l.id, l]));
  for (const l of want.lines) { const o = lm.get(l.id); if (!o || o.p1 !== l.p1 || o.p2 !== l.p2) return false; }
  const am = new Map(ca.map((a) => [a.id, a]));
  for (const a of want.arcs) { const o = am.get(a.id); if (!o || o.p1 !== a.p1 || o.p2 !== a.p2 || !near(o.r, a.r) || !sameAngle(o.start, a.start) || !sameAngle(o.end, a.end)) return false; }
  const km = new Map(cc.map((c) => [c.id, c]));
  for (const c of want.circles) { const o = km.get(c.id); if (!o || o.center !== c.center || !near(o.r, c.r)) return false; }
  const vm = new Map(cv.map((c) => [c.id, c]));
  for (const c of want.curves) { const o = vm.get(c.id); if (!o || o.kind !== 'spline' || c.kind !== 'spline' || o.controlIds.join() !== c.controlIds.join()) return false; }
  return true;
}

const centroidOf = (sk: Sk, cl: Closure): XY => {
  let x = 0, y = 0, n = 0;
  for (const p of sk.points) if (cl.points.has(p.id)) { x += p.x; y += p.y; n++; }
  return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
};

export function useModifyTools(core: SketchCore, prev: ViewAndAnnotations & SnapAndSelect & DrawingTools & TrimAndChamfer) {
  const {
    points, lines, circles, arcs, curves, constraints, setPoints, setLines, setCircles, setArcs, setCurves, setConstraints, nextId, solve, selected, setSelected,
    tool, setTool, mousePt, SKETCH_ORIGIN, unitMm, toU, curvePoints, setError, plane, getModelGeometry, modelRevision, supportFrame,
  } = core;
  const { pickEntityAt, pickCurveAt, findNearestPoint, gridSnap } = prev;

  const mode: ModifyMode | null = isModifyTool(tool) ? tool : null;
  const sk: Sk = { points, lines, circles, arcs, curves, constraints };
  const skRef = useRef(sk); skRef.current = sk;
  const selRef = useRef(selected); selRef.current = selected;

  // ---- options + stage -------------------------------------------------------------------------------------
  const [stage, setStage] = useState<'entities' | 'reference'>('entities');
  const [mirrorAssoc, setMirrorAssoc] = useState(true);
  const [trMode, setTrMode] = useState<'xy' | 'polar'>('xy');
  const [trDx, setTrDx] = useState('20'); const [trDy, setTrDy] = useState('0');
  const [trDist, setTrDist] = useState('20'); const [trAng, setTrAng] = useState('0');
  const [trKeep, setTrKeep] = useState(false); const [trCount, setTrCount] = useState('1');
  const [rotAngle, setRotAngle] = useState('90'); const [rotKeep, setRotKeep] = useState(false); const [rotCount, setRotCount] = useState('1');
  const [rotFollow, setRotFollow] = useState(true);
  const [vecFrom, setVecFrom] = useState<XY | null>(null);           // translate: the vector's start · rotate: the centre
  const [offDist, setOffDist] = useState('10'); const [offCorner, setOffCorner] = useState<OffsetCorner>('sharp');
  const [offBoth, setOffBoth] = useState(false); const [offProp, setOffProp] = useState<OffsetPropagation>('point'); const [offLink, setOffLink] = useState(true);
  const [offChains, setOffChains] = useState<OffsetChain[]>([]);
  const [projKind, setProjKind] = useState<'edge' | 'face' | 'vertex'>('edge');
  const [note, setNote] = useState<string | null>(null);

  const closure: Closure = useMemo(() => collect(sk, selected), [points, lines, circles, arcs, curves, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasSel = closureSize(closure) > 0;

  // Entering a tool: with something already selected go straight to the reference, otherwise pick elements first.
  useEffect(() => {
    setVecFrom(null); setRotFollow(true); setNote(null); setOffChains([]);
    if (!mode) return;
    const cl = collect(skRef.current, selRef.current);
    if (mode === 'project-3d') { setStage('reference'); return; }
    if (mode === 'offset-2d') {
      const seeds = selRef.current.filter((id) => !id.startsWith('__'));
      const chains = specFor(skRef.current, seeds, 'point');
      if (chains.length) { setOffChains(chains); setStage('reference'); } else setStage('entities');
      return;
    }
    setStage(closureSize(cl) > 0 ? 'reference' : 'entities');
  }, [mode]);

  const snapXY = (x: number, y: number): XY & { id?: string } => {
    const p = findNearestPoint(x, y);
    if (p) return { x: p.x, y: p.y, id: p.id };
    return gridSnap(x, y);
  };
  const mouse: XY | null = mousePt ? snapXY(mousePt.x, mousePt.y) : null;

  // ---- committing results ----------------------------------------------------------------------------------
  const commitAdditions = (add: { points?: Pt[]; lines?: Ln[]; circles?: Circ[]; arcs?: Arc[]; curves?: SketchCurve[]; constraints?: Constraint[] }) => {
    const s = skRef.current;
    const np = [...s.points, ...(add.points ?? [])], nl = [...s.lines, ...(add.lines ?? [])], nc = [...s.circles, ...(add.circles ?? [])];
    const nk = [...s.constraints, ...(add.constraints ?? [])];
    setPoints(np); setLines(nl); setCircles(nc);
    if (add.arcs?.length) setArcs((a) => [...a, ...add.arcs!]);
    if (add.curves?.length) setCurves((c) => [...c, ...add.curves!]);
    setConstraints(nk);
    void solve(np, nl, nc, nk);
  };

  const finish = (selectIds: string[]) => {
    setSelected(selectIds);
    setVecFrom(null); setOffChains([]);
    setTool('select');
  };

  // ---- Mirror ----------------------------------------------------------------------------------------------
  const applyMirror = (axis: Extract<EntityGeom, { kind: 'line' }>) => {
    const t: Xform = { kind: 'mirror', a: { x: axis.a.x, y: axis.a.y }, b: { x: axis.b.x, y: axis.b.y } };
    if (Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) < 1e-6) { setError('That axis has no length.'); return; }
    const res = copyEntities(skRef.current, collect(skRef.current, selRef.current), t, nextId, { assoc: mirrorAssoc ? { axisLineId: axis.id } : null });
    if (res.newIds.length === 0) { setError('Nothing to mirror — the selection lies on the axis.'); return; }
    setError(null);
    commitAdditions(res);
    finish(res.selectIds);
  };

  // ---- Translate -------------------------------------------------------------------------------------------
  const typedVec = (): XY | null => {
    if (trMode === 'xy') {
      const dx = Number(trDx), dy = Number(trDy);
      return Number.isFinite(dx) && Number.isFinite(dy) ? { x: dx * unitMm, y: -dy * unitMm } : null;
    }
    const d = Number(trDist) * unitMm, a = (Number(trAng) * Math.PI) / 180;
    return Number.isFinite(d) && Number.isFinite(a) ? { x: d * Math.cos(a), y: -d * Math.sin(a) } : null;
  };
  const liveVec = (): XY | null => (vecFrom && mouse ? { x: mouse.x - vecFrom.x, y: mouse.y - vecFrom.y } : typedVec());

  const applyTranslate = (vec: XY | null) => {
    if (!vec || (Math.abs(vec.x) < 1e-9 && Math.abs(vec.y) < 1e-9)) { setError('Give a movement — a vector of zero length does nothing.'); return; }
    const s = skRef.current; const cl = collect(s, selRef.current);
    if (closureSize(cl) === 0) { setError('Pick the elements to move first.'); return; }
    setError(null);
    if (trKeep) {
      const n = Math.max(1, Math.min(200, Math.round(Number(trCount) || 1)));
      const all = { points: [] as Pt[], lines: [] as Ln[], circles: [] as Circ[], arcs: [] as Arc[], curves: [] as SketchCurve[], constraints: [] as Constraint[] };
      const sel: string[] = [];
      for (let k = 1; k <= n; k++) {
        const r = copyEntities(s, cl, { kind: 'translate', dx: vec.x * k, dy: vec.y * k }, nextId);
        all.points.push(...r.points); all.lines.push(...r.lines); all.circles.push(...r.circles); all.arcs.push(...r.arcs); all.curves.push(...r.curves); all.constraints.push(...r.constraints);
        sel.push(...r.selectIds);
      }
      commitAdditions(all); finish(sel);
    } else {
      const mv = moveEntities(s, cl, { kind: 'translate', dx: vec.x, dy: vec.y });
      setPoints(mv.points); setArcs(mv.arcs); setCurves(mv.curves); setConstraints(mv.constraints);
      void solve(mv.points, s.lines, s.circles, mv.constraints);
      finish(selRef.current);
    }
  };

  // ---- Rotate ----------------------------------------------------------------------------------------------
  const centroid = useMemo(() => centroidOf(sk, closure), [closure, points]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Rotation in sketch space (radians): cursor-driven until the angle is typed. */
  const livePhi = (): number | null => {
    if (vecFrom && rotFollow && mouse) {
      if (Math.hypot(centroid.x - vecFrom.x, centroid.y - vecFrom.y) < 1e-6) return null;
      let a1 = Math.atan2(mouse.y - vecFrom.y, mouse.x - vecFrom.x) - Math.atan2(centroid.y - vecFrom.y, centroid.x - vecFrom.x);
      // Snap to whole degrees so the number shown is the number applied.
      a1 = Math.round(a1 * DEG) / DEG;
      return a1;
    }
    const a = Number(rotAngle);
    return Number.isFinite(a) ? ccwToPhi(a) : null;
  };
  const phiToCcw = (phi: number) => { let d = -phi * DEG; d = ((d + 180) % 360 + 360) % 360 - 180; return Math.abs(d) < 1e-9 ? 0 : d; };

  const applyRotate = (centre: XY | null, phi: number | null) => {
    if (!centre) { setError('Click the centre of rotation first.'); return; }
    if (phi === null || Math.abs(phi) < 1e-9) { setError('Give an angle — a rotation of 0° does nothing.'); return; }
    const s = skRef.current; const cl = collect(s, selRef.current);
    if (closureSize(cl) === 0) { setError('Pick the elements to rotate first.'); return; }
    setError(null);
    if (rotKeep) {
      const n = Math.max(1, Math.min(200, Math.round(Number(rotCount) || 1)));
      const all = { points: [] as Pt[], lines: [] as Ln[], circles: [] as Circ[], arcs: [] as Arc[], curves: [] as SketchCurve[], constraints: [] as Constraint[] };
      const sel: string[] = [];
      for (let k = 1; k <= n; k++) {
        const r = copyEntities(s, cl, { kind: 'rotate', c: centre, phi: phi * k }, nextId);
        all.points.push(...r.points); all.lines.push(...r.lines); all.circles.push(...r.circles); all.arcs.push(...r.arcs); all.curves.push(...r.curves); all.constraints.push(...r.constraints);
        sel.push(...r.selectIds);
      }
      commitAdditions(all); finish(sel);
    } else {
      const mv = moveEntities(s, cl, { kind: 'rotate', c: centre, phi });
      setPoints(mv.points); setArcs(mv.arcs); setCurves(mv.curves); setConstraints(mv.constraints);
      void solve(mv.points, s.lines, s.circles, mv.constraints);
      finish(selRef.current);
      if (mv.released > 0) setError(`Rotated — ${mv.released} Horizontal / Vertical / Angle constraint${mv.released === 1 ? '' : 's'} on the turned lines could not hold at the new angle and ${mv.released === 1 ? 'was' : 'were'} released.`);
    }
  };

  // ---- Offset ----------------------------------------------------------------------------------------------
  const sampleCurve = (id: string): XY[] => { const cv = skRef.current.curves.find((c) => c.id === id); return cv ? curvePoints(cv) : []; };
  const offsetMm = () => { const d = Number(offDist) * unitMm; return Number.isFinite(d) ? d : 0; };
  const sidesFor = (at: XY): (1 | -1 | 0)[] => offChains.map((ch) => (offBoth ? 0 : sideOfChain(skRef.current, ch, at)));
  const offsetSpec = (at: XY): OffsetSpec => ({ chains: offChains, dist: offsetMm(), corner: offCorner, sides: sidesFor(at) });

  const applyOffset = (at: XY) => {
    if (offChains.length === 0) { setError('Pick the element to offset first.'); return; }
    const spec = offsetSpec(at);
    const plan = planOffset(skRef.current, spec, sampleCurve);
    const mat0 = materialize('x_', plan);
    if (mat0.points.length + mat0.circles.length === 0) { setError(plan.warnings[0] ?? 'Nothing could be offset by that distance.'); return; }
    const gid = nextId('ofs');
    const prefix = `${gid}_`;
    const mat = materialize(prefix, plan);
    const extra: Constraint[] = [];
    if (offLink) {
      const srcs = Array.from(new Set(spec.chains.flatMap((c) => c.items.map((i) => i.id))));
      const args: Record<string, unknown> = { prefix, spec, n: { p: mat.points.length, l: mat.lines.length }, anchor: mat.points[0]?.id ?? mat.circles[0]?.id ?? '' };
      srcs.forEach((id, i) => { args[`src${i}`] = id; });
      extra.push({ id: nextId('c'), type: 'offset_link', args, label: `Offset ${Number(offDist)} (linked, ${srcs.length} source${srcs.length > 1 ? 's' : ''})` });
    }
    setError(plan.warnings.length ? plan.warnings[0] : null);
    commitAdditions({ ...mat, constraints: extra });
    finish([...mat.lines.map((l) => l.id), ...mat.arcs.map((a) => a.id), ...mat.circles.map((c) => c.id), ...mat.curves.map((c) => c.id)]);
  };

  // Linked offsets: rebuild from the sources whenever those (or the distance) change.
  useEffect(() => {
    const links = constraints.filter((k) => k.type === 'offset_link');
    if (links.length === 0) return;
    let changed = false;
    let nextConstraints = constraints;
    let np = points, nl = lines, na = arcs, nc = circles, nk = curves;
    for (const k of links) {
      const a = k.args as unknown as OffsetArgs;
      const s: Sk = { points: np, lines: nl, circles: nc, arcs: na, curves: nk, constraints };
      const cur = {
        p: np.filter((p) => p.id.startsWith(a.prefix)).length,
        l: nl.filter((l) => l.id.startsWith(a.prefix)).length,
      };
      // The user removed a piece of the result: it is theirs now — stop regenerating it.
      if (cur.p < a.n.p || cur.l < a.n.l) { nextConstraints = nextConstraints.filter((c) => c.id !== k.id); changed = true; continue; }
      const ok = a.spec.chains.every((ch) => ch.items.every((it) => nl.some((l) => l.id === it.id) || na.some((x) => x.id === it.id) || nc.some((x) => x.id === it.id) || nk.some((x) => x.id === it.id)));
      if (!ok) continue;
      const plan = planOffset(s, a.spec, (id) => { const cv = nk.find((c) => c.id === id); return cv ? curvePoints(cv) : []; });
      const want = materialize(a.prefix, plan);
      if (want.points.length + want.circles.length === 0) continue;
      if (groupMatches(s, a.prefix, want)) continue;
      const has = (id: string) => id.startsWith(a.prefix);
      np = [...np.filter((p) => !has(p.id)), ...want.points];
      nl = [...nl.filter((l) => !has(l.id)), ...want.lines];
      na = [...na.filter((x) => !has(x.id)), ...want.arcs];
      nc = [...nc.filter((x) => !has(x.id)), ...want.circles];
      nk = [...nk.filter((x) => !has(x.id)), ...want.curves];
      nextConstraints = nextConstraints.map((c) => (c.id === k.id ? { ...c, args: { ...c.args, n: { p: want.points.length, l: want.lines.length } } } : c));
      changed = true;
    }
    if (!changed) return;
    setPoints(np); setLines(nl); setArcs(na); setCircles(nc); setCurves(nk); setConstraints(nextConstraints);
  }, [points, lines, circles, arcs, curves, constraints]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => constraints.filter((k) => k.type === 'offset_link').map((k) => {
    const a = k.args as unknown as OffsetArgs;
    return { id: k.id, prefix: a.prefix, dist: a.spec.dist, corner: a.spec.corner, label: k.label };
  }), [constraints]);
  const setGroupDistance = (constraintId: string, distMm: number) => {
    if (!(distMm > 0)) return;
    setConstraints((cs) => cs.map((c) => (c.id === constraintId && c.type === 'offset_link'
      ? { ...c, label: c.label.replace(/Offset [^ ]+/, `Offset ${(distMm / unitMm).toFixed(2)}`), args: { ...c.args, spec: { ...(c.args as unknown as OffsetArgs).spec, dist: distMm } } } : c)));
  };
  const setGroupCorner = (constraintId: string, corner: OffsetCorner) => {
    setConstraints((cs) => cs.map((c) => (c.id === constraintId && c.type === 'offset_link'
      ? { ...c, args: { ...c.args, spec: { ...(c.args as unknown as OffsetArgs).spec, corner } } } : c)));
  };
  const unlinkGroup = (constraintId: string) => {
    const rec = skRef.current.constraints.find((c) => c.id === constraintId);
    // Releasing a projection leaves its lines behind as ordinary construction geometry (no longer locked or yellow).
    if (rec?.type === 'projection') {
      const prefix = String((rec.args as { prefix?: string }).prefix);
      setLines((ls) => ls.map((l) => (l.id.startsWith(prefix) ? { ...l, style: 'construction' as const } : l)));
    }
    setConstraints((cs) => cs.filter((c) => c.id !== constraintId));
  };
  /** The linked group (if any) that owns an entity id. */
  const groupOf = (entityId: string | null | undefined) => (entityId ? groups.find((g) => entityId.startsWith(g.prefix)) ?? null : null);

  // ---- Project 3D Element ---------------------------------------------------------------------------------
  const model = useMemo(() => (mode === 'project-3d' && getModelGeometry ? getModelGeometry() : null), [mode, modelRevision, getModelGeometry]); // eslint-disable-line react-hooks/exhaustive-deps
  const toCanvas = (p: Vec3): XY => {
    if (!supportFrame) return { x: SKETCH_ORIGIN.x, y: SKETCH_ORIGIN.y };
    const { u, v } = planeCoords(supportFrame, p);
    return { x: SKETCH_ORIGIN.x + u, y: SKETCH_ORIGIN.y - v };
  };
  type EdgeG = { src: Model3DEdge; pts: XY[] };
  type FaceG = { src: Model3DFace; loops: XY[][]; area: number; dist: number };
  type VertG = { src: Model3DVertex; p: XY };
  const ghost = useMemo(() => {
    if (mode !== 'project-3d' || !model || !supportFrame) return null;
    const edges: EdgeG[] = model.edges.map((e) => ({ src: e, pts: e.path.map(toCanvas) }));
    const faces: FaceG[] = [];
    for (const f of model.faces) {
      const loops = f.loops.map((l) => l.map(toCanvas));
      const outer = loops[0];
      let a = 0; for (let i = 0; i < outer.length; i++) { const p = outer[i], q = outer[(i + 1) % outer.length]; a += p.x * q.y - q.x * p.y; }
      if (Math.abs(a) / 2 < 1e-3) continue;               // seen edge-on: nothing to pick from this side
      faces.push({ src: f, loops, area: Math.abs(a) / 2, dist: Math.abs(planeDistance(supportFrame, f.centroid)) });
    }
    const verts: VertG[] = model.vertices.map((v) => ({ src: v, p: toCanvas(v.p) }));
    return { edges, faces, verts };
  }, [mode, model, supportFrame && frameKey(supportFrame)]); // eslint-disable-line react-hooks/exhaustive-deps

  const distToPoly = (p: XY, pts: XY[], closed = false) => {
    let best = Infinity;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const abx = b.x - a.x, aby = b.y - a.y, L2 = abx * abx + aby * aby;
      const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / L2));
      best = Math.min(best, Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)));
    }
    return best;
  };
  const inPoly = (p: XY, poly: XY[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
    }
    return inside;
  };

  type Pick3D = { kind: 'edge'; g: EdgeG } | { kind: 'face'; g: FaceG } | { kind: 'vertex'; g: VertG } | null;
  const pick3D = (at: XY): Pick3D => {
    if (!ghost) return null;
    if (projKind === 'vertex') {
      let best: VertG | null = null, bd = HIT * 1.6;
      for (const v of ghost.verts) { const d = Math.hypot(v.p.x - at.x, v.p.y - at.y); if (d < bd) { bd = d; best = v; } }
      return best ? { kind: 'vertex', g: best } : null;
    }
    if (projKind === 'edge') {
      let best: EdgeG | null = null, bd = HIT;
      for (const e of ghost.edges) { const d = distToPoly(at, e.pts, e.src.closed); if (d < bd) { bd = d; best = e; } }
      return best ? { kind: 'edge', g: best } : null;
    }
    // face boundary: among the faces under the cursor prefer the one nearest the sketch plane, then the smaller
    let best: FaceG | null = null;
    for (const f of ghost.faces) {
      if (!inPoly(at, f.loops[0]) || f.loops.slice(1).some((h) => inPoly(at, h))) continue;
      if (!best || f.dist < best.dist - 1e-6 || (Math.abs(f.dist - best.dist) < 1e-6 && f.area < best.area)) best = f;
    }
    return best ? { kind: 'face', g: best } : null;
  };

  type ProjArgs = { prefix: string; kind: 'edge' | 'face' | 'vertex'; key: string; mid: Vec3; size: number; normal: Vec3; plane: string; frame: string; n: { p: number; l: number }; status: 'ok' | 'lost'; anchor: string };
  /** The sketch entities for a projected source. */
  const projectionPlan = (kind: ProjArgs['kind'], src: Model3DEdge | Model3DFace | Model3DVertex): OffsetPlan | null => {
    const plan: OffsetPlan = { points: [], lines: [], arcs: [], circles: [], curves: [], warnings: [] };
    const ring = (poly: XY[], closed: boolean, tag: string) => {
      const keep: XY[] = [];
      for (const p of poly) if (!keep.length || Math.hypot(p.x - keep[keep.length - 1].x, p.y - keep[keep.length - 1].y) > 1e-5) keep.push(p);
      if (closed && keep.length > 1 && Math.hypot(keep[0].x - keep[keep.length - 1].x, keep[0].y - keep[keep.length - 1].y) < 1e-5) keep.pop();
      if (keep.length < 2) return;
      keep.forEach((p, i) => plan.points.push({ key: `${tag}p${i}`, x: p.x, y: p.y }));
      const segs = closed ? keep.length : keep.length - 1;
      for (let i = 0; i < segs; i++) plan.lines.push({ key: `${tag}l${i}`, p1: `${tag}p${i}`, p2: `${tag}p${(i + 1) % keep.length}` });
    };
    if (kind === 'vertex') { const p = toCanvas((src as Model3DVertex).p); plan.points.push({ key: 'p0', x: p.x, y: p.y }); return plan; }
    if (kind === 'edge') { const e = src as Model3DEdge; ring(e.path.map(toCanvas), e.closed, 'a'); }
    else (src as Model3DFace).loops.forEach((l, i) => ring(l.map(toCanvas), true, `f${i}`));
    return plan.points.length ? plan : null;
  };

  const projectPick = (pk: NonNullable<Pick3D>) => {
    if (!supportFrame) { setError('The sketch plane is not known yet — open the sketch from 3D Design.'); return; }
    const src = pk.g.src as Model3DEdge | Model3DFace | Model3DVertex;
    const plan = projectionPlan(pk.kind, src);
    if (!plan) { setNote('That element runs straight along the sketch normal, so it projects to a single point — try the Vertex option.'); return; }
    const gid = nextId('prj');
    const prefix = `${gid}_`;
    const mat = materialize(prefix, plan, 'projected');
    const mid = pk.kind === 'face' ? (src as Model3DFace).centroid : pk.kind === 'edge' ? (src as Model3DEdge).mid : (src as Model3DVertex).p;
    const args: ProjArgs = {
      prefix, kind: pk.kind, key: src.key, mid, size: pk.kind === 'face' ? (src as Model3DFace).area : pk.kind === 'edge' ? (src as Model3DEdge).length : 0,
      normal: pk.kind === 'face' ? (src as Model3DFace).normal : [0, 0, 1], plane, frame: frameKey(supportFrame),
      n: { p: mat.points.length, l: mat.lines.length }, status: 'ok', anchor: mat.points[0].id,
    };
    const label = pk.kind === 'face' ? 'Projected face boundary' : pk.kind === 'edge' ? 'Projected edge' : 'Projected vertex';
    setNote(null); setError(null);
    commitAdditions({ ...mat, constraints: [{ id: nextId('c'), type: 'projection', args: args as unknown as Record<string, unknown>, label }] });
    setSelected([...mat.lines.map((l) => l.id), ...(mat.lines.length ? [] : mat.points.map((p) => p.id))]);
  };

  // Projected elements follow the model: re-lay them whenever the model (or the sketch plane) changes.
  const geomRef = useRef<typeof getModelGeometry>(getModelGeometry); geomRef.current = getModelGeometry;
  useEffect(() => {
    const recs = constraints.filter((k) => k.type === 'projection');
    if (recs.length === 0 || !geomRef.current || !supportFrame) return;
    const m = geomRef.current();
    if (!m) return;
    const frame = frameKey(supportFrame);
    let changed = false;
    let np = points, nl = lines;
    let nextConstraints = constraints;
    for (const k of recs) {
      const a = k.args as unknown as ProjArgs;
      if (a.plane !== plane) continue;
      const cur = { p: np.filter((p) => p.id.startsWith(a.prefix)).length, l: nl.filter((l) => l.id.startsWith(a.prefix)).length };
      if (cur.p < a.n.p || cur.l < a.n.l) { nextConstraints = nextConstraints.filter((c) => c.id !== k.id); changed = true; continue; }
      const src = a.kind === 'edge' ? matchEdge(m, a.key, a.mid, a.size) : a.kind === 'face' ? matchFace(m, a.key, a.mid, a.normal, a.size) : matchVertex(m, a.key, a.mid);
      if (!src) {
        if (a.status !== 'lost') { nextConstraints = nextConstraints.map((c) => (c.id === k.id ? { ...c, args: { ...c.args, status: 'lost' } } : c)); changed = true; }
        continue;
      }
      const plan = projectionPlan(a.kind, src);
      if (!plan) continue;
      const want = materialize(a.prefix, plan, 'projected');
      const same = groupMatches({ points: np, lines: nl, circles: [], arcs: [], curves: [], constraints }, a.prefix, { ...want, arcs: [], circles: [], curves: [] });
      const sourceMoved = a.key !== src.key || a.frame !== frame || a.status !== 'ok';
      if (same && !sourceMoved) continue;
      if (!same) {
        np = [...np.filter((p) => !p.id.startsWith(a.prefix)), ...want.points];
        nl = [...nl.filter((l) => !l.id.startsWith(a.prefix)), ...want.lines];
      }
      const mid = a.kind === 'face' ? (src as Model3DFace).centroid : a.kind === 'edge' ? (src as Model3DEdge).mid : (src as Model3DVertex).p;
      nextConstraints = nextConstraints.map((c) => (c.id === k.id ? { ...c, args: { ...c.args, key: src.key, mid, frame, status: 'ok', n: { p: want.points.length, l: want.lines.length } } } : c));
      changed = true;
    }
    if (!changed) return;
    setPoints(np); setLines(nl); setConstraints(nextConstraints);
  }, [modelRevision, supportFrame && frameKey(supportFrame), plane, constraints.length, points.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Clicks ---------------------------------------------------------------------------------------------
  const pickableIds = (hit: EntityGeom | null): string | null => (hit && !hit.id.startsWith('__') ? hit.id : null);

  const handleClick = (x: number, y: number) => {
    if (!mode) return;
    setNote(null);
    // Project 3D: one click on a ghost element
    if (mode === 'project-3d') {
      const pk = pick3D({ x, y });
      if (pk) projectPick(pk); else setNote(projKind === 'face' ? 'Click inside a flat face of the model.' : projKind === 'vertex' ? 'Click a corner point of the model.' : 'Click an edge of the model.');
      return;
    }
    if (stage === 'entities') {
      const hit = mode === 'offset-2d' ? pickCurveAt(x, y) : pickEntityAt(x, y);
      const id = pickableIds(hit);
      if (mode === 'offset-2d') {
        if (!id || !hit || hit.kind === 'point') { return; }
        const s = skRef.current;
        if (s.lines.find((l) => l.id === id)?.style === 'infinite') { setError('An infinite line cannot be offset — it has no ends.'); return; }
        // clicking something already picked takes its chain back out
        const existing = offChains.findIndex((c) => c.items.some((i) => i.id === id));
        let next: OffsetChain[];
        if (existing >= 0) next = offChains.filter((_, i) => i !== existing);
        else { const add = specFor(s, [id], offProp); next = [...offChains, ...add]; }
        setOffChains(next);
        setSelected(next.flatMap((c) => c.items.map((i) => i.id)));
        setError(null);
        setStage(next.length ? 'reference' : 'entities');
        return;
      }
      if (id) { setSelected((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id])); return; }
      // Translate / Rotate: a click on empty canvas moves on to the reference, and is the first reference click
      if (hasSel && (mode === 'translate-2d' || mode === 'rotate-2d')) { setStage('reference'); referenceClick(x, y); }
      return;
    }
    referenceClick(x, y);
  };

  const referenceClick = (x: number, y: number) => {
    if (mode === 'mirror-2d') {
      const hit = pickCurveAt(x, y);
      if (!hit || hit.kind !== 'line') { setNote('Click a line (or the horizontal / vertical axis) to mirror about.'); return; }
      applyMirror(hit);
      return;
    }
    if (mode === 'translate-2d') {
      const p = snapXY(x, y);
      if (!vecFrom) { setVecFrom({ x: p.x, y: p.y }); return; }
      applyTranslate({ x: p.x - vecFrom.x, y: p.y - vecFrom.y });
      return;
    }
    if (mode === 'rotate-2d') {
      const p = snapXY(x, y);
      if (!vecFrom) { setVecFrom({ x: p.x, y: p.y }); setRotFollow(true); return; }
      applyRotate(vecFrom, rotFollow ? livePhi() : ccwToPhi(Number(rotAngle)));
      return;
    }
    if (mode === 'offset-2d') {
      const p = snapXY(x, y);
      applyOffset(p);
    }
  };

  /** The Apply button / Enter: uses the typed numbers. */
  const apply = () => {
    if (!mode) return;
    if (mode === 'translate-2d') { applyTranslate(typedVec()); return; }
    if (mode === 'rotate-2d') { applyRotate(vecFrom ?? centroid, ccwToPhi(Number(rotAngle))); return; }
    if (mode === 'offset-2d') {
      // With the cursor over the canvas use its side, otherwise the left of travel
      applyOffset(mouse ?? { x: 0, y: 0 });
    }
  };
  const goToReference = () => { if (hasSel || offChains.length) setStage('reference'); else setError('Pick at least one element first.'); };
  const backToPicking = () => { setStage('entities'); setVecFrom(null); };

  // Enter outside a field: continue / apply
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'Enter' && mode !== 'project-3d') {
        e.preventDefault();
        if (stage === 'entities') goToReference(); else if (mode === 'translate-2d' || mode === 'rotate-2d') apply();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // every render: the handlers close over fresh state

  // ---- Preview ------------------------------------------------------------------------------------------------
  const arcPoly = (c: XY, r: number, a0: number, a1: number, n = 40): XY[] => {
    let sweep = ((a1 - a0) % 360 + 360) % 360; if (sweep === 0) sweep = 360;
    return Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + (sweep * i) / n) * Math.PI) / 180; return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }; });
  };
  const ghostOf = (cl: Closure, t: Xform) => {
    const polys: XY[][] = [], dots: XY[] = [];
    const byId = new Map(points.map((p) => [p.id, p]));
    for (const l of cl.lines) { const a = byId.get(l.p1), b = byId.get(l.p2); if (a && b) polys.push([applyPt(t, a), applyPt(t, b)]); }
    for (const c of cl.circles) { const ctr = byId.get(c.center); if (ctr) polys.push(arcPoly(applyPt(t, ctr), c.r, 0, 360, 48)); }
    for (const a of cl.arcs) {
      const ctr = byId.get(a.center); if (!ctr) continue;
      const s = t.kind === 'mirror' ? mapAngleDeg(t, a.end) : mapAngleDeg(t, a.start), e = t.kind === 'mirror' ? mapAngleDeg(t, a.start) : mapAngleDeg(t, a.end);
      polys.push(arcPoly(applyPt(t, ctr), a.r, s, e));
    }
    for (const cv of cl.curves) polys.push(curvePoints(cv).map((p) => applyPt(t, p)));
    const owned = new Set<string>();
    for (const l of cl.lines) { owned.add(l.p1); owned.add(l.p2); }
    for (const c of cl.circles) owned.add(c.center);
    for (const a of cl.arcs) { owned.add(a.center); if (a.p1) owned.add(a.p1); if (a.p2) owned.add(a.p2); }
    for (const id of cl.points) { if (owned.has(id)) continue; const p = byId.get(id); if (p) dots.push(applyPt(t, p)); }
    return { polys, dots };
  };

  const preview: ModifyPreview | null = (() => {
    if (!mode) return null;
    const out: ModifyPreview = { polys: [], dots: [], guides: [], marks: [], arrow: null, sweep: null, label: null, warn: null, bgPolys: [], bgDots: [] };
    if (mode === 'project-3d') {
      if (!supportFrame || !model) { out.warn = !supportFrame ? 'The sketch plane is not known yet.' : 'The model has no edges to project yet — build a feature first.'; return out; }
      if (!ghost) return out;
      if (projKind === 'edge') ghost.edges.forEach((e) => out.bgPolys.push(e.src.closed ? [...e.pts, e.pts[0]] : e.pts));
      else if (projKind === 'face') ghost.faces.forEach((f) => f.loops.forEach((l) => out.bgPolys.push([...l, l[0]])));
      else ghost.verts.forEach((v) => out.bgDots.push(v.p));
      if (mousePt) {
        const pk = pick3D({ x: mousePt.x, y: mousePt.y });
        if (pk?.kind === 'edge') out.polys.push(pk.g.src.closed ? [...pk.g.pts, pk.g.pts[0]] : pk.g.pts);
        if (pk?.kind === 'face') pk.g.loops.forEach((l) => out.polys.push([...l, l[0]]));
        if (pk?.kind === 'vertex') out.dots.push(pk.g.p);
      }
      return out;
    }
    if (stage === 'entities' && mode !== 'offset-2d') return out;
    if (mode === 'mirror-2d') {
      if (!mousePt) return out;
      const hit = pickCurveAt(mousePt.x, mousePt.y);
      if (hit && hit.kind === 'line') {
        const t: Xform = { kind: 'mirror', a: { x: hit.a.x, y: hit.a.y }, b: { x: hit.b.x, y: hit.b.y } };
        const g = ghostOf(closure, t); out.polys = g.polys; out.dots = g.dots;
        out.guides.push([{ x: hit.a.x, y: hit.a.y }, { x: hit.b.x, y: hit.b.y }]);
      }
      return out;
    }
    if (mode === 'translate-2d') {
      const v = liveVec();
      if (vecFrom) out.marks.push(vecFrom);
      if (!v || (Math.abs(v.x) < 1e-9 && Math.abs(v.y) < 1e-9)) return out;
      const n = trKeep ? Math.max(1, Math.min(50, Math.round(Number(trCount) || 1))) : 1;
      for (let k = 1; k <= n; k++) { const g = ghostOf(closure, { kind: 'translate', dx: v.x * k, dy: v.y * k }); out.polys.push(...g.polys); out.dots.push(...g.dots); }
      const from = vecFrom ?? centroid;
      out.arrow = [from, { x: from.x + v.x, y: from.y + v.y }];
      out.label = { at: { x: from.x + v.x / 2, y: from.y + v.y / 2 }, text: `${toU(Math.hypot(v.x, v.y)).toFixed(2)} @ ${((Math.atan2(-v.y, v.x) * DEG + 360) % 360).toFixed(1)}°  (ΔH ${toU(v.x).toFixed(2)}, ΔV ${toU(-v.y).toFixed(2)})` };
      return out;
    }
    if (mode === 'rotate-2d') {
      if (!vecFrom) return out;
      out.marks.push(vecFrom);
      const phi = livePhi();
      if (phi === null || Math.abs(phi) < 1e-9) return out;
      const n = rotKeep ? Math.max(1, Math.min(50, Math.round(Number(rotCount) || 1))) : 1;
      for (let k = 1; k <= n; k++) { const g = ghostOf(closure, { kind: 'rotate', c: vecFrom, phi: phi * k }); out.polys.push(...g.polys); out.dots.push(...g.dots); }
      const a0 = Math.atan2(centroid.y - vecFrom.y, centroid.x - vecFrom.x) * DEG;
      const r = Math.max(8, Math.hypot(centroid.x - vecFrom.x, centroid.y - vecFrom.y));
      out.sweep = { c: vecFrom, r, from: a0, to: a0 + phi * DEG };
      out.label = { at: { x: vecFrom.x + 6, y: vecFrom.y - 6 }, text: `${phiToCcw(phi).toFixed(1)}°` };
      return out;
    }
    if (mode === 'offset-2d') {
      if (offChains.length === 0) return out;
      const at: XY = mouse ?? { x: 0, y: 0 };
      const spec = offsetSpec(at);
      const plan = planOffset(skRef.current, spec, sampleCurve);
      const pt = new Map(plan.points.map((p) => [p.key, p]));
      for (const l of plan.lines) { const a = pt.get(l.p1), b = pt.get(l.p2); if (a && b) out.polys.push([a, b]); }
      for (const a of plan.arcs) { const c = pt.get(a.center); if (c) out.polys.push(arcPoly(c, a.r, a.start, a.end)); }
      for (const c of plan.circles) { const ctr = pt.get(c.center); if (ctr) out.polys.push(arcPoly(ctr, c.r, 0, 360, 64)); }
      for (const cv of plan.curves) out.polys.push(cv.ctrl.map((k) => pt.get(k)!).filter(Boolean));
      if (plan.warnings[0]) out.warn = plan.warnings[0];
      const idSet = new Set(offChains.flatMap((c) => c.items.map((i) => i.id)));
      for (const l of lines) if (idSet.has(l.id)) { const a = points.find((p) => p.id === l.p1), b = points.find((p) => p.id === l.p2); if (a && b) out.guides.push([a, b]); }
      return out;
    }
    return out;
  })();

  // ---- Words ---------------------------------------------------------------------------------------------------
  const instruction: string | null = (() => {
    if (!mode) return null;
    const n = closureSize(closure);
    if (mode === 'project-3d') {
      if (!supportFrame) return 'Open the sketch from 3D Design so the plane is known.';
      return projKind === 'edge' ? 'Click an edge of the model (dotted) — it is projected onto this sketch plane as yellow reference geometry.'
        : projKind === 'face' ? 'Click inside a flat face of the model — its outline is projected onto this plane.'
        : 'Click a corner point of the model — it is projected onto this plane.';
    }
    if (stage === 'entities') {
      const base = mode === 'offset-2d' ? 'Click the line, arc, circle or curve to offset (a connected chain is picked together).' : `Click the elements to ${mode === 'mirror-2d' ? 'mirror' : mode === 'translate-2d' ? 'move' : 'rotate'}, or select them first with the Select tool.`;
      return n || offChains.length ? `${base} ${mode === 'translate-2d' || mode === 'rotate-2d' ? 'Click empty canvas, press Enter or Continue to go on.' : 'Press Enter or Continue to go on.'}` : base;
    }
    if (mode === 'mirror-2d') return `${n} element${n === 1 ? '' : 's'} selected — click the line or axis to mirror about.`;
    if (mode === 'translate-2d') return vecFrom ? 'Click the end of the movement — or type X/Y (or distance and angle) and press Apply.' : 'Click a start point and then an end point, or type the movement below and press Apply.';
    if (mode === 'rotate-2d') return vecFrom ? (rotFollow ? 'Move the cursor to set the angle and click — or type an angle below and press Apply.' : 'Press Apply (or Enter) to rotate by the typed angle.') : 'Click the centre of rotation (a point, or anywhere).';
    return offChains.length ? 'Click on the side to offset to — or switch on Both sides, then click anywhere.' : 'Click the element to offset.';
  })();

  // Which entities are projected reference geometry (yellow, locked), and which of those lost their source.
  const projectedSets = useMemo(() => {
    const recs = constraints.filter((k) => k.type === 'projection');
    const ids = new Set<string>(), lost = new Set<string>();
    if (recs.length === 0) return { ids, lost };
    for (const k of recs) {
      const a = k.args as unknown as ProjArgs;
      for (const p of points) if (p.id.startsWith(a.prefix)) { ids.add(p.id); if (a.status === 'lost') lost.add(p.id); }
      for (const l of lines) if (l.id.startsWith(a.prefix)) { ids.add(l.id); if (a.status === 'lost') lost.add(l.id); }
    }
    return { ids, lost };
  }, [points, lines, constraints]);

  return {
    modProjectedIds: projectedSets.ids, modLostIds: projectedSets.lost,
    modMode: mode, modStage: stage, modOpts: {
      mirrorAssoc, setMirrorAssoc,
      trMode, setTrMode, trDx, setTrDx, trDy, setTrDy, trDist, setTrDist, trAng, setTrAng, trKeep, setTrKeep, trCount, setTrCount,
      rotAngle, setRotAngle, rotKeep, setRotKeep, rotCount, setRotCount, rotFollow, setRotFollow,
      offDist, setOffDist, offCorner, setOffCorner, offBoth, setOffBoth, offProp, setOffProp, offLink, setOffLink,
      projKind, setProjKind,
    },
    modVecFrom: vecFrom, modSetVecFrom: setVecFrom, modCentre: vecFrom,
    modLiveAngle: (() => { const p = vecFrom && rotFollow ? livePhi() : null; return p === null ? null : phiToCcw(p); })(),
    modOffChains: offChains, modGroups: groups, modSetGroupDistance: setGroupDistance, modSetGroupCorner: setGroupCorner, modUnlinkGroup: unlinkGroup, modGroupOf: groupOf,
    modPreview: preview, modInstruction: instruction, modNote: note, modHasSelection: hasSel || offChains.length > 0, modSelectionCount: closureSize(closure),
    modHandleClick: handleClick, modApply: apply, modContinue: goToReference, modBack: backToPicking,
    modProjection: { available: !!supportFrame && !!getModelGeometry, hasModel: !!model && (model.edges.length + model.vertices.length) > 0 },
  };
}

export type ModifyTools = ReturnType<typeof useModifyTools>;
export { GROUP_TYPES };
