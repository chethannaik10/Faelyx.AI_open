// Sketch & 2D: the "Image to Sketch" dialog (SKETCH TOOLBOX > AI IMPORT > Image to Sketch).
// Load a PNG / JPG / SVG, orient and crop it, calibrate its scale, trace it into lines, arcs, circles or splines
// (optionally with constraints), and drop the result on the active sketch plane over a locked reference layer.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Brush, Crop, Eye, FlipHorizontal2, FlipVertical2, ImagePlus, Layers, Loader2, RotateCcw, RotateCw, Ruler, Sparkles, TriangleAlert, Wand2, X } from 'lucide-react';
import { API_BASE } from '../../config';
import type { SketchUI } from '../handlers';
import type { RefImage } from '../handlers/imageImport';
import {
  brushPaths, fitBounds, fitPaths, toGray, traceImage, transformFit,
  type BrushStroke, type Fit, type FitOpts, type Raster, type TraceResult,
} from '../imageTrace';

type Tool = 'crop' | 'calib' | 'brush';
type View = 'image' | 'mask' | 'trace';
type Rect = { x: number; y: number; w: number; h: number };
type Line2 = { x0: number; y0: number; x1: number; y1: number };

type Cfg = {
  rot90: number; flipH: boolean; flipV: boolean; straighten: number;
  mode: 'outline' | 'geometric'; output: 'lines_arcs' | 'splines' | 'polylines'; kind: 'auto' | 'shape' | 'line';
  polarity: 'auto' | 'dark' | 'light'; autoThr: boolean; thr: number; adaptive: boolean;
  blur: number; tol: number; minArea: number; cornerDeg: number; hvDeg: number; simplify: number;
  cons: FitOpts['cons'];
  scaleSrc: 'width' | 'height' | 'calib' | 'mmpx'; scaleVal: number;
  centerGeom: boolean; offX: number; offY: number;
  keepRef: boolean; refOpacity: number; brushR: number;
};

const CFG0: Cfg = {
  rot90: 0, flipH: false, flipV: false, straighten: 0,
  mode: 'geometric', output: 'lines_arcs', kind: 'auto',
  polarity: 'auto', autoThr: true, thr: 128, adaptive: false,
  blur: 1, tol: 1.5, minArea: 12, cornerDeg: 35, hvDeg: 3, simplify: 0,
  cons: { hv: true, parallelPerp: true, equal: true, tangent: true, symmetric: true, dims: false, fix: false },
  scaleSrc: 'width', scaleVal: 100, centerGeom: true, offX: 0, offY: 0,
  keepRef: true, refOpacity: 0.4, brushR: 14,
};

const MAX_DIM = 900; // working resolution of the tracer (longest side, pixels)

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = window.setTimeout(() => setD(v), ms); return () => window.clearTimeout(t); }, [v, ms]);
  return d;
}

const readAsDataUrl = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

/** Loads PNG / JPG / SVG (or anything the browser can draw). An SVG without a size gets one from its viewBox. */
async function loadPicture(f: Blob, name: string): Promise<{ img: HTMLImageElement; vector: boolean }> {
  const isSvg = f.type === 'image/svg+xml' || /\.svg$/i.test(name);
  let url: string;
  if (isSvg) {
    let text = await f.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('That SVG could not be read.');
    const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
    const num = (a: string | null) => { const m = /^([\d.]+)\s*(px)?$/.exec((a ?? '').trim()); return m ? Number(m[1]) : NaN; };
    let w = num(root.getAttribute('width')); let h = num(root.getAttribute('height'));
    if (!(w > 0) || !(h > 0)) { if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; } else { w = 1024; h = 1024; } }
    const k = MAX_DIM / Math.max(w, h);
    root.setAttribute('width', String(Math.round(w * k))); root.setAttribute('height', String(Math.round(h * k)));
    if (vb.length !== 4) root.setAttribute('viewBox', `0 0 ${w} ${h}`);
    text = new XMLSerializer().serializeToString(root);
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  } else url = await readAsDataUrl(f);
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('That file could not be opened as an image.')); img.src = url; });
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('The image has no size.');
  return { img, vector: isSvg };
}

/** The picture after rotate / flip / straighten, on a white sheet, at working resolution. */
function buildBase(img: HTMLImageElement, vector: boolean, c: Pick<Cfg, 'rot90' | 'flipH' | 'flipV' | 'straighten'>): HTMLCanvasElement {
  const nw = img.naturalWidth; const nh = img.naturalHeight;
  const k = vector ? MAX_DIM / Math.max(nw, nh) : Math.min(1, MAX_DIM / Math.max(nw, nh));
  const sw = nw * k; const sh = nh * k;
  const a = ((c.rot90 * 90 + c.straighten) * Math.PI) / 180;
  const W = Math.max(8, Math.round(Math.abs(sw * Math.cos(a)) + Math.abs(sh * Math.sin(a))));
  const H = Math.max(8, Math.round(Math.abs(sw * Math.sin(a)) + Math.abs(sh * Math.cos(a))));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2); g.rotate(a); g.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  return cv;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Catmull-Rom through spline control points (the same curve the sketch draws), for the preview only. */
function catmull(pts: { x: number; y: number }[], per = 8): [number, number][] {
  const out: [number, number][] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per; const t2 = t * t; const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      ]);
    }
  }
  out.push([pts[n - 1].x, pts[n - 1].y]);
  return out;
}

