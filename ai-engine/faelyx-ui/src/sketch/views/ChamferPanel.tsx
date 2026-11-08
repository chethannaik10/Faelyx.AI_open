// Inspector: a selected chamfer line's own parameters. Distance A / B (from
// the corner it cut off, along each parent line), its length and its angle
// to the first parent — editing any of them changes only this chamfer (see
// applyChamferValues in useSketchCore); the parent lines keep their
// directions and every other dimension of the sketch stays as it was.
import { useState } from 'react';
import type { SketchUI } from '../handlers';

export function ChamferPanel({ core, lineId }: { core: SketchUI; lineId: string }) {
  const { chamferInfo, chamferMeasure, applyChamferValues, scaleChamfer, lenNum, toU, uLabel, setError, setSelected } = core;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const info = chamferInfo(lineId);
  const m = info && chamferMeasure(info);
  if (!info || !m) return null;
  const fields: { key: 'a' | 'b' | 'length' | 'angle'; label: string; value: string; unit: string }[] = [
    { key: 'a', label: 'Distance A', value: toU(m.a).toFixed(2), unit: uLabel },
    { key: 'b', label: 'Distance B', value: toU(m.b).toFixed(2), unit: uLabel },
    { key: 'length', label: 'Chamfer length', value: toU(m.length).toFixed(2), unit: uLabel },
    // A length + angle chamfer's angle is a real constraint, already edited
    // just below as "Chamfer angle" — only a two-lengths one needs it here.
    ...(info.angle ? [] : [{ key: 'angle' as const, label: 'Chamfer angle', value: m.angle.toFixed(1), unit: '°' }]),
  ];
  const commit = (key: string) => {
    const raw = drafts[key];
    setDrafts((d) => { const { [key]: _gone, ...rest } = d; void _gone; return rest; });
    if (raw === undefined) return;
    const v = key === 'angle' ? Number(raw) : lenNum(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    if (key === 'length') { scaleChamfer(lineId, v); return; }
    const err = applyChamferValues(lineId, key === 'a' ? { a: v } : key === 'b' ? { b: v } : { angle: v });
    setError(err);
  };
  return (
    <div className="chamfer-panel" data-chamfer={lineId}>
      <div className="eyebrow">CHAMFER · {info.d2 ? 'TWO LENGTHS' : 'LENGTH + ANGLE'}</div>
      {fields.map((f) => (
        <label key={f.key} className="property-input">{f.label} ({f.unit})
          <input type="number" value={drafts[f.key] ?? f.value}
            onChange={(event) => setDrafts((d) => ({ ...d, [f.key]: event.target.value }))}
            onBlur={() => commit(f.key)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(f.key); } }} />
        </label>
      ))}
      <div className="relations-row"><span>Parents</span>
        {[info.line1, info.line2].map((id) => <button key={id} onClick={() => setSelected([id])}>{id}</button>)}
        <button onClick={() => setSelected([info.corner])}>corner</button>
      </div>
      <div className="sketch-hint">Only this chamfer changes: its cuts slide along the parent lines; the corner, the parents' directions and the rest of the sketch stay put.</div>
    </div>
  );
}
