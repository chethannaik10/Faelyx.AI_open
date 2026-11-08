// DrawingWorkspace.tsx
//
// The "Drawings & Documentation" tab, modeled on CATIA Generative Drafting:
// an ISO drawing sheet (A4–A0) with a frame and title block, a front view
// with its projected views placed by the projection method (first angle, the
// ISO default, or third angle, ANSI), hidden-line rendering (visible edges
// solid, hidden edges dashed), a real drawing scale (1:2, 5:1 …, or auto-fit),
// overall dimensions on every orthographic view and an editable title block.
// Every view is generated from the same real Open Cascade solid that
// cad_server.py produces (see StlViewport's `view` + `drawing` props), not a
// second rendering path.
//
// Still to come, from the same manual: section / detail / auxiliary views,
// automatic and manual dimensioning of individual features, GD&T and a BOM.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FileBox, Printer } from 'lucide-react';
import StlViewport from './StlViewport';

type ViewDirection = 'front' | 'top' | 'right' | 'iso';
type Projection = 'first' | 'third';

// ISO sheet formats, landscape, in mm (width × height).
const SHEETS: Record<string, [number, number]> = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
const SCALES: [number, string][] = [[0.01, '1:100'], [0.02, '1:50'], [0.05, '1:20'], [0.1, '1:10'], [0.2, '1:5'], [0.5, '1:2'], [1, '1:1'], [2, '2:1'], [5, '5:1'], [10, '10:1']];
const scaleLabel = (s: number) => SCALES.find(([v]) => Math.abs(v - s) < 1e-9)?.[1] ?? `${s}:1`;

const MARGIN_MM = 10;       // frame inset from the sheet edge
const TITLE_H_MM = 36;      // title block height (at A3 and below; larger sheets scale it up)
const DIM_ROOM_MM = 16;     // space kept inside each cell for dimension lines and labels

type Envelope = { x: number; y: number; z: number };

// Overall width × height (mm) a view shows, and the view's name.
const viewSize = (v: ViewDirection, e: Envelope): [number, number] => {
  if (v === 'front') return [e.x, e.y];
  if (v === 'top') return [e.x, e.z];
  if (v === 'right') return [e.z, e.y];
  const flat = (e.x + e.z) * 0.866; // isometric: 30° axes
  return [flat, e.y + (e.x + e.z) * 0.5];
};
const VIEW_NAME: Record<ViewDirection, string> = { front: 'FRONT VIEW', top: 'TOP VIEW', right: 'RIGHT VIEW', iso: 'ISOMETRIC VIEW' };

// Where each view sits in the 2 × 2 grid ([column, row]). First angle (ISO):
// the top view goes below the front view and the right view on its left;
// third angle (ANSI) puts them on the near side: top above, right to the right.
const CELLS: Record<Projection, Record<ViewDirection, [number, number]>> = {
  first: { right: [0, 0], front: [1, 0], iso: [0, 1], top: [1, 1] },
  third: { iso: [0, 0], top: [1, 0], front: [0, 1], right: [1, 1] },
};

const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

function DimArrow({ x, y, dir, size }: { x: number; y: number; dir: 1 | -1 | 2 | -2; size: number }) {
  // dir ±1: arrow tip pointing along ±x; ±2: along ±y (screen down is +y).
  const half = size * 0.3;
  const pts = dir === 1 ? [[x, y], [x - size, y - half], [x - size, y + half]]
    : dir === -1 ? [[x, y], [x + size, y - half], [x + size, y + half]]
    : dir === 2 ? [[x, y], [x - half, y - size], [x + half, y - size]]
    : [[x, y], [x - half, y + size], [x + half, y + size]];
  return <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="#111" />;
}

