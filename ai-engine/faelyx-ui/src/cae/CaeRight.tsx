// Right panel of the CAE workspace: result display, inspection (probes, extremes, hot-spots, safety map) and report export.
import { Crosshair, Download, FileText, FileType2, Loader2, Play, Pause, Target, Trash2, AlertTriangle, CheckCircle2, XCircle, MapPin } from 'lucide-react';
import { Section, Toggle, Dropdown, Seg, Slide, KV, Note, Text } from '../cam/camUi';
import { CMAPS, fmtNum, type CmapId } from './colormaps';
import type { ViewInfo, ViewOpts } from './CaeView';
import type { Result } from './model';
import { NumF, type Probe, type RightTab, type V3 } from './caeUi';

export interface RightProps {
  tab: RightTab; setTab: (t: RightTab) => void;
  result: Result | null; stale: boolean;
  opts: ViewOpts; setOpts: (p: Partial<ViewOpts>) => void; info: ViewInfo | null;
  probing: boolean; setProbing: (v: boolean) => void; probes: Probe[]; removeProbe: (id: number) => void; clearProbes: () => void;
  onFocus: (p: V3) => void;
  playing: boolean; setPlaying: (v: boolean) => void;
  project: string; setProject: (v: string) => void; author: string; setAuthor: (v: string) => void;
  reportBusy: string | null; reportErr: string; onExport: (kind: 'pdf' | 'docx') => void;
}

const TABS: { id: RightTab; label: string }[] = [{ id: 'display', label: 'DISPLAY' }, { id: 'inspect', label: 'INSPECT' }, { id: 'report', label: 'REPORT' }];

export default function CaeRight(p: RightProps) {
  return (
    <aside className="rx-panel rx-right cae-right">
      <div className="rx-panel-head"><span className="eyebrow">POST-PROCESSING</span><strong>CONTOURS · PROBES · REPORT</strong></div>
      <div className="rx-tabs">{TABS.map((t) => <button key={t.id} className={p.tab === t.id ? 'rx-tab-on' : ''} onClick={() => p.setTab(t.id)}>{t.label}</button>)}</div>
      <div className="rx-scroll">
        {p.tab === 'display' && <DisplayTab {...p} />}
        {p.tab === 'inspect' && <InspectTab {...p} />}
        {p.tab === 'report' && <ReportTab {...p} />}
      </div>
    </aside>
  );
}

