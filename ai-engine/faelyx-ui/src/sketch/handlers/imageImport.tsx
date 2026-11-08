// Sketch & 2D: "Image to Sketch" — the state behind the AI IMPORT dialog and the locked reference-image layer,
// and the merge of a traced fit into the live sketch (one undoable step, removable with "Undo import").
// A hook built on useSketchCore's state (assembled in handlers/index.ts).
import { useState } from 'react';
import type { Arc, Circ, Constraint, ImportSummary, Ln, Pt, SketchCurve } from '../types';
import type { SketchCore } from '../useSketchCore';
import type { Fit } from '../imageTrace';
import type { ViewAndAnnotations } from './viewAndAnnotations';

/** The source picture, kept on a locked reference layer under the sketch (never selectable, never extruded). */
export type RefImage = {
  src: string; name: string;
  /** Top-left corner and size in sketch units (mm). */
  x: number; y: number; w: number; h: number;
  opacity: number; visible: boolean;
};

export function useImageImport(core: SketchCore, prev: ViewAndAnnotations) {
  const {
    arcs, circles, constraints, curves, lines, nextId, plane, points, setArcs, setCircles, setConstraints, setCurves, setDof, setLines, setPoints, setSelected, setStatus, setError, solve,
  } = core;
  const { importSummary, setImportSummary } = prev;
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  // One reference image per sketch plane.
  const [refImages, setRefImages] = useState<Record<string, RefImage | undefined>>({});
  const refImage = refImages[plane] ?? null;
  const updateRefImage = (patch: Partial<RefImage>) => setRefImages((m) => (m[plane] ? { ...m, [plane]: { ...m[plane]!, ...patch } } : m));
  const setRefImage = (r: RefImage | null) => setRefImages((m) => ({ ...m, [plane]: r ?? undefined }));

  /** Adds a traced fit (already in sketch units) to the sketch: every id is re-minted so nothing can collide. */
  const importTracedSketch = (fit: Fit, notes: string, ref: RefImage | null) => {
    const ids = new Map<string, string>();
    const newPoints: Pt[] = fit.points.map((p) => { const id = nextId('pt'); ids.set(p.id, id); return { id, x: p.x, y: p.y }; });
    const newLines: Ln[] = fit.lines.map((l) => { const id = nextId('ln'); ids.set(l.id, id); return { id, p1: ids.get(l.p1) ?? l.p1, p2: ids.get(l.p2) ?? l.p2 }; });
    const newCircles: Circ[] = fit.circles.map((c) => { const id = nextId('cir'); ids.set(c.id, id); return { id, center: ids.get(c.center) ?? c.center, r: c.r }; });
    const newArcs: Arc[] = fit.arcs.map((a) => { const id = nextId('arc'); ids.set(a.id, id); return { id, center: ids.get(a.center) ?? a.center, r: a.r, start: a.start, end: a.end, p1: ids.get(a.p1) ?? a.p1, p2: ids.get(a.p2) ?? a.p2 }; });
    const newCurves: SketchCurve[] = fit.splines.map((s) => { const id = nextId('cv'); ids.set(s.id, id); return { id, kind: 'spline' as const, controlIds: s.controlIds.map((c) => ids.get(c) ?? c) }; });
    const remap = (v: unknown): unknown => (typeof v === 'string' ? (ids.get(v) ?? v) : v);
    const newConstraints: Constraint[] = fit.constraints.map((c) => {
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(c.args)) args[k] = remap(v);
      return { id: nextId('c'), type: c.type, args, label: c.label.replace(/\b[A-Za-z]+\d+\b/g, (m) => ids.get(m) ?? m) };
    });
    const nextPoints = [...points, ...newPoints];
    const nextLines = [...lines, ...newLines];
    const nextCircles = [...circles, ...newCircles];
    const nextArcs = [...arcs, ...newArcs];
    const nextCurves = [...curves, ...newCurves];
    const nextConstraints = [...constraints, ...newConstraints];
    setPoints(nextPoints); setLines(nextLines); setCircles(nextCircles); setArcs(nextArcs); setCurves(nextCurves); setConstraints(nextConstraints);
    setSelected([]);
    if (ref) setRefImage(ref);
    setImportSummary({
      notes, aiUsed: false,
      counts: { points: newPoints.length, lines: newLines.length, circles: newCircles.length, arcs: newArcs.length, curves: newCurves.length },
      pointIds: newPoints.map((p) => p.id), lineIds: newLines.map((l) => l.id), circleIds: newCircles.map((c) => c.id),
      arcIds: newArcs.map((a) => a.id), curveIds: newCurves.map((c) => c.id),
      constraintIds: newConstraints.map((c) => c.id), suggestedDimensions: [],
    });
    setStatus('Imported from image');
    void solve(nextPoints, nextLines, nextCircles, nextConstraints);
  };

  /** Removes exactly what the last import added (arcs and splines included) and nothing the user drew since. */
  const undoImport = () => {
    const s: ImportSummary | null = importSummary;
    if (!s) return;
    const gone = new Set([...s.pointIds, ...s.lineIds, ...s.circleIds, ...(s.arcIds ?? []), ...(s.curveIds ?? [])]);
    const hit = (c: Constraint) => s.constraintIds.includes(c.id) || Object.values(c.args).some((v) => typeof v === 'string' && gone.has(v));
    const nextPoints = points.filter((p) => !gone.has(p.id));
    const nextLines = lines.filter((l) => !gone.has(l.id));
    const nextCircles = circles.filter((c) => !gone.has(c.id));
    const nextArcs = arcs.filter((a) => !gone.has(a.id));
    const nextCurves = curves.filter((c) => !gone.has(c.id));
    const nextConstraints = constraints.filter((c) => !hit(c));
    setPoints(nextPoints); setLines(nextLines); setCircles(nextCircles); setArcs(nextArcs); setCurves(nextCurves); setConstraints(nextConstraints);
    setSelected([]); setImportSummary(null);
    if (!nextPoints.length && !nextLines.length && !nextCircles.length && !nextArcs.length && !nextCurves.length) { setDof(null); setStatus('Empty sketch'); setError(null); }
    else void solve(nextPoints, nextLines, nextCircles, nextConstraints);
  };

  return { imageDialogOpen, setImageDialogOpen, refImage, refImages, setRefImage, updateRefImage, importTracedSketch, undoImport };
}

export type ImageImport = ReturnType<typeof useImageImport>;