function DrawingView({ view, stlData, envelope, scale, mmPx, hidden, showDims, rect }: {
  view: ViewDirection; stlData: ArrayBuffer; envelope: Envelope; scale: number; mmPx: number; hidden: boolean; showDims: boolean;
  rect: { left: string; top: string; width: string; height: string };
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [mw, mh] = viewSize(view, envelope);
  const ppm = mmPx * scale; // screen px per model mm
  const cx = size.w / 2; const cy = size.h / 2;
  const pw = (mw * ppm) / 2; const ph = (mh * ppm) / 2;
  const off = 8 * mmPx; const ext = 2 * mmPx; const gap = 1 * mmPx; const arrow = 2.6 * mmPx; const font = 3.5 * mmPx;
  const dims = showDims && view !== 'iso' && size.w > 0;

  return <div className="dw-cell" style={rect} ref={hostRef}>
    <div className="dw-cell-gl"><StlViewport stlData={stlData} view={view} interactive={false} drawing={{ pxPerMm: ppm, scale, hidden }} /></div>
    {dims && <svg className="dw-dims" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-label={`${VIEW_NAME[view]} dimensions`}>
      <g stroke="#111" strokeWidth={Math.max(0.6, 0.25 * mmPx)} fill="none">
        {/* horizontal overall dimension, below the part */}
        <line x1={cx - pw} y1={cy + ph + gap} x2={cx - pw} y2={cy + ph + off + ext} />
        <line x1={cx + pw} y1={cy + ph + gap} x2={cx + pw} y2={cy + ph + off + ext} />
        <line x1={cx - pw} y1={cy + ph + off} x2={cx + pw} y2={cy + ph + off} />
        {/* vertical overall dimension, to the right */}
        <line x1={cx + pw + gap} y1={cy - ph} x2={cx + pw + off + ext} y2={cy - ph} />
        <line x1={cx + pw + gap} y1={cy + ph} x2={cx + pw + off + ext} y2={cy + ph} />
        <line x1={cx + pw + off} y1={cy - ph} x2={cx + pw + off} y2={cy + ph} />
      </g>
      <DimArrow x={cx - pw} y={cy + ph + off} dir={-1} size={arrow} />
      <DimArrow x={cx + pw} y={cy + ph + off} dir={1} size={arrow} />
      <DimArrow x={cx + pw + off} y={cy - ph} dir={-2} size={arrow} />
      <DimArrow x={cx + pw + off} y={cy + ph} dir={2} size={arrow} />
      <text x={cx} y={cy + ph + off - 1.2 * mmPx} textAnchor="middle" fontSize={font} fill="#111" fontFamily="'DM Mono', monospace">{fmt(mw)}</text>
      <text transform={`translate(${cx + pw + off - 1.2 * mmPx} ${cy}) rotate(-90)`} textAnchor="middle" fontSize={font} fill="#111" fontFamily="'DM Mono', monospace">{fmt(mh)}</text>
    </svg>}
    <div className="dw-view-label" style={{ fontSize: 2.8 * mmPx }}><b>{VIEW_NAME[view]}</b> <span>{scaleLabel(scale)}</span></div>
  </div>;
}

export default function DrawingWorkspace({ stlData, projectName }: { stlData: ArrayBuffer | null; projectName: string | null }) {
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [sheet, setSheet] = useState('A3');
  const [scaleKey, setScaleKey] = useState('auto');
  const [projection, setProjection] = useState<Projection>('first');
  const [showHidden, setShowHidden] = useState(true);
  const [showDims, setShowDims] = useState(true);
  const [drawnBy, setDrawnBy] = useState('Faelyx AI');
  const [material, setMaterial] = useState('Aluminum 6061');
  const [sheetNo, setSheetNo] = useState('1 of 1');

  // The model's real envelope, read straight from the STL geometry's bounding box.
  useEffect(() => {
    if (!stlData) { setEnvelope(null); return; }
    try {
      const geometry = new STLLoader().parse(stlData);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      if (bb) setEnvelope({ x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z });
    } catch {
      setEnvelope(null);
    }
  }, [stlData]);

  const [W, H] = SHEETS[sheet];
  const paperRef = useRef<HTMLDivElement>(null);
  const [paperPx, setPaperPx] = useState(1100);
  useLayoutEffect(() => {
    const el = paperRef.current;
    if (!el) return;
    const update = () => setPaperPx(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });
  const mmPx = paperPx / W; // screen px per paper mm

  // Title block grows with the sheet so it stays readable on A1 / A0.
  const tb = Math.max(1, W / 420);
  const tbW = 180 * tb; const tbH = TITLE_H_MM * tb;
  const areaW = W - 2 * MARGIN_MM; const areaH = H - 2 * MARGIN_MM - tbH - 4;
  const cellW = areaW / 2; const cellH = areaH / 2;

  // The largest standard scale at which every view fits its cell with room for dimensions.
  const autoScale = useMemo(() => {
    if (!envelope) return 1;
    const usableW = cellW - 2 * DIM_ROOM_MM; const usableH = cellH - 2 * DIM_ROOM_MM;
    const need = (['front', 'top', 'right'] as ViewDirection[]).map((v) => { const [w, h] = viewSize(v, envelope); return Math.min(usableW / Math.max(w, 1e-6), usableH / Math.max(h, 1e-6)); });
    const best = Math.min(...need);
    return [...SCALES].reverse().find(([v]) => v <= best)?.[0] ?? SCALES[0][0];
  }, [envelope, cellW, cellH]);
  const scale = scaleKey === 'auto' ? autoScale : Number(scaleKey);
  // The isometric view carries its own scale (as a drafting package allows per view): the sheet scale, or smaller if it would overflow its cell.
  const isoScale = useMemo(() => {
    if (!envelope) return scale;
    const [iw, ih] = viewSize('iso', envelope);
    const fit = Math.min((cellW - 8) / Math.max(iw, 1e-6), (cellH - 12) / Math.max(ih, 1e-6));
    return Math.min(scale, [...SCALES].reverse().find(([v]) => v <= fit)?.[0] ?? SCALES[0][0]);
  }, [envelope, cellW, cellH, scale]);

  const pct = (mm: number, total: number) => `${(mm / total) * 100}%`;
  const cellRect = (v: ViewDirection) => {
    const [c, r] = CELLS[projection][v];
    return { left: pct(MARGIN_MM + c * cellW, W), top: pct(MARGIN_MM + r * cellH, H), width: pct(cellW, W), height: pct(cellH, H) };
  };
  const today = new Date().toLocaleDateString();
  const px = (mm: number) => mm * mmPx;

  return <main className="drawing-shell dw-shell">
    <style>{`@media print { @page { size: ${W}mm ${H}mm; margin: 0 } }`}</style>
    <div className="dw-toolbar">
      <label>Sheet<select value={sheet} onChange={(e) => setSheet(e.target.value)}>{Object.entries(SHEETS).map(([k, [w, h]]) => <option key={k} value={k}>{k} ISO — {w} × {h} mm</option>)}</select></label>
      <label>Scale<select value={scaleKey} onChange={(e) => setScaleKey(e.target.value)}>
        <option value="auto">Auto fit ({scaleLabel(autoScale)})</option>
        {SCALES.map(([v, l]) => <option key={l} value={String(v)}>{l}</option>)}
      </select></label>
      <label>Projection<select value={projection} onChange={(e) => setProjection(e.target.value as Projection)}>
        <option value="first">First angle (ISO)</option>
        <option value="third">Third angle (ANSI)</option>
      </select></label>
      <label className="dw-check"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Hidden lines</label>
      <label className="dw-check"><input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} /> Dimensions</label>
      <button className="dw-print" onClick={() => window.print()} disabled={!stlData}><Printer size={12} /> Print</button>
    </div>
    <div className="dw-paper" ref={paperRef} style={{ aspectRatio: `${W} / ${H}` }}>
      <div className="dw-frame" style={{ left: pct(MARGIN_MM, W), top: pct(MARGIN_MM, H), right: pct(MARGIN_MM, W), bottom: pct(MARGIN_MM, H) }} />
      {!stlData || !envelope ? (
        <div className="dw-empty" style={{ fontSize: px(3.4) }}>
          <FileBox size={Math.max(18, px(10))} />
          <strong>No 3D model yet</strong>
          <span>Sketch a profile in Sketch &amp; 2D, then Pad it in 3D Design — the views are generated from that real solid.</span>
        </div>
      ) : (['front', 'top', 'right', 'iso'] as ViewDirection[]).map((v) => (
        <DrawingView key={v} view={v} stlData={stlData} envelope={envelope} scale={v === 'iso' ? isoScale : scale} mmPx={mmPx} hidden={showHidden} showDims={showDims} rect={cellRect(v)} />
      ))}
      <div className="dw-title" style={{ right: pct(MARGIN_MM, W), bottom: pct(MARGIN_MM, H), width: pct(tbW, W), height: pct(tbH, H), fontSize: px(3 * tb) }}>
        <div className="dw-tb-name"><span>TITLE</span><b>{projectName ?? 'Untitled'}</b></div>
        <div className="dw-tb-logo">FAELYX AI</div>
        <div><span>DRAWN BY</span><input value={drawnBy} onChange={(e) => setDrawnBy(e.target.value)} aria-label="Drawn by" /></div>
        <div><span>DATE</span><b>{today}</b></div>
        <div><span>MATERIAL</span><input value={material} onChange={(e) => setMaterial(e.target.value)} aria-label="Material" /></div>
        <div><span>SCALE</span><b>{scaleLabel(scale)}</b></div>
        <div><span>SHEET</span><input value={sheetNo} onChange={(e) => setSheetNo(e.target.value)} aria-label="Sheet number" /></div>
        <div><span>SIZE · PROJECTION</span><b>{sheet} · {projection === 'first' ? 'ISO 1st angle' : 'ANSI 3rd angle'}</b></div>
      </div>
    </div>
  </main>;
}
