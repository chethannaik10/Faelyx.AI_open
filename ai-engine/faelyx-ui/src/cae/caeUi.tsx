// Shared types and small controls of the CAE workspace.
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { AnalysisId, CaeBody, Curve, Load, MeshSettings, Region } from './model';
import type { Material } from './materials';
import { fmtNum } from './colormaps';

export type LeftTab = 'study' | 'materials' | 'loads' | 'mesh' | 'solve';
export type RightTab = 'display' | 'inspect' | 'report';
export type V3 = [number, number, number];

export interface Study {
  name: string;
  source: string;                        // sample id, 'project', 'upload'
  analysis: AnalysisId;
  bodies: CaeBody[];
  regions: Region[];
  loads: Load[];
  mesh: MeshSettings;
  params: Partial<Record<AnalysisId, Record<string, number | string | boolean>>>;
  customMats: Material[];
}
export type SetStudy = (f: (s: Study) => Study) => void;

export interface Probe { id: number; p: V3; value: number | null; label: string; unit: string }

// Muted part colours: load, restraint and result colours (orange, red, blue, yellow) must stand out against them.
export const BODY_COLORS = ['#8c9db8', '#a3b59a', '#bfae8d', '#a493bd', '#86b3b6', '#b79c9f', '#9aa6a0', '#b9b2a4'];

export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Number input that accepts scientific notation and keeps what the user typed until blur / Enter. */
export function NumF({ label, value, onChange, unit, min, max, wide, hint }: { label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; wide?: boolean; hint?: string }) {
  const show = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(6)) : '0');
  const [text, setText] = useState(show(value));
  useEffect(() => { setText(show(value)); }, [value]);
  const commit = () => {
    let v = parseFloat(text);
    if (!Number.isFinite(v)) { setText(show(value)); return; }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v); setText(show(v));
  };
  return (
    <label className="rx-num" title={hint}>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}{unit ? ` (${unit})` : ''}</span>
      <input style={{ width: wide ? 96 : 76, flex: 'none' }} type="text" inputMode="decimal" value={text} spellCheck={false}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

export function download(name: string, data: BlobPart | Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------------------------
// Charts (SVG)

const COLORS = ['#9b7bff', '#ff7a45', '#4dd1b8', '#ffd23f', '#6e9bff', '#ff5d73', '#a0e86a', '#d0a85c'];

function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export function Chart({ curve, height = 190 }: { curve: Curve; height?: number }) {
  const W = 560, H = height, L = 52, R = 12, T = 12, B = 34;
  const [hover, setHover] = useState<number | null>(null);
  const g = useMemo(() => {
    const lx = !!curve.logx, ly = !!curve.logy;
    const fx = (v: number) => (lx ? Math.log10(Math.max(v, 1e-300)) : v), fy = (v: number) => (ly ? Math.log10(Math.max(v, 1e-300)) : v);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of curve.series) for (let i = 0; i < s.x.length; i++) {
      if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i]) || (lx && s.x[i] <= 0) || (ly && s.y[i] <= 0)) continue;
      const a = fx(s.x[i]), b = fy(s.y[i]);
      if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b;
    }
    if (!Number.isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
    if (x1 === x0) { x1 += 1; x0 -= 1; }
    if (y1 === y0) { y1 += Math.abs(y1) * 0.1 + 1; y0 -= Math.abs(y0) * 0.1; }
    if (!ly) { const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad; if (y0 < 0 && curve.series.every((s) => s.y.every((v) => !Number.isFinite(v) || v >= 0))) y0 = 0; }
    const sx = (v: number) => L + ((fx(v) - x0) / (x1 - x0)) * (W - L - R), sy = (v: number) => H - B - ((fy(v) - y0) / (y1 - y0)) * (H - T - B);
    const tick = (lo: number, hi: number, log: boolean) => (log ? Array.from({ length: Math.max(0, Math.floor(hi) - Math.ceil(lo) + 1) }, (_, i) => Math.pow(10, Math.ceil(lo) + i)) : niceTicks(lo, hi));
    const xt = tick(lx ? x0 : x0, x1, lx), yt = tick(y0, y1, ly);
    return { sx, sy, xt, yt, x0, x1, lx };
  }, [curve, H]);

  const first = curve.series[0];
  const near = hover !== null && first ? hover : null;
  const onMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!first || !first.x.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < first.x.length; i++) { const d = Math.abs(g.sx(first.x[i]) - px); if (d < bd) { bd = d; best = i; } }
    setHover(best);
  };

  return (
    <div className="cae-chart">
      <div className="cae-chart-head">
        <b>{curve.title}</b>
        <span>{near !== null && first ? `${curve.xlabel.split('(')[0].trim()} ${fmtNum(first.x[near])} → ${curve.series.map((s) => `${fmtNum(s.y[Math.min(near, s.y.length - 1)])}`).join(' / ')}` : ''}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#0d0b14" stroke="#241f36" />
        {g.yt.map((v, i) => <g key={'y' + i}><line x1={L} x2={W - R} y1={g.sy(v)} y2={g.sy(v)} stroke="#1c1830" /><text x={L - 5} y={g.sy(v) + 3} textAnchor="end" fontSize="9" fill="#7f7896" fontFamily="DM Mono, monospace">{fmtNum(v)}</text></g>)}
        {g.xt.map((v, i) => <g key={'x' + i}><line y1={T} y2={H - B} x1={g.sx(v)} x2={g.sx(v)} stroke="#1c1830" /><text x={g.sx(v)} y={H - B + 12} textAnchor="middle" fontSize="9" fill="#7f7896" fontFamily="DM Mono, monospace">{fmtNum(v)}</text></g>)}
        {(curve.marks ?? []).map((m, i) => <g key={'m' + i}><line x1={g.sx(m.x)} x2={g.sx(m.x)} y1={T} y2={H - B} stroke="#ff7a8c" strokeDasharray="4 3" /><text x={g.sx(m.x) + 3} y={T + 9 + (i % 3) * 10} fontSize="9" fill="#ff9aa8">{m.label}</text></g>)}
        {curve.series.map((s, k) => {
          const pts: string[] = [];
          for (let i = 0; i < s.x.length; i++) { if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i])) continue; pts.push(`${g.sx(s.x[i]).toFixed(1)},${g.sy(s.y[i]).toFixed(1)}`); }
          const col = s.color ?? COLORS[k % COLORS.length];
          return <polyline key={k} points={pts.join(' ')} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" />;
        })}
        {near !== null && first && Number.isFinite(first.x[near]) && <line x1={g.sx(first.x[near])} x2={g.sx(first.x[near])} y1={T} y2={H - B} stroke="#ffffff55" />}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="9.5" fill="#a79fbe">{curve.xlabel}</text>
        <text transform={`translate(11 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="9.5" fill="#a79fbe">{curve.ylabel}</text>
      </svg>
      {curve.series.length > 1 && <div className="cae-chart-leg">{curve.series.map((s, k) => <span key={k}><i style={{ background: s.color ?? COLORS[k % COLORS.length] }} />{s.name}</span>)}</div>}
    </div>
  );
}
