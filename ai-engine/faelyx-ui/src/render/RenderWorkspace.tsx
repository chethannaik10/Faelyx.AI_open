// RenderWorkspace.tsx
//
// The "RenderX Engine" tab: a photo studio, not a modeller. The centre is a
// real-time interactive PBR preview (RenderEngine); the side panels are
// organised in tabs — Materials, Environments & Lighting on the left,
// Camera and Render Settings on the right. All CAD feature tools (Pad, Pocket,
// Shaft, Groove, Booleans, Sketch …) are deliberately absent here.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Aperture, Camera, Download, ImagePlus, Lightbulb, Maximize2, Palette, Plus, RotateCcw, Sun, SlidersHorizontal, Trash2, Upload, X, Eye, EyeOff, Film, Layers3,
} from 'lucide-react';
import { RenderEngine, type ModelInfo, type PartInfo } from './RenderEngine';
import {
  ASPECTS, CAMERA_PRESETS, DEFAULT_BACKDROP, DEFAULT_CAMERA, DEFAULT_ENV, DEFAULT_GROUND, DEFAULT_OUTPUT, ENVIRONMENTS, EXPORT_FORMATS, LIGHT_RIGS, LIGHT_TYPE_LABELS,
  MATERIAL_CATEGORIES, MATERIAL_LIBRARY, PROJECTION_LABELS, QUALITY_LEVELS, RELIEF_LABELS, RES_PRESETS, TONE_MAPS, findMaterial, focalFromFov, fovFromFocal, kelvinToRgb, newLight, outputSize,
  type BackdropSettings, type CameraSettings, type ColorMapKind, type DenoiseLevel, type EnvId, type EnvSettings, type ExportFormat, type GroundSettings, type LightDef, type LightType,
  type MaterialCategory, type OutputSettings, type Projection, type ReliefKind, type SurfaceParams,
} from './renderData';
import { downloadBlob } from './exporters';

type LeftTab = 'materials' | 'environment';
type RightTab = 'camera' | 'output';

interface Session {
  env: EnvSettings; backdrop: BackdropSettings; ground: GroundSettings; lights: LightDef[]; rigId: string;
  cam: CameraSettings; out: OutputSettings; surfaces: Record<string, { params: SurfaceParams; materialId: string | null }>;
}
// Survives switching workspaces (the component unmounts, the studio setup should not).
let session: Session | null = null;
const thumbCache = new Map<string, string>();

const COLOR_MAPS: { id: ColorMapKind; label: string }[] = [
  { id: 'none', label: 'None (flat colour)' }, { id: 'oak', label: 'Oak veneer' }, { id: 'walnut', label: 'Walnut veneer' }, { id: 'maple', label: 'Maple veneer' },
  { id: 'carbon-twill', label: 'Carbon twill' }, { id: 'carbon-plain', label: 'Carbon plain weave' }, { id: 'denim', label: 'Denim' }, { id: 'felt', label: 'Felt' }, { id: 'nylon', label: 'Ballistic nylon' },
];

// ---- tiny form controls ------------------------------------------------------

function Slider({ label, value, min, max, step = 0.01, onChange, unit = '', digits = 2 }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string; digits?: number }) {
  return (
    <label className="rx-field">
      <span className="rx-field-top"><span>{label}</span><b>{value.toFixed(digits)}{unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="rx-toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><i /><span>{label}</span>
    </label>
  );
}
function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="rx-field">
      <span className="rx-field-top"><span>{label}</span></span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
    </label>
  );
}
function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return <div className="rx-seg">{options.map((o) => <button key={o.id} className={o.id === value ? 'rx-seg-on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}</div>;
}
function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="rx-colour"><span>{label}</span><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /><code>{value}</code></label>
  );
}
function Section({ title, icon, children, action }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <section className="rx-section"><header><span>{icon}{title}</span>{action}</header><div className="rx-section-body">{children}</div></section>;
}

// ---- component -------------------------------------------------------------------