function DisplayTab({ result: r, opts, setOpts, info, playing, setPlaying }: RightProps) {
  const field = r?.fields.find((f) => f.id === opts.field);
  const fieldOpts = (r?.fields ?? []).map((f) => ({ id: f.id, label: `${f.label}${f.unit ? ` (${f.unit})` : ''}`, group: f.domain === 'fluid' ? 'Fluid' : 'Solid' }));
  const hasTri = !!r?.tri;
  return (
    <>
      <Section title="View">
        <Seg value={opts.mode} options={[{ id: 'model', label: 'Model' }, { id: 'mesh', label: 'Mesh' }, { id: 'result', label: 'Results' }]} onChange={(v) => { if (v === 'result' && !r) return; setOpts({ mode: v }); }} />
        {!r && <p className="rx-note">Run an analysis to see contour plots, deformation and flow fields.</p>}
      </Section>

      {r && (
        <>
          <Section title="Contour plot">
            {fieldOpts.length > 0 && <Dropdown label="Result" value={opts.field} options={fieldOpts.some((o) => o.group === 'Fluid') ? fieldOpts : fieldOpts.map((o) => ({ ...o, group: undefined }))} onChange={(v) => setOpts({ field: v, mode: 'result' })} />}
            {hasTri && fieldOpts.length === 0 && <p className="rx-note">Surface result: {r.tri!.label} ({r.tri!.unit})</p>}
            <Dropdown label="Colour map" value={opts.cmap} options={CMAPS.map((c) => ({ id: c.id, label: c.label }))} onChange={(v) => setOpts({ cmap: v as CmapId })} />
            <Toggle label="Reverse colours" checked={opts.reverse} onChange={(v) => setOpts({ reverse: v })} />
            <Slide label="Colour bands (0 = smooth)" value={opts.bands} min={0} max={20} step={1} onChange={(v) => setOpts({ bands: v })} />
            <Toggle label="Automatic range" checked={opts.rangeAuto} onChange={(v) => setOpts({ rangeAuto: v, ...(v ? {} : { rmin: info?.lo ?? 0, rmax: info?.hi ?? 1 }) })} />
            {!opts.rangeAuto && <div className="cae-grid2"><NumF label="Min" value={opts.rmin} onChange={(v) => setOpts({ rmin: v })} wide /><NumF label="Max" value={opts.rmax} onChange={(v) => setOpts({ rmax: v })} wide /></div>}
            <Toggle label="Mesh edges" checked={opts.edges} onChange={(v) => setOpts({ edges: v })} />
            <Toggle label="Undeformed outline" checked={opts.ghost} onChange={(v) => setOpts({ ghost: v })} />
          </Section>

          {(r.disp || r.modes.length > 0 || r.frames.some((f) => f.disp)) && (
            <Section title="Deformation">
              <Slide label="Scale (× suggested)" value={opts.dispFactor} min={0} max={5} step={0.1} digits={1} unit="×" onChange={(v) => setOpts({ dispFactor: v })} />
              <p className="rx-note">Real scale shown: ×{info ? fmtNum(info.scale) : '–'} (suggested ×{fmtNum(r.dispScale)}). Set the slider to 0 to hide deformation.</p>
              {r.modes.length > 0 && <Toggle label="Animate the mode shape" checked={opts.animate} onChange={(v) => setOpts({ animate: v })} />}
            </Section>
          )}

          {r.modes.length > 0 && (
            <Section title="Mode shapes" badge={`${r.modes.length}`}>
              <div className="cae-list">
                {r.disp && <button className={opts.modeIdx < 0 ? 'on' : ''} onClick={() => setOpts({ modeIdx: -1, animate: false })}><span>Static</span></button>}
                {r.modes.map((m, i) => <button key={i} className={opts.modeIdx === i ? 'on' : ''} onClick={() => setOpts({ modeIdx: i })}><span>{m.label}</span><b>{m.freq > 0 ? `${fmtNum(m.freq)} Hz` : ''}</b></button>)}
              </div>
            </Section>
          )}

          {r.frames.length > 0 && (
            <Section title="Time / frames" badge={`${r.frames.length}`}>
              <div className="cae-row">
                <button className="rx-btn" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={11} /> : <Play size={11} />} {playing ? 'Pause' : 'Play'}</button>
                <button className={`rx-btn${opts.frame < 0 ? ' cae-btn-on' : ''}`} onClick={() => { setPlaying(false); setOpts({ frame: -1 }); }} style={{ flex: 1 }}>Envelope</button>
              </div>
              <Slide label={opts.frame >= 0 ? r.frames[opts.frame]?.label ?? '' : 'Frame'} value={Math.max(0, opts.frame)} min={0} max={r.frames.length - 1} step={1} onChange={(v) => { setPlaying(false); setOpts({ frame: v }); }} />
            </Section>
          )}

          {r.grid && (
            <Section title="Sections, slices, iso-surfaces">
              <Toggle label="Section cut (solid)" checked={opts.section.on} onChange={(v) => setOpts({ section: { ...opts.section, on: v } })} />
              {opts.section.on && <><Seg value={String(opts.section.axis) as '0' | '1' | '2'} options={[{ id: '0', label: 'X' }, { id: '1', label: 'Y' }, { id: '2', label: 'Z' }]} onChange={(v) => setOpts({ section: { ...opts.section, axis: Number(v) as 0 | 1 | 2 } })} /><Slide label="Position" value={opts.section.pos} min={0} max={1} step={0.01} digits={2} onChange={(v) => setOpts({ section: { ...opts.section, pos: v } })} /></>}
              <Toggle label="Slice plane (field in the whole domain)" checked={opts.slice.on} onChange={(v) => setOpts({ slice: { ...opts.slice, on: v } })} />
              {opts.slice.on && <><Seg value={String(opts.slice.axis) as '0' | '1' | '2'} options={[{ id: '0', label: 'X' }, { id: '1', label: 'Y' }, { id: '2', label: 'Z' }]} onChange={(v) => setOpts({ slice: { ...opts.slice, axis: Number(v) as 0 | 1 | 2 } })} /><Slide label="Position" value={opts.slice.pos} min={0} max={1} step={0.01} digits={2} onChange={(v) => setOpts({ slice: { ...opts.slice, pos: v } })} /></>}
              <Toggle label="Iso-surface of the field" checked={opts.iso.on} onChange={(v) => setOpts({ iso: { ...opts.iso, on: v } })} />
              {opts.iso.on && <Slide label={`Level (${field ? fmtNum(info ? info.lo + opts.iso.level * (info.hi - info.lo) : 0) + ' ' + field.unit : ''})`} value={opts.iso.level} min={0.02} max={0.98} step={0.01} digits={2} onChange={(v) => setOpts({ iso: { ...opts.iso, level: v } })} />}
            </Section>
          )}

          {r.streams.length > 0 && (
            <Section title="Flow lines" badge={`${r.streams.length}`}>
              <Toggle label="Velocity streamlines / vector flow lines" checked={opts.streams} onChange={(v) => setOpts({ streams: v })} />
              <p className="rx-note">Lines are coloured by speed with the contour range above.</p>
            </Section>
          )}
        </>
      )}
    </>
  );
}

