// Right side of the CAM workspace: the AI strategy advisor + generate button, tools & feeds, export & send.
import { useMemo, useState, type ReactNode } from 'react';
import { Sparkles, Wrench, Download, Send, AlertTriangle, CheckCircle2, Plug, Copy, FileCode, Box, Loader2, X } from 'lucide-react';
import { SEND_PROTOCOLS, TOOL_LIBRARY, controllerById, processById, stockMaterialById, printMaterialById, type SendProtocol, type Tool } from './camData';
import { millFeeds } from './feeds';
import { type Cfg, machineOf, withProcess } from './camConfig';
import { type Res, type SimData, resWarnings } from './camTypes';
import type { AnyAnalysis } from './camJobs';
import { KV, Note, Section, Text, Toggle, Dropdown, Seg, fmtTime } from './camUi';
import { downloadBlob } from '../render/exporters';
import { make3mf } from './zip';
import { sendProgram, testConnection, type SendResult } from './send';
import type { Mesh } from './geometry';
import { eventLabel } from './sim';

export type RightTab = 'ai' | 'tools' | 'export';
type SetCfg = (f: (c: Cfg) => Cfg) => void;

export interface RightProps {
  tab: RightTab; setTab: (t: RightTab) => void;
  cfg: Cfg; setCfg: SetCfg;
  analysis: AnyAnalysis | null; analysing: boolean; analysisErr: string;
  res: Res | null; stale: boolean; sim: SimData | null;
  busy: string | null; progress: number; error: string;
  onGenerate: () => void; onCancel: () => void;
  codeText: string; edited: boolean; partName: string; mesh: Mesh | null;
}

interface Advice { tone: 'info' | 'warn' | 'err'; text: string; action?: { label: string; apply: (c: Cfg) => Cfg } }

function advise(cfg: Cfg, an: AnyAnalysis | null): Advice[] {
  const out: Advice[] = [];
  if (!an) return out;
  const m = machineOf(cfg);
  if (an.family === 'mill') {
    const a = an.a;
    if (!a.watertight) out.push({ tone: 'warn', text: 'The mesh is not watertight, so volumes and some features are approximate. Check the model for gaps before cutting.' });
    const sideHoles = a.sideSetups.reduce((n, s) => n + s.holes, 0);
    if (sideHoles > 0 && cfg.process === 'mill3') {
      out.push({
        tone: 'warn', text: `${sideHoles} hole${sideHoles === 1 ? '' : 's'} sit${sideHoles === 1 ? 's' : ''} on the side faces and cannot be drilled from the top.`,
        action: m.processes.includes('mill5i') ? { label: 'Switch to 3+2 indexing', apply: (c) => withProcess(c, 'mill5i') } : undefined,
      });
    }
    if (sideHoles === 0 && cfg.process === 'mill5i') out.push({ tone: 'info', text: 'No features were found on the side faces. Plain 3-axis machining is enough for this part.', action: m.processes.includes('mill3') ? { label: 'Switch to 3-axis', apply: (c) => withProcess(c, 'mill3') } : undefined });
    if (a.surface.slope > 0.08 && cfg.process === 'mill3' && m.processes.includes('mill5s')) {
      out.push({ tone: 'info', text: `${(a.surface.slope * 100).toFixed(0)} % of the footprint is sloped or curved. 5-axis simultaneous finishing keeps the ball nose on a favourable cutting angle.`, action: { label: 'Use 5-axis simultaneous', apply: (c) => withProcess(c, 'mill5s') } });
    }
    const total = a.holeGroups.reduce((n, g) => n + g.count, 0);
    if (total) out.push({ tone: 'info', text: `${total} round hole${total === 1 ? '' : 's'} in ${a.holeGroups.length} size${a.holeGroups.length === 1 ? '' : 's'} found: they get drilling cycles (G81 / G83) instead of being milled.` });
    out.push(...a.warnings.map((text) => ({ tone: 'warn' as const, text })));
  } else if (an.family === 'print') {
    const a = an.a;
    if (!a.fits) out.push({ tone: 'err', text: `The part (${a.size.map((v) => v.toFixed(0)).join(' × ')} mm) does not fit the build volume.` });
    if (a.recSupport && cfg.print.support === 'none') out.push({ tone: 'warn', text: 'Large overhangs were found and supports are switched off.', action: { label: 'Turn supports on', apply: (c) => ({ ...c, print: { ...c.print, support: 'auto' } }) } });
    if (cfg.process === 'fdm' && Math.abs(a.recLayer - cfg.print.layer) >= 0.04 && a.recLayer <= cfg.print.nozzle * 0.8) {
      out.push({ tone: 'info', text: `A ${a.recLayer} mm layer is a good balance of surface quality and print time for this size and nozzle.`, action: { label: `Use ${a.recLayer} mm`, apply: (c) => ({ ...c, print: { ...c.print, layer: a.recLayer, firstLayer: Math.max(a.recLayer, Math.min(c.print.nozzle * 0.8, a.recLayer * 1.4)) } }) } });
    }
    if (cfg.process === 'fdm' && Math.abs(a.recInfill - cfg.print.infill) >= 10) out.push({ tone: 'info', text: `${a.recInfill} % infill suits a part this size; you have ${cfg.print.infill} %.`, action: { label: `Use ${a.recInfill} %`, apply: (c) => ({ ...c, print: { ...c.print, infill: a.recInfill } }) } });
    out.push(...a.warnings.map((text) => ({ tone: 'warn' as const, text })));
  } else out.push(...an.a.warnings.map((text) => ({ tone: 'warn' as const, text })));
  return out;
}