export default function RenderWorkspace({ stlData, projectName }: { stlData: ArrayBuffer | null; projectName: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RenderEngine | null>(null);
  const hdriInput = useRef<HTMLInputElement>(null);
  const reliefInput = useRef<HTMLInputElement>(null);
  const stlInput = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('materials');
  const [rightTab, setRightTab] = useState<RightTab>('camera');
  const [category, setCategory] = useState<MaterialCategory | 'All'>('All');

  const [env, setEnv] = useState<EnvSettings>(session?.env ?? DEFAULT_ENV);
  const [backdrop, setBackdrop] = useState<BackdropSettings>(session?.backdrop ?? DEFAULT_BACKDROP);
  const [ground, setGround] = useState<GroundSettings>(session?.ground ?? DEFAULT_GROUND);
  const [rigId, setRigId] = useState(session?.rigId ?? 'three-point');
  const [lights, setLights] = useState<LightDef[]>(() => session?.lights ?? LIGHT_RIGS[0].make());
  const [selLight, setSelLight] = useState<string | null>(null);
  const [showGizmos, setShowGizmos] = useState(true);
  const [cam, setCam] = useState<CameraSettings>(session?.cam ?? DEFAULT_CAMERA);
  const [out, setOut] = useState<OutputSettings>(session?.out ?? DEFAULT_OUTPUT);

  const [parts, setParts] = useState<PartInfo[]>([]);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [selPart, setSelPart] = useState<string | null>(null);
  const [localStl, setLocalStl] = useState<{ name: string; data: ArrayBuffer } | null>(null);
  const [zUp, setZUp] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ f: number; msg: string } | null>(null);
  const [result, setResult] = useState<{ url: string; w: number; h: number; ext: string; bytes: number; seconds: number } | null>(null);
  const [viewportAspect, setViewportAspect] = useState(1.6);

  const sessionRef = useRef<Session | null>(null);
  const surfacesRef = useRef<Session['surfaces']>(session?.surfaces ?? {});
  sessionRef.current = { env, backdrop, ground, lights, rigId, cam, out, surfaces: surfacesRef.current };
  useEffect(() => () => { session = sessionRef.current; }, []);

  const model = localStl?.data ?? stlData;

  // Create the engine once.
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let engine: RenderEngine;
    try {
      engine = new RenderEngine(host, {
        onSelect: (id) => setSelPart(id),
        onParts: (ps, mi) => {
          // Re-apply the surfaces the user had set on the same parts earlier.
          for (const p of ps) {
            const saved = surfacesRef.current[p.id];
            if (saved) { engineRef.current?.setSurface(p.id, saved.params, saved.materialId); p.params = saved.params; p.materialId = saved.materialId; }
          }
          setParts(ps); setInfo(mi);
          setSelPart((cur) => (cur && ps.some((p) => p.id === cur) ? cur : ps[0]?.id ?? null));
        },
      });
    } catch (err) { setNotice(`The 3D renderer could not start: ${(err as Error).message}`); return; }
    engineRef.current = engine;
    engine.setCamera(cam); engine.setOutput(out); engine.setEnvironment(env, backdrop); engine.setGround(ground); engine.setLights(lights, null);
    engine.setModel(model);
    setReady(true);
    const ro = new ResizeObserver(() => setViewportAspect(Math.max(0.2, host.clientWidth / Math.max(1, host.clientHeight))));
    ro.observe(host);
    return () => { ro.disconnect(); engine.dispose(); engineRef.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the model (project part or an opened STL).
  const firstModel = useRef(true);
  useEffect(() => {
    if (firstModel.current) { firstModel.current = false; return; }
    engineRef.current?.setModel(model, zUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Keep the engine in step with the controls.
  useEffect(() => { engineRef.current?.setCamera(cam); }, [cam, ready]);
  useEffect(() => { engineRef.current?.setOutput(out); }, [out, ready]);
  useEffect(() => { engineRef.current?.setEnvironment(env, backdrop); }, [env, backdrop, ready]);
  useEffect(() => { engineRef.current?.setGround(ground); }, [ground, ready]);
  useEffect(() => { engineRef.current?.setLights(lights, selLight); }, [lights, selLight, ready]);
  useEffect(() => { engineRef.current?.setGizmosVisible(showGizmos); }, [showGizmos, ready]);
  useEffect(() => { engineRef.current?.selectPart(selPart); }, [selPart]);

  // Material thumbnails (rendered once, shared across visits).
  useEffect(() => {
    if (!ready || !engineRef.current) return;
    const next: Record<string, string> = {};
    for (const m of MATERIAL_LIBRARY) {
      if (!thumbCache.has(m.id)) { try { thumbCache.set(m.id, engineRef.current.thumbnail(m.params)); } catch { /* thumbnails are cosmetic */ } }
      const t = thumbCache.get(m.id); if (t) next[m.id] = t;
    }
    setThumbs(next);
  }, [ready]);

  const part = parts.find((p) => p.id === selPart) ?? null;

  // ---- materials ----------------------------------------------------------------
  const commitSurface = useCallback((partId: string, params: SurfaceParams, materialId: string | null) => {
    engineRef.current?.setSurface(partId, params, materialId);
    surfacesRef.current = { ...surfacesRef.current, [partId]: { params, materialId } };
    setParts((ps) => ps.map((p) => (p.id === partId ? { ...p, params, materialId } : p)));
  }, []);
  const patchSurface = (patch: Partial<SurfaceParams>) => { if (part) commitSurface(part.id, { ...part.params, ...patch }, part.materialId); };
  const applyPreset = (id: string, all = false) => {
    const m = findMaterial(id); if (!m) return;
    const targets = all ? parts : part ? [part] : [];
    for (const t of targets) commitSurface(t.id, { ...m.params }, m.id);
  };
  const uploadRelief = async (file: File | undefined) => {
    if (!file || !part) return;
    try { await engineRef.current?.uploadRelief(part.id, file); patchSurface({ relief: 'custom' }); setNotice(null); } catch (err) { setNotice((err as Error).message); }
  };

  // ---- lights ---------------------------------------------------------------------
  const light = lights.find((l) => l.id === selLight) ?? null;
  const patchLight = (id: string, patch: Partial<LightDef>) => setLights((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLight = (type: LightType) => { const l = newLight(type); setLights((ls) => [...ls, l]); setSelLight(l.id); setRigId('custom'); };
  const removeLight = (id: string) => { setLights((ls) => ls.filter((l) => l.id !== id)); setSelLight((s) => (s === id ? null : s)); setRigId('custom'); };
  const pickEnvironment = (id: EnvId) => {
    const e = ENVIRONMENTS.find((x) => x.id === id); if (!e) return;
    setEnv((cur) => ({ ...cur, id, blur: e.blur ?? cur.blur }));
    // Rooms and skies are only visible when the backdrop shows the environment.
    if (e.group === 'Interior' || e.group === 'Outdoor & sky' || id === 'custom') setBackdrop((b) => (b.mode === 'environment' ? b : { ...b, mode: 'environment' }));
  };
  const applyRig = (id: string) => { const r = LIGHT_RIGS.find((x) => x.id === id); if (!r) return; setLights(r.make()); setRigId(id); setSelLight(null); };

  const loadHdri = async (file: File | undefined) => {
    if (!file || !engineRef.current) return;
    try {
      const name = await engineRef.current.loadCustomHdri(file);
      setEnv((e) => ({ ...e, id: 'custom', customName: name })); setBackdrop((b) => ({ ...b, mode: 'environment' })); setNotice(null);
      engineRef.current.refreshEnvironment();
    } catch (err) { setNotice(`Could not read that HDRI: ${(err as Error).message}`); }
  };

  const openStl = async (file: File | undefined) => {
    if (!file) return;
    setLocalStl({ name: file.name, data: await file.arrayBuffer() });
  };

  // ---- final render ---------------------------------------------------------------
  const size = useMemo(() => outputSize(out, viewportAspect), [out, viewportAspect]);
  const startRender = async () => {
    const engine = engineRef.current; if (!engine || progress) return;
    setNotice(null); setProgress({ f: 0, msg: 'Preparing…' });
    const t0 = performance.now();
    try {
      const r = await engine.renderStill(out, (f, msg) => setProgress({ f, msg }));
      setResult((prev) => { if (prev) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(r.blob), w: r.width, h: r.height, ext: r.ext, bytes: r.blob.size, seconds: (performance.now() - t0) / 1000 }; });
      downloadBlob(r.blob, `${(projectName || 'render').replace(/[^\w.-]+/g, '_')}_${r.width}x${r.height}.${r.ext}`);
    } catch (err) { setNotice((err as Error).message); }
    finally { setProgress(null); }
  };
  useEffect(() => () => { setResult((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; }); }, []);

  const resetAll = () => {
    setEnv(DEFAULT_ENV); setBackdrop(DEFAULT_BACKDROP); setGround(DEFAULT_GROUND); setCam(DEFAULT_CAMERA); setOut(DEFAULT_OUTPUT); applyRig('three-point');
  };

  const visibleMaterials = MATERIAL_LIBRARY.filter((m) => category === 'All' || m.category === category);
  const focal = focalFromFov(cam.fov);
  const fmt = EXPORT_FORMATS.find((f) => f.id === out.format)!;
  const q = QUALITY_LEVELS.find((x) => x.id === out.quality)!;
  const modelLabel = localStl ? localStl.name : stlData ? 'Current 3D Design part' : 'Sample product';

  // ---- panels -----------------------------------------------------------------------

  const materialsPanel = (
    <div className="rx-scroll">
      <Section title="Parts" icon={<Layers3 size={12} />} action={<span className="rx-badge">{modelLabel}</span>}>
        <div className="rx-chips">
          {parts.map((p) => (
            <button key={p.id} className={`rx-chip ${p.id === selPart ? 'rx-chip-on' : ''}`} onClick={() => setSelPart(p.id)}>
              <i style={{ background: p.params.color }} />{p.name}
            </button>
          ))}
        </div>
        <div className="rx-row">
          <button className="rx-btn" onClick={() => stlInput.current?.click()}><Upload size={11} /> Open STL…</button>
          {localStl && <button className="rx-btn" onClick={() => setLocalStl(null)}><X size={11} /> Use project part</button>}
          {!!model && <label className="rx-toggle rx-inline"><input type="checkbox" checked={zUp} onChange={(e) => { setZUp(e.target.checked); engineRef.current?.setUpAxis(e.target.checked); }} /><i /><span>Z-up (CAD)</span></label>}
        </div>
        <input ref={stlInput} type="file" accept=".stl" hidden onChange={(e) => { void openStl(e.target.files?.[0]); e.target.value = ''; }} />
        {info?.sample && <p className="rx-note">No part is loaded, so a sample product is shown. Generate a part in 3D Design (or open an STL) and it appears here with your materials.</p>}
        {info && !info.sample && <p className="rx-note">{info.triangles.toLocaleString()} triangles · {info.sizeMm.map((v) => v.toFixed(1)).join(' × ')} mm. One part, so the finish applies to the whole body.</p>}
      </Section>

      <Section title="Material & finishes" icon={<Palette size={12} />} action={parts.length > 1 && part ? <span className="rx-badge">applies to {part.name}</span> : undefined}>
        <div className="rx-chips rx-chips-wrap">
          {(['All', ...MATERIAL_CATEGORIES] as const).map((c) => <button key={c} className={`rx-chip ${category === c ? 'rx-chip-on' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}
        </div>
        <div className="rx-grid">
          {visibleMaterials.map((m) => (
            <button key={m.id} className={`rx-card ${part?.materialId === m.id ? 'rx-card-on' : ''}`} onClick={(e) => applyPreset(m.id, e.shiftKey)} title={`${m.name} — ${m.finish}${parts.length > 1 ? ' (Shift-click: all parts)' : ''}`}>
              {thumbs[m.id] ? <img src={thumbs[m.id]} alt="" draggable={false} /> : <span className="rx-thumb-fallback" style={{ background: m.params.color }} />}
              <b>{m.name}</b><small>{m.finish}</small>
            </button>
          ))}
        </div>
        {parts.length > 1 && part?.materialId && <button className="rx-btn" onClick={() => applyPreset(part.materialId!, true)}>Apply “{findMaterial(part.materialId)?.name} · {findMaterial(part.materialId)?.finish}” to all parts</button>}
      </Section>

      {part && (
        <>
          <Section title="Surface" icon={<SlidersHorizontal size={12} />}>
            <Colour label="Base colour" value={part.params.color} onChange={(v) => patchSurface({ color: v })} />
            <Slider label="Roughness" value={part.params.roughness} min={0} max={1} onChange={(v) => patchSurface({ roughness: v })} />
            <Slider label="Metallic" value={part.params.metalness} min={0} max={1} onChange={(v) => patchSurface({ metalness: v })} />
            <Slider label="Reflectivity · clear coat" value={part.params.clearcoat} min={0} max={1} onChange={(v) => patchSurface({ clearcoat: v })} />
            <Slider label="Clear coat roughness" value={part.params.clearcoatRoughness} min={0} max={1} onChange={(v) => patchSurface({ clearcoatRoughness: v })} />
            <Slider label="Anisotropy (brushed streak)" value={part.params.anisotropy} min={0} max={1} onChange={(v) => patchSurface({ anisotropy: v })} />
            <Slider label="Sheen (fabric)" value={part.params.sheen} min={0} max={1} onChange={(v) => patchSurface({ sheen: v })} />
          </Section>

          <Section title="Opacity & refraction" icon={<Eye size={12} />}>
            <Slider label="Opacity" value={part.params.opacity} min={0} max={1} onChange={(v) => patchSurface({ opacity: v })} />
            <Slider label="Transmission (see-through)" value={part.params.transmission} min={0} max={1} onChange={(v) => patchSurface({ transmission: v })} />
            <Slider label="Index of refraction" value={part.params.ior} min={1} max={2.4} onChange={(v) => patchSurface({ ior: v })} />
            <Slider label="Thickness" value={part.params.thickness} min={0} max={0.5} step={0.005} digits={3} onChange={(v) => patchSurface({ thickness: v })} />
          </Section>

          <Section title="Bump / normal map" icon={<Film size={12} />}>
            <Select<ReliefKind> label="Pattern" value={part.params.relief} options={(Object.keys(RELIEF_LABELS) as ReliefKind[]).filter((k) => k !== 'custom' || part.params.relief === 'custom').map((k) => ({ id: k, label: RELIEF_LABELS[k] }))} onChange={(v) => patchSurface({ relief: v })} />
            <Segmented<'bump' | 'normal'> value={part.params.reliefMode} options={[{ id: 'bump', label: 'Bump (height)' }, { id: 'normal', label: 'Normal map' }]} onChange={(v) => patchSurface({ reliefMode: v })} />
            <Slider label="Strength" value={part.params.reliefStrength} min={0} max={3} onChange={(v) => patchSurface({ reliefStrength: v })} />
            <Select<ColorMapKind> label="Colour texture" value={part.params.colorMap} options={COLOR_MAPS} onChange={(v) => patchSurface({ colorMap: v })} />
            <button className="rx-btn" onClick={() => reliefInput.current?.click()}><Upload size={11} /> Upload bump / normal image…</button>
            <input ref={reliefInput} type="file" accept="image/*" hidden onChange={(e) => { void uploadRelief(e.target.files?.[0]); e.target.value = ''; }} />
          </Section>

          <Section title="UV mapping & scale" icon={<Maximize2 size={12} />}>
            <Select<Projection> label="Projection" value={part.params.projection} options={(Object.keys(PROJECTION_LABELS) as Projection[]).map((k) => ({ id: k, label: PROJECTION_LABELS[k] }))} onChange={(v) => patchSurface({ projection: v })} />
            <Slider label="Texture tile size" value={part.params.tileMm} min={2} max={300} step={1} unit=" mm" digits={0} onChange={(v) => patchSurface({ tileMm: v })} />
            <Slider label="Rotation" value={part.params.rotation} min={-180} max={180} step={1} unit="°" digits={0} onChange={(v) => patchSurface({ rotation: v })} />
          </Section>
        </>
      )}
    </div>
  );

  const environmentPanel = (
    <div className="rx-scroll">
      <Section title="Environment" icon={<Sun size={12} />}>
        {(['Studio', 'Interior', 'Outdoor & sky'] as const).map((grp) => (
          <div key={grp} className="rx-envgroup">
            <h4>{grp}</h4>
            <div className="rx-grid rx-grid-env">
              {ENVIRONMENTS.filter((e) => e.group === grp).map((e) => (
                <button key={e.id} className={`rx-env ${env.id === e.id ? 'rx-card-on' : ''}`} onClick={() => pickEnvironment(e.id)} title={e.hint}>
                  <b>{e.name}</b><small>{e.hint}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="rx-envgroup">
          <h4>Custom</h4>
          <div className="rx-grid rx-grid-env">
            <button className={`rx-env ${env.id === 'custom' ? 'rx-card-on' : ''}`} onClick={() => (env.customName ? pickEnvironment('custom') : hdriInput.current?.click())} title="Upload a .hdr, .exr, .jpg or .png panorama">
              <b>{env.customName || 'Upload HDRI…'}</b><small>Your own panorama</small>
            </button>
          </div>
        </div>
        <button className="rx-btn" onClick={() => hdriInput.current?.click()}><Upload size={11} /> Upload HDRI (.hdr / .exr / .jpg / .png)</button>
        <input ref={hdriInput} type="file" accept=".hdr,.exr,.jpg,.jpeg,.png" hidden onChange={(e) => { void loadHdri(e.target.files?.[0]); e.target.value = ''; }} />
        <Slider label="Light intensity" value={env.intensity} min={0} max={3} onChange={(v) => setEnv({ ...env, intensity: v })} />
        <Slider label="Rotation" value={env.rotation} min={-180} max={180} step={1} unit="°" digits={0} onChange={(v) => setEnv({ ...env, rotation: v })} />
        <Slider label="Background blur" value={env.blur} min={0} max={1} onChange={(v) => setEnv({ ...env, blur: v })} />
      </Section>

      <Section title="Backdrop" icon={<ImagePlus size={12} />}>
        {backdrop.mode === 'environment' && <p className="rx-note">Showing the “{ENVIRONMENTS.find((x) => x.id === env.id)?.name}” environment behind the model. Use Background blur above to soften it.</p>}
        <Segmented<BackdropSettings['mode']> value={backdrop.mode} options={[{ id: 'environment', label: 'Environment' }, { id: 'solid', label: 'Solid' }, { id: 'gradient', label: 'Gradient' }, { id: 'transparent', label: 'None' }]} onChange={(v) => setBackdrop({ ...backdrop, mode: v })} />
        {backdrop.mode === 'solid' && <Colour label="Colour" value={backdrop.solid} onChange={(v) => setBackdrop({ ...backdrop, solid: v })} />}
        {backdrop.mode === 'gradient' && <><Colour label="Top" value={backdrop.gradTop} onChange={(v) => setBackdrop({ ...backdrop, gradTop: v })} /><Colour label="Bottom" value={backdrop.gradBottom} onChange={(v) => setBackdrop({ ...backdrop, gradBottom: v })} /></>}
        {backdrop.mode === 'transparent' && <p className="rx-note">Transparent backdrop: exports keep an alpha channel (PNG / TIFF / EXR).</p>}
      </Section>

      <Section title="Lighting rig" icon={<Lightbulb size={12} />} action={<button className="rx-mini" onClick={() => setShowGizmos(!showGizmos)} title="Show light handles in the viewport">{showGizmos ? <Eye size={11} /> : <EyeOff size={11} />}</button>}>
        <Select<string> label="Rig preset" value={rigId} options={[...LIGHT_RIGS.map((r) => ({ id: r.id, label: `${r.name} — ${r.hint}` })), ...(rigId === 'custom' ? [{ id: 'custom', label: 'Custom rig' }] : [])]} onChange={applyRig} />
        <div className="rx-row rx-row-wrap">
          {(Object.keys(LIGHT_TYPE_LABELS) as LightType[]).map((t) => <button key={t} className="rx-btn" onClick={() => addLight(t)}><Plus size={11} /> {LIGHT_TYPE_LABELS[t]}</button>)}
        </div>
        <div className="rx-lights">
          {lights.map((l) => {
            const [r, g, b] = kelvinToRgb(l.kelvin);
            return (
              <div key={l.id} className={`rx-light ${l.id === selLight ? 'rx-light-on' : ''}`} onClick={() => setSelLight(l.id === selLight ? null : l.id)}>
                <i style={{ background: `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`, opacity: l.enabled ? 1 : 0.3 }} />
                <span>{l.name}<small>{LIGHT_TYPE_LABELS[l.type]} · {l.kelvin} K</small></span>
                <button className="rx-mini" title={l.enabled ? 'Switch off' : 'Switch on'} onClick={(e) => { e.stopPropagation(); patchLight(l.id, { enabled: !l.enabled }); }}>{l.enabled ? <Eye size={11} /> : <EyeOff size={11} />}</button>
                <button className="rx-mini" title="Delete light" onClick={(e) => { e.stopPropagation(); removeLight(l.id); }}><Trash2 size={11} /></button>
              </div>
            );
          })}
          {!lights.length && <p className="rx-note">No lights — the scene is lit by the environment only.</p>}
        </div>
        {light && (
          <div className="rx-light-edit">
            <Slider label="Intensity" value={light.intensity} min={0} max={100} step={1} digits={0} onChange={(v) => { patchLight(light.id, { intensity: v }); setRigId('custom'); }} />
            <Slider label="Colour temperature" value={light.kelvin} min={2000} max={10000} step={100} unit=" K" digits={0} onChange={(v) => { patchLight(light.id, { kelvin: v }); setRigId('custom'); }} />
            {light.type !== 'ambient' && (
              <>
                <Slider label="Azimuth (around model)" value={light.azimuth} min={-180} max={180} step={1} unit="°" digits={0} onChange={(v) => { patchLight(light.id, { azimuth: v }); setRigId('custom'); }} />
                <Slider label="Elevation (height)" value={light.elevation} min={0} max={90} step={1} unit="°" digits={0} onChange={(v) => { patchLight(light.id, { elevation: v }); setRigId('custom'); }} />
                <Slider label="Distance" value={light.distance} min={1.5} max={10} step={0.1} digits={1} onChange={(v) => { patchLight(light.id, { distance: v }); setRigId('custom'); }} />
              </>
            )}
            {light.type === 'softbox' && <Slider label="Softbox size" value={light.size} min={0.4} max={5} step={0.1} digits={1} onChange={(v) => { patchLight(light.id, { size: v }); setRigId('custom'); }} />}
            {light.type === 'spot' && <Slider label="Cone angle" value={light.angle} min={6} max={60} step={1} unit="°" digits={0} onChange={(v) => { patchLight(light.id, { angle: v }); setRigId('custom'); }} />}
            {(light.type === 'spot' || light.type === 'directional') && (
              <>
                <Slider label="Shadow softness" value={light.softness} min={0} max={1} onChange={(v) => { patchLight(light.id, { softness: v }); setRigId('custom'); }} />
                <Toggle label="Casts shadows" checked={light.shadows} onChange={(v) => { patchLight(light.id, { shadows: v }); setRigId('custom'); }} />
              </>
            )}
            {light.type === 'softbox' && <p className="rx-note">Softboxes give soft highlights and reflections but do not cast shadows; pair with a directional light for a shadow.</p>}
          </div>
        )}
      </Section>

      <Section title="Ground & floor" icon={<Layers3 size={12} />}>
        <Toggle label="Ground plane" checked={ground.enabled} onChange={(v) => setGround({ ...ground, enabled: v })} />
        {ground.enabled && (
          <>
            <Segmented<GroundSettings['mode']> value={ground.mode} options={[{ id: 'floor', label: 'Floor' }, { id: 'shadowCatcher', label: 'Shadow catcher' }]} onChange={(v) => setGround({ ...ground, mode: v })} />
            {ground.mode === 'floor' && (
              <>
                <Colour label="Floor colour" value={ground.color} onChange={(v) => setGround({ ...ground, color: v })} />
                <Slider label="Reflections" value={ground.reflections} min={0} max={1} onChange={(v) => setGround({ ...ground, reflections: v })} />
                <Slider label="Glossiness" value={ground.glossiness} min={0} max={1} onChange={(v) => setGround({ ...ground, glossiness: v })} />
              </>
            )}
            <Slider label="Shadow opacity" value={ground.shadowOpacity} min={0} max={1} onChange={(v) => setGround({ ...ground, shadowOpacity: v })} />
            {ground.mode === 'shadowCatcher' && <p className="rx-note">Shadow catcher: only the shadow is drawn on the backdrop (or on transparent for compositing).</p>}
          </>
        )}
        <Toggle label="Floor grid" checked={ground.grid} onChange={(v) => setGround({ ...ground, grid: v })} />
      </Section>
    </div>
  );

  const cameraPanel = (
    <div className="rx-scroll">
      <Section title="Lens" icon={<Camera size={12} />}>
        <Select<string> label="Preset" value="" options={[{ id: '', label: 'Choose a lens…' }, ...CAMERA_PRESETS.map((p) => ({ id: p.id, label: p.name }))]} onChange={(id) => { const p = CAMERA_PRESETS.find((x) => x.id === id); if (p) setCam({ ...cam, fov: p.fov, dof: p.dof, fstop: p.fstop }); }} />
        <Slider label="Field of view" value={cam.fov} min={8} max={90} step={0.5} unit="°" digits={1} onChange={(v) => setCam({ ...cam, fov: v })} />
        <Slider label="Focal length (36 mm sensor)" value={focal} min={14} max={300} step={1} unit=" mm" digits={0} onChange={(v) => setCam({ ...cam, fov: fovFromFocal(v) })} />
        <Slider label="Exposure" value={cam.exposure} min={-4} max={4} step={0.05} unit=" EV" onChange={(v) => setCam({ ...cam, exposure: v })} />
        <Select<CameraSettings['toneMap']> label="Tone mapping" value={cam.toneMap} options={TONE_MAPS} onChange={(v) => setCam({ ...cam, toneMap: v })} />
      </Section>

      <Section title="Depth of field" icon={<Aperture size={12} />}>
        <Toggle label="Enable depth of field" checked={cam.dof} onChange={(v) => setCam({ ...cam, dof: v })} />
        {cam.dof && (
          <>
            <Slider label="Aperture (f-stop)" value={cam.fstop} min={0.7} max={22} step={0.1} unit="" digits={1} onChange={(v) => setCam({ ...cam, fstop: v })} />
            <Slider label="Bokeh size" value={cam.bokeh} min={0.2} max={3} onChange={(v) => setCam({ ...cam, bokeh: v })} />
            <Toggle label="Auto focus on model" checked={cam.focusAuto} onChange={(v) => setCam({ ...cam, focusAuto: v, focusDistance: v ? cam.focusDistance : Math.max(0.5, engineRef.current?.focusDistance() ?? cam.focusDistance) })} />
            {!cam.focusAuto && <Slider label="Focus distance" value={cam.focusDistance} min={0.5} max={20} step={0.1} digits={1} onChange={(v) => setCam({ ...cam, focusDistance: v })} />}
            <p className="rx-note">Lower f-stop and larger bokeh give a shallower focus. The preview and final render use the same blur.</p>
          </>
        )}
      </Section>

      <Section title="Post-processing" icon={<Film size={12} />}>
        <Toggle label="Bloom" checked={cam.bloom} onChange={(v) => setCam({ ...cam, bloom: v })} />
        {cam.bloom && <><Slider label="Strength" value={cam.bloomStrength} min={0} max={2} onChange={(v) => setCam({ ...cam, bloomStrength: v })} /><Slider label="Radius" value={cam.bloomRadius} min={0} max={1} onChange={(v) => setCam({ ...cam, bloomRadius: v })} /><Slider label="Threshold" value={cam.bloomThreshold} min={0} max={1.5} onChange={(v) => setCam({ ...cam, bloomThreshold: v })} /></>}
        <Toggle label="Vignette" checked={cam.vignette} onChange={(v) => setCam({ ...cam, vignette: v })} />
        {cam.vignette && <><Slider label="Amount" value={cam.vignetteAmount} min={0} max={1} onChange={(v) => setCam({ ...cam, vignetteAmount: v })} /><Slider label="Softness" value={cam.vignetteSoftness} min={0} max={1} onChange={(v) => setCam({ ...cam, vignetteSoftness: v })} /></>}
      </Section>

      <Section title="Colour balance" icon={<Palette size={12} />} action={<button className="rx-mini" title="Reset colour balance" onClick={() => setCam({ ...cam, temperature: 0, tint: 0, saturation: 1, contrast: 1 })}><RotateCcw size={11} /></button>}>
        <Slider label="Temperature (cool ↔ warm)" value={cam.temperature} min={-1} max={1} onChange={(v) => setCam({ ...cam, temperature: v })} />
        <Slider label="Tint (green ↔ magenta)" value={cam.tint} min={-1} max={1} onChange={(v) => setCam({ ...cam, tint: v })} />
        <Slider label="Saturation" value={cam.saturation} min={0} max={2} onChange={(v) => setCam({ ...cam, saturation: v })} />
        <Slider label="Contrast" value={cam.contrast} min={0.5} max={1.8} onChange={(v) => setCam({ ...cam, contrast: v })} />
      </Section>
    </div>
  );

  const outputPanel = (
    <div className="rx-scroll">
      <Section title="Frame" icon={<Maximize2 size={12} />}>
        <Select label="Aspect ratio" value={out.aspect} options={ASPECTS.map((a) => ({ id: a.id, label: a.label }))} onChange={(v) => setOut({ ...out, aspect: v })} />
        <Select label="Resolution" value={out.preset} options={RES_PRESETS.map((r) => ({ id: r.id, label: r.label }))} onChange={(v) => setOut({ ...out, preset: v })} />
        {(out.preset === 'custom' || out.aspect === 'custom') && (
          <div className="rx-row">
            <label className="rx-num"><span>W</span><input type="number" min={16} max={16384} value={out.customW} onChange={(e) => setOut({ ...out, customW: Number(e.target.value) || 16 })} /></label>
            <label className="rx-num"><span>H</span><input type="number" min={16} max={16384} value={out.customH} onChange={(e) => setOut({ ...out, customH: Number(e.target.value) || 16 })} /></label>
          </div>
        )}
        <div className="rx-readout"><span>Output</span><b>{size.w} × {size.h} px</b><small>{((size.w * size.h) / 1e6).toFixed(1)} MP</small></div>
      </Section>

      <Section title="Quality" icon={<Aperture size={12} />}>
        <Segmented<OutputSettings['quality']> value={out.quality} options={QUALITY_LEVELS.map((l) => ({ id: l.id, label: l.label }))} onChange={(v) => setOut({ ...out, quality: v })} />
        <p className="rx-note">{q.hint}. Anti-aliasing and soft shadows are rendered with supersampling on the GPU (rasterised PBR with image-based lighting) — not a path tracer.</p>
        <Segmented<DenoiseLevel> value={out.denoise} options={[{ id: 'off', label: 'Denoise off' }, { id: 'light', label: 'Light' }, { id: 'strong', label: 'Strong' }]} onChange={(v) => setOut({ ...out, denoise: v })} />
      </Section>

      <Section title="Export" icon={<Download size={12} />}>
        <Segmented<ExportFormat> value={out.format} options={EXPORT_FORMATS.map((f) => ({ id: f.id, label: f.label }))} onChange={(v) => setOut({ ...out, format: v })} />
        <p className="rx-note">{fmt.note}.{out.format === 'exr' ? ' EXR is limited to 4096 px on the long edge.' : ''}</p>
        <Toggle label="Transparent background (alpha channel)" checked={out.transparent} onChange={(v) => setOut({ ...out, transparent: v })} />
        <button className="rx-render" disabled={!!progress || !ready} onClick={() => void startRender()}>
          <Film size={14} />{progress ? 'Rendering…' : `Render ${size.w} × ${size.h} ${fmt.label}`}
        </button>
        {progress && (
          <div className="rx-progress">
            <div><i style={{ width: `${Math.round(progress.f * 100)}%` }} /></div>
            <span>{progress.msg} · {Math.round(progress.f * 100)}%</span>
            <button className="rx-btn" onClick={() => engineRef.current?.cancelRender()}><X size={11} /> Cancel</button>
          </div>
        )}
        {result && (
          <div className="rx-result">
            {result.ext !== 'exr' && result.ext !== 'tif' ? <img src={result.url} alt="Last render" /> : <div className="rx-result-ph">{result.ext.toUpperCase()}</div>}
            <span>{result.w} × {result.h} · {(result.bytes / 1048576).toFixed(1)} MB · {result.seconds.toFixed(1)} s</span>
            <button className="rx-btn" onClick={() => { const a = document.createElement('a'); a.href = result.url; a.download = `${(projectName || 'render').replace(/[^\w.-]+/g, '_')}_${result.w}x${result.h}.${result.ext}`; a.click(); }}><Download size={11} /> Save again</button>
          </div>
        )}
      </Section>
    </div>
  );

  return (
    <main className="rx-shell">
      <aside className="rx-panel rx-left">
        <div className="rx-panel-head"><div><div className="eyebrow">RENDERX · STUDIO</div><strong>MATERIALS & LIGHTING</strong></div></div>
        <div className="rx-tabs" role="tablist">
          <button role="tab" aria-selected={leftTab === 'materials'} className={leftTab === 'materials' ? 'rx-tab-on' : ''} onClick={() => setLeftTab('materials')}><Palette size={12} /> Materials</button>
          <button role="tab" aria-selected={leftTab === 'environment'} className={leftTab === 'environment' ? 'rx-tab-on' : ''} onClick={() => setLeftTab('environment')}><Sun size={12} /> Environments & Lighting</button>
        </div>
        {leftTab === 'materials' ? materialsPanel : environmentPanel}
      </aside>

      <section className="rx-stage">
        <div className="rx-topline">
          <span>RENDERX ENGINE <b>/</b> LIVE PBR PREVIEW <b>/</b> {modelLabel.toUpperCase()}</span>
          <span className="rx-topline-r">{size.w} × {size.h} · {q.label}</span>
        </div>
        <div className="rx-commands">
          {(['iso', 'front', 'back', 'left', 'right', 'top'] as const).map((v) => <button key={v} onClick={() => engineRef.current?.setView(v)}>{v === 'iso' ? 'Iso' : v[0].toUpperCase() + v.slice(1)}</button>)}
          <i />
          <button onClick={() => engineRef.current?.fit()}><Maximize2 size={11} /> Fit</button>
          <button onClick={() => setShowGizmos(!showGizmos)} className={showGizmos ? 'rx-cmd-on' : ''}><Lightbulb size={11} /> Light handles</button>
          <button onClick={resetAll}><RotateCcw size={11} /> Reset studio</button>
          <span className="rx-spacer" />
          <button className="rx-cmd-render" disabled={!!progress || !ready} onClick={() => { setRightTab('output'); void startRender(); }}><Film size={11} /> Render</button>
        </div>
        <div className="rx-viewport" ref={hostRef} />
        {notice && <div className="rx-notice" role="alert"><span>{notice}</span><button onClick={() => setNotice(null)}><X size={11} /></button></div>}
        {progress && <div className="rx-busy"><div><i style={{ width: `${Math.round(progress.f * 100)}%` }} /></div><span>{progress.msg}</span></div>}
        <div className="rx-hint">LMB select · double-click edit · MMB pan · MMB + RMB orbit · MMB + RMB click, drag up/down to zoom</div>
      </section>

      <aside className="rx-panel rx-right">
        <div className="rx-panel-head"><div><div className="eyebrow">RENDERX · OUTPUT</div><strong>CAMERA & RENDER</strong></div></div>
        <div className="rx-tabs" role="tablist">
          <button role="tab" aria-selected={rightTab === 'camera'} className={rightTab === 'camera' ? 'rx-tab-on' : ''} onClick={() => setRightTab('camera')}><Camera size={12} /> Camera</button>
          <button role="tab" aria-selected={rightTab === 'output'} className={rightTab === 'output' ? 'rx-tab-on' : ''} onClick={() => setRightTab('output')}><Film size={12} /> Render Settings</button>
        </div>
        {rightTab === 'camera' ? cameraPanel : outputPanel}
      </aside>
    </main>
  );
}

