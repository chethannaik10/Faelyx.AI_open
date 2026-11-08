// Inspector: the dimensions that drive the selected element (a chamfer's
// or any other angle, a point's distances), each editable in place — type a new value and
// press Enter, and the sketch re-solves to it.
import { useState } from 'react';
import type { Constraint } from '../types';
import type { SketchUI } from '../handlers';

const NAMES: Record<string, string> = { distance: 'Distance', angle: 'Angle', radius: 'Radius' };

export function ConstraintValues({ core, id }: { core: SketchUI; id: string }) {
  const { constraints, points, constraintValueText, setConstraintValue, uLabel } = core;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // A line's own length and a circle's radius already have their fields
  // above (Length/Radius write the same constraint), so this adds the rest:
  // the angles a line takes part in, and the distances from a point.
  const isPoint = points.some((p) => p.id === id);
  const drives = (c: Constraint) => {
    if (!('value' in c.args)) return false;
    if (c.type === 'angle') return c.args.line1 === id || c.args.line2 === id;
    if (c.type === 'distance') return isPoint && (c.args.p1 === id || c.args.p2 === id);
    return false;
  };
  const list = constraints.filter(drives);
  if (list.length === 0) return null;
  const commit = (c: Constraint) => {
    const raw = drafts[c.id];
    if (raw !== undefined) setConstraintValue(c.id, raw);
    setDrafts((d) => { const { [c.id]: _gone, ...rest } = d; void _gone; return rest; });
  };
  return (
    <>
      {list.map((c) => (
        <label key={c.id} className="property-input">
          {c.label.startsWith('Chamfer angle') ? 'Chamfer angle' : NAMES[c.type]} ({c.type === 'angle' ? '°' : uLabel})
          <input type="number" value={drafts[c.id] ?? constraintValueText(c)}
            onChange={(event) => setDrafts((d) => ({ ...d, [c.id]: event.target.value }))}
            onBlur={() => commit(c)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(c); } }} />
        </label>
      ))}
    </>
  );
}
