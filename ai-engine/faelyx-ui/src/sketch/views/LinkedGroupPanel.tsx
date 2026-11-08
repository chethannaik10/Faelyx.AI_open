// Inspector: the picked entity belongs to a linked Offset, or is geometry projected from the 3D model.
// A linked offset keeps its distance and corner style editable (it is rebuilt from its source); projected
// geometry is a locked reference that follows the model.
import type { SketchUI } from '../handlers';

export function LinkedGroupPanel({ core }: { core: SketchUI }) {
  const { selectedSingleId, modGroupOf, modSetGroupDistance, modSetGroupCorner, modUnlinkGroup, modProjectedIds, modLostIds, constraints, toU, lenNum, uLabel } = core;
  if (!selectedSingleId) return null;
  const g = modGroupOf(selectedSingleId);
  if (g) {
    return (
      <div className="chamfer-panel" data-offset-group={g.id}>
        <div className="eyebrow">OFFSET · LINKED TO SOURCE</div>
        <label className="property-input">Offset distance ({uLabel})
          <input type="number" min={0} step="any" key={`${g.id}:${g.dist}`} defaultValue={toU(g.dist).toFixed(2)}
            onBlur={(e) => modSetGroupDistance(g.id, lenNum(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); modSetGroupDistance(g.id, lenNum((e.target as HTMLInputElement).value)); } }} />
        </label>
        <label className="property-input">Corners
          <select value={g.corner} onChange={(e) => modSetGroupCorner(g.id, e.target.value as 'sharp' | 'round' | 'chain')}>
            <option value="sharp">Sharp</option><option value="round">Round</option><option value="chain">Chained</option>
          </select>
        </label>
        <div className="tool-card-actions"><button className="outline-action" onClick={() => modUnlinkGroup(g.id)}>Unlink (keep as plain geometry)</button></div>
        <div className="sketch-hint">This geometry is rebuilt from its source whenever the source changes. Edit the distance here; Unlink to edit the pieces freely.</div>
      </div>
    );
  }
  if (modProjectedIds.has(selectedSingleId)) {
    const rec = constraints.find((k) => k.type === 'projection' && selectedSingleId.startsWith(String((k.args as { prefix?: string }).prefix)));
    const lost = modLostIds.has(selectedSingleId);
    return (
      <div className="chamfer-panel" data-projected={rec?.id}>
        <div className="eyebrow">{rec?.label?.toUpperCase() ?? 'PROJECTED 3D ELEMENT'} · LOCKED</div>
        <div className="sketch-hint">{lost ? 'The 3D element this was projected from no longer exists, so it stays where it was. Release it to edit it freely.' : 'Reference geometry projected from the 3D model. It follows the model and cannot be moved here — dimension and constrain your own geometry to it.'}</div>
        {rec && <div className="tool-card-actions"><button className="outline-action" onClick={() => modUnlinkGroup(rec.id)}>Release (keep as plain geometry)</button></div>}
      </div>
    );
  }
  return null;
}
