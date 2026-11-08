// Small form controls for the CAM workspace. They reuse the .rx-* styles of the RenderX panels so both
// workspaces look and behave alike.
import { useEffect, useState, type ReactNode } from 'react';

export function Section({ title, icon, children, action, badge }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode; badge?: string }) {
  return (
    <section className="rx-section">
      <header><span>{icon}{title}</span>{badge ? <em className="rx-badge">{badge}</em> : action}</header>
      <div className="rx-section-body">{children}</div>
    </section>
  );
}

export function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className="rx-toggle" title={hint} style={disabled ? { opacity: 0.45 } : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><i /><span>{label}</span>
    </label>
  );
}

export function Dropdown<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: { id: T; label: string; group?: string }[]; onChange: (v: T) => void; hint?: string }) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <label className="rx-field" title={hint}>
      <span className="rx-field-top"><span>{label}</span></span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {groups.length === 1 && groups[0] === ''
          ? options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)
          : groups.map((g) => <optgroup key={g} label={g || 'Other'}>{options.filter((o) => (o.group ?? '') === g).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>)}
      </select>
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return <div className="rx-seg">{options.map((o) => <button key={o.id} className={o.id === value ? 'rx-seg-on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}</div>;
}

/** Numeric field that lets the user type freely and commits on blur / Enter. */
export function Num({ label, value, onChange, min, max, step, unit, digits = 2 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; digits?: number }) {
  const [text, setText] = useState(String(+value.toFixed(digits)));
  useEffect(() => { setText(String(+value.toFixed(digits))); }, [value, digits]);
  const commit = () => {
    let v = parseFloat(text);
    if (!Number.isFinite(v)) { setText(String(+value.toFixed(digits))); return; }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v); setText(String(+v.toFixed(digits)));
  };
  return (
    <label className="rx-num">
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}{unit ? ` (${unit})` : ''}</span>
      <input style={{ width: 66, flex: 'none' }} type="number" inputMode="decimal" step={step} value={text}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

export function Text({ label, value, onChange, placeholder, type = 'text', mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <label className="rx-field">
      <span className="rx-field-top"><span>{label}</span></span>
      <input className="cam-text" style={mono ? { fontFamily: "'DM Mono',monospace" } : undefined} type={type} value={value} placeholder={placeholder}
        autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Slide({ label, value, min, max, step = 1, onChange, unit = '', digits = 0 }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string; digits?: number }) {
  return (
    <label className="rx-field">
      <span className="rx-field-top"><span>{label}</span><b>{value.toFixed(digits)}{unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="cam-kv">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
  );
}

export function Note({ children, tone }: { children: ReactNode; tone?: 'warn' | 'err' | 'ok' }) {
  return <p className={`rx-note${tone ? ` cam-note-${tone}` : ''}`}>{children}</p>;
}

export const fmtTime = (min: number) => {
  if (!Number.isFinite(min)) return '–';
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 90) return `${min.toFixed(1)} min`;
  return `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;
};