function NumberRow({ label, value, min, max, step, onChange, unit, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string; hint?: string }) {
  return (
    <label className="i2s-row" title={hint}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <em>{Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)}{unit ?? ''}</em>
    </label>
  );
}

export function ImageToSketchDialog({ core }: { core: SketchUI }) {
  const { imageDialogOpen, setImageDialogOpen, importTracedSketch, refImage, updateRefImage, plane, SKETCH_ORIGIN, mergeImportedSketch, setImportError } = core;
  const open = imageDialogOpen;

  const [cfg, setCfgState] = useState<Cfg>(CFG0);
  const setCfg = (p: Partial<Cfg>) => setCfgState((c) => ({ ...c, ...p }));
  const [pic, setPic] = useState<{ img: HTMLImageElement; vector: boolean; name: string; file: Blob } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('crop');
  const [view, setViewMode] = useState<View>('trace');
  const [crop, setCrop] = useState<Rect | null>(null); // in base-image pixels; null = whole picture
  const [calib, setCalib] = useState<Line2 | null>(null); // in base-image pixels
  const [strokes, setStrokes] = useState<BrushStroke[]>([]); // in cropped-image pixels
  const [strokeMarks, setStrokeMarks] = useState<number[]>([]); // stroke counts at each completed drag (for "undo last")
  const [busy, setBusy] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [vp, setVp] = useState({ k: 1, tx: 0, ty: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 480 });
  const vpRef = useRef(vp); vpRef.current = vp;

  // ── the picture, oriented ────────────────────────────────────────────────
  const base = useMemo(() => (pic && open ? buildBase(pic.img, pic.vector, cfg) : null), [pic, open, cfg.rot90, cfg.flipH, cfg.flipV, cfg.straighten]); // eslint-disable-line react-hooks/exhaustive-deps
  const cropR: Rect | null = useMemo(() => {
    if (!base) return null;
    const r = crop ?? { x: 0, y: 0, w: base.width, h: base.height };
    const x = clamp(Math.round(r.x), 0, base.width - 4); const y = clamp(Math.round(r.y), 0, base.height - 4);
    return { x, y, w: clamp(Math.round(r.w), 4, base.width - x), h: clamp(Math.round(r.h), 4, base.height - y) };
  }, [base, crop]);

  const fitView = () => {
    if (!base) return;
    const k = Math.min(size.w / base.width, size.h / base.height) * 0.94;
    setVp({ k, tx: (size.w - base.width * k) / 2, ty: (size.h - base.height * k) / 2 });
  };
  // Re-fit the preview when a new picture, orientation or panel size arrives.
  useEffect(fitView, [base, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current; if (!el || !open) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(160, el.clientHeight) }));
    ro.observe(el); setSize({ w: Math.max(200, el.clientWidth), h: Math.max(160, el.clientHeight) });
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => { if (open) rootRef.current?.focus(); }, [open]);

  // ── tracing (debounced so sliders stay smooth) ──────────────────────────
  const job = useMemo(() => ({ base, cropR, cfg, strokes }), [base, cropR, cfg, strokes]);
  const dj = useDebounced(job, 220);
  const pending = job !== dj;

  const gray: Raster | null = useMemo(() => {
    if (!open || !dj.base || !dj.cropR) return null;
    const { x, y, w, h } = dj.cropR;
    const d = dj.base.getContext('2d')!.getImageData(x, y, w, h);
    return toGray(d.data, w, h);
  }, [open, dj.base, dj.cropR]);

  const dc = dj.cfg;
  const trace: { r: TraceResult | null; err: string | null } = useMemo(() => {
    if (!gray) return { r: null, err: null };
    try {
      return { r: traceImage(gray, { threshold: dc.autoThr ? null : dc.thr, adaptive: dc.adaptive, polarity: dc.polarity, blur: dc.blur, minArea: dc.minArea, kind: dc.kind }), err: null };
    } catch (e) { return { r: null, err: e instanceof Error ? e.message : String(e) }; }
  }, [gray, dc.autoThr, dc.thr, dc.adaptive, dc.polarity, dc.blur, dc.minArea, dc.kind]);

  const fit: { f: Fit | null; err: string | null } = useMemo(() => {
    if (!trace.r || !gray) return { f: null, err: trace.err };
    try {
      const simp = Math.pow(1.6, dc.simplify);
      const o: FitOpts = {
        mode: dc.mode, output: dc.output, tol: dc.tol * simp, cornerDeg: dc.cornerDeg, minLen: Math.max(4, 8 * simp), hvDeg: dc.hvDeg,
        cons: dc.cons, centered: dc.centerGeom, vAxis: '__vdir', hAxis: '__hdir',
      };
      return { f: fitPaths(brushPaths(trace.r.paths, dj.strokes), o, { w: gray.w, h: gray.h }), err: null };
    } catch (e) { return { f: null, err: e instanceof Error ? e.message : String(e) }; }
  }, [trace, gray, dc.mode, dc.output, dc.tol, dc.simplify, dc.cornerDeg, dc.hvDeg, dc.cons, dc.centerGeom, dj.strokes]);

  // ── scale + placement ───────────────────────────────────────────────────
  const bounds = useMemo(() => (fit.f ? fitBounds(fit.f) : null), [fit.f]);
  const calibPx = calib ? Math.hypot(calib.x1 - calib.x0, calib.y1 - calib.y0) : 0;
  const scale: number | null = useMemo(() => {
    let s: number | null = null;
    if (cfg.scaleSrc === 'mmpx') s = cfg.scaleVal;
    else if (cfg.scaleSrc === 'calib') s = calibPx > 2 ? cfg.scaleVal / calibPx : null;
    else if (bounds) { const px = cfg.scaleSrc === 'width' ? bounds.x1 - bounds.x0 : bounds.y1 - bounds.y0; s = px > 1 ? cfg.scaleVal / px : null; }
    return s !== null && Number.isFinite(s) && s > 0 ? s : null;
  }, [cfg.scaleSrc, cfg.scaleVal, calibPx, bounds]);

  const placed = useMemo(() => {
    if (!fit.f || !gray || scale === null) return null;
    const cx = cfg.centerGeom && bounds ? (bounds.x0 + bounds.x1) / 2 : gray.w / 2;
    const cy = cfg.centerGeom && bounds ? (bounds.y0 + bounds.y1) / 2 : gray.h / 2;
    const ox = SKETCH_ORIGIN.x + cfg.offX; const oy = SKETCH_ORIGIN.y - cfg.offY;
    const out = transformFit(fit.f, { s: scale, ox, oy, cx, cy });
    const ref = { x: ox - cx * scale, y: oy - cy * scale, w: gray.w * scale, h: gray.h * scale };
    return { fit: out, ref };
  }, [fit.f, gray, scale, bounds, cfg.centerGeom, cfg.offX, cfg.offY, SKETCH_ORIGIN.x, SKETCH_ORIGIN.y]);

  const f0 = fit.f;
  const nEnt = f0 ? f0.lines.length + f0.circles.length + f0.arcs.length + f0.splines.length : 0;
  const nCons = f0 ? f0.constraints.length : 0;
  const sizeMm = bounds && scale !== null ? { w: (bounds.x1 - bounds.x0) * scale, h: (bounds.y1 - bounds.y0) * scale } : null;
  const notes: string[] = [];
  if (trace.r?.frameDropped) notes.push('The image border was ignored.');
  if (f0?.warnings.length) notes.push(...f0.warnings);

  // ── preview drawing ─────────────────────────────────────────────────────
  const maskCanvas = useMemo(() => {
    if (!trace.r) return null;
    const m = trace.r.mask; const cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h;
    const g = cv.getContext('2d')!; const id = g.createImageData(m.w, m.h);
    for (let i = 0; i < m.data.length; i++) { const v = m.data[i] ? 20 : 250; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v === 20 ? 40 : 250; id.data[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0); return cv;
  }, [trace.r]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !open) return;
    cv.width = size.w; cv.height = size.h;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#0b0a12'; g.fillRect(0, 0, size.w, size.h);
    if (!base || !cropR) return;
    const { k, tx, ty } = vp;
    g.save(); g.translate(tx, ty); g.scale(k, k);
    g.imageSmoothingEnabled = k < 3;
    g.drawImage(base, 0, 0);
    // dim everything outside the crop
    g.fillStyle = 'rgba(9,8,15,.62)';
    g.beginPath(); g.rect(0, 0, base.width, base.height); g.rect(cropR.x, cropR.y, cropR.w, cropR.h); g.fill('evenodd');
    if (view === 'mask' && maskCanvas) g.drawImage(maskCanvas, cropR.x, cropR.y);
    if (view === 'trace') {
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(cropR.x, cropR.y, cropR.w, cropR.h);
      if (fit.f) {
        const f = fit.f; const pm = new Map(f.points.map((p) => [p.id, p] as const));
        const lw = 2.2 / k;
        g.save(); g.translate(cropR.x, cropR.y);
        g.lineWidth = lw; g.strokeStyle = '#6a3fe0'; g.lineJoin = 'round';
        g.beginPath();
        for (const l of f.lines) { const a = pm.get(l.p1); const b = pm.get(l.p2); if (a && b) { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); } }
        g.stroke();
        g.strokeStyle = '#d9640a'; g.beginPath();
        for (const c of f.circles) { const p = pm.get(c.center); if (p) { g.moveTo(p.x + c.r, p.y); g.arc(p.x, p.y, c.r, 0, Math.PI * 2); } }
        g.stroke();
        g.strokeStyle = '#0b8a5b'; g.beginPath();
        for (const a of f.arcs) { const p = pm.get(a.center); if (p) { g.moveTo(p.x + a.r * Math.cos((a.start * Math.PI) / 180), p.y + a.r * Math.sin((a.start * Math.PI) / 180)); g.arc(p.x, p.y, a.r, (a.start * Math.PI) / 180, (a.end * Math.PI) / 180, false); } }
        g.stroke();
        g.strokeStyle = '#c0267a'; g.beginPath();
        for (const s of f.splines) { const cp = s.controlIds.map((id) => pm.get(id)).filter(Boolean) as { x: number; y: number }[]; if (cp.length > 1) { const pts = catmull(cp); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]); } }
        g.stroke();
        g.fillStyle = '#111'; const pr = 2.4 / k;
        for (const p of f.points) { g.fillRect(p.x - pr, p.y - pr, pr * 2, pr * 2); }
        g.restore();
      }
    }
    // crop frame + handles
    g.strokeStyle = '#9b7bff'; g.lineWidth = 1.5 / k; g.setLineDash([6 / k, 4 / k]); g.strokeRect(cropR.x, cropR.y, cropR.w, cropR.h); g.setLineDash([]);
    if (tool === 'crop') {
      g.fillStyle = '#9b7bff'; const hs = 4 / k;
      for (const [hx, hy] of handlePts(cropR)) g.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
    }
    // brush strokes
    if (strokes.length) {
      g.fillStyle = 'rgba(112,206,158,.28)';
      for (const s of strokes) { g.beginPath(); g.arc(cropR.x + s.x, cropR.y + s.y, s.r, 0, Math.PI * 2); g.fill(); }
    }
    // calibration line
    if (calib) {
      g.strokeStyle = '#ff4fa3'; g.fillStyle = '#ff4fa3'; g.lineWidth = 2 / k;
      g.beginPath(); g.moveTo(calib.x0, calib.y0); g.lineTo(calib.x1, calib.y1); g.stroke();
      const r = 4 / k; g.beginPath(); g.arc(calib.x0, calib.y0, r, 0, 7); g.arc(calib.x1, calib.y1, r, 0, 7); g.fill();
    }
    g.restore();
  }, [open, size, vp, base, cropR, view, maskCanvas, fit.f, strokes, calib, tool]);

  // ── mouse: LMB tools, MMB pan, wheel zoom ────────────────────────────────
  const dragRef = useRef<null | { kind: 'pan' | 'crop-new' | 'crop-move' | 'calib' | 'brush'; sx: number; sy: number; ix: number; iy: number; r0?: Rect; handle?: string; vp0?: typeof vp }>(null);
  const toImg = (e: { clientX: number; clientY: number }) => {
    const b = canvasRef.current!.getBoundingClientRect(); const { k, tx, ty } = vpRef.current;
    return { x: (e.clientX - b.left - tx) / k, y: (e.clientY - b.top - ty) / k };
  };
  function handlePts(r: Rect): [number, number][] {
    const xm = r.x + r.w / 2; const ym = r.y + r.h / 2; const x1 = r.x + r.w; const y1 = r.y + r.h;
    return [[r.x, r.y], [xm, r.y], [x1, r.y], [x1, ym], [x1, y1], [xm, y1], [r.x, y1], [r.x, ym]];
  }
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  const onDown = (e: React.MouseEvent) => {
    if (!base || !cropR) return;
    if (e.button === 1) { e.preventDefault(); dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ix: 0, iy: 0, vp0: vp }; return; }
    if (e.button !== 0) return;
    const p = toImg(e);
    if (tool === 'crop') {
      const hs = 9 / vp.k;
      const hp = handlePts(cropR); let hit = -1;
      for (let i = 0; i < 8; i++) if (Math.abs(p.x - hp[i][0]) <= hs && Math.abs(p.y - hp[i][1]) <= hs) { hit = i; break; }
      if (hit >= 0) dragRef.current = { kind: 'crop-move', sx: e.clientX, sy: e.clientY, ix: p.x, iy: p.y, r0: cropR, handle: HANDLES[hit] };
      else dragRef.current = { kind: 'crop-new', sx: e.clientX, sy: e.clientY, ix: clamp(p.x, 0, base.width), iy: clamp(p.y, 0, base.height) };
    } else if (tool === 'calib') {
      const x = clamp(p.x, 0, base.width); const y = clamp(p.y, 0, base.height);
      dragRef.current = { kind: 'calib', sx: e.clientX, sy: e.clientY, ix: x, iy: y }; setCalib({ x0: x, y0: y, x1: x, y1: y });
    } else {
      dragRef.current = { kind: 'brush', sx: e.clientX, sy: e.clientY, ix: p.x, iy: p.y };
      setStrokeMarks((m) => [...m, strokes.length]);
      setStrokes((s) => [...s, { x: p.x - cropR.x, y: p.y - cropR.y, r: cfg.brushR }]);
    }
  };
  useEffect(() => {
    if (!open) return;
    const move = (e: MouseEvent) => {
      const d = dragRef.current; if (!d || !base || !cropR) return;
      if (d.kind === 'pan' && d.vp0) { setVp({ ...d.vp0, tx: d.vp0.tx + e.clientX - d.sx, ty: d.vp0.ty + e.clientY - d.sy }); return; }
      const p = toImg(e);
      if (d.kind === 'crop-new') {
        const x0 = d.ix; const y0 = d.iy; const x1 = clamp(p.x, 0, base.width); const y1 = clamp(p.y, 0, base.height);
        setCrop({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
      } else if (d.kind === 'crop-move' && d.r0 && d.handle) {
        const r = d.r0; let x0 = r.x; let y0 = r.y; let x1 = r.x + r.w; let y1 = r.y + r.h;
        const px = clamp(p.x, 0, base.width); const py = clamp(p.y, 0, base.height);
        if (d.handle.includes('w')) x0 = px; if (d.handle.includes('e')) x1 = px;
        if (d.handle.includes('n')) y0 = py; if (d.handle.includes('s')) y1 = py;
        setCrop({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
      } else if (d.kind === 'calib') {
        setCalib((c) => (c ? { ...c, x1: clamp(p.x, 0, base.width), y1: clamp(p.y, 0, base.height) } : c));
      } else if (d.kind === 'brush') {
        if (Math.hypot(p.x - d.ix, p.y - d.iy) >= cfg.brushR * 0.45) {
          d.ix = p.x; d.iy = p.y;
          setStrokes((s) => [...s, { x: p.x - cropR.x, y: p.y - cropR.y, r: cfg.brushR }]);
        }
      }
    };
    const up = () => {
      const d = dragRef.current; dragRef.current = null;
      if (!d) return;
      if (d.kind === 'calib') { setCalib((c) => (c && Math.hypot(c.x1 - c.x0, c.y1 - c.y0) < 3 ? null : c)); setCfgState((c) => (c.scaleSrc === 'calib' ? c : { ...c, scaleSrc: 'calib' })); }
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }); // re-bound each render so it always sees current state

  useEffect(() => {
    const el = canvasRef.current; if (!el || !open) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const b = el.getBoundingClientRect(); const mx = e.clientX - b.left; const my = e.clientY - b.top;
      setVp((v) => { const k2 = clamp(v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.05, 40); return { k: k2, tx: mx - ((mx - v.tx) / v.k) * k2, ty: my - ((my - v.ty) / v.k) * k2 }; });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [open, base]);

  // ── loading ─────────────────────────────────────────────────────────────
  const loadFile = async (f: Blob, name: string) => {
    setLoadErr(null);
    try {
      const { img, vector } = await loadPicture(f, name);
      setPic({ img, vector, name, file: f });
      setCrop(null); setCalib(null); setStrokes([]); setStrokeMarks([]);
      setCfgState((c) => ({ ...c, rot90: 0, flipH: false, flipV: false, straighten: 0, ...(c.scaleSrc === 'calib' ? { scaleSrc: 'width' as const, scaleVal: 100 } : {}) }));
    } catch (e) { setLoadErr(e instanceof Error ? e.message : String(e)); }
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadFile(f, f.name); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f, f.name); };
  const onPaste = (e: React.ClipboardEvent) => {
    const it = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    const f = it?.getAsFile(); if (f) { e.preventDefault(); void loadFile(f, 'pasted-image.png'); }
  };

  // ── actions ─────────────────────────────────────────────────────────────
  const close = () => setImageDialogOpen(false);
  const consLevel = (l: 'none' | 'basic' | 'full') => setCfg({
    cons: l === 'none' ? { hv: false, parallelPerp: false, equal: false, tangent: false, symmetric: false, dims: false, fix: false }
      : l === 'basic' ? { hv: true, parallelPerp: false, equal: false, tangent: false, symmetric: false, dims: false, fix: false }
        : { hv: true, parallelPerp: true, equal: true, tangent: true, symmetric: true, dims: cfg.cons.dims, fix: cfg.cons.fix },
  });
  const setCon = (k: keyof Cfg['cons'], v: boolean) => setCfg({ cons: { ...cfg.cons, [k]: v } });

  const importNow = () => {
    if (!placed || !gray || !cropR || !base) return;
    setBusy(true);
    try {
      let ref: RefImage | null = null;
      if (cfg.keepRef) {
        const cc = document.createElement('canvas'); cc.width = cropR.w; cc.height = cropR.h;
        cc.getContext('2d')!.drawImage(base, cropR.x, cropR.y, cropR.w, cropR.h, 0, 0, cropR.w, cropR.h);
        ref = { src: cc.toDataURL('image/png'), name: pic?.name ?? 'image', ...placed.ref, opacity: cfg.refOpacity, visible: true };
      }
      const label = `${cfg.mode === 'geometric' ? 'geometric fit' : 'outline'}, ${sizeMm ? `${sizeMm.w.toFixed(1)} × ${sizeMm.h.toFixed(1)} mm` : ''}`;
      importTracedSketch(placed.fit, `Image to Sketch (${label})`, ref);
      close();
    } finally { setBusy(false); }
  };

  const serverTrace = async () => {
    if (!pic) return;
    setServerBusy(true); setImportError(null);
    try {
      const dataUrl = await readAsDataUrl(pic.file);
      const res = await fetch(`${API_BASE}/sketch_from_image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl }) });
      if (!res.ok) throw new Error(await res.text());
      mergeImportedSketch(await res.json());
      close();
    } catch (e) {
      setLoadErr(`Server trace unavailable (${e instanceof Error ? e.message.slice(0, 120) : 'error'}). The built-in tracer above works offline.`);
    } finally { setServerBusy(false); }
  };

  const undoStroke = () => {
    const at = strokeMarks[strokeMarks.length - 1];
    if (at === undefined) return;
    setStrokes((s) => s.slice(0, at)); setStrokeMarks((m) => m.slice(0, -1));
  };
  // Changing orientation moves every pixel, so crop, calibration line and brush strokes no longer apply.
  const reorient = (p: Partial<Cfg>) => { setCfg(p); setCrop(null); setCalib(null); setStrokes([]); setStrokeMarks([]); };

  if (!open) return null;
  const empty = !!pic && !pending && !!trace.r && nEnt === 0;
  const dense = nEnt > 350;
  const hint = !pic ? 'Choose, drop or paste a PNG, JPG or SVG.'
    : tool === 'crop' ? 'Drag to crop · drag the handles to adjust · wheel zooms · middle-drag pans'
      : tool === 'calib' ? 'Drag a line across a feature of known size, then type its real length in mm'
        : 'Paint over wobbly edges to smooth them · wheel zooms · middle-drag pans';

  return (
    <div className="i2s-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={rootRef} className="i2s-dialog" role="dialog" aria-label="Image to Sketch" tabIndex={-1}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }} onKeyUp={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onPaste={onPaste}>
        <header className="i2s-head">
          <span className="i2s-title"><Sparkles size={13} /> IMAGE TO SKETCH <i>AI IMPORT</i></span>
          <span className="i2s-sub">Traces onto the <b>{plane} Plane</b> · the picture stays on a locked reference layer</span>
          <button className="i2s-x" onClick={close} aria-label="Close"><X size={14} /></button>
        </header>
        <div className="i2s-body">
          <section className="i2s-preview">
            <div className="i2s-tools">
              <button className="i2s-btn i2s-primary" onClick={() => fileRef.current?.click()}><ImagePlus size={12} /> {pic ? 'Replace image…' : 'Choose image…'}</button>
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp,.bmp,.gif,image/png,image/jpeg,image/svg+xml,image/*" style={{ display: 'none' }} onChange={onPick} />
              <span className="i2s-sep" />
              <div className="i2s-seg">
                <button className={tool === 'crop' ? 'on' : ''} onClick={() => setTool('crop')} title="Crop the picture to the part you want"><Crop size={11} /> Crop</button>
                <button className={tool === 'calib' ? 'on' : ''} onClick={() => setTool('calib')} title="Draw a line of known length to set the scale"><Ruler size={11} /> Calibrate</button>
                <button className={tool === 'brush' ? 'on' : ''} onClick={() => setTool('brush')} title="Smoothing brush: paint over messy edges"><Brush size={11} /> Smooth</button>
              </div>
              <span className="i2s-sep" />
              <div className="i2s-seg">
                <button className={view === 'image' ? 'on' : ''} onClick={() => setViewMode('image')}><Eye size={11} /> Image</button>
                <button className={view === 'mask' ? 'on' : ''} onClick={() => setViewMode('mask')}><Layers size={11} /> Edges</button>
                <button className={view === 'trace' ? 'on' : ''} onClick={() => setViewMode('trace')}><Wand2 size={11} /> Trace</button>
              </div>
              <button className="i2s-btn" onClick={fitView} disabled={!base}>Fit</button>
              {(busy || pending) && pic && <span className="i2s-busy"><Loader2 size={12} className="i2s-spin" /> Tracing…</span>}
            </div>
            <div ref={wrapRef} className="i2s-canvas-wrap">
              <canvas ref={canvasRef} className={`i2s-canvas i2s-tool-${tool}`} onMouseDown={onDown} onContextMenu={(e) => e.preventDefault()} onAuxClick={(e) => e.preventDefault()} />
              {!pic && (
                <button className="i2s-drop" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={30} />
                  <b>Drop an image here</b>
                  <span>PNG · JPG · SVG — a photo, scan, screenshot or drawing. You can also paste from the clipboard.</span>
                </button>
              )}
            </div>
            <div className="i2s-foot-hint">
              <span>{hint}</span>
              {base && cropR && <em>{base.width}×{base.height}px · crop {cropR.w}×{cropR.h}</em>}
            </div>
            {loadErr && <div className="i2s-alert"><TriangleAlert size={12} /> {loadErr}</div>}
          </section>

          <aside className="i2s-side">
            <fieldset className="i2s-sec">
              <legend>1 · Picture</legend>
              <div className="i2s-btns">
                <button className="i2s-btn" onClick={() => reorient({ rot90: (cfg.rot90 + 3) % 4 })} disabled={!pic} title="Rotate 90° counter-clockwise"><RotateCcw size={12} /></button>
                <button className="i2s-btn" onClick={() => reorient({ rot90: (cfg.rot90 + 1) % 4 })} disabled={!pic} title="Rotate 90° clockwise"><RotateCw size={12} /></button>
                <button className={`i2s-btn ${cfg.flipH ? 'on' : ''}`} onClick={() => reorient({ flipH: !cfg.flipH })} disabled={!pic} title="Flip horizontally"><FlipHorizontal2 size={12} /></button>
                <button className={`i2s-btn ${cfg.flipV ? 'on' : ''}`} onClick={() => reorient({ flipV: !cfg.flipV })} disabled={!pic} title="Flip vertically"><FlipVertical2 size={12} /></button>
                <button className="i2s-btn" onClick={() => { setCrop(null); }} disabled={!pic || !crop}>Full image</button>
              </div>
              <NumberRow label="Straighten" value={cfg.straighten} min={-45} max={45} step={0.1} unit="°" onChange={(v) => reorient({ straighten: v })} hint="Rotate the picture a few degrees so the part sits square" />
              <label className="i2s-chk"><input type="checkbox" checked={cfg.keepRef} onChange={(e) => setCfg({ keepRef: e.target.checked })} /> Keep picture as a locked reference layer</label>
              <NumberRow label="Opacity" value={cfg.refOpacity} min={0.05} max={1} step={0.05} onChange={(v) => { setCfg({ refOpacity: v }); if (refImage) updateRefImage({ opacity: v }); }} hint="How strongly the reference picture shows under the sketch" />
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>2 · Scale &amp; placement</legend>
              <label className="i2s-field"><span>Set scale from</span>
                <select value={cfg.scaleSrc} onChange={(e) => setCfg({ scaleSrc: e.target.value as Cfg['scaleSrc'], scaleVal: e.target.value === 'mmpx' ? 0.25 : 100 })}>
                  <option value="width">Overall width of the part</option>
                  <option value="height">Overall height of the part</option>
                  <option value="calib">Calibration line on the picture</option>
                  <option value="mmpx">Millimetres per pixel</option>
                </select>
              </label>
              <label className="i2s-field"><span>{cfg.scaleSrc === 'mmpx' ? 'mm / pixel' : cfg.scaleSrc === 'calib' ? 'Line length (mm)' : cfg.scaleSrc === 'height' ? 'Height (mm)' : 'Width (mm)'}</span>
                <input type="number" min={0.001} step={cfg.scaleSrc === 'mmpx' ? 0.01 : 1} value={cfg.scaleVal} onChange={(e) => setCfg({ scaleVal: Number(e.target.value) })} /></label>
              {cfg.scaleSrc === 'calib' && (
                <div className="i2s-note">
                  {calib ? <>Line is {calibPx.toFixed(0)} px → <b>{scale !== null ? scale.toFixed(4) : '—'}</b> mm/px.</> : <>Pick <b>Calibrate</b> above and drag a line over something of known size.</>}
                  {!calib && <button className="i2s-btn" onClick={() => setTool('calib')}><Ruler size={11} /> Calibrate</button>}
                </div>
              )}
              <label className="i2s-chk"><input type="checkbox" checked={cfg.centerGeom} onChange={(e) => setCfg({ centerGeom: e.target.checked })} /> Centre the sketch on the origin</label>
              <div className="i2s-two">
                <label className="i2s-field"><span>Offset X</span><input type="number" step={1} value={cfg.offX} onChange={(e) => setCfg({ offX: Number(e.target.value) })} /></label>
                <label className="i2s-field"><span>Offset Y</span><input type="number" step={1} value={cfg.offY} onChange={(e) => setCfg({ offY: Number(e.target.value) })} /></label>
              </div>
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>3 · Conversion</legend>
              <div className="i2s-seg i2s-wide">
                <button className={cfg.mode === 'outline' ? 'on' : ''} onClick={() => setCfg({ mode: 'outline' })} title="Follow the edges of the picture">Outline / Vectorize</button>
                <button className={cfg.mode === 'geometric' ? 'on' : ''} onClick={() => setCfg({ mode: 'geometric' })} title="Recognise circles, rectangles and fillets and give them exact dimensions">Geometric fit</button>
              </div>
              <label className="i2s-field"><span>Output</span>
                <select value={cfg.output} onChange={(e) => setCfg({ output: e.target.value as Cfg['output'] })}>
                  <option value="lines_arcs">Lines + arcs (can be extruded)</option>
                  <option value="splines">Splines + lines (smooth curves)</option>
                  <option value="polylines">Polylines (many short lines)</option>
                </select>
              </label>
              <label className="i2s-field"><span>Picture is</span>
                <select value={cfg.kind} onChange={(e) => setCfg({ kind: e.target.value as Cfg['kind'] })}>
                  <option value="auto">Detect automatically</option>
                  <option value="shape">Solid shapes (silhouette)</option>
                  <option value="line">Line drawing (centre lines)</option>
                </select>
              </label>
              <label className="i2s-field"><span>Ink</span>
                <select value={cfg.polarity} onChange={(e) => setCfg({ polarity: e.target.value as Cfg['polarity'] })}>
                  <option value="auto">Detect automatically</option>
                  <option value="dark">Dark on light</option>
                  <option value="light">Light on dark (invert)</option>
                </select>
              </label>
              <label className="i2s-chk"><input type="checkbox" checked={cfg.autoThr} onChange={(e) => setCfg({ autoThr: e.target.checked })} /> Automatic threshold</label>
              {!cfg.autoThr && <NumberRow label="Threshold" value={cfg.thr} min={5} max={250} step={1} onChange={(v) => setCfg({ thr: v })} />}
              <label className="i2s-chk"><input type="checkbox" checked={cfg.adaptive} onChange={(e) => setCfg({ adaptive: e.target.checked })} /> Adaptive (uneven lighting, photos)</label>
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>4 · Cleanup &amp; sensitivity</legend>
              <NumberRow label="Noise reduction" value={cfg.blur} min={0} max={4} step={1} onChange={(v) => setCfg({ blur: v })} hint="Blurs speckle and JPEG noise before edges are found" />
              <NumberRow label="Fit tolerance" value={cfg.tol} min={0.5} max={6} step={0.1} unit=" px" onChange={(v) => setCfg({ tol: v })} hint="How far the sketch may stray from the picture's edge. Larger = fewer, smoother entities" />
              <NumberRow label="Ignore small" value={cfg.minArea} min={0} max={400} step={2} onChange={(v) => setCfg({ minArea: v })} hint="Specks smaller than this (pixels²) are dropped" />
              <NumberRow label="Corner angle" value={cfg.cornerDeg} min={10} max={80} step={1} unit="°" onChange={(v) => setCfg({ cornerDeg: v })} hint="Direction changes sharper than this become corners" />
              <NumberRow label="Snap H/V within" value={cfg.hvDeg} min={0} max={10} step={0.5} unit="°" onChange={(v) => setCfg({ hvDeg: v })} />
              <div className="i2s-btns">
                <button className="i2s-btn" onClick={() => setCfg({ simplify: Math.min(4, cfg.simplify + 1) })} disabled={cfg.simplify >= 4}><Wand2 size={11} /> Simplify curves{cfg.simplify ? ` (${cfg.simplify})` : ''}</button>
                <button className="i2s-btn" onClick={() => setCfg({ simplify: 0 })} disabled={!cfg.simplify}>Reset</button>
              </div>
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>5 · Constraints</legend>
              <div className="i2s-seg i2s-wide">
                <button onClick={() => consLevel('none')}>None</button>
                <button onClick={() => consLevel('basic')}>Basic</button>
                <button onClick={() => consLevel('full')}>Full</button>
              </div>
              <div className="i2s-grid2">
                <label className="i2s-chk"><input type="checkbox" checked={cfg.cons.hv} onChange={(e) => setCon('hv', e.target.checked)} /> Horizontal / Vertical</label>
                <label className="i2s-chk"><input type="checkbox" checked={cfg.cons.parallelPerp} onChange={(e) => setCon('parallelPerp', e.target.checked)} /> Parallel / Perpendicular</label>
                <label className="i2s-chk"><input type="checkbox" checked={cfg.cons.equal} onChange={(e) => setCon('equal', e.target.checked)} /> Equal</label>
                <label className="i2s-chk"><input type="checkbox" checked={cfg.cons.tangent} onChange={(e) => setCon('tangent', e.target.checked)} /> Tangent</label>
                <label className="i2s-chk"><input type="checkbox" checked={cfg.cons.symmetric} disabled={!cfg.centerGeom} onChange={(e) => setCon('symmetric', e.target.checked)} /> Symmetric</label>
                <label className="i2s-chk"><input type="checkbox" checked={cfg.cons.dims} onChange={(e) => setCon('dims', e.target.checked)} /> Dimensions</label>
                <label className="i2s-chk"><input type="checkbox" checked={cfg.cons.fix} onChange={(e) => setCon('fix', e.target.checked)} /> Fix one corner</label>
              </div>
              <div className="i2s-note">Coincident joints are always made: touching ends share one point.</div>
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>6 · Smoothing brush</legend>
              <NumberRow label="Brush size" value={cfg.brushR} min={4} max={60} step={1} unit=" px" onChange={(v) => setCfg({ brushR: v })} />
              <div className="i2s-btns">
                <button className={`i2s-btn ${tool === 'brush' ? 'on' : ''}`} onClick={() => setTool('brush')} disabled={!pic}><Brush size={11} /> Use brush</button>
                <button className="i2s-btn" onClick={undoStroke} disabled={!strokeMarks.length}>Undo stroke</button>
                <button className="i2s-btn" onClick={() => { setStrokes([]); setStrokeMarks([]); }} disabled={!strokes.length}>Clear</button>
              </div>
            </fieldset>
          </aside>
        </div>

        <footer className="i2s-foot">
          <div className="i2s-result">
            {!pic ? <span>No image loaded.</span> : pending ? <span><Loader2 size={11} className="i2s-spin" /> Tracing…</span> : fit.err ? <span className="i2s-bad"><TriangleAlert size={11} /> {fit.err}</span> : f0 ? (
              <>
                <span><b>{nEnt}</b> entities</span>
                {trace.r && <span title="What the tracer decided the picture is — change it under Conversion › Picture is">{trace.r.kind === 'line' ? 'line drawing' : 'solid shapes'}</span>}
                {f0.stats.lines > 0 && <span>{f0.stats.lines} line{f0.stats.lines === 1 ? '' : 's'}</span>}
                {f0.stats.arcs > 0 && <span>{f0.stats.arcs} arc{f0.stats.arcs === 1 ? '' : 's'}</span>}
                {f0.stats.circles > 0 && <span>{f0.stats.circles} circle{f0.stats.circles === 1 ? '' : 's'}</span>}
                {f0.stats.splines > 0 && <span>{f0.stats.splines} spline{f0.stats.splines === 1 ? '' : 's'}</span>}
                <span><b>{nCons}</b> constraints</span>
                {sizeMm ? <span className="i2s-size">{sizeMm.w.toFixed(1)} × {sizeMm.h.toFixed(1)} mm</span> : <span className="i2s-bad">Scale not set</span>}
              </>
            ) : null}
            {notes.map((n, i) => <span key={i} className="i2s-warn"><TriangleAlert size={11} /> {n}</span>)}
          </div>
          {(empty || dense || fit.err) && (
            <div className="i2s-fallback">
              <TriangleAlert size={12} />
              {empty ? 'No outlines found.' : dense ? 'That is a lot of small pieces — the edges are noisy.' : 'Tracing failed.'}
              <span>Try:</span>
              {empty && <button className="i2s-btn" onClick={() => setCfg({ adaptive: true, autoThr: true, blur: Math.max(1, cfg.blur) })}>Adaptive threshold</button>}
              {empty && <button className="i2s-btn" onClick={() => setCfg({ polarity: cfg.polarity === 'light' ? 'dark' : 'light' })}>Invert</button>}
              {empty && <button className="i2s-btn" onClick={() => setCfg({ minArea: 0, blur: 0 })}>Keep fine detail</button>}
              {(dense || !empty) && <button className="i2s-btn" onClick={() => setCfg({ simplify: Math.min(4, cfg.simplify + 1), blur: Math.min(4, cfg.blur + 1) })}>Simplify + smooth</button>}
              {(dense || !empty) && <button className="i2s-btn" onClick={() => setCfg({ output: 'splines' })}>Use splines</button>}
              <button className="i2s-btn" onClick={() => setTool('brush')}>Smoothing brush</button>
            </div>
          )}
          <div className="i2s-actions">
            <button className="i2s-btn" onClick={serverTrace} disabled={!pic || serverBusy} title="Send the picture to the CAD server's OpenCV / vision trace instead of the built-in tracer">{serverBusy ? <Loader2 size={11} className="i2s-spin" /> : <Sparkles size={11} />} Server trace…</button>
            <span className="i2s-flex" />
            <button className="i2s-btn" onClick={close}>Cancel</button>
            <button className="i2s-btn i2s-primary" onClick={importNow} disabled={!placed || nEnt === 0 || pending || busy}><Wand2 size={12} /> Add to sketch</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
