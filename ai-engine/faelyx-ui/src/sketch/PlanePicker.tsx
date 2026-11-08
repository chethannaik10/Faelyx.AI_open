// The sketch tree's small building blocks and the "pick a plane" screen
// (with its isometric plane cube preview).

import { Square, X } from 'lucide-react';
import type { IconType, Plane, SketchProjectData } from './types';
import { SKETCH_ORIGIN_SVG } from '../config';
import { PLANE_COLORS } from './constants';
import { catmullRom, sampleConicFrom5Points, sampleConicRho, sampleCvSpline, sampleEllipse, sampleHyperbola, sampleParabola } from './curves';

export function PanelHeaderLite({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="panel-header"><div><div className="eyebrow">{eyebrow}</div><strong>{title}</strong></div>{action}</div>;
}

export function TreeRowLite({ icon: Icon, label, depth = 0, muted = false }: { icon: IconType; label: string; depth?: number; muted?: boolean }) {
  return <div className={`tree-row ${muted ? 'muted' : ''}`} style={{ paddingLeft: `${10 + depth * 14}px` }}>
    <Icon size={13} /><span>{label}</span>
  </div>;
}

// "Pick a plane before you sketch" — shown fresh every new sketch (see
// clearSketch) and reopenable any time from the viewport topline's small
// square icon. Renders the three reference planes as an actual isometric
// wireframe (three perpendicular squares meeting at the origin, standard
// engineering-drawing convention), each one carrying a live thumbnail of
// whatever's really been sketched on it — not three flat colored divs —
// so picking a plane means picking a real one relative to your other work,
// not a decorative icon.
const PLANES: { id: Plane; label: string; hint: string }[] = [
  { id: 'Top', label: 'Top Plane', hint: 'XY — looking down the Z axis' },
  { id: 'Front', label: 'Front Plane', hint: 'XZ — looking down the Y axis' },
  { id: 'Right', label: 'Right Plane', hint: 'YZ — looking down the X axis' },
];

// One sketch's worth of geometry per plane, so the picker can draw what's
// really on each one — the currently-active plane's live state plus
// whatever's cached in sketchesRef for the other two (see SketchWorkspace's
// render, where this is assembled).
type PlaneGeometry = Partial<Record<Plane, SketchProjectData>>;

// Standard engineering isometric projection — X to the lower-right, Y to
// the lower-left, Z straight up — the same convention behind every "three
// planes meeting at a corner" reference-geometry drawing.
const ISO_COS30 = Math.cos(Math.PI / 6), ISO_SIN30 = Math.sin(Math.PI / 6);
// A true isometric's own diamond is naturally wider than tall (the Top
// plane's corners swing out to +-2*cos30 on X but only +-1*sin30 - z on Y,
// ~1.13 bounding-box aspect unscaled), which reads as a flat, stretched
// oval in a small picker widget rather than a balanced "three planes
// meeting at a corner" cluster. These two factors (applied only to the
// final screen projection below — the underlying frame/entity/axis math
// everything else uses is untouched) pull the box in on both axes at
// once, landing it at a "proper square" ~1.14 aspect: noticeably tighter
// than the original oval, but a touch wider than tall rather than a
// perfect 1:1, which on its own read as slightly too narrow/cramped for
// this widget.
const ISO_H_SCALE = 0.92;
const ISO_V_SCALE = 0.9;
const isoProject = (x: number, y: number, z: number) => ({
  x: (x - y) * ISO_COS30 * ISO_H_SCALE,
  y: ((x + y) * ISO_SIN30 - z) * ISO_V_SCALE,
});
// Where each plane's sketch (h right, v up — the axes the sketch canvas
// shows) sits in the shared 3D space.
const PLANE_EMBED: Record<Plane, (h: number, v: number) => [number, number, number]> = {
  Front: (h, v) => [h, 0, v],
  Top: (h, v) => [h, v, 0],
  Right: (h, v) => [0, h, v],
};
const PLANE_UNIT_CORNERS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const PLANE_FILL: Record<Plane, string> = PLANE_COLORS;

type XY = { x: number; y: number };
// Every entity of a sketch as canvas-space polylines (circles, arcs and
// curves sampled), so they project exactly onto any plane.
function sketchPolylines(data: SketchProjectData): XY[][] {
  const byId = new Map(data.points.map((p) => [p.id, p]));
  const at = (id: string) => byId.get(id);
  const out: XY[][] = [];
  for (const l of data.lines) { const a = at(l.p1), b = at(l.p2); if (a && b) out.push([a, b]); }
  const ring = (c: XY, r: number, start: number, sweep: number) => Array.from({ length: 49 }, (_, i) => {
    const t = ((start + (sweep * i) / 48) * Math.PI) / 180;
    return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
  });
  for (const c of data.circles) { const o = at(c.center); if (o) out.push(ring(o, c.r, 0, 360)); }
  for (const a of data.arcs ?? []) { const o = at(a.center); if (o) out.push(ring(o, a.r, a.start, ((a.end - a.start) % 360 + 360) % 360 || 360)); }
  for (const cv of data.curves ?? []) {
    const pts = (ids: string[]) => ids.map(at).filter((p): p is XY & { id: string } => !!p);
    let poly: XY[] = [];
    if (cv.kind === 'ellipse') { const o = at(cv.center); if (o) poly = sampleEllipse(o.x, o.y, cv.rx, cv.ry, cv.rot, 56, cv.start, cv.end); }
    else if (cv.kind === 'parabola') { const f = at(cv.focus), v = at(cv.vertex); if (f && v) poly = sampleParabola(f, v, cv.span); }
    else if (cv.kind === 'hyperbola') { const o = at(cv.center), f = at(cv.focus), v = at(cv.vertex); if (o && f && v) poly = sampleHyperbola(o, f, v); }
    else if (cv.kind === 'spline') poly = catmullRom(pts(cv.controlIds));
    else if (cv.kind === 'spline-cv') poly = sampleCvSpline(pts(cv.controlIds));
    else if (cv.kind === 'conic') poly = sampleConicFrom5Points(pts(cv.ptIds));
    else { const p0 = at(cv.p0), pa = at(cv.papex), p2 = at(cv.p2); if (p0 && pa && p2) poly = sampleConicRho(p0, pa, p2, cv.rho); }
    if (poly.length > 1) out.push(poly);
  }
  return out;
}

export function IsoPlaneCube({ current, onChoose, geometry }: { current: Plane; onChoose: (p: Plane) => void; geometry: PlaneGeometry }) {
  const project = (plane: Plane, h: number, v: number) => {
    const [x, y, z] = PLANE_EMBED[plane](h, v);
    return isoProject(x, y, z);
  };
  const frame = (plane: Plane) => PLANE_UNIT_CORNERS.map(([h, v]) => project(plane, h, v));

  // Each sketch is drawn where it really is relative to the sketch origin
  // and its H/V axes, at one scale shared by all three planes (fitted so
  // the farthest element on any plane still lands inside its frame) — not
  // re-centred or zoomed per plane.
  const O = SKETCH_ORIGIN_SVG;
  const planesDrawn = (['Top', 'Right', 'Front'] as Plane[]).map((plane) => ({ plane, polys: geometry[plane] ? sketchPolylines(geometry[plane]!) : [] }));
  const reach = Math.max(1, ...planesDrawn.flatMap(({ polys }) => polys.flat().map((p) => Math.max(Math.abs(p.x - O.x), Math.abs(p.y - O.y)))));
  const scale = 0.9 / reach;
  const entitiesFor = (plane: Plane) => (planesDrawn.find((d) => d.plane === plane)?.polys ?? [])
    .map((poly) => poly.map((p) => project(plane, (p.x - O.x) * scale, (O.y - p.y) * scale)));

  // Fit the SVG's own viewBox to whatever's actually drawn (three unit
  // frames plus a short axis triad) instead of a guessed constant, so the
  // widget never clips no matter how the projection numbers above change.
  const allPts = (['Top', 'Right', 'Front'] as Plane[]).flatMap((p) => frame(p));
  allPts.push(isoProject(1.5, 0, 0), isoProject(0, 1.5, 0), isoProject(0, 0, 1.5));
  const pad = 0.35;
  const minX = Math.min(...allPts.map((p) => p.x)) - pad, maxX = Math.max(...allPts.map((p) => p.x)) + pad;
  const minY = Math.min(...allPts.map((p) => p.y)) - pad, maxY = Math.max(...allPts.map((p) => p.y)) + pad;

  const renderPlane = (plane: Plane) => {
    const corners = frame(plane);
    const d = `${corners.map((c) => `${c.x},${c.y}`).join(' ')}`;
    const polys = entitiesFor(plane);
    const active = current === plane;
    const meta = PLANES.find((p) => p.id === plane)!;
    return (
      <g key={plane} className={`iso-plane ${active ? 'iso-plane-active' : ''}`} data-plane={plane}
        onClick={() => onChoose(plane)}
        // Keyboard: Tab reaches each plane, Enter/Space picks it, arrow keys
        // move between the three (the cards below work as before).
        tabIndex={0} role="button" aria-pressed={active} aria-label={`Sketch on the ${meta.label} (${meta.hint})`}
        onKeyDown={(evt) => {
          if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); onChoose(plane); return; }
          const step = evt.key === 'ArrowRight' || evt.key === 'ArrowDown' ? 1 : evt.key === 'ArrowLeft' || evt.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          evt.preventDefault();
          const order: Plane[] = ['Top', 'Front', 'Right'];
          const next = order[(order.indexOf(plane) + step + order.length) % order.length];
          (evt.currentTarget.ownerSVGElement?.querySelector(`[data-plane="${next}"]`) as SVGGElement | null)?.focus();
        }}>
        <title>{meta.label} — {meta.hint}</title>
        <polygon points={d} style={{ fill: PLANE_FILL[plane] }} className="iso-plane-face" />
        {polys.map((poly, i) => <polyline key={i} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} className="iso-plane-entity" fill="none" />)}
        <polygon points={d} style={{ stroke: PLANE_FILL[plane], color: PLANE_FILL[plane] }} className="iso-plane-outline" />
      </g>
    );
  };

  const axis = (dir: [number, number, number], label: string, color: string) => {
    const tip = isoProject(dir[0] * 1.45, dir[1] * 1.45, dir[2] * 1.45);
    return (
      <g key={label} className="iso-axis">
        <line x1={0} y1={0} x2={tip.x} y2={tip.y} style={{ stroke: color }} />
        <text x={tip.x} y={tip.y} dx={tip.x >= 0 ? 0.12 : -0.12} dy={tip.y >= 0 ? 0.14 : -0.08} textAnchor={tip.x >= 0 ? 'start' : 'end'} style={{ fill: color }}>{label}</text>
      </g>
    );
  };

  return (
    // Sized by CSS (see .iso-plane-cube) to fill the picker; the aspect
    // ratio comes from the viewBox itself, so planes, axes, labels and every
    // hit area scale together — nothing is positioned in screen pixels.
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="iso-plane-cube"
      style={{ '--iso-aspect': String((maxX - minX) / (maxY - minY)) } as React.CSSProperties}>
      {renderPlane('Top')}
      {renderPlane('Right')}
      {renderPlane('Front')}
      {axis([1, 0, 0], 'X', '#ed727d')}
      {axis([0, 1, 0], 'Y', '#70ce9e')}
      {axis([0, 0, 1], 'Z', '#6e9bff')}
    </svg>
  );
}

export function PlanePicker({ current, onChoose, onClose, geometry }: { current: Plane; onChoose: (p: Plane) => void; onClose: () => void; geometry: PlaneGeometry }) {
  return (
    <div className="plane-picker" onClick={(evt) => evt.stopPropagation()}>
      <button className="plane-picker-close" onClick={onClose} aria-label="Close"><X size={13} /></button>
      <div className="plane-picker-eyebrow"><Square size={11} /> START SKETCH</div>
      <h2>Select a plane to sketch on</h2>
      <p>Click a plane below, or one of the three planes in the Model Tree.</p>
      <div className="plane-cube-wrap">
        <IsoPlaneCube current={current} onChoose={onChoose} geometry={geometry} />
      </div>
      <div className="plane-picker-list">
        {PLANES.map((p) => (
          <button key={p.id} className={`plane-picker-row ${current === p.id ? 'plane-picker-row-active' : ''}`} onClick={() => onChoose(p.id)}>
            <span className={`plane-swatch plane-swatch-${p.id.toLowerCase()}`} style={{ background: PLANE_COLORS[p.id] }} />
            <span><strong>{p.label}</strong><small>{p.hint}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}
