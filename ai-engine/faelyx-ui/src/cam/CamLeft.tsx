// Left side of the CAM workspace: machine selection (type, brand / model, kinematics, controller)
// and the process / material / stock / fixture setup.
import { useRef, type ReactNode } from 'react';
import { Cpu, Factory, Layers, Gauge, Upload, Box, Printer, Crosshair, Settings2 } from 'lucide-react';
import {
  BRANDS, MACHINES, PROCESSES, CONTROLLERS, WORK_HOLDS, WCS_LIST, NOZZLES, controllerById, processById, stockMaterialById, printMaterialById,
  type ControllerId, type MachineDef, type ProcessId, type WcsId, type WorkHold,
} from './camData';
import { SAMPLE_PARTS, type Mesh } from './geometry';
import { type Cfg, CUSTOM_ID, UP_AXES, customTemplate, machineOf, printMaterialsFor, resolvePart, stockMaterialsFor, withController, withCustom, withKind, withMachine, withProcess, printWithMaterial } from './camConfig';
import { millFeeds } from './feeds';
import { KV, Note, Num, Dropdown, Section, Seg, Slide, Text, Toggle } from './camUi';

export type LeftTab = 'machine' | 'setup';
type SetCfg = (f: (c: Cfg) => Cfg) => void;

export interface LeftProps {
  tab: LeftTab; setTab: (t: LeftTab) => void;
  cfg: Cfg; setCfg: SetCfg;
  hasProject: boolean; partMesh: Mesh | null; partName: string;
  onUpload: (file: File) => void;
}

const AXIS_LETTERS = (axes: string) => [...new Set(axes.replace(/[^XYZABCE]/g, '').split(''))];