function Strategy({ cfg, setCfg, an }: { cfg: Cfg; setCfg: SetCfg; an: AnyAnalysis | null }) {
  if (!an) return <Note>Analysing the part…</Note>;
  const toggles: Record<string, [boolean, (v: boolean) => void] | undefined> = an.family === 'mill' ? {
    rough: [cfg.mill.rough, (v) => setCfg((c) => ({ ...c, mill: { ...c.mill, rough: v } }))],
    rest: [cfg.mill.rough, (v) => setCfg((c) => ({ ...c, mill: { ...c.mill, rough: v } }))],
    drill: [cfg.mill.drill, (v) => setCfg((c) => ({ ...c, mill: { ...c.mill, drill: v } }))],
    floor: [cfg.mill.finish, (v) => setCfg((c) => ({ ...c, mill: { ...c.mill, finish: v } }))],
    wall: [cfg.mill.finish, (v) => setCfg((c) => ({ ...c, mill: { ...c.mill, finish: v } }))],
    surface: [cfg.mill.finish, (v) => setCfg((c) => ({ ...c, mill: { ...c.mill, finish: v } }))],
  } : an.family === 'print' ? {
    support: [cfg.print.support === 'auto', (v) => setCfg((c) => ({ ...c, print: { ...c.print, support: v ? 'auto' : 'none' } }))],
  } : {};
  const items = an.family === 'mill' ? an.a.strategy : an.a.strategy;
  return (
    <div className="cam-strat">
      {items.map((s) => {
        const t = toggles[s.id];
        const on = t ? t[0] : s.on;
        return (
          <div key={s.id} className={`cam-strat-item${on ? '' : ' cam-strat-off'}`}>
            <div className="cam-strat-top"><b>{s.title}</b>{t ? <Toggle label="" checked={on} onChange={t[1]} /> : <span className="cam-pill">{s.on ? 'planned' : 'off'}</span>}</div>
            <p>{s.detail}</p>
            {'tool' in s && (s as { tool?: string }).tool && <span className="cam-tag"><Wrench size={9} /> {(s as { tool?: string }).tool}</span>}
            {'metric' in s && (s as { metric?: string }).metric && <span className="cam-tag">{(s as { metric?: string }).metric}</span>}
          </div>
        );
      })}
    </div>
  );
}

