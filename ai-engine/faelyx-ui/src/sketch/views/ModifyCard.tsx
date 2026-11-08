// The Parameters section of the tool card for the MODIFY tools — Mirror, Translate, Rotate, Offset and
// Project 3D Element. Every field is bound to the same state the canvas preview uses (handlers/modifyTools.tsx),
// so typing here moves the preview and clicking on the canvas fills the fields in.
import type { SketchUI } from '../handlers';

function Num({ label, value, set, onEnter, min, step, onFocus }: { label: string; value: string; set: (v: string) => void; onEnter?: () => void; min?: number; step?: number; onFocus?: () => void }) {
  return (
    <label className="property-input">{label}
      <input type="number" value={value} min={min} step={step} onFocus={onFocus}
        onChange={(event) => set(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && onEnter) { event.preventDefault(); onEnter(); } }} />
    </label>
  );
}
function Toggle<T extends string | boolean>({ label, value, options, set }: { label?: string; value: T; options: readonly (readonly [T, string])[]; set: (v: T) => void }) {
  return (
    <div className="tool-card-toggle">
      {label && <span className="tool-card-toggle-label">{label}</span>}
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" className={value === v ? 'anchor-active' : ''} onClick={() => set(v)}>{text}</button>
      ))}
    </div>
  );
}

