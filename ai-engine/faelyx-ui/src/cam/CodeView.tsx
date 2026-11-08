// Machine-code viewer: virtualised (only the visible rows are in the DOM, so a 100 000-line
// program scrolls smoothly), syntax coloured for G-code / Siemens / Heidenhain dialects,
// follows the simulation playhead, and can switch to a plain text editor.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const ROW = 17;

const TOKEN = /(\([^)]*\))|(;.*$)|(\bBEGIN PGM|\bEND PGM|\bCYCL DEF|\bTOOL CALL|\bTOOL DEF|\bBLK FORM|\bFMAX\b|\bMCALL\b|\bCYCLE\d+|\bTRAORI\b|\bTRAFOOF\b|\bSUPA\b|\bSTART_PRINT\b|\bEND_PRINT\b|\bSET_[A-Z_]+|\bSTOP\b|\bTOOL\b)|(\b[Gg]0*[0-3](?![\d.]))|(\b[Gg]\d+(?:\.\d+)?)|(\b[Mm]\d+)|(\b[Tt]\d+)|(^\s*[NnOo]\d+)|(?<![A-Za-z])([XYZABCUVWIJKRQPxyzabcuvwijkrqp])([+-]?\d*\.?\d+)|(?<![A-Za-z])([Ee])([+-]?\d*\.?\d+)|(?<![A-Za-z])([Ff])(\d+(?:\.\d+)?)|(?<![A-Za-z])([Ss])(\d+(?:\.\d+)?)|(\bL\b)/gm;

type Tok = [string, string];
function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  let last = 0;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  const push = (cls: string, text: string) => { if (text) out.push([cls, text]); };
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) push('', line.slice(last, m.index));
    if (m[1] !== undefined) push('cg-c', m[1]);
    else if (m[2] !== undefined) push('cg-c', m[2]);
    else if (m[3] !== undefined) push('cg-kw', m[3]);
    else if (m[4] !== undefined) push('cg-g1', m[4]);
    else if (m[5] !== undefined) push('cg-gx', m[5]);
    else if (m[6] !== undefined) push('cg-m', m[6]);
    else if (m[7] !== undefined) push('cg-t', m[7]);
    else if (m[8] !== undefined) push('cg-n', m[8]);
    else if (m[9] !== undefined) { push('cg-ax', m[9]); push('cg-av', m[10]); }
    else if (m[11] !== undefined) { push('cg-ae', m[11]); push('cg-av', m[12]); }
    else if (m[13] !== undefined) { push('cg-f', m[13]); push('cg-fv', m[14]); }
    else if (m[15] !== undefined) { push('cg-s', m[15]); push('cg-sv', m[16]); }
    else if (m[17] !== undefined) push('cg-g1', m[17]);
    last = m.index + m[0].length;
    if (m[0].length === 0) TOKEN.lastIndex++;
  }
  if (last < line.length) push('', line.slice(last));
  // rapid moves get their own tint
  if (out.length && /^cg-g1$/.test(out[0][0]) && /^[Gg]0*0$/.test(out[0][1])) out[0][0] = 'cg-g0';
  for (let i = 0; i < out.length; i++) if (out[i][0] === 'cg-g1' && /^[Gg]0*0$/.test(out[i][1])) out[i][0] = 'cg-g0';
  return out;
}

const Row = memo(function Row({ i, text, active, flag, onPick }: { i: number; text: string; active: boolean; flag?: string; onPick: (i: number) => void }) {
  const toks = useMemo(() => tokenize(text), [text]);
  return (
    <div className={`cg-row${active ? ' cg-row-on' : ''}${flag ? ` cg-flag-${flag}` : ''}`} style={{ top: i * ROW, height: ROW }} onClick={() => onPick(i)}>
      <span className="cg-ln">{i + 1}</span>
      <span className="cg-txt">{toks.length ? toks.map((t, k) => <span key={k} className={t[0] || undefined}>{t[1]}</span>) : ' '}</span>
    </div>
  );
});

export interface CodeViewProps {
  lines: string[];
  active: number;                         // line index highlighted by the simulation
  flags?: Map<number, 'error' | 'warn'>;  // lines where the simulation found a problem
  follow: boolean;
  editing: boolean;
  onPick: (line: number) => void;
  onEdit: (text: string) => void;
}

export default function CodeView({ lines, active, flags, follow, editing, onPick, onEdit }: CodeViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [h, setH] = useState(300);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el); setH(el.clientHeight);
    return () => ro.disconnect();
  }, [editing]);

  // keep the playhead line in view while the simulation runs
  useEffect(() => {
    const el = box.current;
    if (!el || !follow || editing) return;
    const y = active * ROW;
    if (y < el.scrollTop + ROW * 2 || y > el.scrollTop + el.clientHeight - ROW * 3) el.scrollTop = Math.max(0, y - el.clientHeight / 2);
  }, [active, follow, editing]);

  const [draft, setDraft] = useState('');
  useEffect(() => { if (editing) setDraft(lines.join('\n')); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (editing) {
    return <textarea className="cg-editor" spellCheck={false} value={draft} onChange={(e) => { setDraft(e.target.value); onEdit(e.target.value); }} />;
  }
  const first = Math.max(0, Math.floor(top / ROW) - 8);
  const last = Math.min(lines.length, Math.ceil((top + h) / ROW) + 8);
  const rows: ReactNode[] = [];
  for (let i = first; i < last; i++) rows.push(<Row key={i} i={i} text={lines[i]} active={i === active} flag={flags?.get(i)} onPick={onPick} />);
  return (
    <div className="cg-scroll" ref={box} onScroll={(e) => setTop((e.target as HTMLDivElement).scrollTop)}>
      <div className="cg-canvas" style={{ height: lines.length * ROW }}>{rows}</div>
    </div>
  );
}