function InspectTab({ result: r, opts, setOpts, info, probing, setProbing, probes, removeProbe, clearProbes, onFocus }: RightProps) {
  if (!r) return <Note>Run an analysis to inspect extremes, probe values and check the safety factor map.</Note>;
  const fos = r.fields.find((f) => f.id === 'fos');
  const f = info?.field;
  return (
    <>
      <Section title="Probe" icon={<Crosshair size={11} />} badge={`${probes.length}`} action={probes.length ? <button className="rx-btn cae-mini" onClick={clearProbes}>Clear</button> : undefined}>
        <Toggle label="Probe tool: click the result" checked={probing} onChange={(v) => { setProbing(v); if (v) setOpts({ mode: 'result' }); }} />
        {probing && <p className="rx-note">Left-click any point of the results to read the value (left click only selects, the view does not move).</p>}
        <div className="cae-list">
          {probes.map((q, i) => (
            <div key={q.id} className="cae-probe">
              <button onClick={() => onFocus(q.p)}><MapPin size={10} /> P{i + 1}</button>
              <span>{q.label}</span><b>{q.value === null ? '–' : `${fmtNum(q.value)} ${q.unit}`}</b>
              <button className="cae-icon" onClick={() => removeProbe(q.id)}><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      </Section>

      {f && info && (
        <Section title={`Extremes · ${f.label}`}>
          <div className="cae-ext">
            <button onClick={() => info.maxP && onFocus(info.maxP)}><span>Maximum</span><b>{fmtNum(info.max)} {f.unit}</b></button>
            <button onClick={() => info.minP && onFocus(info.minP)}><span>Minimum</span><b>{fmtNum(info.min)} {f.unit}</b></button>
          </div>
          <p className="rx-note">Click a value to fly to the point.</p>
        </Section>
      )}

      <Section title="Safety & failure map" icon={<Target size={11} />}>
        {fos ? (
          <>
            <Toggle label="Traffic-light safety-factor map" checked={opts.thresholdOn && opts.field === 'fos'} onChange={(v) => setOpts(v ? { field: 'fos', thresholdOn: true, mode: 'result' } : { thresholdOn: false })} />
            <NumF label="Required safety factor" value={opts.fosTarget} min={1} max={50} onChange={(v) => setOpts({ fosTarget: v })} />
            <div className="cae-fos">
              <span style={{ background: '#e91e1e' }} /><em>below 1 (yielded){info && opts.field === 'fos' ? ` · ${(info.failFrac * 100).toFixed(1)} %` : ''}</em>
              <span style={{ background: '#f9b81a' }} /><em>below {opts.fosTarget}{info && opts.field === 'fos' ? ` · ${(info.warnFrac * 100).toFixed(1)} %` : ''}</em>
              <span style={{ background: '#2ea861' }} /><em>meets the requirement</em>
            </div>
          </>
        ) : (
          <>
            <Toggle label="Grey out values below a threshold" checked={opts.thresholdOn} onChange={(v) => setOpts({ thresholdOn: v, ...(v && info ? { threshold: info.lo + 0.5 * (info.hi - info.lo) } : {}) })} />
            {opts.thresholdOn && <NumF label="Threshold" unit={f?.unit} value={opts.threshold} onChange={(v) => setOpts({ threshold: v })} wide />}
            {opts.thresholdOn && info && <p className="rx-note">{(info.aboveFrac * 100).toFixed(1)} % of the surface is at or above the threshold.</p>}
          </>
        )}
        <Toggle label="Markers for hot-spots and extremes" checked={opts.hotspots} onChange={(v) => setOpts({ hotspots: v, markers: v })} />
      </Section>

      <Section title="Hot-spots" badge={`${r.hotspots.length}`}>
        <div className="cae-list">
          {r.hotspots.map((h, i) => (
            <button key={i} onClick={() => onFocus([h.x, h.y, h.z])}><span>{h.label}</span><b>{fmtNum(h.value)}</b></button>
          ))}
          {!r.hotspots.length && <p className="rx-note">No hot-spots flagged.</p>}
        </div>
      </Section>
    </>
  );
}

function ReportTab({ result: r, stale, project, setProject, author, setAuthor, reportBusy, reportErr, onExport }: RightProps) {
  return (
    <>
      <Section title="Engineering report" icon={<FileText size={11} />}>
        <p className="rx-note">One click builds the report: executive summary, model and mesh metrics, load and boundary-condition diagram, results with contour plots and charts, checks, factor-of-safety compliance and the pass / fail verdict.</p>
        <Text label="Project / report title" value={project} onChange={setProject} />
        <Text label="Prepared by" value={author} onChange={setAuthor} placeholder="Name (optional)" />
        {r && (
          <div className={`cae-verdict ${r.verdict.pass === true ? 'pass' : r.verdict.pass === false ? 'fail' : 'info'}`}>
            {r.verdict.pass === true ? <CheckCircle2 size={13} /> : r.verdict.pass === false ? <XCircle size={13} /> : <AlertTriangle size={13} />}
            <span>{r.verdict.text || 'Informational result: no pass / fail criterion for this analysis.'}</span>
          </div>
        )}
        {stale && r && <Note tone="warn">The set-up changed since this run: re-run the analysis before issuing the report.</Note>}
        <div className="cae-row">
          <button className="rx-render" style={{ flex: 1 }} disabled={!r || !!reportBusy} onClick={() => onExport('pdf')}>{reportBusy === 'pdf' ? <Loader2 size={12} className="cam-spin" /> : <Download size={12} />} PDF</button>
          <button className="rx-render" style={{ flex: 1 }} disabled={!r || !!reportBusy} onClick={() => onExport('docx')}>{reportBusy === 'docx' ? <Loader2 size={12} className="cam-spin" /> : <FileType2 size={12} />} DOCX</button>
        </div>
        {!r && <p className="rx-note">Run an analysis first.</p>}
        {reportErr && <Note tone="err">{reportErr}</Note>}
      </Section>
      {r && (
        <Section title="Contents">
          <KV rows={[['Analysis', r.title], ['Mesh', `${r.mesh.elements.toLocaleString('en-US')} elements`], ['Checks', `${r.checks.filter((c) => c.ok).length} of ${r.checks.length} satisfied`], ['Charts', `${r.curves.length}`], ['Tables', `${r.tables.length}`]]} />
        </Section>
      )}
    </>
  );
}