function MachineTab({ cfg, setCfg }: Pick2) {
  const m = machineOf(cfg);
  const custom = cfg.machineId === CUSTOM_ID;
  const brands = BRANDS(cfg.kind);
  const brand = custom ? CUSTOM_ID : m.brand;
  const models = MACHINES.filter((x) => x.kind === cfg.kind && x.brand === m.brand);
  const ctrl = controllerById(cfg.controller);
  const patchCustom = (p: Partial<MachineDef>) => setCfg((c) => withCustom(c, p));

  return (
    <>
      <Section title="Machine type" icon={<Factory size={11} />}>
        <Seg value={cfg.kind} onChange={(k) => setCfg((c) => withKind(c, k))}
          options={[{ id: 'subtractive', label: 'Subtractive · CNC' }, { id: 'additive', label: 'Additive · 3D print' }]} />
        <Note>{cfg.kind === 'subtractive' ? 'Milling, turning and laser / plasma cutting: material is removed from stock.' : 'FDM, resin and powder-bed printing: the part is built layer by layer.'}</Note>
      </Section>

      <Section title="Manufacturer & model" icon={<Cpu size={11} />} badge={custom ? 'custom' : `${m.brand}`}>
        <Dropdown label="Brand" value={brand}
          options={[...brands.map((b) => ({ id: b, label: b })), { id: CUSTOM_ID, label: 'Custom machine profile…' }]}
          onChange={(b) => setCfg((c) => {
            if (b === CUSTOM_ID) return withMachine(c, c.custom.kind === c.kind ? c.custom : customTemplate(c.kind));
            const first = MACHINES.find((x) => x.kind === c.kind && x.brand === b);
            if (!first) return c;
            return withMachine(c, first);
          })} />
        {!custom && (
          <Dropdown label="Model" value={m.id} options={models.map((x) => ({ id: x.id, label: x.model }))}
            onChange={(id) => setCfg((c) => withMachine(c, MACHINES.find((x) => x.id === id)!))} />
        )}
        {custom && (
          <div className="cam-custom">
            <Text label="Machine name" value={m.model} onChange={(v) => patchCustom({ model: v })} />
            <div className="rx-row"><Num label="X" unit="mm" value={m.envelope[0]} min={1} digits={0} onChange={(v) => patchCustom({ envelope: [v, m.envelope[1], m.envelope[2]] })} />
              <Num label="Y" unit="mm" value={m.envelope[1]} min={0} digits={0} onChange={(v) => patchCustom({ envelope: [m.envelope[0], v, m.envelope[2]] })} /></div>
            <div className="rx-row"><Num label="Z" unit="mm" value={m.envelope[2]} min={1} digits={0} onChange={(v) => patchCustom({ envelope: [m.envelope[0], m.envelope[1], v] })} />
              {m.kind === 'subtractive'
                ? <Num label="Max rpm" value={m.maxRpm ?? 8000} min={100} digits={0} onChange={(v) => patchCustom({ maxRpm: v })} />
                : <Num label="Nozzle max" unit="°C" value={m.maxNozzleC ?? 260} digits={0} onChange={(v) => patchCustom({ maxNozzleC: v })} />}</div>
            {m.kind === 'subtractive' && <div className="rx-row"><Num label="Power" unit="kW" value={m.powerKw ?? 5} min={0.2} digits={1} onChange={(v) => patchCustom({ powerKw: v })} />
              <Num label="Rapid" unit="mm/min" value={m.rapid ?? 15000} min={1000} digits={0} onChange={(v) => patchCustom({ rapid: v })} /></div>}
            {m.kind === 'additive' && <div className="rx-row"><Num label="Bed max" unit="°C" value={m.maxBedC ?? 100} digits={0} onChange={(v) => patchCustom({ maxBedC: v })} />
              <Num label="Max speed" unit="mm/s" value={m.maxSpeed ?? 200} digits={0} onChange={(v) => patchCustom({ maxSpeed: v })} /></div>}
            <Text label="Axes (kinematics)" value={m.axes} onChange={(v) => patchCustom({ axes: v })} placeholder="XYZ + A/C trunnion" />
            <span className="rx-field-top"><span>Processes this machine can run</span></span>
            <div className="rx-chips rx-chips-wrap">
              {PROCESSES.filter((p) => p.kind === m.kind).map((p) => (
                <button key={p.id} className={`rx-chip${m.processes.includes(p.id) ? ' rx-chip-on' : ''}`}
                  onClick={() => { const set = m.processes.includes(p.id) ? m.processes.filter((x) => x !== p.id) : [...m.processes, p.id]; if (set.length) patchCustom({ processes: set }); }}>{p.short}</button>
              ))}
            </div>
            <span className="rx-field-top"><span>Controller dialects it understands</span></span>
            <div className="rx-chips rx-chips-wrap">
              {CONTROLLERS.filter((x) => (m.kind === 'subtractive' ? x.family === 'cnc' : x.family !== 'cnc')).map((x) => (
                <button key={x.id} className={`rx-chip${m.controllers.includes(x.id) ? ' rx-chip-on' : ''}`}
                  onClick={() => { const set = m.controllers.includes(x.id) ? m.controllers.filter((y) => y !== x.id) : [...m.controllers, x.id]; if (set.length) patchCustom({ controllers: set }); }}>{x.name.split(' ')[0]}</button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Machine kinematics" icon={<Crosshair size={11} />}>
        <div className="rx-chips rx-chips-wrap">{AXIS_LETTERS(m.axes).map((a) => <span key={a} className="rx-chip rx-chip-on" style={{ cursor: 'default' }}>{a}</span>)}</div>
        <KV rows={m.kind === 'subtractive' ? [
          ['Configuration', m.axes],
          ['Travels X · Y · Z', `${m.envelope[0]} · ${m.envelope[1] || '–'} · ${m.envelope[2]} mm`],
          ...(m.maxRpm ? [['Spindle', `${m.maxRpm.toLocaleString()} rpm${m.powerKw ? ` · ${m.powerKw} kW` : ''}`] as [string, string]] : []),
          ...(m.laserW ? [['Beam / torch', `${m.laserW} W class`] as [string, string]] : []),
          ['Rapids', `${((m.rapid ?? 0) / 1000).toFixed(1)} m/min`],
          ...(m.taper ? [['Taper · magazine', `${m.taper} · ${m.tools} tools`] as [string, string]] : []),
        ] : [
          ['Build volume', `${m.envelope.join(' × ')} mm`],
          ['Axes', m.axes],
          ...(m.nozzles ? [['Nozzles', m.nozzles.join(' · ') + ' mm'] as [string, string]] : []),
          ...(m.maxNozzleC ? [['Nozzle · bed max', `${m.maxNozzleC} °C · ${m.maxBedC ?? '–'} °C`] as [string, string]] : []),
          ...(m.spotMm ? [['Laser spot · power', `${m.spotMm} mm · ${m.laserW} W`] as [string, string]] : []),
          ...(m.layerRange ? [['Layer range', `${m.layerRange[0]}–${m.layerRange[1]} mm`] as [string, string]] : []),
          ['Enclosure', m.enclosed ? 'enclosed' : 'open frame'],
        ]} />
        {m.notes && <Note>{m.notes}</Note>}
        {m.vendorLocked && <Note tone="warn">This machine normally runs jobs from the vendor's own software. Faelyx exports generic reference code and files; import them into the vendor tool.</Note>}
        {!custom && <button className="rx-btn" onClick={() => setCfg((c) => withMachine({ ...c, custom: { ...m, id: CUSTOM_ID, brand: 'Custom', model: `${m.model} (copy)` } }, { ...m, id: CUSTOM_ID, brand: 'Custom', model: `${m.model} (copy)` }))}><Settings2 size={11} /> Duplicate as custom profile</button>}
      </Section>

      <Section title="Controller & post-processor" icon={<Gauge size={11} />} badge="auto-loaded">
        <Dropdown label="Controller profile" value={cfg.controller} options={m.controllers.map((id) => ({ id, label: controllerById(id).name }))}
          onChange={(id: ControllerId) => setCfg((c) => withController(c, id))} />
        <Note>{ctrl.description}</Note>
        <KV rows={[
          ['Post-processor', ctrl.name.split(' (')[0]],
          ['File extension', `.${ctrl.ext}`],
          ['Line numbers', ctrl.lineNumbers ? 'yes (N-words)' : 'no'],
          ...(ctrl.tcp ? [['5-axis TCP', ctrl.tcp] as [string, string]] : []),
        ]} />
        {m.controllers.length > 1 && <Note>{m.model} ships with {controllerById(m.controllers[0]).name.split(' ')[0]}; other dialects it accepts are listed above.</Note>}
        <Toggle label="Number the blocks (N10, N20…)" checked={cfg.lineNumbers} onChange={(v) => setCfg((c) => ({ ...c, lineNumbers: v }))} disabled={ctrl.family !== 'cnc'} />
      </Section>
    </>
  );
}

type Pick2 = { cfg: Cfg; setCfg: SetCfg };

function SetupTab({ cfg, setCfg, hasProject, partMesh, partName, onUpload }: LeftProps) {
  const m = machineOf(cfg);
  const proc = processById(cfg.process);
  const fileRef = useRef<HTMLInputElement>(null);
  const sub = m.kind === 'subtractive';
  const stockMats = stockMaterialsFor(cfg.process);
  const stockMat = stockMaterialById(cfg.stockMat);
  const printMats = printMaterialsFor(cfg.process);
  const printMat = printMaterialById(cfg.printMat);
  const mill = cfg.process === 'mill3' || cfg.process === 'mill5i' || cfg.process === 'mill5s';
  const turn = cfg.process === 'turn';
  const cut = cfg.process === 'laser' || cfg.process === 'plasma';
  const fdm = cfg.process === 'fdm';
  const laserAdd = !sub && !fdm;
  const set = (p: Partial<Cfg>) => setCfg((c) => ({ ...c, ...p }));
  const setStock = (p: Partial<Cfg['stock']>) => setCfg((c) => ({ ...c, stock: { ...c.stock, ...p } }));
  const setMill = (p: Partial<Cfg['mill']>) => setCfg((c) => ({ ...c, mill: { ...c.mill, ...p } }));
  const setPrint = (p: Partial<Cfg['print']>) => setCfg((c) => ({ ...c, print: { ...c.print, ...p } }));

  // recommended cutting data, live from the physics engine (Ø10 flat end mill as the reference)
  const refTool = { id: 'ref', kind: 'flat' as const, name: 'Ø10 flat', d: 10, flutes: 3, fluteLen: 25, stickout: 50, holderD: 24, material: 'carbide' as const, coating: 'TiAlN' };
  const rec = sub && mill ? millFeeds(refTool, stockMat, m, 'rough') : null;

  const parts: { id: string; label: string; group: string }[] = [
    ...(hasProject ? [{ id: 'project', label: 'Current project model', group: 'Your model' }] : []),
    { id: 'upload', label: 'Open STL file…', group: 'Your model' },
    ...SAMPLE_PARTS.map((s) => ({ id: s.id, label: s.name, group: 'Sample parts' })),
  ];
  const partSel = resolvePart(cfg, hasProject);

  return (
    <>
      <Section title="Process" icon={<Layers size={11} />} badge={proc.short}>
        <div className="cam-procs">
          {m.processes.map((id: ProcessId) => {
            const p = processById(id);
            return <button key={id} className={`rx-env${id === cfg.process ? ' rx-card-on' : ''}`} onClick={() => setCfg((c) => withProcess(c, id))}><small>{p.short}</small><b>{p.label}</b></button>;
          })}
        </div>
        <Note>{proc.hint}</Note>
        {sub && m.processes.length === 1 && <Note>{m.model} runs only this process. Choose another machine for turning, cutting or 5-axis work.</Note>}
      </Section>

      <Section title="Material" icon={<Box size={11} />} badge={sub ? stockMat.group : printMat.family}>
        {sub ? (
          <>
            <Dropdown label="Stock material" value={cfg.stockMat} options={stockMats.map((x) => ({ id: x.id, label: x.name, group: x.group }))} onChange={(id) => set({ stockMat: id })} />
            {mill && rec && <KV rows={[
              ['Cutting speed (carbide)', `${stockMat.vcCarbide} m/min`], ['Chip load', `${(stockMat.fzRatio * 100).toFixed(1)} % of Ø per tooth`],
              ['Roughing ap · ae', `${stockMat.apRough}×D · ${(stockMat.aeRough * 100).toFixed(0)} %D`], ['Specific force kc1.1', `${stockMat.kc11} N/mm²`],
              ['Ø10 3-flute reference', `${rec.rpm.toLocaleString()} rpm · ${Math.round(rec.feed)} mm/min`], ['Coolant', stockMat.coolant],
            ]} />}
            {turn && <KV rows={[['Cutting speed (carbide)', `${stockMat.vcCarbide} m/min`], ['Density', `${stockMat.density} g/cm³`], ['Coolant', stockMat.coolant]]} />}
            {cut && <KV rows={[['Cut speed at 3 mm', `${stockMat.cutFeed3 ?? '–'} mm/min`], ['Density', `${stockMat.density} g/cm³`]]} />}
            <Note>Speeds, feeds, depths and stepovers are calculated per tool from these values (see Tools &amp; Feeds).</Note>
          </>
        ) : (
          <>
            <Dropdown label={fdm ? 'Filament' : laserAdd ? 'Material' : 'Material'} value={cfg.printMat} options={printMats.map((x) => ({ id: x.id, label: x.name, group: x.family }))}
              onChange={(id) => setCfg((c) => ({ ...c, printMat: id, print: printWithMaterial(c.print, printMaterialById(id), machineOf(c)) }))} />
            <KV rows={fdm ? [
              ['Nozzle · bed', `${printMat.nozzleC} °C · ${printMat.bedC} °C`], ['Fan · speed', `${printMat.fan}% · ${printMat.speed} mm/s`], ['Retraction', `${printMat.retract} mm`], ['Density', `${printMat.density} g/cm³`],
            ] : printMat.process === 'sla' ? [
              ['Layer · exposure', `${printMat.layer} mm · ${printMat.exposure} s`], ['Bottom exposure', `${printMat.bottomExposure} s × ${printMat.bottomLayers}`], ['Lift', `${printMat.lift} mm`],
            ] : [
              ['Laser power · scan', `${printMat.power} W · ${printMat.scan} mm/s`], ['Hatch spacing', `${printMat.hatch} mm`], ['Layer · preheat', `${printMat.powderLayer} mm · ${printMat.preheatC} °C`],
            ]} />
            {printMat.notes && <Note>{printMat.notes}</Note>}
            {printMat.enclosure && !m.enclosed && <Note tone="warn">{printMat.name} warps without an enclosure; {m.model} is open frame.</Note>}
            {printMat.abrasive && <Note tone="warn">Abrasive filament: use a hardened nozzle.</Note>}
            {printMat.nozzleC && m.maxNozzleC && printMat.nozzleC > m.maxNozzleC && <Note tone="err">{printMat.name} needs {printMat.nozzleC} °C; this hotend tops out at {m.maxNozzleC} °C.</Note>}
          </>
        )}
      </Section>

      <Section title="Part" icon={<Upload size={11} />} badge={partName}>
        <Dropdown label="Model source" value={partSel} options={parts}
          onChange={(id) => { if (id === 'upload') fileRef.current?.click(); else set({ part: id }); }} />
        <input ref={fileRef} type="file" accept=".stl,model/stl" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        {partMesh && <KV rows={[['Size (mm)', [0, 1, 2].map((i) => (partMesh.max[i] - partMesh.min[i]).toFixed(1)).join(' × ')], ['Triangles', partMesh.n.toLocaleString()]]} />}
        {(mill || !sub) && <Dropdown label={sub ? 'Orientation on the machine' : 'Orientation on the build plate'} value={cfg.up} options={UP_AXES} onChange={(up) => set({ up })} />}
        {turn && <Note>The part's Z axis is taken as the spindle axis.</Note>}
        {cut && <Note>The outline is sliced at mid-thickness; Z is the sheet thickness.</Note>}
      </Section>

      {sub && (mill || turn) && (
        <Section title={turn ? 'Bar stock & chuck' : 'Stock & workholding'} icon={<Box size={11} />} badge={cfg.stock.wcs}>
          {mill && <Seg value={cfg.stock.shape} onChange={(v) => setStock({ shape: v })} options={[{ id: 'block', label: 'Raw block' }, { id: 'cylinder', label: 'Round bar' }]} />}
          <Toggle label="Size the stock automatically" checked={cfg.stock.auto} onChange={(v) => setStock({ auto: v })} hint="Part size plus the margin, rounded up" />
          {cfg.stock.auto ? (
            <div className="rx-row"><Num label="Margin" unit="mm" value={cfg.stock.margin} min={0} onChange={(v) => setStock({ margin: v })} /><Num label="Top" unit="mm" value={cfg.stock.topAllow} min={0} onChange={(v) => setStock({ topAllow: v })} /></div>
          ) : (
            <>
              <div className="rx-row"><Num label={turn ? 'Ø' : 'X'} unit="mm" value={cfg.stock.size[0]} min={1} digits={1} onChange={(v) => setStock({ size: [v, cfg.stock.size[1], cfg.stock.size[2]] })} />
                {!turn && <Num label="Y" unit="mm" value={cfg.stock.size[1]} min={1} digits={1} onChange={(v) => setStock({ size: [cfg.stock.size[0], v, cfg.stock.size[2]] })} />}</div>
              {!turn && <Num label="Height Z" unit="mm" value={cfg.stock.size[2]} min={1} digits={1} onChange={(v) => setStock({ size: [cfg.stock.size[0], cfg.stock.size[1], v] })} />}
              {turn && <Note>The bar length is set from the part length and hold depth.</Note>}
            </>
          )}
          <div className="rx-row">
            <label className="rx-field" style={{ flex: 1 }}><span className="rx-field-top"><span>Work offset</span></span>
              <select value={cfg.stock.wcs} onChange={(e) => setStock({ wcs: e.target.value as WcsId })}>{WCS_LIST.map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
            {mill && <label className="rx-field" style={{ flex: 1 }}><span className="rx-field-top"><span>Zero point</span></span>
              <select value={cfg.stock.origin} onChange={(e) => setStock({ origin: e.target.value as Cfg['stock']['origin'] })}><option value="top-corner">Top, front-left corner</option><option value="top-center">Top, centre</option></select></label>}
          </div>
          {mill && (
            <>
              <Dropdown label="Workholding" value={cfg.stock.hold} options={WORK_HOLDS.filter((w) => w.id !== 'chuck').map((w) => ({ id: w.id, label: w.label }))} onChange={(v: WorkHold) => setStock({ hold: v })} />
              <Note>{WORK_HOLDS.find((w) => w.id === cfg.stock.hold)?.hint}</Note>
              {cfg.stock.hold !== 'plate' && <Num label="Held depth" unit="mm" value={cfg.stock.holdDepth} min={2} onChange={(v) => setStock({ holdDepth: v })} />}
              {cfg.stock.hold === 'vise' && <>
                <div className="rx-row"><Num label="Jaw height" unit="mm" value={cfg.stock.jawHeight} min={1} onChange={(v) => setStock({ jawHeight: v })} /><Num label="Jaw length" unit="mm" value={cfg.stock.jawLength} min={10} digits={0} onChange={(v) => setStock({ jawLength: v })} /></div>
              </>}
              <Note>Fixtures are modelled as solid obstacles: roughing and finishing paths stay out of them and the holder is kept clear. Taller jaws make the lower part of the stock unreachable.</Note>
            </>
          )}
          {turn && <Num label="Held length in chuck" unit="mm" value={cfg.stock.holdDepth} min={10} digits={0} onChange={(v) => setStock({ holdDepth: v })} />}
        </Section>
      )}

      {cut && (
        <Section title="Sheet" icon={<Box size={11} />}>
          <Num label="Thickness (0 = from part)" unit="mm" value={cfg.sheetThickness} min={0} onChange={(v) => set({ sheetThickness: v })} />
          <Note>Sheet size follows the machine table ({m.envelope[0]} × {m.envelope[1]} mm).</Note>
        </Section>
      )}

      {sub && mill && (
        <Section title="Machining options" icon={<Settings2 size={11} />}>
          <Toggle label="Roughing (adaptive, rest)" checked={cfg.mill.rough} onChange={(v) => setMill({ rough: v })} />
          <Toggle label="Finishing passes" checked={cfg.mill.finish} onChange={(v) => setMill({ finish: v })} />
          <Toggle label="Hole drilling cycles" checked={cfg.mill.drill} onChange={(v) => setMill({ drill: v })} />
          <div className="rx-row"><Num label="Wall stock" unit="mm" value={cfg.mill.allowRadial} min={0} step={0.05} onChange={(v) => setMill({ allowRadial: v })} />
            <Num label="Floor stock" unit="mm" value={cfg.mill.allowAxial} min={0} step={0.05} onChange={(v) => setMill({ allowAxial: v })} /></div>
          <Num label="Scallop target" unit="mm" value={cfg.mill.cusp} min={0.002} step={0.005} digits={3} onChange={(v) => setMill({ cusp: v })} />
          <Slide label="Model resolution" value={cfg.mill.cell} min={0} max={1} step={0.05} digits={2} unit=" mm" onChange={(v) => setMill({ cell: v })} />
          <Note>{cfg.mill.cell === 0 ? 'Automatic: about 0.4 mm cells, finer for small parts.' : 'Fixed model cell size. Smaller is more precise and slower.'}</Note>
        </Section>
      )}

      {!sub && (
        <Section title={fdm ? 'Slicing' : 'Layer & exposure'} icon={<Printer size={11} />}>
          {fdm ? (
            <>
              <Dropdown label="Nozzle" value={String(cfg.print.nozzle)} options={(m.nozzles ?? NOZZLES).map((n) => ({ id: String(n), label: `${n} mm` }))} onChange={(v) => setPrint({ nozzle: +v, layer: Math.min(cfg.print.layer, +v * 0.8) })} />
              <Slide label="Layer height" value={cfg.print.layer} min={0.05} max={Math.max(0.1, cfg.print.nozzle * 0.8)} step={0.01} digits={2} unit=" mm" onChange={(v) => setPrint({ layer: v, firstLayer: Math.max(v, Math.min(cfg.print.nozzle * 0.8, v * 1.4)) })} />
              <div className="rx-row"><Num label="Walls" value={cfg.print.perimeters} min={1} max={8} digits={0} onChange={(v) => setPrint({ perimeters: Math.round(v) })} /><Num label="Top" value={cfg.print.topLayers} min={0} max={12} digits={0} onChange={(v) => setPrint({ topLayers: Math.round(v) })} /></div>
              <Num label="Bottom layers" value={cfg.print.bottomLayers} min={0} max={12} digits={0} onChange={(v) => setPrint({ bottomLayers: Math.round(v) })} />
              <Slide label="Infill density" value={cfg.print.infill} min={0} max={100} step={5} unit=" %" onChange={(v) => setPrint({ infill: v })} />
              <Seg value={cfg.print.pattern} onChange={(v) => setPrint({ pattern: v })} options={[{ id: 'lines', label: 'Lines 45°' }, { id: 'grid', label: 'Grid' }]} />
              <Slide label="Print speed" value={cfg.print.speed} min={10} max={m.maxSpeed ?? 300} step={5} unit=" mm/s" onChange={(v) => setPrint({ speed: v })} />
              <div className="rx-row"><Num label="Nozzle" unit="°C" value={cfg.print.nozzleC} digits={0} onChange={(v) => setPrint({ nozzleC: v })} /><Num label="Bed" unit="°C" value={cfg.print.bedC} digits={0} onChange={(v) => setPrint({ bedC: v })} /></div>
              <Seg value={cfg.print.support} onChange={(v) => setPrint({ support: v })} options={[{ id: 'auto', label: 'Supports: auto' }, { id: 'none', label: 'Supports: off' }]} />
              <Seg value={cfg.print.adhesion} onChange={(v) => setPrint({ adhesion: v })} options={[{ id: 'brim', label: 'Brim' }, { id: 'skirt', label: 'Skirt' }, { id: 'none', label: 'None' }]} />
              <Slide label="Overhang limit" value={cfg.print.overhang} min={30} max={80} step={5} unit="°" onChange={(v) => setPrint({ overhang: v })} />
              <div className="rx-row"><Num label="Retract" unit="mm" value={cfg.print.retract} min={0} step={0.1} onChange={(v) => setPrint({ retract: v })} /><Num label="Z-hop" unit="mm" value={cfg.print.zhop} min={0} step={0.1} onChange={(v) => setPrint({ zhop: v })} /></div>
              <Num label="Flow" unit="×" value={cfg.print.flow} min={0.8} max={1.2} step={0.01} onChange={(v) => setPrint({ flow: v })} />
            </>
          ) : (
            <>
              <Slide label="Layer thickness" value={cfg.print.layer} min={m.layerRange?.[0] ?? 0.02} max={m.layerRange?.[1] ?? 0.15} step={0.005} digits={3} unit=" mm" onChange={(v) => setPrint({ layer: v, firstLayer: v })} />
              {cfg.process === 'sla' && <>
                <div className="rx-row"><Num label="Exposure" unit="s" value={cfg.print.exposure} min={0.1} onChange={(v) => setPrint({ exposure: v })} /><Num label="Bottom" unit="s" value={cfg.print.bottomExposure} min={1} onChange={(v) => setPrint({ bottomExposure: v })} /></div>
                <div className="rx-row"><Num label="Bottom layers" value={cfg.print.bottomLayers2} min={1} digits={0} onChange={(v) => setPrint({ bottomLayers2: Math.round(v) })} /><Num label="Lift" unit="mm" value={cfg.print.lift} min={1} onChange={(v) => setPrint({ lift: v })} /></div>
              </>}
              {cfg.process !== 'sla' && <>
                <div className="rx-row"><Num label="Laser" unit="W" value={cfg.print.power} min={1} digits={0} onChange={(v) => setPrint({ power: v })} /><Num label="Scan" unit="mm/s" value={cfg.print.scan} min={50} digits={0} onChange={(v) => setPrint({ scan: v })} /></div>
                <Num label="Hatch spacing" unit="mm" value={cfg.print.hatch} min={0.03} step={0.01} onChange={(v) => setPrint({ hatch: v })} />
              </>}
              <Seg value={cfg.print.support} onChange={(v) => setPrint({ support: v })} options={[{ id: 'auto', label: 'Supports: auto' }, { id: 'none', label: 'Supports: off' }]} />
              <Note>Output is a neutral scan-vector G-code (contour plus rotating hatch) that vendor software can import; it is not a native job file.</Note>
            </>
          )}
        </Section>
      )}
    </>
  );
}

export default function CamLeft(p: LeftProps): ReactNode {
  return (
    <aside className="rx-panel cam-left">
      <div className="rx-panel-head"><span className="eyebrow">MANUFACTURING SETUP</span><strong>MACHINE · PROCESS · STOCK</strong></div>
      <div className="rx-tabs">
        <button className={p.tab === 'machine' ? 'rx-tab-on' : ''} onClick={() => p.setTab('machine')}><Cpu size={11} /> Machine</button>
        <button className={p.tab === 'setup' ? 'rx-tab-on' : ''} onClick={() => p.setTab('setup')}><Layers size={11} /> Process &amp; Setup</button>
      </div>
      <div className="rx-scroll">{p.tab === 'machine' ? <MachineTab cfg={p.cfg} setCfg={p.setCfg} /> : <SetupTab {...p} />}</div>
    </aside>
  );
}
