// Left panel of the CAE workspace: study set-up (modules, model), materials, loads & restraints, meshing, solver.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Wind, Zap, Layers, Building2, Atom, Upload, Trash2, Play, X, Crosshair, Plus, Box, Eye, EyeOff, AlertTriangle, CheckCircle2, Info, Loader2, FlaskConical } from 'lucide-react';
import { Section, Toggle, Dropdown, Seg, Text, Slide, KV, Note } from '../cam/camUi';
import { ANALYSES, GROUPS, LOAD_SPECS, acceptsNodes, analysisSpec, defaultParams, loadSpec, type AnalysisGroup, type AnalysisId, type CaeBody, type Load, type LoadType, type ParamSpec, type Region, type Result } from './model';
import { MATERIALS, alpha3, k3, laminate, unidirectional, type Material } from './materials';
import { SAMPLES, makeLoad, makeRegion } from './samples';
import { estimateMesh } from './prepare';
import { bodiesBounds, isGeoRegion, loadColor, regionTris } from './regions';
import { BODY_COLORS, NumF, uid, type LeftTab, type SetStudy, type Study } from './caeUi';

const GROUP_ICON: Record<AnalysisGroup, ReactNode> = {
  'Structural & Mechanical': <Layers size={11} />, 'Fluid Dynamics & Aerodynamics': <Wind size={11} />, 'Civil & Infrastructure': <Building2 size={11} />,
  'Electrical & Electronics': <Zap size={11} />, 'Multiphysics': <Atom size={11} />,
};

/** What is picked in the viewport and not yet saved: face patches, edge chains or points. */
export type PickKind = 'off' | 'face' | 'edge' | 'point';
export interface Pending { kind: 'face' | 'edge' | 'point'; body: number; tris: number[]; segs: number[]; pts: number[]; count: number }
const pendingSize = (p: Pending | null) => (!p ? 0 : p.kind === 'face' ? p.tris.length : p.kind === 'edge' ? p.segs.length / 6 : p.pts.length / 3);
const nounOf = (k: Pending['kind'], n: number) => (k === 'face' ? (n === 1 ? 'face' : 'faces') : k === 'edge' ? (n === 1 ? 'edge segment' : 'edge segments') : n === 1 ? 'point' : 'points');
const regionSize = (r: Region, bodies: CaeBody[]) => (r.kind === 'edge' ? (r.segs?.length ?? 0) / 6 : r.kind === 'point' ? (r.pts?.length ?? 0) / 3 : regionTris(r, bodies).reduce((a, s) => a + s.tris.length, 0));

export interface LeftProps {
  tab: LeftTab; setTab: (t: LeftTab) => void;
  study: Study; setStudy: SetStudy;
  hasProject: boolean; projectName: string;
  onSample: (id: string, analysis?: AnalysisId) => void; onProject: () => void; onUpload: (f: File) => void;
  pickKind: PickKind; setPickKind: (k: PickKind) => void; pickAngle: number; setPickAngle: (v: number) => void;
  pending: Pending | null; setPending: (p: Pending | null) => void;
  selRegion: string | null; setSelRegion: (id: string | null) => void;
  busy: string | null; progress: number; error: string; onRun: () => void; onCancel: () => void;
  result: Result | null; stale: boolean;
  onPreviewMesh: () => void; meshPreviewing: boolean; meshBusy: boolean;
}

const TABS: { id: LeftTab; label: string }[] = [{ id: 'study', label: 'STUDY' }, { id: 'materials', label: 'MATERIAL' }, { id: 'loads', label: 'LOADS' }, { id: 'mesh', label: 'MESH' }, { id: 'solve', label: 'SOLVER' }];

export default function CaeLeft(p: LeftProps) {
  return (
    <aside className="rx-panel cae-left">
      <div className="rx-panel-head"><span className="eyebrow">PRE-PROCESSING</span><strong>STUDY · MATERIALS · LOADS · MESH</strong></div>
      <div className="rx-tabs">{TABS.map((t) => <button key={t.id} className={p.tab === t.id ? 'rx-tab-on' : ''} onClick={() => p.setTab(t.id)}>{t.label}</button>)}</div>
      <div className="rx-scroll">
        {p.tab === 'study' && <StudyTab {...p} />}
        {p.tab === 'materials' && <MaterialsTab {...p} />}
        {p.tab === 'loads' && <LoadsTab {...p} />}
        {p.tab === 'mesh' && <MeshTab {...p} />}
        {p.tab === 'solve' && <SolveTab {...p} />}
      </div>
    </aside>
  );
}

const paramValues = (s: Study, a: AnalysisId) => ({ ...defaultParams(a), ...(s.params[a] ?? {}) });

// ===============================================================================================
// Study

