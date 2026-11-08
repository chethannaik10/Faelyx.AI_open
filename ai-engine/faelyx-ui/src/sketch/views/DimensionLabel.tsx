// DimensionLabel — the one on-canvas value label every measurement uses
// (Line/Circle/Arc dimensions, Distance and Angle pairs, Chamfer/Fillet
// values, Measure Item / Measure Between previews, and any measurement
// tool added later): the value as SVG text, and on double-click an inline
// editor seeded with the current value. Enter commits, Escape cancels,
// blurring commits. Tools only supply what the value is and what
// committing it means, so the double-click behaviour and the editor's
// look stay identical everywhere.
//
// The edit chip's size used to be *guessed* from the seed string's
// character count (a hardcoded per-glyph width times how many characters
// the plain number has). That guess quietly went "off proportion" for any
// label whose on-screen text isn't just the bare seed — a diameter/radius
// label's "D"/"R" prefix, a future unit suffix, anything — because the box
// was sized for characters the label wasn't actually showing. Rather than
// re-tuning that guess per caller (again), the box is now measured
// directly off the real, currently-rendered <text> node's own SVG bounding
// box the instant it's double-clicked (see startEdit below) — whatever
// glyphs are actually on screen, in whatever font, with whatever prefix or
// suffix a caller adds, the chip fits them exactly. No per-tool tuning,
// ever, is the point: every caller — curves, chamfer, fillet, radius,
// angle, anything added later — automatically gets a correctly-fitted,
// consistently-styled chip for free.
import { useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

// Breathing room around the measured text — small and constant (not
// per-glyph), so it never needs re-tuning as fonts/labels change. In SVG
// user units, same space the measured bbox comes back in.
const PAD_X = 2.4;
const PAD_Y = 2.2;
// A little extra width so the chip doesn't feel like it's about to clip
// the instant you type one more digit than the seed had.
const TYPING_ROOM = 3;
// Floor so a one-character value (or an empty/degenerate bbox) still gets
// a usable click target instead of a sliver.
const MIN_W = 13;
const MIN_H = 8;

export type DimensionLabelProps = {
  x: number; y: number;
  dy?: number;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: 'middle';
  transform?: string;
  className: string;
  children: ReactNode;          // what the label shows (may carry a prefix, e.g. "D12.00")
  seed: string;                 // the plain number the editor opens with
  editing: boolean;
  onStartEdit: (seed: string) => void;
  onChange: (value: string) => void;
  // `changed`: whether the typed text differs from the seed.
  onCommit: (value: string, changed: boolean) => void;
  onCancel: () => void;
  onMouseDown?: (evt: ReactMouseEvent<SVGTextElement>) => void;
  onClick?: (evt: ReactMouseEvent<SVGTextElement>) => void;
};

export function DimensionLabel(p: DimensionLabelProps) {
  // Set once Enter/Escape has settled this edit, so the blur that follows
  // the editor's removal can't commit a cancelled (or already-committed) value.
  const settledRef = useRef(false);
  const textRef = useRef<SVGTextElement | null>(null);
  // The just-clicked text's own real bounding box (pre-transform, the same
  // coordinate space the foreignObject below is placed in) — captured the
  // instant edit starts, so every caller's chip is sized off what was
  // actually on screen rather than a guess. Null only for the render(s)
  // before edit begins, and as a safety fallback if a measurement ever
  // comes back degenerate.
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // The label's own actual font size/family — read off it the same moment
  // the box is measured, so a chip always fits the text it's replacing even
  // if some future caller's label renders at a different size than the
  // 7px every current one uses. Weight stays the CSS's own fixed 600 (see
  // .dim-edit-input) — the chip is deliberately bolder than a passive
  // label, a consistent "you're editing this" look, not a mirror of it.
  const [font, setFont] = useState<{ size: string; family: string } | null>(null);
  if (!p.editing) {
    return (
      <text ref={textRef} x={p.x} y={p.y} dy={p.dy} textAnchor={p.textAnchor} dominantBaseline={p.dominantBaseline}
        transform={p.transform} className={p.className}
        onMouseDown={p.onMouseDown} onClick={p.onClick}
        onDoubleClick={(evt) => {
          evt.stopPropagation();
          settledRef.current = false;
          const node = textRef.current;
          const bbox = node?.getBBox();
          setBox(bbox && bbox.width > 0 && bbox.height > 0 ? { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height } : null);
          if (node) { const cs = getComputedStyle(node); setFont({ size: cs.fontSize, family: cs.fontFamily }); }
          p.onStartEdit(p.seed);
        }}
      >{p.children}</text>
    );
  }
  const commit = (value: string) => {
    if (settledRef.current) return;
    settledRef.current = true;
    p.onCommit(value, value.trim() !== p.seed.trim());
  };
  const cancel = () => { settledRef.current = true; p.onCancel(); };
  // Hug the real, measured glyphs (see the double-click handler above) with
  // a small constant pad, plus a little room to type past the seed's own
  // length. The Math.max fallback only ever fires if a measurement was
  // somehow unavailable (e.g. edit re-entered without a fresh double-click
  // in some future caller) — same shape as the real thing, just not
  // measured, so the chip is never absent or degenerate.
  const w = Math.max(MIN_W, (box?.w ?? p.seed.length * 4.2) + TYPING_ROOM + PAD_X * 2);
  const h = Math.max(MIN_H, (box?.h ?? 7) + PAD_Y * 2);
  const left = box ? box.x - (w - box.w) / 2 : p.textAnchor === 'middle' ? p.x - w / 2 : p.textAnchor === 'end' ? p.x - w : p.x;
  const top = box ? box.y - (h - box.h) / 2
    // Fallback only (no measurement yet): centre on the glyphs the same way
    // the old fixed-size chip did — the text's baseline is y + dy, digits
    // sit ~0.35em above it.
    : (p.dominantBaseline === 'middle' ? p.y : p.y + (p.dy ?? 0) - 7 * 0.35) - h / 2;
  return (
    <foreignObject x={left} y={top} width={w} height={h} transform={p.transform} className="dim-edit-host">
      <input
        className="dim-edit-input"
        // line-height = the chip's own measured height centres the text
        // vertically no matter what that height came out to (it varies:
        // real bboxes differ by label/font), instead of the old fixed 9px
        // baked into the CSS for one fixed box height. fontSize/fontFamily
        // mirror whatever the label was actually rendered in, so a chip
        // never looks a different size than the text it just replaced.
        style={{ lineHeight: `${h}px`, ...(font ? { fontSize: font.size, fontFamily: font.family } : {}) }}
        autoFocus
        type="text"
        inputMode="decimal"
        defaultValue={p.seed}
        onFocus={(evt) => evt.target.select()}
        onChange={(evt) => p.onChange(evt.target.value)}
        onBlur={(evt) => commit(evt.target.value)}
        onKeyDown={(evt) => {
          if (evt.key === 'Enter') { evt.preventDefault(); commit(evt.currentTarget.value); }
          else if (evt.key === 'Escape') { evt.preventDefault(); cancel(); }
        }}
        onClick={(evt) => evt.stopPropagation()}
        onMouseDown={(evt) => evt.stopPropagation()}
        onDoubleClick={(evt) => evt.stopPropagation()}
      />
    </foreignObject>
  );
}
