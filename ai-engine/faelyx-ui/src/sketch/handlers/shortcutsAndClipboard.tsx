// Sketch & 2D: the standard editing keys (Ctrl/Cmd + Z, Y, Shift+Z, X, C, V,
// A), cut/copy/paste of sketch geometry, and in-place editing of a
// constraint's value from the Inspector.
// A hook built on useSketchCore's state (assembled in handlers/index.ts).
import { useEffect, useRef } from 'react';
import type { Pt, Ln, Circ, Arc, Constraint, Dimension, SketchCurve } from '../types';
import type { SketchCore } from '../useSketchCore';
import type { ViewAndAnnotations } from './viewAndAnnotations';

// What Ctrl+C / Ctrl+X keep: the copied entities, every point they're built
// on, and the constraints and dimensions that only involve those.
type Clip = { points: Pt[]; lines: Ln[]; circles: Circ[]; arcs: Arc[]; curves: SketchCurve[]; constraints: Constraint[]; dimensions: Dimension[]; select: string[] };

// Each paste lands this far (sketch units) right of and above the last one.
const PASTE_STEP = 10;

const remapCurve = (cv: SketchCurve, m: (id: string) => string): SketchCurve => {
  switch (cv.kind) {
    case 'ellipse': return { ...cv, center: m(cv.center) };
    case 'parabola': return { ...cv, focus: m(cv.focus), vertex: m(cv.vertex) };
    case 'hyperbola': return { ...cv, center: m(cv.center), focus: m(cv.focus), vertex: m(cv.vertex) };
    case 'spline': case 'spline-cv': return { ...cv, controlIds: cv.controlIds.map(m) };
    case 'conic': return { ...cv, ptIds: cv.ptIds.map(m) };
    case 'conic-rp': return { ...cv, p0: m(cv.p0), papex: m(cv.papex), p2: m(cv.p2) };
  }
};