function StudyTab(p: LeftProps) {
  const { study, setStudy } = p;
  const spec = analysisSpec(study.analysis);
  const fileRef = useRef<HTMLInputElement>(null);
  const est = useMemo(() => estimateMesh(study.bodies, study.mesh), [study.bodies, study.mesh]);
  const usable = spec.loads;
  const applied = study.loads.filter((l) => l.on && usable.includes(l.type));
  const needsSupport = usable.includes('fixed') && spec.group !== 'Fluid Dynamics & Aerodynamics' && !['retaining', 'fsi', 'thermostress'].includes(spec.id);
  const supports = applied.filter((l) => ['fixed', 'frictionless', 'spring'].includes(l.type)).length;
  const sug = spec.sample ? SAMPLES.find((s) => s.id === spec.sample) : undefined;
  const checks: { ok: boolean | null; text: string }[] = [
    { ok: study.bodies.some((b) => b.role !== 'carve'), text: study.bodies.length ? `${study.bodies.length} part${study.bodies.length === 1 ? '' : 's'} loaded` : 'No geometry: pick a sample, use the project model or upload an STL' },
    { ok: study.bodies.length ? true : null, text: 'Materials assigned' },
    spec.loads.length === 0 ? { ok: true, text: 'This analysis needs no loads or restraints' } : { ok: applied.length > 0 ? true : spec.domain === 'solid' || spec.domain === 'air-box' ? false : null, text: applied.length ? `${applied.length} load${applied.length === 1 ? '' : 's'} / restraint${applied.length === 1 ? '' : 's'} apply` : 'No loads or restraints for this analysis yet (Loads tab)' },
    ...(needsSupport ? [{ ok: supports > 0 ? true : false, text: supports > 0 ? 'Supports defined' : 'No support: a free body cannot be solved statically' }] : []),
    { ok: study.bodies.length ? est.acrossMin >= 4 : null, text: study.bodies.length ? `Mesh ≈ ${est.elements.toLocaleString('en-US')} elements, ${est.acrossMin.toFixed(1)} cells across the thinnest side` : 'Mesh not estimated' },
  ];
  return (
    <>
      <Section title="Analysis module" icon={<FlaskConical size={11} />}>
        {GROUPS.map((g) => (
          <div key={g} className="cae-group">
            <div className="cae-group-h">{GROUP_ICON[g]}{g}</div>
            <div className="cae-an-list">
              {ANALYSES.filter((a) => a.group === g).map((a) => (
                <button key={a.id} className={`cae-an${a.id === study.analysis ? ' cae-an-on' : ''}`} onClick={() => { setStudy((s) => ({ ...s, analysis: a.id })); }} title={a.blurb}>{a.label}</button>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title={spec.short} badge={spec.group.split(' ')[0].toUpperCase()}>
        <p className="rx-note" style={{ color: '#b9afd8' }}>{spec.blurb}</p>
        <p className="rx-note"><b style={{ color: '#d6cdef' }}>Needs:</b> {spec.needs}</p>
        {spec.limits.map((l, i) => <p key={i} className="rx-note cae-limit"><Info size={9} /> {l}</p>)}
        {sug && !study.loads.some((l) => usable.includes(l.type)) && sug.id !== study.source && (
          <button className="rx-btn" style={{ width: '100%', marginTop: 4 }} onClick={() => p.onSample(sug.id, study.analysis)}><Box size={11} /> Load the example set-up: {sug.name}</button>
        )}
      </Section>

      <Section title="Model" icon={<Box size={11} />} badge={study.bodies.length ? study.name : undefined}>
        <div className="cae-samples">
          {SAMPLES.map((s) => (
            <button key={s.id} className={`cae-sample${study.source === s.id ? ' cae-sample-on' : ''}`} onClick={() => p.onSample(s.id)} title={s.blurb}>
              <b>{s.name}</b><span>{s.blurb}</span>
            </button>
          ))}
        </div>
        <div className="cae-row">
          <button className="rx-btn" onClick={p.onProject} disabled={!p.hasProject} title={p.hasProject ? 'Use the model of the open project' : 'The open project has no 3D model yet'} style={{ flex: 1 }}><Box size={11} /> Project model</button>
          <button className="rx-btn" onClick={() => fileRef.current?.click()} style={{ flex: 1 }}><Upload size={11} /> Upload STL</button>
          <input ref={fileRef} type="file" accept=".stl" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUpload(f); e.target.value = ''; }} />
        </div>
        {study.bodies.length > 0 && (
          <div className="cae-bodies">
            {study.bodies.map((b, i) => (
              <div key={b.id} className="cae-body">
                <span className="cae-dot" style={{ background: b.role === 'fluid' ? '#4fc3f7' : b.role === 'carve' ? '#ff6b6b' : BODY_DOT[i % BODY_DOT.length] }} />
                <span className="cae-body-n" title={b.name}>{b.name}</span>
                <select value={b.role} onChange={(e) => setStudy((s) => ({ ...s, bodies: s.bodies.map((x, k) => (k === i ? { ...x, role: e.target.value as CaeBody['role'] } : x)) }))} title="Solid part, fluid passage (internal flow) or cut-out">
                  <option value="solid">solid</option><option value="fluid">fluid</option><option value="carve">cut-out</option>
                </select>
                <button className="cae-icon" title="Remove part" onClick={() => setStudy((s) => ({ ...s, bodies: s.bodies.filter((_, k) => k !== i), regions: s.regions.filter((r) => !(r.bodyIndex === i && (r.kind === 'tris' || r.kind === 'body'))).map((r) => (r.bodyIndex !== undefined && r.bodyIndex > i ? { ...r, bodyIndex: r.bodyIndex - 1 } : r)) }))}><Trash2 size={10} /></button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Readiness">
        <ul className="cae-checks">
          {checks.map((c, i) => <li key={i} className={c.ok === true ? 'ok' : c.ok === false ? 'bad' : ''}>{c.ok === true ? <CheckCircle2 size={11} /> : c.ok === false ? <AlertTriangle size={11} /> : <Info size={11} />}<span>{c.text}</span></li>)}
        </ul>
        <button className="rx-render" onClick={p.onRun} disabled={!!p.busy || !study.bodies.length}><Play size={12} /> RUN {spec.short.toUpperCase()}</button>
      </Section>
    </>
  );
}
const BODY_DOT = BODY_COLORS;

// ===============================================================================================
// Materials

const fmtG = (v: number) => (v >= 1000 ? `${+(v / 1000).toPrecision(3)} GPa` : `${+v.toPrecision(3)} MPa`);

function MaterialsTab(p: LeftProps) {
  const { study, setStudy } = p;
  const [bi, setBi] = useState(0);
  const b = study.bodies[Math.min(bi, study.bodies.length - 1)];
  const idx = b ? study.bodies.indexOf(b) : -1;
  const spec = analysisSpec(study.analysis);
  if (!b) return <Note>Load a model first (Study tab).</Note>;
  const setBody = (f: (x: CaeBody) => CaeBody) => setStudy((s) => ({ ...s, bodies: s.bodies.map((x, k) => (k === idx ? f(x) : x)) }));
  const setMat = (m: Material) => setBody((x) => ({ ...x, mat: m }));
  const all = [...MATERIALS, ...study.customMats];
  const thermalOn = spec.group === 'Electrical & Electronics' || ['thermal', 'thermostress', 'internal', 'windtunnel', 'fsi'].includes(spec.id);
  const elecOn = spec.group === 'Electrical & Electronics';
  const m = b.mat;
  const edit = (patch: Partial<Material>) => setMat({ ...m, ...patch, custom: true, id: m.custom ? m.id : uid('cm'), name: m.custom ? m.name : `${m.name} (edited)` });
  const ortho = m.kind === 'ortho';
  const a3 = alpha3(m), kk = k3(m);
  const toOrtho = () => edit({ kind: 'ortho', E1: m.E, E2: m.E, E3: m.E, nu12: m.nu, nu23: m.nu, nu13: m.nu, G12: m.E / (2 * (1 + m.nu)), G23: m.E / (2 * (1 + m.nu)), G13: m.E / (2 * (1 + m.nu)), alpha: alpha3(m), k: k3(m) });
  const toIso = () => edit({ kind: 'iso', E: m.E1 ?? m.E, nu: m.nu12 ?? m.nu, alpha: a3[0], k: kk[0] });

  return (
    <>
      <Section title="Part">
        <div className="cae-bodies">
          {study.bodies.map((x, i) => (
            <button key={x.id} className={`cae-body cae-body-btn${i === idx ? ' cae-body-on' : ''}`} onClick={() => setBi(i)}>
              <span className="cae-dot" style={{ background: BODY_DOT[i % BODY_DOT.length] }} /><span className="cae-body-n">{x.name}</span><em>{x.mat.name}</em>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Material library" badge={m.kind === 'ortho' ? 'ORTHOTROPIC' : 'ISOTROPIC'}>
        <Dropdown label={`Material of “${b.name}”`} value={m.custom && !all.some((x) => x.id === m.id) ? '__cur' : m.id}
          options={[...(m.custom && !all.some((x) => x.id === m.id) ? [{ id: '__cur', label: m.name, group: 'Current' }] : []), ...MATERIALS.map((x) => ({ id: x.id, label: x.name, group: x.cat })), ...study.customMats.map((x) => ({ id: x.id, label: x.name, group: 'My materials' }))]}
          onChange={(id) => { const f = all.find((x) => x.id === id); if (f) setMat({ ...f }); }} />
        <div className="cae-props">
          <div><span>E</span><b>{fmtG(m.E1 ?? m.E)}</b></div><div><span>ν</span><b>{m.nu.toFixed(3)}</b></div>
          <div><span>ρ</span><b>{Math.round(m.rho)} kg/m³</b></div><div><span>Yield</span><b>{+m.yield.toPrecision(3)} MPa</b></div>
          <div><span>Ultimate</span><b>{+m.ultimate.toPrecision(3)} MPa</b></div><div><span>k</span><b>{+kk[0].toPrecision(3)} W/mK</b></div>
        </div>
        {m.note && <p className="rx-note">{m.note}</p>}
      </Section>

      <Section title="Edit properties" badge={m.custom ? 'CUSTOM' : undefined} action={m.custom ? <button className="rx-btn cae-mini" onClick={() => { if (!study.customMats.some((x) => x.id === m.id)) setStudy((s) => ({ ...s, customMats: [...s.customMats, { ...m }] })); }}>Save to library</button> : undefined}>
        <Seg value={ortho ? 'ortho' : 'iso'} options={[{ id: 'iso', label: 'Isotropic' }, { id: 'ortho', label: 'Orthotropic' }]} onChange={(v) => (v === 'ortho' ? !ortho && toOrtho() : ortho && toIso())} />
        {!ortho ? (
          <>
            <NumF label="Young's modulus E" unit="MPa" value={m.E} min={1e-3} onChange={(v) => edit({ E: v })} wide />
            <NumF label="Poisson's ratio ν" value={m.nu} min={0} max={0.499} onChange={(v) => edit({ nu: v })} />
          </>
        ) : (
          <>
            <div className="cae-grid3">
              <NumF label="E1" unit="MPa" value={m.E1 ?? m.E} min={1e-3} onChange={(v) => edit({ E1: v, E: v })} wide />
              <NumF label="E2" unit="MPa" value={m.E2 ?? m.E} min={1e-3} onChange={(v) => edit({ E2: v })} wide />
              <NumF label="E3" unit="MPa" value={m.E3 ?? m.E} min={1e-3} onChange={(v) => edit({ E3: v })} wide />
              <NumF label="ν12" value={m.nu12 ?? m.nu} min={0} max={0.499} onChange={(v) => edit({ nu12: v, nu: v })} />
              <NumF label="ν23" value={m.nu23 ?? m.nu} min={0} max={0.499} onChange={(v) => edit({ nu23: v })} />
              <NumF label="ν13" value={m.nu13 ?? m.nu} min={0} max={0.499} onChange={(v) => edit({ nu13: v })} />
              <NumF label="G12" unit="MPa" value={m.G12 ?? 1000} min={1e-3} onChange={(v) => edit({ G12: v })} wide />
              <NumF label="G23" unit="MPa" value={m.G23 ?? 1000} min={1e-3} onChange={(v) => edit({ G23: v })} wide />
              <NumF label="G13" unit="MPa" value={m.G13 ?? 1000} min={1e-3} onChange={(v) => edit({ G13: v })} wide />
            </div>
            <Dropdown label="Fibre / grain direction (local 1)" value={String(b.fibre)} options={[{ id: '0', label: 'Global X' }, { id: '1', label: 'Global Y' }, { id: '2', label: 'Global Z' }]} onChange={(v) => setBody((x) => ({ ...x, fibre: Number(v) as 0 | 1 | 2 }))} />
            <p className="rx-note">Strength (first-ply failure, Tsai–Wu): along / across the fibres</p>
            <div className="cae-grid3">
              {(['Xt', 'Xc', 'Yt', 'Yc', 'S'] as const).map((k) => <NumF key={k} label={k} unit="MPa" value={m.str?.[k] ?? 0} min={0} onChange={(v) => edit({ str: { Xt: 0, Xc: 0, Yt: 0, Yc: 0, S: 0, ...(m.str ?? {}), [k]: v } })} />)}
            </div>
          </>
        )}
        <NumF label="Density ρ" unit="kg/m³" value={m.rho} min={1e-3} onChange={(v) => edit({ rho: v })} wide />
        <NumF label="Yield strength" unit="MPa" value={m.yield} min={0} onChange={(v) => edit({ yield: v })} />
        <NumF label="Ultimate strength" unit="MPa" value={m.ultimate} min={0} onChange={(v) => edit({ ultimate: v })} />
        {(thermalOn || true) && (
          <>
            <NumF label="Thermal conductivity k" unit="W/mK" value={kk[0]} min={0} onChange={(v) => edit({ k: ortho ? [v, kk[1], kk[2]] : v })} />
            {ortho && <div className="cae-grid3"><NumF label="k2" value={kk[1]} min={0} onChange={(v) => edit({ k: [kk[0], v, kk[2]] })} /><NumF label="k3" value={kk[2]} min={0} onChange={(v) => edit({ k: [kk[0], kk[1], v] })} /></div>}
            <NumF label="Specific heat cp" unit="J/kgK" value={m.cp} min={0} onChange={(v) => edit({ cp: v })} />
            <NumF label="Thermal expansion α" unit="10⁻⁶/K" value={a3[0]} onChange={(v) => edit({ alpha: ortho ? [v, a3[1], a3[2]] : v })} />
            {ortho && <div className="cae-grid3"><NumF label="α2" value={a3[1]} onChange={(v) => edit({ alpha: [a3[0], v, a3[2]] })} /><NumF label="α3" value={a3[2]} onChange={(v) => edit({ alpha: [a3[0], a3[1], v] })} /></div>}
          </>
        )}
        {(elecOn || true) && (
          <>
            <NumF label="Electrical conductivity σ" unit="S/m" value={m.sigma ?? 0} min={0} onChange={(v) => edit({ sigma: v })} wide />
            <NumF label="Relative permittivity εr" value={m.epsr ?? 1} min={1} onChange={(v) => edit({ epsr: v })} />
            <NumF label="Relative permeability μr" value={m.mur ?? 1} min={0.01} onChange={(v) => edit({ mur: v })} />
            <NumF label="Remanence Br (magnets)" unit="T" value={m.Br ?? 0} min={0} onChange={(v) => edit({ Br: v })} />
          </>
        )}
        <NumF label="Permeability (porous)" unit="m²" value={m.perm ?? 0} min={0} onChange={(v) => edit({ perm: v })} wide />
        <NumF label="Friction angle φ" unit="°" value={m.phi ?? 0} min={0} max={60} onChange={(v) => edit({ phi: v })} />
        <NumF label="Cohesion c" unit="MPa" value={m.coh ?? 0} min={0} onChange={(v) => edit({ coh: v })} />
      </Section>

      <CompositeBuilder study={study} setStudy={setStudy} assign={setMat} />

      <Section title="Part behaviour">
        {(thermalOn) && (
          <>
            <NumF label="Heat dissipation" unit="W" value={b.power} min={0} onChange={(v) => setBody((x) => ({ ...x, power: v }))} />
            <NumF label="Junction-to-case Rjc" unit="K/W" value={b.rjc} min={0} onChange={(v) => setBody((x) => ({ ...x, rjc: v }))} hint="Thermal resistance between the silicon junction and the package case (electronics)." />
          </>
        )}
        {(spec.id === 'joule' || spec.id === 'electrostatic') && (
          <>
            <Toggle label="Held at a fixed potential" checked={b.potential !== null} onChange={(v) => setBody((x) => ({ ...x, potential: v ? 0 : null }))} />
            {b.potential !== null && <NumF label="Potential" unit="V" value={b.potential} onChange={(v) => setBody((x) => ({ ...x, potential: v }))} />}
          </>
        )}
        {spec.id === 'magnetostatic' && (
          <Dropdown label="Magnetisation direction" value={b.magnet ? b.magnet.join(',') : 'none'}
            options={[{ id: 'none', label: 'Not a magnet' }, { id: '1,0,0', label: '+X' }, { id: '-1,0,0', label: '−X' }, { id: '0,1,0', label: '+Y' }, { id: '0,-1,0', label: '−Y' }, { id: '0,0,1', label: '+Z' }, { id: '0,0,-1', label: '−Z' }]}
            onChange={(v) => setBody((x) => ({ ...x, magnet: v === 'none' ? null : (v.split(',').map(Number) as [number, number, number]) }))} />
        )}
        <Dropdown label="Role in the model" value={b.role} options={[{ id: 'solid', label: 'Solid part' }, { id: 'fluid', label: 'Fluid passage (internal flow)' }, { id: 'carve', label: 'Cut-out (removes material)' }]} onChange={(v) => setBody((x) => ({ ...x, role: v as CaeBody['role'] }))} />
        {!thermalOn && spec.id !== 'joule' && spec.id !== 'electrostatic' && spec.id !== 'magnetostatic' && <p className="rx-note">Heat, potential and magnetisation settings appear when the selected analysis uses them.</p>}
      </Section>

      <Section title="Material matrix">
        <div className="cae-mx">
          <table>
            <thead><tr><th>Part</th><th>Material</th><th>E</th><th>ν</th><th>σy</th><th>ρ</th></tr></thead>
            <tbody>{study.bodies.filter((x) => x.role !== 'carve').map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.mat.name}{x.mat.kind === 'ortho' ? ' ⊥' : ''}</td><td>{fmtG(x.mat.E1 ?? x.mat.E)}</td><td>{x.mat.nu.toFixed(2)}</td><td>{+x.mat.yield.toPrecision(3)}</td><td>{Math.round(x.mat.rho)}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

const CARBON = { Ef: 230000, nuf: 0.2, Gf: 90000, rhof: 1800, Em: 3500, num: 0.35, rhom: 1200, Vf: 0.6 };
const GLASS = { Ef: 73000, nuf: 0.22, Gf: 30000, rhof: 2540, Em: 3200, num: 0.35, rhom: 1200, Vf: 0.5 };

function CompositeBuilder({ study, setStudy, assign }: { study: Study; setStudy: SetStudy; assign: (m: Material) => void }) {
  const [mode, setMode] = useState<'ud' | 'lam'>('ud');
  const [name, setName] = useState('Carbon/epoxy ply');
  const [c, setC] = useState(CARBON);
  const [angles, setAngles] = useState('0/45/-45/90/90/-45/45/0');
  const [plyId, setPlyId] = useState('');
  const [normal, setNormal] = useState<'0' | '1' | '2'>('2');
  const [msg, setMsg] = useState('');
  const plies = study.customMats.filter((m) => m.kind === 'ortho');
  const num = (k: keyof typeof CARBON, label: string, unit: string, mx?: number) => <NumF label={label} unit={unit} value={c[k]} min={0} max={mx} onChange={(v) => setC({ ...c, [k]: v })} wide />;
  const create = () => {
    try {
      if (mode === 'ud') {
        const m = unidirectional(name || 'UD ply', c); m.id = uid('ud');
        setStudy((s) => ({ ...s, customMats: [...s.customMats, m] })); assign(m); setMsg(`Created ${m.name}: E1 ${fmtG(m.E1 ?? m.E)}, E2 ${fmtG(m.E2 ?? 0)}, G12 ${fmtG(m.G12 ?? 0)}.`);
      } else {
        const ply = plies.find((x) => x.id === plyId) ?? plies[plies.length - 1];
        if (!ply) { setMsg('Create a unidirectional ply first.'); return; }
        const list = angles.split(/[\/,;\s]+/).map(Number).filter((x) => Number.isFinite(x));
        if (!list.length) { setMsg('Enter ply angles such as 0/45/-45/90.'); return; }
        const m = laminate(name || 'Laminate', ply, list, Number(normal) as 0 | 1 | 2); m.id = uid('lam');
        setStudy((s) => ({ ...s, customMats: [...s.customMats, m] })); assign(m); setMsg(`Created ${m.name}: Ex ${fmtG(m.E1 ?? m.E)}, Ey ${fmtG(m.E2 ?? 0)}.`);
      }
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <Section title="Composite builder" icon={<Layers size={11} />}>
      <Seg value={mode} options={[{ id: 'ud', label: 'Unidirectional ply' }, { id: 'lam', label: 'Laminate' }]} onChange={setMode} />
      <Text label="Name" value={name} onChange={setName} />
      {mode === 'ud' ? (
        <>
          <div className="cae-row"><button className="rx-btn" style={{ flex: 1 }} onClick={() => { setC(CARBON); setName('Carbon/epoxy ply'); }}>Carbon / epoxy</button><button className="rx-btn" style={{ flex: 1 }} onClick={() => { setC(GLASS); setName('E-glass/epoxy ply'); }}>Glass / epoxy</button></div>
          {num('Ef', 'Fibre E', 'MPa')}{num('nuf', 'Fibre ν', '', 0.5)}{num('Gf', 'Fibre G', 'MPa')}{num('rhof', 'Fibre ρ', 'kg/m³')}
          {num('Em', 'Matrix E', 'MPa')}{num('num', 'Matrix ν', '', 0.499)}{num('rhom', 'Matrix ρ', 'kg/m³')}{num('Vf', 'Fibre volume fraction', '', 0.85)}
        </>
      ) : (
        <>
          <Dropdown label="Ply material (a unidirectional ply)" value={plyId || (plies[plies.length - 1]?.id ?? '')} options={plies.length ? plies.map((m) => ({ id: m.id, label: m.name })) : [{ id: '', label: 'No plies yet: build one first' }]} onChange={setPlyId} />
          <Text label="Ply angles (degrees, / separated)" value={angles} onChange={setAngles} mono />
          <Dropdown label="Ply stacking direction (normal)" value={normal} options={[{ id: '0', label: 'Global X' }, { id: '1', label: 'Global Y' }, { id: '2', label: 'Global Z' }]} onChange={(v) => setNormal(v as '0' | '1' | '2')} />
        </>
      )}
      <button className="rx-btn" onClick={create}><Plus size={11} /> Create and assign to the selected part</button>
      {msg && <p className="rx-note">{msg}</p>}
      <p className="rx-note">Ply properties follow the rule of mixtures and Halpin–Tsai; a laminate is homogenised with classical laminate theory (in-plane stiffness). Strengths are estimates: confirm with test data.</p>
    </Section>
  );
}

// ===============================================================================================
// Loads & restraints

const GROUP_ORDER = ['Restraint', 'Mechanical', 'Thermal', 'Electrical', 'Magnetic'] as const;

function LoadsTab(p: LeftProps) {
  const { study, setStudy, pending } = p;
  const spec = analysisSpec(study.analysis);
  const bounds = useMemo(() => bodiesBounds(study.bodies), [study.bodies]);
  const [kind, setKind] = useState<'plane' | 'box' | 'body' | 'all'>('plane');
  const [plane, setPlane] = useState('2:1');
  const [bodyIx, setBodyIx] = useState(0);
  const [box, setBox] = useState<[number, number, number, number, number, number]>([0, 0, 0, 1, 1, 1]);
  const [newType, setNewType] = useState<LoadType>(spec.loads[0] ?? 'force');
  const [newRegion, setNewRegion] = useState('');
  const pendGeo = !!pending && pending.kind !== 'face';
  // picked edges and points take a few load types only (supports, forces, temperature, potential...)
  const applicable = spec.loads;
  const addable = pendGeo ? applicable.filter(acceptsNodes) : applicable;
  const curType = addable.includes(newType) ? newType : addable[0];
  const regionOk = (r: Region, t: LoadType | undefined) => !isGeoRegion(r) || (!!t && acceptsNodes(t));
  const addRegion = (r: Region) => setStudy((s) => ({ ...s, regions: [...s.regions, r] }));

  const savePending = (name?: string): Region | null => {
    if (!pending || pendingSize(pending) === 0) return null;
    const n = study.regions.length + 1;
    const r = pending.kind === 'face' ? makeRegion(name ?? `Faces ${n}`, { kind: 'tris', bodyIndex: pending.body, tris: pending.tris })
      : pending.kind === 'edge' ? makeRegion(name ?? `Edges ${n}`, { kind: 'edge', bodyIndex: pending.body, segs: pending.segs })
        : makeRegion(name ?? `Points ${n}`, { kind: 'point', pts: pending.pts });
    addRegion(r); p.setPending(null);
    return r;
  };
  const createGeometric = () => {
    let r: Region;
    if (kind === 'plane') { const [ax, sd] = plane.split(':').map(Number) as [0 | 1 | 2, 0 | 1]; r = makeRegion(`${sd ? 'Max' : 'Min'} ${'XYZ'[ax]} face`, { kind: 'plane', axis: ax, side: sd }); }
    else if (kind === 'body') r = makeRegion(`Body: ${study.bodies[bodyIx]?.name ?? ''}`, { kind: 'body', bodyIndex: bodyIx });
    else if (kind === 'all') r = makeRegion('All surfaces', { kind: 'all' });
    else r = makeRegion(`Box ${study.regions.length + 1}`, { kind: 'box', box });
    addRegion(r);
  };
  const addLoad = () => {
    if (!curType) return;
    const ls = loadSpec(curType);
    let rid = newRegion;
    if (ls.region !== 'none') {
      if (pending && pendingSize(pending) > 0) rid = savePending()!.id;
      else if (!rid || !study.regions.some((r) => r.id === rid)) rid = [...study.regions].reverse().find((r) => regionOk(r, curType))?.id ?? '';
      if (!rid) return;
    }
    const l = makeLoad(curType, ls.region === 'none' ? '' : rid);
    setStudy((s) => ({ ...s, loads: [...s.loads, l] }));
  };
  const setLoad = (id: string, f: (l: Load) => Load) => setStudy((s) => ({ ...s, loads: s.loads.map((l) => (l.id === id ? f(l) : l)) }));

  return (
    <>
      <Section title="1 · Pick surface, edge or point" icon={<Crosshair size={11} />} badge={pending ? `${pendingSize(pending)} ${nounOf(pending.kind, pendingSize(pending))}` : undefined}>
        <Seg value={p.pickKind} options={[{ id: 'off', label: 'Off' }, { id: 'face', label: 'Surface' }, { id: 'edge', label: 'Edge' }, { id: 'point', label: 'Point' }]} onChange={(v) => p.setPickKind(v as PickKind)} />
        {p.pickKind !== 'off' && <Slide label={p.pickKind === 'edge' ? 'Edge angle (corner threshold)' : p.pickKind === 'face' ? 'Patch angle (smooth-face threshold)' : 'Edge angle (not used by points)'} value={p.pickAngle} min={5} max={85} step={5} unit="°" onChange={p.setPickAngle} />}
        <p className="rx-note">
          {p.pickKind === 'off' && 'Choose what to pick in the viewport, then add a load or support to it. Navigation is unchanged: middle mouse pans, double middle-click fits.'}
          {p.pickKind === 'face' && 'Click a face to select it (the patch grows across edges flatter than the angle). Shift / Ctrl + click adds more patches.'}
          {p.pickKind === 'edge' && 'Click near an edge: the whole edge up to the next corner is selected (a circle is taken whole). Shift / Ctrl + click adds more. Edges carry a fixed support, line force, temperature, heat, or potential.'}
          {p.pickKind === 'point' && 'Click a corner to snap to it, or anywhere on the surface for a free point. Shift / Ctrl + click adds more. Points carry a fixed support, point force, temperature, heat, or potential.'}
        </p>
        <div className="cae-row">
          <button className="rx-btn" style={{ flex: 1 }} disabled={!pending} onClick={() => { const r = savePending(); if (r) p.setSelRegion(r.id); }}><Plus size={11} /> Save as selection set</button>
          <button className="rx-btn" disabled={!pending} onClick={() => p.setPending(null)}><X size={11} /> Clear</button>
        </div>
      </Section>

      <Section title="Selection sets" badge={`${study.regions.length}`}>
        <Seg value={kind} options={[{ id: 'plane', label: 'Bbox face' }, { id: 'box', label: 'Box' }, { id: 'body', label: 'Part' }, { id: 'all', label: 'All' }]} onChange={(v) => { setKind(v); if (v === 'box' && bounds) setBox([...bounds.min, ...bounds.max] as typeof box); }} />
        {kind === 'plane' && <Dropdown label="Outer face of the model" value={plane} options={['0:0', '0:1', '1:0', '1:1', '2:0', '2:1'].map((v) => ({ id: v, label: `${v.endsWith('1') ? 'Max' : 'Min'} ${'XYZ'[+v[0]]}${bounds ? ` (${'XYZ'[+v[0]]} = ${(v.endsWith('1') ? bounds.max[+v[0]] : bounds.min[+v[0]]).toFixed(1)} mm)` : ''}` }))} onChange={setPlane} />}
        {kind === 'body' && <Dropdown label="Part" value={String(bodyIx)} options={study.bodies.map((b, i) => ({ id: String(i), label: b.name }))} onChange={(v) => setBodyIx(Number(v))} />}
        {kind === 'box' && (
          <div className="cae-grid3">{['x0', 'y0', 'z0', 'x1', 'y1', 'z1'].map((l, i) => <NumF key={l} label={l} value={box[i]} onChange={(v) => setBox((b) => b.map((x, k) => (k === i ? v : x)) as typeof box)} />)}</div>
        )}
        <button className="rx-btn" onClick={createGeometric} disabled={!study.bodies.length}><Plus size={11} /> Add selection set</button>
        <div className="cae-regions">
          {study.regions.map((r) => {
            const n = regionSize(r, study.bodies);
            return (
              <div key={r.id} className={`cae-region${p.selRegion === r.id ? ' cae-region-on' : ''}`} onClick={() => p.setSelRegion(p.selRegion === r.id ? null : r.id)}>
                <i style={{ background: r.color }} />
                <input value={r.name} onClick={(e) => e.stopPropagation()} onChange={(e) => setStudy((s) => ({ ...s, regions: s.regions.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)) }))} />
                <small>{r.kind === 'tris' ? 'faces' : r.kind} · {n}</small>
                <button className="cae-icon" title="Delete (also removes the loads that use it)" onClick={(e) => { e.stopPropagation(); setStudy((s) => ({ ...s, regions: s.regions.filter((x) => x.id !== r.id), loads: s.loads.filter((l) => l.region !== r.id) })); }}><Trash2 size={10} /></button>
              </div>
            );
          })}
          {!study.regions.length && <p className="rx-note">No selection sets yet. Pick faces, edges or points, or add the outer face of the model, a box or a part.</p>}
        </div>
      </Section>

      <Section title="2 · Loads & restraints" badge={applicable.length ? `${study.loads.filter((l) => applicable.includes(l.type)).length} used` : 'none needed'}>
        {!applicable.length ? <p className="rx-note">This analysis needs no loads or restraints; set its parameters in the Solver tab.</p> : (
          <>
            <Dropdown label="Add" value={curType ?? ''} options={addable.map((t) => { const s = loadSpec(t); return { id: t, label: s.label, group: s.group }; })} onChange={(v) => setNewType(v as LoadType)} />
            {curType && <p className="rx-note">{loadSpec(curType).hint}</p>}
            {pendGeo && !addable.length && <p className="rx-note cae-limit"><Info size={9} /> This analysis has no load or support that can sit on an edge or a point. Pick a surface instead.</p>}
            {curType && loadSpec(curType).region !== 'none' && (
              <Dropdown label="Applied to" value={pending ? '__pending' : (study.regions.some((r) => r.id === newRegion && regionOk(r, curType)) ? newRegion : [...study.regions].reverse().find((r) => regionOk(r, curType))?.id) || ''} options={[...(pending ? [{ id: '__pending', label: `Current picked ${nounOf(pending.kind, pendingSize(pending))} (${pendingSize(pending)})` }] : []), ...study.regions.filter((r) => regionOk(r, curType)).map((r) => ({ id: r.id, label: r.name }))]} onChange={setNewRegion} />
            )}
            <button className="rx-btn" onClick={addLoad} disabled={!curType}><Plus size={11} /> Add {curType ? loadSpec(curType).label.toLowerCase() : ''}</button>
          </>
        )}
        {GROUP_ORDER.map((g) => {
          const list = study.loads.filter((l) => loadSpec(l.type).group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <div className="cae-group-h" style={{ marginTop: 6 }}>{g}</div>
              {list.map((l) => {
                const ls = loadSpec(l.type), used = applicable.includes(l.type);
                return (
                  <div key={l.id} className={`cae-load${used ? '' : ' cae-load-off'}`} style={{ borderLeftColor: loadColor(l) }}>
                    <div className="cae-load-h">
                      <button className="cae-icon" title={l.on ? 'Disable' : 'Enable'} onClick={() => setLoad(l.id, (x) => ({ ...x, on: !x.on }))}>{l.on ? <Eye size={11} /> : <EyeOff size={11} />}</button>
                      <input value={l.name} onChange={(e) => setLoad(l.id, (x) => ({ ...x, name: e.target.value }))} />
                      <button className="cae-icon" title="Remove" onClick={() => setStudy((s) => ({ ...s, loads: s.loads.filter((x) => x.id !== l.id) }))}><Trash2 size={10} /></button>
                    </div>
                    {!used && <p className="rx-note">Not used by {spec.short}.</p>}
                    {ls.region !== 'none' && (
                      <Dropdown label="Applied to" value={l.region} options={[{ id: '', label: '– none –' }, ...study.regions.filter((r) => regionOk(r, l.type)).map((r) => ({ id: r.id, label: r.name }))]} onChange={(v) => setLoad(l.id, (x) => ({ ...x, region: v }))} />
                    )}
                    {ls.fields.map((f) => <NumF key={f.k} label={f.label} unit={f.unit} value={l.p[f.k] ?? f.def} min={f.min} max={f.max} onChange={(v) => setLoad(l.id, (x) => ({ ...x, p: { ...x.p, [f.k]: v } }))} />)}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!study.loads.length && applicable.length > 0 && <p className="rx-note">No loads yet. Add a support first, then the loads. The coloured patches and arrows in the viewport show what is applied where.</p>}
      </Section>
      <LoadLegend />
    </>
  );
}

function LoadLegend() {
  return <div className="cae-legend-load">{LOAD_SPECS.filter((s) => s.type !== 'coil').slice(0, 12).map((s) => <span key={s.type}><i style={{ background: s.color }} />{s.label}</span>)}</div>;
}

// ===============================================================================================
// Mesh

function ParamField({ ps, values, set }: { ps: ParamSpec; values: Record<string, number | string | boolean>; set: (k: string, v: number | string | boolean) => void }) {
  const v = values[ps.k] ?? ps.def;
  if (ps.type === 'num') return <NumF label={ps.label} unit={ps.unit} value={Number(v)} min={ps.min} max={ps.max} hint={ps.hint} onChange={(x) => set(ps.k, x)} wide />;
  if (ps.type === 'bool') return <Toggle label={ps.label} checked={!!v} hint={ps.hint} onChange={(x) => set(ps.k, x)} />;
  if (ps.type === 'select') return <Dropdown label={ps.label} value={String(v)} hint={ps.hint} options={(ps.options ?? []).map((o) => ({ id: o.v, label: o.label }))} onChange={(x) => set(ps.k, x)} />;
  return <Text label={ps.label} value={String(v)} onChange={(x) => set(ps.k, x)} />;
}

function MeshTab(p: LeftProps) {
  const { study, setStudy } = p;
  const spec = analysisSpec(study.analysis);
  const est = useMemo(() => estimateMesh(study.bodies, study.mesh), [study.bodies, study.mesh]);
  const vals = paramValues(study, study.analysis);
  const setP = (k: string, v: number | string | boolean) => setStudy((s) => ({ ...s, params: { ...s.params, [s.analysis]: { ...(s.params[s.analysis] ?? {}), [k]: v } } }));
  const r = p.result;
  const cfdOnly = spec.domain === 'flow';
  return (
    <>
      <Section title="Global mesh control">
        <Seg value={study.mesh.preset} options={[{ id: 'coarse', label: 'Coarse' }, { id: 'medium', label: 'Medium' }, { id: 'fine', label: 'Fine' }, { id: 'custom', label: 'Custom' }]} onChange={(v) => setStudy((s) => ({ ...s, mesh: { ...s.mesh, preset: v } }))} />
        {study.mesh.preset === 'custom' && <NumF label="Element size" unit="mm" value={study.mesh.size} min={1e-3} onChange={(v) => setStudy((s) => ({ ...s, mesh: { ...s.mesh, size: v } }))} />}
        <p className="rx-note">{cfdOnly ? 'CFD uses its own lattice resolution (Solver tab). The structural mesh below is not used.' : 'Coarse / medium / fine divide the longest side of the model into 28 / 48 / 80 elements.'}</p>
        <KV rows={[['Element size', `${+est.h.toPrecision(3)} mm`], ['Elements (est.)', est.elements.toLocaleString('en-US')], ['Degrees of freedom', est.dof.toLocaleString('en-US')], ['Cells across thinnest side', est.acrossMin.toFixed(1)]]} />
        {est.acrossMin < 4 && study.bodies.length > 0 && <Note tone="warn">Fewer than about 4 cells across the thinnest dimension: bending of thin parts is poorly resolved. Refine, or lower the element size.</Note>}
        {est.elements > 60000 && <Note tone="warn">Large model: expect long run times. Modal, buckling and dynamic analyses coarsen the mesh automatically.</Note>}
      </Section>

      <Section title="Element type and refinement">
        {spec.params.filter((x) => x.k === 'elem' || x.k === 'refine').map((x) => <ParamField key={x.k} ps={x} values={vals} set={setP} />)}
        {!spec.params.some((x) => x.k === 'elem' || x.k === 'refine') && <p className="rx-note">Element type and local refinement options appear for structural analyses.</p>}
        <p className="rx-note">Meshing is voxel based (Cartesian). Hexahedral elements use enhanced strain; tetrahedra split each voxel into six. “Refine the hot-spot” re-solves a box around the highest stress at half the element size.</p>
        <button className="rx-btn" onClick={() => setStudy((s) => ({ ...s, analysis: 'convergence' }))}><Atom size={11} /> Mesh convergence study</button>
      </Section>

      <Section title="Mesh preview">
        <button className="rx-btn" onClick={p.onPreviewMesh} disabled={!study.bodies.length || p.meshBusy}>{p.meshBusy ? <Loader2 size={11} className="cam-spin" /> : <Box size={11} />} {p.meshPreviewing ? 'Refresh voxel mesh' : 'Show voxel mesh'}</button>
        <p className="rx-note">Draws the actual element grid (coloured by part) in the viewport; switch back with the Model / Mesh / Results buttons.</p>
        {r && r.mesh.elements > 0 && (
          <KV rows={[['Last run: elements', r.mesh.elements.toLocaleString('en-US')], ['Nodes', r.mesh.nodes.toLocaleString('en-US')], ['Element size', `${+r.mesh.h.toPrecision(3)} mm`], ['Quality', r.mesh.quality || '–']]} />
        )}
      </Section>
    </>
  );
}

// ===============================================================================================
// Solver

function SolveTab(p: LeftProps) {
  const { study, setStudy } = p;
  const spec = analysisSpec(study.analysis);
  const vals = paramValues(study, study.analysis);
  const setP = (k: string, v: number | string | boolean) => setStudy((s) => ({ ...s, params: { ...s.params, [s.analysis]: { ...(s.params[s.analysis] ?? {}), [k]: v } } }));
  return (
    <>
      <Section title={`${spec.label}`} badge={spec.short.toUpperCase()}>
        {spec.params.filter((x) => !x.show || x.show(vals)).map((x) => <ParamField key={x.k} ps={x} values={vals} set={setP} />)}
        {!spec.params.length && <p className="rx-note">No parameters.</p>}
        <button className="rx-btn" onClick={() => setStudy((s) => ({ ...s, params: { ...s.params, [s.analysis]: {} } }))}>Reset parameters</button>
      </Section>
      <Section title="Run" badge={p.result ? (p.stale ? 'out of date' : 'up to date') : undefined}>
        {p.busy ? (
          <div className="rx-busy" style={{ position: 'static', transform: 'none', width: 'auto' }}>
            <span>{p.busy}</span>
            <div><i style={{ width: `${Math.round(p.progress * 100)}%` }} /></div>
            <button className="rx-btn" onClick={p.onCancel}><X size={11} /> Cancel</button>
          </div>
        ) : <button className="rx-render" onClick={p.onRun} disabled={!study.bodies.length}><Play size={12} /> {p.result ? (p.stale ? 'RE-RUN (set-up changed)' : 'RE-RUN') : 'RUN'} {spec.short.toUpperCase()}</button>}
        {p.error && <Note tone="err">{p.error}</Note>}
      </Section>
    </>
  );
}