export function ModifyParams({ core }: { core: SketchUI }) {
  const c = core;
  const o = c.modOpts;
  const mode = c.modMode;
  const { uLabel, toU } = c;
  if (!mode) return null;

  const picking = c.modStage === 'entities';
  const count = c.modSelectionCount;
  const everything = () => c.setSelected([...c.lines.filter((l) => l.style !== 'projected' && l.style !== 'infinite').map((l) => l.id), ...c.circles.map((x) => x.id), ...c.arcs.map((x) => x.id), ...c.curves.map((x) => x.id)]);

  const picker = mode !== 'project-3d' && (
    <div className="modify-pick">
      <div className="modify-pick-count">{mode === 'offset-2d' ? `${c.modOffChains.length} chain${c.modOffChains.length === 1 ? '' : 's'} picked` : `${count} element${count === 1 ? '' : 's'} selected`}</div>
      <div className="tool-card-actions">
        {picking
          ? <>
            {mode !== 'offset-2d' && <button className="outline-action" onClick={everything}>Select all</button>}
            <button className="outline-action" disabled={!c.modHasSelection} onClick={c.modContinue}>Continue →</button>
          </>
          : <button className="outline-action" onClick={c.modBack}>{mode === 'offset-2d' ? '+ Add element' : 'Change selection'}</button>}
      </div>
    </div>
  );

  if (mode === 'mirror-2d') {
    return <>
      {picker}
      <Toggle label="Result" value={o.mirrorAssoc} options={[[true, 'Associative'], [false, 'Independent']] as const} set={o.setMirrorAssoc} />
      <div className="sketch-hint">{o.mirrorAssoc
        ? 'Each mirrored point is tied to its original by a Symmetry constraint (and circles by Equal radius) — edit the original and the copy follows.'
        : 'Plain mirrored copies. The constraints that exist between the picked elements are copied; nothing ties the copy to the original.'}</div>
    </>;
  }

  if (mode === 'translate-2d') {
    const apply = c.modApply;
    return <>
      {picker}
      <Toggle label="Define by" value={o.trMode} options={[['xy', 'ΔX / ΔY'], ['polar', 'Distance + angle']] as const} set={o.setTrMode} />
      {o.trMode === 'xy'
        ? <>
          <Num label={`ΔH — to the right (${uLabel})`} value={o.trDx} set={o.setTrDx} onEnter={apply} />
          <Num label={`ΔV — up (${uLabel})`} value={o.trDy} set={o.setTrDy} onEnter={apply} />
        </>
        : <>
          <Num label={`Distance (${uLabel})`} value={o.trDist} set={o.setTrDist} onEnter={apply} min={0} />
          <Num label="Angle from H, counter-clockwise (°)" value={o.trAng} set={o.setTrAng} onEnter={apply} />
        </>}
      <Toggle label="Original" value={o.trKeep} options={[[false, 'Move it'], [true, 'Keep it (copy)']] as const} set={o.setTrKeep} />
      {o.trKeep && <Num label="Number of copies" value={o.trCount} set={o.setTrCount} onEnter={apply} min={1} step={1} />}
      <div className="tool-card-actions"><button className="outline-action" disabled={picking} onClick={apply}>{o.trKeep ? 'Apply copy' : 'Apply move'}</button>{c.modVecFrom && <button className="outline-action" onClick={() => c.modSetVecFrom(null)}>Reset start</button>}</div>
      <div className="sketch-hint">Or click a start point and an end point on the canvas — snaps to existing points and the grid.</div>
    </>;
  }

  if (mode === 'rotate-2d') {
    const centre = c.modCentre;
    const apply = c.modApply;
    const live = c.modLiveAngle;
    return <>
      {picker}
      <Num label={`Centre H (${uLabel})`} value={centre ? toU(centre.x - c.SKETCH_ORIGIN.x).toFixed(2) : ''} set={(v) => { const n = Number(v); if (Number.isFinite(n) && v !== '') c.modSetVecFrom({ x: c.SKETCH_ORIGIN.x + n * c.unitMm, y: centre ? centre.y : c.SKETCH_ORIGIN.y }); }} />
      <Num label={`Centre V (${uLabel})`} value={centre ? toU(c.SKETCH_ORIGIN.y - centre.y).toFixed(2) : ''} set={(v) => { const n = Number(v); if (Number.isFinite(n) && v !== '') c.modSetVecFrom({ x: centre ? centre.x : c.SKETCH_ORIGIN.x, y: c.SKETCH_ORIGIN.y - n * c.unitMm }); }} />
      <Num label="Angle, counter-clockwise (°)" value={live !== null && o.rotFollow && centre ? live.toFixed(1) : o.rotAngle}
        set={(v) => { o.setRotFollow(false); o.setRotAngle(v); }} onEnter={apply} onFocus={() => { if (live !== null) o.setRotAngle(live.toFixed(1)); o.setRotFollow(false); }} />
      <Toggle label="Original" value={o.rotKeep} options={[[false, 'Move it'], [true, 'Keep it (copy)']] as const} set={o.setRotKeep} />
      {o.rotKeep && <Num label="Number of copies (each turned a further step)" value={o.rotCount} set={o.setRotCount} onEnter={apply} min={1} step={1} />}
      <div className="tool-card-actions"><button className="outline-action" disabled={picking} onClick={apply}>{o.rotKeep ? 'Apply copy' : 'Apply rotation'}</button>{!o.rotFollow && centre && <button className="outline-action" onClick={() => o.setRotFollow(true)}>Follow cursor</button>}</div>
      <div className="sketch-hint">Click the centre, then either move the cursor and click (the angle follows it, whole degrees) or type an angle and press Apply.</div>
    </>;
  }

  if (mode === 'offset-2d') {
    const apply = c.modApply;
    return <>
      {picker}
      <Num label={`Offset distance (${uLabel})`} value={o.offDist} set={o.setOffDist} min={0} onEnter={apply} />
      <Toggle label="Corners" value={o.offCorner} options={[['sharp', 'Sharp'], ['round', 'Round'], ['chain', 'Chained']] as const} set={o.setOffCorner} />
      <Toggle label="Side" value={o.offBoth} options={[[false, 'Click a side'], [true, 'Both sides']] as const} set={o.setOffBoth} />
      <Toggle label="Pick" value={o.offProp} options={[['point', 'Connected chain'], ['tangent', 'Tangent chain'], ['none', 'Single element']] as const} set={o.setOffProp} />
      <Toggle label="Result" value={o.offLink} options={[[true, 'Linked to source'], [false, 'Independent']] as const} set={o.setOffLink} />
      <div className="sketch-hint">Corners where the offset pieces would leave a gap are extended to a point (Sharp), rounded with an arc of the offset radius (Round) or closed with a straight segment (Chained); where they overlap they are trimmed. A linked offset is rebuilt whenever its source changes.</div>
      {c.modGroups.length > 0 && <div className="modify-groups">
        <div className="eyebrow">OFFSETS IN THIS SKETCH</div>
        {c.modGroups.map((g) => (
          <div key={g.id} className="modify-group">
            <div className="modify-group-title">{g.label.replace(/ \(linked.*$/, '')} · distance ({uLabel}) · corners</div>
            <GroupDistance core={c} id={g.id} dist={g.dist} />
          </div>
        ))}
      </div>}
    </>;
  }

  // project-3d
  const avail = c.modProjection;
  const records = c.constraints.filter((k) => k.type === 'projection');
  return <>
    <Toggle label="Project" value={o.projKind} options={[['edge', 'Edge / curve'], ['face', 'Face boundary'], ['vertex', 'Vertex']] as const} set={o.setProjKind} />
    {!avail.available && <div className="tool-card-empty">This sketch is not attached to the 3D model yet — open it from 3D Design (Sketch tab) to project model geometry.</div>}
    {avail.available && !avail.hasModel && <div className="tool-card-empty">The model has no edges yet — build a feature (Pad, Pocket …) or add reference geometry, then come back.</div>}
    <div className="sketch-hint">Projected geometry is shown in yellow and is locked: it is a reference to dimension and constrain against, never part of the profile. If the 3D model changes it moves with it; if its source disappears it turns red.</div>
    {records.length > 0 && <div className="modify-groups">
      <div className="eyebrow">PROJECTIONS IN THIS SKETCH</div>
      {records.map((k) => (
        <div key={k.id} className="relations-row"><span>{k.label}</span>
          <button onClick={() => { const pre = String((k.args as { prefix?: string }).prefix); c.setSelected(c.lines.filter((l) => l.id.startsWith(pre)).map((l) => l.id)); }}>{(k.args as { status?: string }).status === 'lost' ? 'source lost' : 'select'}</button>
          <button onClick={() => c.modUnlinkGroup(k.id)}>release</button>
        </div>
      ))}
    </div>}
  </>;
}

// A committed distance field for a linked offset (applies on Enter / blur, like the other Inspector fields).
function GroupDistance({ core, id, dist }: { core: SketchUI; id: string; dist: number }) {
  const { toU, lenNum, modSetGroupDistance, modSetGroupCorner, modUnlinkGroup, uLabel } = core;
  const g = core.modGroups.find((x) => x.id === id);
  return (
    <div className="modify-group-row">
      <input type="number" min={0} step="any" defaultValue={toU(dist).toFixed(2)} key={`${id}:${dist}`} aria-label={`Offset distance (${uLabel})`}
        onBlur={(e) => modSetGroupDistance(id, lenNum(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); modSetGroupDistance(id, lenNum((e.target as HTMLInputElement).value)); } }} />
      <select value={g?.corner ?? 'sharp'} onChange={(e) => modSetGroupCorner(id, e.target.value as 'sharp' | 'round' | 'chain')}>
        <option value="sharp">Sharp</option><option value="round">Round</option><option value="chain">Chained</option>
      </select>
      <button className="outline-action" onClick={() => modUnlinkGroup(id)}>Unlink</button>
    </div>
  );
}