function AiTab(p: RightProps) {
  const { cfg, setCfg, analysis: an, res, busy } = p;
  const m = machineOf(cfg);
  const advice = useMemo(() => advise(cfg, an), [cfg, an]);
  const flats = TOOL_LIBRARY.filter((t) => t.kind === 'flat'), balls = TOOL_LIBRARY.filter((t) => t.kind === 'ball');
  const sw = res ? resWarnings(res) : [];
  const issues = p.sim ? p.sim.events.length : 0;
  const errs = p.sim ? p.sim.events.filter((e) => e.severity === 'error').length : 0;
  const mill = cfg.process === 'mill3' || cfg.process === 'mill5i' || cfg.process === 'mill5s';

  const sel = (role: 'rough' | 'finish' | 'ball', list: Tool[], auto: Tool | undefined) => (
    <Dropdown label={role === 'rough' ? 'Roughing tool' : role === 'finish' ? 'Floor / wall finishing tool' : 'Surface finishing ball nose'} value={cfg.tools[role] ?? 'auto'}
      options={[{ id: 'auto', label: `AI choice${auto ? ` · ${auto.name}` : ''}` }, ...list.map((t) => ({ id: t.id, label: t.name }))]}
      onChange={(v) => setCfg((c) => ({ ...c, tools: { ...c.tools, [role]: v === 'auto' ? undefined : v } }))} />
  );
  const autoTool = (role: string) => (an && an.family === 'mill' ? an.a.toolAssign.find((t) => t.role.toLowerCase().startsWith(role))?.tool : undefined);

  return (
    <>
      <Section title="AI part analysis" icon={<Sparkles size={11} />} badge={p.analysing ? 'analysing…' : an ? 'ready' : '–'}>
        <KV rows={[
          ['Model', p.partName],
          ...(an ? [['Size', an.a.size.map((v) => v.toFixed(1)).join(' × ') + ' mm'] as [string, ReactNode], ['Volume', `${(an.a.volume / 1000).toFixed(2)} cm³`] as [string, ReactNode]] : []),
          ...(an && an.family === 'mill' ? [
            ['Holes', `${an.a.holes.length}`] as [string, ReactNode], ['Flat levels', `${an.a.levels.length}`] as [string, ReactNode],
            ['Surface', `${(an.a.surface.flat * 100).toFixed(0)} % flat · ${(an.a.surface.slope * 100).toFixed(0)} % sloped · ${(an.a.surface.wall * 100).toFixed(0)} % wall`] as [string, ReactNode],
            ['Stock', `${an.a.stockBox.map((v) => v.toFixed(0)).join(' × ')} mm`] as [string, ReactNode], ['To remove', `${(an.a.removalVolume / 1000).toFixed(1)} cm³`] as [string, ReactNode],
          ] : []),
          ...(an && an.family === 'print' ? [['Layers', `${an.a.layers}`] as [string, ReactNode], ['Mass', `${an.a.massEstimate.toFixed(1)} g`] as [string, ReactNode]] : []),
        ]} />
        {p.analysisErr && <Note tone="err">Analysis failed: {p.analysisErr}</Note>}
        <Note>The advisor is a deterministic geometry engine, not a language model: it rasterises the model, finds holes, flat faces, walls and overhangs, and applies manufacturing rules. The same part and settings always give the same plan.</Note>
      </Section>

      {advice.length > 0 && (
        <Section title="Advisor notes" icon={<AlertTriangle size={11} />} badge={`${advice.length}`}>
          <div className="cam-advice">
            {advice.map((a, i) => (
              <div key={i} className={`cam-adv cam-adv-${a.tone}`}>
                <p>{a.text}</p>
                {a.action && <button className="rx-btn" onClick={() => setCfg(a.action!.apply)}>{a.action.label}</button>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Suggested strategy" icon={<Sparkles size={11} />} badge={processById(cfg.process).short}>
        <Strategy cfg={cfg} setCfg={setCfg} an={an} />
      </Section>

      {mill && an && an.family === 'mill' && (
        <Section title="Tool auto-assignment" icon={<Wrench size={11} />}>
          {sel('rough', flats, autoTool('roughing'))}
          {sel('finish', flats, autoTool('floor'))}
          {sel('ball', balls, autoTool('surface'))}
          <div className="cam-assign">
            {an.a.toolAssign.map((t) => <div key={t.role}><b>{t.role}</b><span>{t.tool.name}</span><small>{t.reason}</small></div>)}
            {an.a.holeGroups.map((g) => <div key={g.d}><b>Drilling Ø{g.d}</b><span>{g.drill ? `Ø${g.drill} drill` : 'no matching drill: milled'}</span><small>{g.count} hole{g.count === 1 ? '' : 's'}{g.through ? `, ${g.through} through` : ''}</small></div>)}
          </div>
        </Section>
      )}
      {!mill && cfg.process === 'fdm' && (
        <Section title="Nozzle" icon={<Wrench size={11} />}>
          <Dropdown label="Nozzle diameter" value={String(cfg.print.nozzle)} options={(m.nozzles ?? [0.4]).map((n) => ({ id: String(n), label: `${n} mm` }))}
            onChange={(v) => setCfg((c) => ({ ...c, print: { ...c.print, nozzle: +v, layer: Math.min(c.print.layer, +v * 0.8) } }))} />
          <Note>Line width is {(cfg.print.nozzle * cfg.print.lineWidthK).toFixed(2)} mm. Layer height should stay under 80 % of the nozzle diameter.</Note>
        </Section>
      )}

      <Section title="Generate" icon={<FileCode size={11} />} badge={res ? (p.stale ? 'out of date' : 'up to date') : undefined}>
        {busy ? (
          <div className="rx-busy" style={{ position: 'static', transform: 'none', width: 'auto' }}>
            <span>{busy}</span>
            <div><i style={{ width: `${Math.round(p.progress * 100)}%` }} /></div>
            <button className="rx-btn" onClick={p.onCancel}><X size={11} /> Cancel</button>
          </div>
        ) : (
          <button className="rx-render" onClick={p.onGenerate}><Sparkles size={13} /> {res ? (p.stale ? 'REGENERATE (settings changed)' : 'REGENERATE') : cfg.process === 'fdm' || m.kind === 'additive' ? 'SLICE & GENERATE G-CODE' : 'GENERATE TOOLPATHS & G-CODE'}</button>
        )}
        {p.error && <Note tone="err">{p.error}</Note>}
        {res && !busy && (
          <>
            <div className="cam-tiles">
              {res.kind === 'print' ? <>
                <Tile k="Print time" v={fmtTime(res.print.time / 60)} /><Tile k="Layers" v={`${res.print.layers.length}`} />
                <Tile k={res.print.process === 'fdm' ? 'Filament' : 'Material'} v={res.print.process === 'fdm' ? `${(res.print.filamentMm / 1000).toFixed(1)} m · ${res.print.massG.toFixed(0)} g` : `${res.print.massG.toFixed(0)} g`} /><Tile k="Supports" v={`${(res.print.supportVolume / 1000).toFixed(1)} cm³`} />
              </> : <>
                <Tile k="Cycle time" v={fmtTime(res.program.totalTime)} /><Tile k="Operations" v={`${res.program.ops.length}`} />
                <Tile k="Tools" v={`${res.program.tools.length}`} /><Tile k="Removed" v={`${(res.program.removedVolume / 1000).toFixed(1)} cm³`} />
              </>}
              <Tile k="G-code lines" v={res.post.lines.length.toLocaleString()} /><Tile k="Planned in" v={`${(res.ms / 1000).toFixed(1)} s`} />
            </div>
            {p.sim && (
              <div className={`cam-verdict ${errs ? 'cam-verdict-err' : issues ? 'cam-verdict-warn' : 'cam-verdict-ok'}`}>
                {errs ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                <span>{errs ? `${errs} problem${errs === 1 ? '' : 's'} found by the simulation` : issues ? `${issues} warning${issues === 1 ? '' : 's'} from the simulation` : 'Simulation found no collisions or gouges'}</span>
              </div>
            )}
            {p.sim && p.sim.reports.length > 0 && res.kind === 'mill' && (
              <KV rows={p.sim.reports.map((r, i) => [res.program.sims[i].name, `${r.gougeArea > 0 ? `gouge ${r.gougeMax.toFixed(2)} mm · ` : ''}${(r.leftoverVolume / 1000).toFixed(2)} cm³ left`] as [string, string])} />
            )}
            {sw.map((w, i) => <Note key={i} tone="warn">{w}</Note>)}
            {p.sim && [...new Set(p.sim.events.map((e) => e.kind))].length > 0 && <Note>{[...new Set(p.sim.events.map((e) => e.kind))].map((k) => `${eventLabel(k)} ×${p.sim!.events.filter((e) => e.kind === k).length}`).join(' · ')}</Note>}
          </>
        )}
      </Section>
    </>
  );
}

const Tile = ({ k, v }: { k: string; v: string }) => <div className="cam-tile"><small>{k}</small><b>{v}</b></div>;

// ---------------------------------------------------------------------------

function ToolsTab(p: RightProps) {
  const { cfg, res, analysis: an } = p;
  const m = machineOf(cfg);
  const mat = stockMaterialById(cfg.stockMat);
  const [filter, setFilter] = useState<'flat' | 'ball' | 'drill'>('flat');
  const [open, setOpen] = useState<number | null>(null);
  const predicted = useMemo(() => {
    if (!an || an.family !== 'mill' || m.kind !== 'subtractive') return [];
    const row = (role: string, tool: Tool, mode: Parameters<typeof millFeeds>[3]) => {
      const f = millFeeds(tool, mat, m, mode);
      return { role, tool, f };
    };
    const t = an.a.toolAssign;
    const find = (r: string) => t.find((x) => x.role.toLowerCase().startsWith(r))?.tool;
    const out: { role: string; tool: Tool; f: ReturnType<typeof millFeeds> }[] = [];
    const rough = find('roughing'), rest = find('rest'), fin = find('floor'), ball = find('surface');
    if (rough) out.push(row('Roughing', rough, 'rough'));
    if (rest) out.push(row('Rest roughing', rest, 'rest'));
    if (fin) { out.push(row('Floor finish', fin, 'floor')); out.push(row('Wall finish', fin, 'wall')); }
    if (ball) out.push(row('Surface finish', ball, 'finish'));
    return out;
  }, [an, mat, m]);

  return (
    <>
      {res && res.kind !== 'print' ? (
        <Section title="Operations" icon={<Wrench size={11} />} badge={`${res.program.ops.length}`}>
          <div className="cam-ops">
            {res.program.ops.map((o, i) => (
              <div key={i} className={`cam-op${open === i ? ' cam-op-open' : ''}`}>
                <button onClick={() => setOpen(open === i ? null : i)}>
                  <b>{i + 1}. {o.name}</b><small>{o.toolName} · {fmtTime(o.time)}</small>
                </button>
                {open === i && (
                  <div className="cam-op-body">
                    <KV rows={[
                      ['Strategy', o.strategy], ['Spindle', `${Math.round(o.rpm).toLocaleString()} rpm`], ['Feed', `${Math.round(o.feed).toLocaleString()} ${res.kind === 'turn' ? 'mm/rev' : 'mm/min'}`],
                      ['Depth ap · width ae', `${o.ap.toFixed(2)} · ${o.ae.toFixed(2)} mm`], ['Removal rate', `${o.mrr.toFixed(1)} cm³/min`], ['Power', `${o.powerKw.toFixed(2)} kW`],
                      ['Path length', `${(o.length / 1000).toFixed(2)} m`],
                    ]} />
                    {o.notes.map((n, k) => <Note key={k}>{n}</Note>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      ) : predicted.length > 0 && (
        <Section title="Predicted cutting data" icon={<Wrench size={11} />} badge={mat.name.split(' ')[0]}>
          <div className="cam-ops">
            {predicted.map((r, i) => (
              <div key={i} className="cam-op"><button style={{ cursor: 'default' }}><b>{r.role}</b><small>{r.tool.name}</small></button>
                <div className="cam-op-body">
                  <KV rows={[['Spindle', `${r.f.rpm.toLocaleString()} rpm`], ['Feed', `${Math.round(r.f.feed).toLocaleString()} mm/min`], ['Chip load', `${r.f.fz.toFixed(3)} mm/tooth`], ['ap · ae', `${r.f.ap.toFixed(2)} · ${r.f.ae.toFixed(2)} mm`], ['Power', `${r.f.powerKw.toFixed(2)} kW`]]} />
                  {r.f.limited.length > 0 && <Note>Limited by: {r.f.limited.join('; ')}.</Note>}
                </div>
              </div>
            ))}
          </div>
          <Note>Physics-based: surface speed from the material, chip load with radial chip thinning, cutting force from the Kienzle model, tool deflection from a cantilever model; clamped to the {m.model} spindle and power.</Note>
        </Section>
      )}

      {cfg.kind === 'additive' && (
        <PrintFeeds cfg={cfg} res={res && res.kind === 'print' ? res : null} />
      )}

      {res && res.kind !== 'print' && (
        <Section title="Tool list" icon={<Wrench size={11} />} badge={`${res.program.tools.length}`}>
          <div className="cam-table">
            <div className="cam-th"><span>T</span><span>Tool</span><span>rpm</span><span>min</span></div>
            {res.program.tools.map((t) => <div key={t.n}><span>T{t.n}</span><span>{t.tool.name}</span><span>{Math.round(t.rpm)}</span><span>{t.minutes.toFixed(1)}</span></div>)}
          </div>
          <Note>Set the tool offsets (length, wear) at the machine; the program calls them with G43 H and the tool number.</Note>
        </Section>
      )}

      {cfg.kind === 'subtractive' && (cfg.process === 'mill3' || cfg.process === 'mill5i' || cfg.process === 'mill5s') && (
        <Section title="Tool library" icon={<Wrench size={11} />}>
          <Seg value={filter} onChange={setFilter} options={[{ id: 'flat', label: 'End mills' }, { id: 'ball', label: 'Ball nose' }, { id: 'drill', label: 'Drills' }]} />
          <div className="cam-table cam-lib">
            <div className="cam-th"><span>Ø</span><span>Flutes</span><span>Flute</span><span>Reach</span><span /></div>
            {TOOL_LIBRARY.filter((t) => t.kind === filter).map((t) => (
              <div key={t.id}><span>{t.d}</span><span>{t.flutes}</span><span>{t.fluteLen.toFixed(0)}</span><span>{t.stickout.toFixed(0)}</span>
                <span>{filter !== 'drill' && <button className="cam-use" title="Use as the roughing tool" onClick={() => p.setCfg((c) => ({ ...c, tools: { ...c.tools, [filter === 'ball' ? 'ball' : 'rough']: t.id } }))}>use</button>}</span></div>
            ))}
          </div>
          <Note>Carbide, TiAlN / TiN coated. Diameters between library sizes are matched to the nearest drill within 0.4 mm. Longer-reach variants are created automatically when a hole or pocket is deeper than the flutes.</Note>
        </Section>
      )}
    </>
  );
}

function PrintFeeds({ cfg, res }: { cfg: Cfg; res: Extract<Res, { kind: 'print' }> | null }) {
  const m = machineOf(cfg);
  const mat = printMaterialById(cfg.printMat);
  const s = cfg.print;
  if (cfg.process === 'fdm') {
    const w = s.nozzle * s.lineWidthK;
    const flow = s.speed * w * s.layer;
    const maxF = Math.min(mat.maxVolFlow ?? 99, m.maxFlow ?? 99);
    return (
      <Section title="Extrusion limits" icon={<Wrench size={11} />}>
        <KV rows={[
          ['Line width', `${w.toFixed(2)} mm`], ['Layer', `${s.layer.toFixed(2)} mm`], ['Volumetric flow', `${flow.toFixed(1)} mm³/s`], ['Limit (hotend · material)', `${maxF.toFixed(0)} mm³/s`],
          ['Outer wall speed', `${Math.round(s.speed * 0.6)} mm/s`], ['Infill speed', `${Math.round(s.speed * 1.2)} mm/s`], ['First layer', `${s.firstLayerSpeed} mm/s`], ['Travel', `${s.travel} mm/s`],
        ]} />
        {flow > maxF && <Note tone="err">At {s.speed} mm/s the flow is {flow.toFixed(1)} mm³/s, above what the {mat.name} / hotend combination melts ({maxF.toFixed(0)} mm³/s). The slicer slows lines automatically; lower the speed or layer height.</Note>}
        {res && <Note>Estimated {fmtTime(res.print.time / 60)}; {res.print.layers.length} layers.</Note>}
      </Section>
    );
  }
  return (
    <Section title="Exposure / scan data" icon={<Wrench size={11} />}>
      <KV rows={cfg.process === 'sla'
        ? [['Layer', `${s.layer} mm`], ['Exposure', `${s.exposure} s`], ['Bottom exposure', `${s.bottomExposure} s × ${s.bottomLayers2}`], ['Lift', `${s.lift} mm`]]
        : [['Layer', `${s.layer} mm`], ['Laser power', `${s.power} W`], ['Scan speed', `${s.scan} mm/s`], ['Hatch', `${s.hatch} mm`], ['Spot', `${m.spotMm ?? '–'} mm`]]} />
      {res && res.print.hatchUsed > s.hatch + 1e-6 && <Note tone="warn">The hatch spacing was widened to {res.print.hatchUsed.toFixed(2)} mm to keep the vector count manageable.</Note>}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function ExportTab(p: RightProps) {
  const { cfg, res, codeText } = p;
  const m = machineOf(cfg);
  const ctrl = controllerById(cfg.controller);
  const printer = m.kind === 'additive';
  const extOptions = printer ? ['gcode'] : [...new Set([ctrl.ext, 'nc', 'tap', 'txt'])];
  const [ext, setExt] = useState('');
  const useExt = extOptions.includes(ext) ? ext : extOptions[0];
  const [name, setName] = useState('');
  const base = (name.trim() || p.partName || 'faelyx_part').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/\.[A-Za-z0-9]+$/, '');
  const [proto, setProto] = useState<SendProtocol>('moonraker');
  const [host, setHost] = useState('');
  const [key, setKey] = useState('');
  const [path, setPath] = useState('/upload');
  const [start, setStart] = useState(false);
  const [log, setLog] = useState<(SendResult & { at: string })[]>([]);
  const [sending, setSending] = useState(false);
  const protos = m.sendProtocols?.length ? SEND_PROTOCOLS.filter((x) => m.sendProtocols!.includes(x.id) || x.id === 'http') : printer ? SEND_PROTOCOLS : SEND_PROTOCOLS.filter((x) => x.id === 'http');
  const proto2 = protos.some((x) => x.id === proto) ? proto : protos[0].id;
  const target = { protocol: proto2, host, apiKey: key, path, startAfter: start };
  const push = (r: SendResult) => setLog((l) => [{ ...r, at: new Date().toLocaleTimeString() }, ...l].slice(0, 6));
  const blob = () => new Blob([codeText], { type: 'text/plain' });
  const dl = () => downloadBlob(blob(), `${base}.${useExt}`);
  const copy = async () => { try { await navigator.clipboard.writeText(codeText); push({ ok: true, message: 'G-code copied to the clipboard.' }); } catch { push({ ok: false, message: 'The browser blocked clipboard access. Use Download instead.' }); } };
  const do3mf = () => {
    if (!p.mesh) return;
    const meta: Record<string, string> = { Title: base, Application: 'Faelyx CAM', Description: `${m.brand} ${m.model} · ${processById(cfg.process).label}` };
    if (printer) Object.assign(meta, { Material: printMaterialById(cfg.printMat).name, LayerHeight: String(cfg.print.layer), Infill: `${cfg.print.infill}%`, Nozzle: String(cfg.print.nozzle) });
    downloadBlob(new Blob([make3mf(p.mesh, base, meta) as unknown as BlobPart], { type: 'model/3mf' }), `${base}.3mf`);
  };
  const setup = () => {
    if (!res) return;
    const L: string[] = [`FAELYX CAM SETUP SHEET`, `Part: ${p.partName}`, `Machine: ${m.brand} ${m.model}`, `Controller: ${ctrl.name}`, `Process: ${processById(cfg.process).label}`, ''];
    if (res.kind === 'print') {
      L.push(`Material: ${res.print.material.name}`, `Layer: ${cfg.print.layer} mm`, `Layers: ${res.print.layers.length}`, `Time: ${fmtTime(res.print.time / 60)}`, `Filament: ${(res.print.filamentMm / 1000).toFixed(2)} m (${res.print.massG.toFixed(1)} g)`);
    } else {
      const pr = res.program;
      L.push(`Material: ${stockMaterialById(cfg.stockMat).name}`, `Stock: ${pr.stock.box.map((v) => v.toFixed(1)).join(' x ')} mm`, `Work offset: ${pr.stock.wcs}`, `Cycle time: ${fmtTime(pr.totalTime)}`, '', 'TOOLS');
      for (const t of pr.tools) L.push(`  T${t.n}  ${t.tool.name}  ${Math.round(t.rpm)} rpm  ${t.minutes.toFixed(1)} min`);
      L.push('', 'OPERATIONS');
      pr.ops.forEach((o, i) => L.push(`  ${i + 1}. ${o.name} - ${o.toolName} - ${Math.round(o.rpm)} rpm - ${Math.round(o.feed)} - ${fmtTime(o.time)}`));
    }
    L.push('', 'Check the zero point, tool offsets and clearances at the machine before running. Dry-run first.');
    downloadBlob(new Blob([L.join('\n') + '\n'], { type: 'text/plain' }), `${base}_setup.txt`);
  };
  const test = async () => { setSending(true); push(await testConnection(target)); setSending(false); };
  const send = async () => { setSending(true); push(await sendProgram(target, `${base}.${useExt}`, blob())); setSending(false); };
  const proInfo = SEND_PROTOCOLS.find((x) => x.id === proto2)!;

  return (
    <>
      <Section title="Export files" icon={<Download size={11} />}>
        {!res ? <Note>Generate toolpaths first; the exports then appear here.</Note> : (
          <>
            <Text label="File name" value={name} placeholder={base} onChange={setName} />
            <Dropdown label="Format" value={useExt} options={extOptions.map((e) => ({ id: e, label: `.${e.toUpperCase()}${e === ctrl.ext ? ` · ${ctrl.name.split(' ')[0]} native` : ''}` }))} onChange={setExt} />
            <div className="rx-row rx-row-wrap">
              <button className="rx-btn" onClick={dl}><Download size={11} /> {base}.{useExt}</button>
              <button className="rx-btn" onClick={copy}><Copy size={11} /> Copy</button>
              <button className="rx-btn" onClick={do3mf} disabled={!p.mesh}><Box size={11} /> .3MF</button>
              <button className="rx-btn" onClick={setup}><FileCode size={11} /> Setup sheet</button>
            </div>
            {p.edited && <Note tone="warn">You have edited the code. Exports use your edited text; the simulation still shows the generated plan.</Note>}
            <Note>{printer ? 'The 3MF holds the part mesh (millimetres) with the print settings as metadata. It is a model file for slicers, not a sliced job.' : 'The 3MF is the part model. The G-code carries the toolpaths.'} {ctrl.id === 'bambu' ? ' Bambu Studio itself expects a .gcode.3mf project; the plain G-code here is Marlin-compatible reference output.' : ''}</Note>
          </>
        )}
      </Section>

      <Section title="Send to machine" icon={<Send size={11} />} badge={res ? undefined : 'generate first'}>
        <Dropdown label="Protocol" value={proto2} options={protos.map((x) => ({ id: x.id, label: x.label }))} onChange={setProto} />
        <Note>{proInfo.hint}</Note>
        <Text label="Machine address" value={host} placeholder={`192.168.1.50${proInfo.port !== 80 ? ':' + proInfo.port : ''}`} onChange={setHost} mono />
        {proto2 !== 'moonraker' && <Text label={proto2 === 'duet' ? 'Duet password (blank = reprap)' : proto2 === 'octoprint' ? 'OctoPrint application key' : 'API key / token (optional)'} value={key} type="password" onChange={setKey} />}
        {proto2 === 'http' && <Text label="Upload path or full URL" value={path} onChange={setPath} mono />}
        {proto2 !== 'http' && <Toggle label="Start the job after upload" checked={start} onChange={setStart} hint="Only on a machine you are standing next to" />}
        <div className="rx-row">
          <button className="rx-btn" onClick={test} disabled={sending || !host.trim()}>{sending ? <Loader2 size={11} className="cam-spin" /> : <Plug size={11} />} Test connection</button>
          <button className="rx-btn" onClick={send} disabled={sending || !host.trim() || !res}><Send size={11} /> Send file</button>
        </div>
        {log.map((r, i) => <Note key={i} tone={r.ok ? 'ok' : 'err'}>{r.at} · {r.message}{r.detail ? ` (${r.detail})` : ''}</Note>)}
        <Note>The transfer is made by your browser straight to the address you give; nothing passes through Faelyx servers. Browsers block pages from reaching plain-HTTP machines when the page itself is HTTPS, and the machine must allow this page's origin (CORS).</Note>
        {!printer && <Note>CNC controls have no common network upload standard. Use the generic HTTP option for a DNC gateway you run, or copy the file with the vendor's tool (Haas Net Share, FANUC FTP / FOCAS, Heidenhain TNCremo, Siemens network drive, Tormach PathPilot upload).</Note>}
        {m.vendorLocked && <Note tone="warn">{m.brand} {m.model} is normally driven by the vendor's software or cloud; direct upload may not be supported.</Note>}
        <Note tone="warn">Always dry-run unfamiliar code: check zero points, tool lengths and clearances at the machine first.</Note>
      </Section>
    </>
  );
}

export default function CamRight(p: RightProps) {
  return (
    <aside className="rx-panel rx-right cam-right">
      <div className="rx-panel-head"><span className="eyebrow">AI MANUFACTURING ENGINE</span><strong>STRATEGY · FEEDS · OUTPUT</strong></div>
      <div className="rx-tabs">
        <button className={p.tab === 'ai' ? 'rx-tab-on' : ''} onClick={() => p.setTab('ai')}><Sparkles size={11} /> AI Strategy</button>
        <button className={p.tab === 'tools' ? 'rx-tab-on' : ''} onClick={() => p.setTab('tools')}><Wrench size={11} /> Tools &amp; Feeds</button>
        <button className={p.tab === 'export' ? 'rx-tab-on' : ''} onClick={() => p.setTab('export')}><Download size={11} /> Export</button>
      </div>
      <div className="rx-scroll">{p.tab === 'ai' ? <AiTab {...p} /> : p.tab === 'tools' ? <ToolsTab {...p} /> : <ExportTab {...p} />}</div>
    </aside>
  );
}