export function useShortcutsAndClipboard(core: SketchCore, prev: ViewAndAnnotations) {
  const {
    arcs, circles, constraints, curveDefiningIds, curves, deleteIds, dimensions, hidden, toU, lines, nextId, points, redo, resetToolState, selected, setArcs, setCircles, setConstraints, setCurves, setDimensions, setError, setLines, setPoints, setSelected, setTool, solve, undo,
  } = core;
  const { lenNum, uLabel } = prev;
  const clipRef = useRef<{ clip: Clip; pastes: number } | null>(null);

  const copySelection = (): Clip | null => {
    const ids = new Set(selected);
    const pick = <T extends { id: string }>(list: T[]) => list.filter((e) => ids.has(e.id));
    const cLines = pick(lines), cCircles = pick(circles), cArcs = pick(arcs), cCurves = pick(curves);
    const ptIds = new Set(points.filter((p) => ids.has(p.id)).map((p) => p.id));
    cLines.forEach((l) => { ptIds.add(l.p1); ptIds.add(l.p2); });
    cCircles.forEach((c) => ptIds.add(c.center));
    cArcs.forEach((a) => { ptIds.add(a.center); if (a.p1) ptIds.add(a.p1); if (a.p2) ptIds.add(a.p2); });
    cCurves.forEach((cv) => curveDefiningIds(cv).forEach((id) => ptIds.add(id)));
    const cPoints = points.filter((p) => ptIds.has(p.id));
    if (cPoints.length === 0) return null;
    const inside = new Set([...ptIds, ...cLines.map((l) => l.id), ...cCircles.map((c) => c.id), ...cArcs.map((a) => a.id), ...cCurves.map((cv) => cv.id)]);
    const cConstraints = constraints.filter((c) => {
      const refs = Object.values(c.args).filter((v): v is string => typeof v === 'string');
      return refs.length > 0 && refs.every((r) => inside.has(r));
    });
    const cDims = dimensions.filter((d) => [d.entityId, d.entityIdA, d.entityIdB].every((r) => r === undefined || inside.has(r)));
    return { points: cPoints, lines: cLines, circles: cCircles, arcs: cArcs, curves: cCurves, constraints: cConstraints, dimensions: cDims, select: selected.filter((id) => inside.has(id)) };
  };

  const copy = () => {
    const clip = copySelection();
    if (clip) clipRef.current = { clip, pastes: 1 };
    return clip;
  };
  // Cut: the first paste goes back exactly where the geometry was.
  const cut = () => {
    const clip = copySelection();
    if (!clip) return;
    clipRef.current = { clip, pastes: 0 };
    deleteIds(clip.select);
  };

  // Pastes a fresh copy (new ids), offset from the original, and selects it
  // so it can be dragged into place or edited straight away.
  const paste = () => {
    const held = clipRef.current;
    if (!held) return;
    const { clip } = held;
    const d = held.pastes * PASTE_STEP;
    held.pastes += 1;
    const ids = new Map<string, string>();
    const m = (id: string) => ids.get(id) ?? id;
    const nPoints = clip.points.map((p) => { const id = nextId('pt'); ids.set(p.id, id); return { id, x: p.x + d, y: p.y - d }; });
    const nLines = clip.lines.map((l) => { const id = nextId('ln'); ids.set(l.id, id); return { ...l, id, p1: m(l.p1), p2: m(l.p2) }; });
    const nCircles = clip.circles.map((c) => { const id = nextId('cir'); ids.set(c.id, id); return { ...c, id, center: m(c.center) }; });
    const nArcs = clip.arcs.map((a) => { const id = nextId('arc'); ids.set(a.id, id); return { ...a, id, center: m(a.center), p1: a.p1 && m(a.p1), p2: a.p2 && m(a.p2) }; });
    const nCurves = clip.curves.map((cv) => { const id = nextId('cv'); ids.set(cv.id, id); return { ...remapCurve(cv, m), id }; });
    const nConstraints = clip.constraints.map((c) => {
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(c.args)) args[k] = typeof v === 'string' ? m(v) : v;
      if (c.type === 'fixed') { args.x = Number(args.x) + d; args.y = Number(args.y) - d; }
      const label = Object.entries(c.args).reduce((s, [, v]) => (typeof v === 'string' ? s.split(v).join(m(v)) : s), c.label);
      return { ...c, id: nextId('c'), args, label };
    });
    const nDims = clip.dimensions.map((dm) => ({ ...dm, id: nextId('dim'), entityId: dm.entityId && m(dm.entityId), entityIdA: dm.entityIdA && m(dm.entityIdA), entityIdB: dm.entityIdB && m(dm.entityIdB) }));
    const allPoints = [...points, ...nPoints], allLines = [...lines, ...nLines], allCircles = [...circles, ...nCircles], allConstraints = [...constraints, ...nConstraints];
    resetToolState();
    setTool('select');
    setPoints(allPoints); setLines(allLines); setCircles(allCircles); setArcs([...arcs, ...nArcs]); setCurves([...curves, ...nCurves]);
    setConstraints(allConstraints); setDimensions([...dimensions, ...nDims]);
    setSelected(clip.select.map(m));
    void solve(allPoints, allLines, allCircles, allConstraints);
  };

  const selectAll = () => {
    resetToolState();
    setTool('select');
    setSelected([...lines.map((l) => l.id), ...circles.map((c) => c.id), ...arcs.map((a) => a.id), ...curves.map((cv) => cv.id), ...points.map((p) => p.id)]);
  };

  // A constraint's number (a Distance, Radius or Angle — a chamfer's angle,
  // a rectangle's side), typed in the Inspector: the sketch re-solves to it.
  // An angle is stored the solver's way (line1's direction to line2's,
  // folded to [0, 180)) but labelled as the angle you see — for a chamfer
  // that's often the supplement. The Inspector shows and takes the one you see.
  const shownAngle = (c: Constraint) => { const m = /=\s*([\d.]+)°\s*$/.exec(c.label); return m ? Number(m[1]) : Number(c.args.value); };
  const isSupplement = (c: Constraint) => { const s = shownAngle(c), v = Number(c.args.value); return Math.abs(s - v) > 0.2 && Math.abs(s + v - 180) < 0.2; };
  const setConstraintValue = (id: string, raw: string) => {
    const c = constraints.find((k) => k.id === id);
    if (!c || !('value' in c.args)) return;
    const isAngle = c.type === 'angle';
    const value = isAngle ? Number(raw) : lenNum(raw);
    if (!Number.isFinite(value) || value <= 0 || (isAngle && value >= 180)) {
      setError(isAngle ? 'An angle must be more than 0° and less than 180°.' : `Enter a length greater than 0 ${uLabel}.`);
      return;
    }
    const shown = isAngle ? `${value.toFixed(1)}°` : `${value.toFixed(2)}mm`;
    const stored = isAngle && isSupplement(c) ? 180 - value : value;
    const next = constraints.map((k) => (k.id === id ? { ...k, args: { ...k.args, value: stored }, label: k.label.replace(/=\s*[^=]*$/, `= ${shown}`) } : k));
    setError(null);
    setConstraints(next);
    void solve(points, lines, circles, next);
  };
  const constraintValueText = (c: Constraint) => {
    const v = Number(c.args.value);
    return c.type === 'angle' ? shownAngle(c).toFixed(1) : toU(v).toFixed(2);
  };

  // Keys work whatever tool is active; inside a text field they keep their
  // normal text meaning (undo typing, paste a number…).
  const keyRef = useRef<(evt: KeyboardEvent) => void>(() => {});
  keyRef.current = (evt: KeyboardEvent) => {
    if (hidden || !(evt.ctrlKey || evt.metaKey) || evt.altKey) return;
    const el = document.activeElement as HTMLElement | null;
    const tag = (el?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
    const key = evt.key.toLowerCase();
    if (key === 'z' && !evt.shiftKey) { evt.preventDefault(); undo(); }
    else if (key === 'y' || (key === 'z' && evt.shiftKey)) { evt.preventDefault(); redo(); }
    else if (key === 'c') { if (selected.length) { evt.preventDefault(); copy(); } }
    else if (key === 'x') { if (selected.length) { evt.preventDefault(); cut(); } }
    else if (key === 'v') { if (clipRef.current) { evt.preventDefault(); paste(); } }
    else if (key === 'a') { evt.preventDefault(); selectAll(); }
  };
  useEffect(() => {
    const onKey = (evt: KeyboardEvent) => keyRef.current(evt);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { copy, cut, paste, selectAll, setConstraintValue, constraintValueText };
}

export type ShortcutsAndClipboard = ReturnType<typeof useShortcutsAndClipboard>;
