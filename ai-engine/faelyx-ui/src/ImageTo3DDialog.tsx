// faelyx.AI — Image to 3D (TripoSR and Hunyuan3D 2.1). Licensed under the faelyx.AI Image to 3D Module License
// (ai-engine/cad-server/LICENSE-faelyx-image-to-3d.md). TripoSR is MIT, © Tripo AI & Stability AI. Hunyuan3D 2.1 is © 2025 Tencent,
// used under the Tencent Hunyuan 3D 2.1 Community License; faelyx.AI is not affiliated with Tencent.
//
// The "Image to 3D" pop-up (3D Design · AI GENERATE), laid out like the Image to Sketch dialog: the picture / cut-out /
// 3D result on the left, numbered option groups on the right, the result and actions in the footer. A picture goes to
// the chosen engine on this computer — or, for either engine, on a Google Colab GPU (Hunyuan3D 2.1 = best quality but slow; TripoSR = fast draft); the result is previewed
// here and added to the model tree as a mesh body.
// See imageTo3D.ts (client/store) and image_to_3d.py (server).
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type PointerEvent } from 'react';
import { Box, Check, Clock, Cpu, Crop as CropIcon, Download, Eye, FlipHorizontal2, FlipVertical2, ImagePlus, Layers, Loader2, Palette, RefreshCw, RotateCcw, RotateCw, Sparkles, Trash2, TriangleAlert, Wand2, X } from 'lucide-react';
import MeshPreview, { type PreviewMode } from './MeshPreview';
import {
  PRESETS, activePreset, addColour, applyPreset, cancelJob, connectColab, cutoutUrl, discardJob, downloadModel, fetchMeshStl, forgetColab, generate, loadStatus, meshUrl,
  orientBy, pbrUrl, runEngineOn, setCrop, setEngine, setPicture, showPreview, updateSettings, useImageTo3D, type Crop, type CutoutModel, type EngineId, type MeshFormat, type PresetId, type Settings,
} from './imageTo3D';

export type MeshMeta = { engine: string; faces: number; size: number[]; volume: number; printable: boolean; closed: boolean; source: string };
type View = 'image' | 'cutout' | '3d';

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–');

function Slide({ label, value, onChange, min, max, step = 1, unit = '', hint, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; hint?: string; format?: (v: number) => string }) {
  return <label className="i2s-row" title={hint}>
    <span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    <em>{format ? format(value) : `${Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)}${unit}`}</em>
  </label>;
}
function Field<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <label className="i2s-field"><span>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  </label>;
}
function Check1({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <label className="i2s-chk"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}
function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = (t: string) => {
    const v = Number(t.replace(',', '.'));
    if (t.trim() !== '' && Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
    else setText(String(value));
  };
  return <label className="i2s-field"><span>{label}</span>
    <input type="number" value={text} step={step} onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }} />
  </label>;
}

/** The picture with a crop box: drag on it to draw one. The box is in fractions of the (rotated / flipped) picture. */
function CropStage({ src, crop, onCrop }: { src: string; crop: Crop | null; onCrop: (c: Crop | null) => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const at = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const live = drag ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) } : crop;
  return <div className="i3d-stage" ref={box} role="img" aria-label="Reference picture. Drag to crop."
    onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); const p = at(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
    onPointerMove={(e) => { if (drag) { const p = at(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } }}
    onPointerUp={() => { if (drag) { const c = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }; setDrag(null); onCrop(c.w > 0.03 && c.h > 0.03 ? c : crop); } }}>
    <img src={src} alt="" draggable={false} />
    {live && live.w > 0 && live.h > 0 ? <i className="i3d-crop" style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%`, width: `${live.w * 100}%`, height: `${live.h * 100}%` }} /> : null}
  </div>;
}

async function saveUrlAs(url: string, name: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function ImageTo3DDialog({ onClose, onAddMesh }: { onClose: () => void; onAddMesh: (stl: ArrayBuffer, meta: MeshMeta) => string }) {
  const st = useImageTo3D();
  const { settings: s, job, picture, status, orient, crop, preview } = st;
  const [view, setView] = useState<View>('image');
  const [mode, setMode] = useState<PreviewMode>('textured');
  const [added, setAdded] = useState<string | null>(null);
  const [busyAdd, setBusyAdd] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [colabCode, setColabCode] = useState('');
  const [colabMsg, setColabMsg] = useState<string | null>(null);
  const [colabBusy, setColabBusy] = useState(false);
  const [colabOpen, setColabOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { void loadStatus(); rootRef.current?.focus(); }, []);
  useEffect(() => { setAdded(null); }, [job?.id]);
  // A finished model is what you want to look at; a new picture goes back to the picture.
  useEffect(() => { if (job?.status === 'succeeded') { setView('3d'); setMode(job.has_colors ? 'textured' : 'clay'); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [job?.id, job?.status]);
  // The moment colour has been added, show it.
  useEffect(() => { if (job?.status === 'succeeded' && job.has_colors) setMode('textured'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [job?.has_colors]);
  const picName = picture?.name;
  useEffect(() => { if (picName) setView((v) => (v === '3d' && !job ? 'image' : v)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [picName]);
  // The cut-out view fetches its picture the first time it is opened.
  useEffect(() => { if (view === 'cutout' && picture && !preview.url && !preview.busy && !preview.error && status && !(status.missing ?? []).some((m) => m.module === 'rembg')) void showPreview(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view, picName, !!status]);

  const running = !!job && (job.status === 'queued' || job.status === 'running');
  const done = job?.status === 'succeeded';
  const missing = status?.missing ?? [];
  const weights = status?.weights;
  const hy = status?.hunyuan;
  const isHy = s.engine === 'hunyuan';
  const engineName = isHy ? 'Hunyuan3D 2.1' : 'TripoSR';
  const needed = isHy ? (s.removeBackground ? missing.filter((m) => ['rembg', 'onnxruntime', 'PIL'].includes(m.module)) : []) : missing;
  const canGenerate = !!picture && !running && !st.starting && !!status
    && (isHy ? !!hy?.ready && needed.length === 0 : missing.length === 0 && !status.hardware.error);
  const slow = isHy && ((hy?.vram_gb ?? 99) < 12);
  const rem = isHy ? hy?.remote : status?.remote;
  const onColab = isHy ? hy?.where === 'remote' : status?.where === 'remote';
  const colabGpu = isHy ? hy?.gpu : (status?.hardware.cuda ? status.hardware.device_name : null);
  const tsrBlocked = !isHy && onColab && !!status?.hardware.error;      // the Colab side cannot make TripoSR models right now: the box below says why
  const connect = async () => {
    setColabBusy(true); setColabMsg(null);
    const msg = await connectColab(colabCode);
    setColabBusy(false);
    if (msg) setColabMsg(msg); else { setColabCode(''); setColabOpen(false); }
  };
  const set = (p: Partial<Settings>) => updateSettings(p);
  const preset = activePreset(s);
  const cutSrc = preview.url ?? (job?.has_cutout ? cutoutUrl(job) : null);
  const err = localError ?? st.error;

  const onFiles = (files: FileList | null) => { const f = files?.[0]; if (f) { setLocalError(null); setAdded(null); void setPicture(f); setView('image'); } };
  const onDrop = (e: DragEvent) => { e.preventDefault(); onFiles(e.dataTransfer.files); };
  const onPaste = (e: ClipboardEvent) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void setPicture(f); setView('image'); } };

  const add = async () => {
    if (!job || !done) return;
    setBusyAdd(true); setLocalError(null);
    try {
      const stl = await fetchMeshStl();
      const stats = job.stats;
      const name = onAddMesh(stl, {
        engine: job.engine, faces: stats?.faces ?? 0, size: stats?.size ?? [0, 0, 0], volume: stats?.volume ?? 0,
        printable: !!stats?.printable, closed: !!stats?.closed, source: picture?.name ?? 'picture',
      });
      setAdded(name);
    } catch (e) { setLocalError((e as Error).message); }
    setBusyAdd(false);
  };
  const download = async (kind: MeshFormat) => {
    if (!job) return;
    const base = (picture?.name ?? 'model').replace(/\.[^.]+$/, '') || 'model';
    try { await saveUrlAs(meshUrl(job, kind), `${base}.${kind}`); } catch (e) { setLocalError((e as Error).message); }
  };

  const hint = !picture ? 'Choose, drop or paste a PNG, JPG or WebP.'
    : view === 'image' ? 'Drag on the picture to crop to the object · rotate and flip with the buttons on the right'
      : view === 'cutout' ? `This is the picture ${engineName} is given — it updates as you change the picture options`
        : 'Middle button pans · middle + right drag zooms / orbits · F fits the model';

  return (
    <div className="i2s-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={rootRef} className="i2s-dialog" role="dialog" aria-label="Image to 3D" tabIndex={-1}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }} onKeyUp={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onPaste={onPaste}>
        <header className="i2s-head">
          <span className="i2s-title"><Sparkles size={13} /> IMAGE TO 3D <i>AI GENERATE</i></span>
          <span className="i2s-sub">Built with <b>{engineName}</b> {onColab ? 'on Google Colab' : 'on this computer'} · the result is added to the model as a mesh body</span>
          <button className="i2s-x" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </header>

        <div className="i2s-body">
          <section className="i2s-preview">
            <div className="i2s-tools">
              <button className="i2s-btn i2s-primary" onClick={() => fileRef.current?.click()}><ImagePlus size={12} /> {picture ? 'Replace image…' : 'Choose image…'}</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
              <span className="i2s-sep" />
              <div className="i2s-seg">
                <button className={view === 'image' ? 'on' : ''} onClick={() => setView('image')}><Eye size={11} /> Image</button>
                <button className={view === 'cutout' ? 'on' : ''} onClick={() => setView('cutout')} disabled={!picture}><Layers size={11} /> Cut-out</button>
                <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')} disabled={!job}><Box size={11} /> 3D model</button>
              </div>
              {view === '3d' && done && <>
                <span className="i2s-sep" />
                <div className="i2s-seg">
                  {([['textured', 'Colour'], ['clay', 'Clay'], ['wire', 'Wireframe']] as [PreviewMode, string][]).map(([m, l]) =>
                    <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{l}</button>)}
                </div>
              </>}
              {view === 'cutout' && picture && <button className="i2s-btn" onClick={() => void showPreview()} disabled={preview.busy}><RefreshCw size={11} /> Refresh</button>}
              {(preview.busy || st.starting) && <span className="i2s-busy"><Loader2 size={12} className="i2s-spin" /> {st.starting ? 'Starting…' : 'Preparing the picture…'}</span>}
            </div>

            <div className="i2s-canvas-wrap i3d-wrap">
              {view === 'image' && picture && <div className="i3d-center"><CropStage src={picture.dataUrl} crop={crop} onCrop={setCrop} /></div>}
              {view === 'cutout' && <div className="i3d-center i3d-grey">
                {cutSrc ? <img className="i3d-cut" src={cutSrc} alt={`The picture as ${engineName} sees it`} />
                  : <span className="i3d-empty">{preview.busy ? 'Preparing the picture…' : preview.error ?? 'Nothing to show yet.'}</span>}
              </div>}
              {view === '3d' && job && done && <MeshPreview job={job} settings={s} mode={mode} fill />}
              {view === '3d' && job && !done && <div className="i3d-center"><span className="i3d-empty">{running ? 'The model is being made…' : job.status === 'cancelled' ? 'Cancelled.' : 'No model — see the message below.'}</span></div>}
              {!picture && (
                <button className="i2s-drop" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={30} />
                  <b>Drop an image here</b>
                  <span>PNG · JPG · WebP — one object, clearly visible, a plain background works best. You can also paste from the clipboard.</span>
                </button>
              )}
              {running && <div className="i3d-progress">
                <div className="i3d-bar"><i style={{ width: `${Math.max(3, job?.progress ?? 0)}%` }} /></div>
                <span><Loader2 size={12} className="i2s-spin" /> {job?.message || 'Working…'}</span>
                <button className="i2s-btn" onClick={() => void cancelJob()}><X size={11} /> Cancel</button>
              </div>}
            </div>
            <div className="i2s-foot-hint">
              <span>{hint}</span>
              {picture && <em>{picture.width}×{picture.height}px{crop ? ` · crop ${Math.round(crop.w * 100)}% × ${Math.round(crop.h * 100)}%` : ''}</em>}
            </div>
            {err && <div className="i2s-alert"><TriangleAlert size={12} /> {err}</div>}
            {st.statusError && <div className="i2s-alert"><TriangleAlert size={12} /> {st.statusError}</div>}
            {preview.error && view !== 'cutout' && <div className="i2s-alert"><TriangleAlert size={12} /> {preview.error}</div>}
            {done && job?.note && <div className="i2s-note"><Clock size={11} /> {job.note}</div>}
            {job && (job.status === 'failed' || job.status === 'cancelled') && <div className="i2s-alert"><TriangleAlert size={12} /> {job.status === 'cancelled' ? 'Cancelled.' : job.error}</div>}
          </section>

          <aside className="i2s-side">
            <fieldset className="i2s-sec">
              <legend>1 · Engine</legend>
              <div className="i3d-engines" role="radiogroup" aria-label="Engine">
                {([['hunyuan', 'Hunyuan3D 2.1', 'Best quality · slow · set up once'], ['triposr', 'TripoSR', 'Fast draft · seconds']] as [EngineId, string, string][]).map(([id, name, sub]) =>
                  <button key={id} role="radio" aria-checked={s.engine === id} className={s.engine === id ? 'on' : ''} onClick={() => setEngine(id)} disabled={running}>
                    <b>{name}</b><small>{sub}</small>
                  </button>)}
              </div>
              {!status && !st.statusError && <div className="i2s-note"><Loader2 size={11} className="i2s-spin" /> Checking the Image to 3D engines…</div>}

              {status && (!isHy || hy) && <>
                <div className="i3d-engines i3d-where" role="radiogroup" aria-label="Run on">
                  <button role="radio" aria-checked={!onColab} className={!onColab ? 'on' : ''} disabled={running}
                    onClick={() => { setColabOpen(false); if (onColab) void runEngineOn(s.engine, 'local'); }}>
                    <b>This computer</b><small>Your own graphics card</small>
                  </button>
                  <button role="radio" aria-checked={onColab} className={onColab ? 'on' : ''} disabled={running}
                    onClick={() => { if (rem?.configured && !onColab) void runEngineOn(s.engine, 'remote'); else setColabOpen(true); }}>
                    <b>Google Colab</b><small>Free cloud GPU · connect the notebook</small>
                  </button>
                </div>
                {(onColab || colabOpen) && <div className="i3d-colab">
                  {onColab && rem?.reachable && !rem.error && <div className="i2s-note"><Check size={11} /> Connected to a Colab session{colabGpu ? ` · ${colabGpu}` : ''}. Pictures go there, the finished model comes back.</div>}
                  {onColab && (rem?.reachable === false || !!rem?.error) && <div className="i2s-note i2s-bad">{rem?.error || 'The Colab session does not answer.'}</div>}
                  {(!onColab || rem?.reachable === false || !!rem?.error) && <ol className="i23d-steps">
                    <li>Open <b>colab.research.google.com</b> → File → Upload notebook → choose <b>Faelyx_Hunyuan3D_Colab.ipynb</b> (in the <b>cad-server</b> folder).</li>
                    <li>Runtime → Change runtime type → a <b>GPU</b>. In the notebook's step 1 choose {isHy ? <><b>Hunyuan3D 2.1 only</b> or <b>Both</b></> : <><b>TripoSR only</b> or <b>Both</b></>}, then Runtime → <b>Run all</b>. The first time takes {isHy ? '15–25 minutes' : 'about 4 minutes for TripoSR'}.</li>
                    <li>Copy the <b>connection code</b> the last cell prints and paste it here. Keep that Colab tab open.</li>
                  </ol>}
                  {!(onColab && rem?.reachable && !rem.error) && <div className="i3d-colab-row">
                    <input type="text" spellCheck={false} placeholder="https://….trycloudflare.com#access-code" value={colabCode} onChange={(e) => setColabCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && colabCode.trim() && !colabBusy) void connect(); }} />
                    <button className="i2s-btn" disabled={!colabCode.trim() || colabBusy} onClick={() => void connect()}>{colabBusy ? <Loader2 size={11} className="i23d-spin" /> : <Check size={11} />} Connect</button>
                  </div>}
                  {colabMsg && <div className="i2s-note i2s-bad">{colabMsg}</div>}
                  {rem?.configured && <button className="i2s-btn" onClick={() => void forgetColab()}>Forget the saved Colab connection</button>}
                  <small>The picture and the model pass through Google's machine and a Cloudflare tunnel — do not send anything confidential. A new Colab session has a new code. One Colab session serves both engines — connect the other engine with the same code.</small>
                </div>}
              </>}


              {status && isHy && hy && <>
                {!hy.installed && !onColab && !colabOpen && <>
                  <div className="i2s-note">Hunyuan3D 2.1 is not set up on this computer yet. {hy.reasons.filter((r) => r !== 'Not set up yet.').join(' ')}</div>
                  <ol className="i23d-steps">
                    <li>Clone Tencent's repository once: <code className="i23d-code">git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git</code></li>
                    <li>Run <b>{hy.setup_command}</b> in <b>{hy.setup_folder}</b>. It makes its own Python 3.10 environment and installs PyTorch 2.5.1 + CUDA 12.4 and the requirements — about 10 GB and 15–40 minutes, once.</li>
                    <li>Restart the backend and press <b>Recheck</b>.</li>
                  </ol>
                </>}
                {onColab && rem?.reachable && !hy.installed && <div className="i2s-note i2s-bad">Hunyuan3D 2.1 is not installed on the Colab machine. {hy.reasons.join(' ')} Run the notebook's install cell (step 3) and connect again.</div>}
                {hy.installed && <>
                  <div className="i23d-device"><Cpu size={11} /> {hy.gpu || 'GPU'}{hy.vram_gb ? ` · ${hy.vram_gb} GB video memory` : ''}{hy.ram_gb ? ` · ${hy.ram_gb} GB RAM` : ''}</div>
                  <div className="i2s-note"><Check size={11} /> Shape stage installed.{' '}
                    {hy.texture_ok ? <><Check size={11} /> Colour stage installed.</> : <>Colour stage <b>not installed</b> — models will be uncoloured. {onColab ? 'The notebook\'s install cell could not build it (see its output).' : <>Run {hy.setup_command} with the C++ build tools and the CUDA Toolkit present to add it.</>}</>}</div>
                  {!hy.texture_ok && hy.texture_missing.length > 0 && <details className="i3d-more"><summary>What is missing for colour</summary><ul>{hy.texture_missing.map((m, i) => <li key={i}>{m}</li>)}</ul></details>}
                  {hy.reasons.length > 0 && <div className="i2s-note i2s-bad">{hy.reasons.join(' ')}</div>}
                  {slow && <div className="i2s-note"><Clock size={11} /> {hy.vram_gb} GB of video memory is below what Tencent lists (10 GB shape, 21 GB colour), so Faelyx streams the model from system RAM. It works, but expect many minutes per model — the quality is the same.</div>}
                  {!onColab && (hy.ram_gb ?? 99) < 23 && <div className="i2s-note">This PC has {hy.ram_gb} GB of RAM; loading the shape model needs roughly 20 GB, so Windows will use the page file and the first load is slow.</div>}
                  {hy.weights.state === 'downloading' && <div className="i23d-progress">
                    <div className="i23d-bar"><i style={{ width: `${Math.max(3, hy.weights.percent)}%` }} /></div>
                    <span><Loader2 size={11} className="i23d-spin" /> Downloading the Hunyuan3D model files (first use only) — {Math.round(hy.weights.downloaded_mb).toLocaleString()} of about {Math.round(hy.weights.total_mb).toLocaleString()} MB{hy.weights.stage ? ` · ${hy.weights.stage}` : ''}</span>
                  </div>}
                  {hy.weights.state === 'missing' && <div className="i23d-weights">
                    <small>{onColab ? 'The model files (several GB; more with the colour stage) download from Hugging Face onto the Colab machine. A new Colab session needs them again.' : 'The model files (several GB; more with the colour stage) download once from Hugging Face into the Faelyx runtime folder, the first time you make a model.'}</small>
                    <button className="i2s-btn" onClick={() => void downloadModel()}><Download size={11} /> Download model files now</button>
                  </div>}
                  {hy.weights.state === 'error' && <div className="i2s-note i2s-bad">{hy.weights.error} <button className="i2s-btn" onClick={() => void downloadModel()}><RefreshCw size={11} /> Try again</button></div>}
                  {hy.weights.state === 'ready' && <div className="i2s-note"><Check size={11} /> Model files are ready.</div>}
                </>}
                {needed.length > 0 && <div className="i2s-note i2s-bad">Removing the background needs: <b>{needed.map((m) => m.module).join(', ')}</b>. Install with <code className="i23d-code">{status.install}</code> in the backend's environment, or turn off “Remove the background”.</div>}
                <div className="i3d-license">
                  <small>{hy.notice}</small>
                  <details className="i3d-more"><summary>Licence terms that apply</summary>
                    <ul>{hy.license_terms.map((t, i) => <li key={i}>{t}</li>)}</ul>
                    <a href={hy.license_url} target="_blank" rel="noreferrer">Read the full Tencent licence</a>
                  </details>
                </div>
              </>}

              {status && !isHy && missing.length > 0 && onColab && <>
                <div className="i2s-note">Preparing the picture on this computer needs {missing.length === 1 ? 'a Python package' : 'some Python packages'} that {missing.length === 1 ? 'is' : 'are'} not installed in the backend: <b>{missing.map((m) => m.module).join(', ')}</b>. (PyTorch is not needed here — the Colab GPU does the rest.)</div>
                <ol className="i23d-steps">
                  <li>In the environment that runs <b>cad_server.py</b>:<code className="i23d-code">pip install {status.install_packages}</code></li>
                  <li>Restart the backend and press <b>Recheck</b>.</li>
                </ol>
              </>}
              {status && !isHy && missing.length > 0 && !onColab && <>
                <div className="i2s-note">TripoSR needs {missing.length === 1 ? 'a Python package' : 'some Python packages'} that {missing.length === 1 ? 'is' : 'are'} not installed in the backend: <b>{missing.map((m) => m.module).join(', ')}</b>.</div>
                <ol className="i23d-steps">
                  <li>Install PyTorch first: <b>pytorch.org/get-started</b> (CUDA for an NVIDIA GPU, otherwise the CPU build).</li>
                  <li>Then, in the environment that runs <b>cad_server.py</b>:<code className="i23d-code">{status.install}</code></li>
                  <li>Restart the backend and press <b>Recheck</b>.</li>
                </ol>
                <div className="i2s-note">No NVIDIA GPU? Choose <b>Google Colab</b> above to run TripoSR on a free cloud GPU — PyTorch is then not needed on this computer.</div>
              </>}
              {status && !isHy && missing.length === 0 && !tsrBlocked && <div className="i23d-device"><Cpu size={11} /> {status.hardware.error
                ? status.hardware.error
                : <>{status.hardware.device_name || status.hardware.device}{status.hardware.vram_gb ? ` · ${status.hardware.vram_gb} GB` : ''}{status.hardware.cuda ? '' : onColab ? ' · no GPU on the Colab machine, it will be slow' : ' · no GPU found, it will be slow'}</>}</div>}
              {status && !isHy && missing.length === 0 && !tsrBlocked && weights?.state === 'downloading' && <div className="i23d-progress">
                <div className="i23d-bar"><i style={{ width: `${Math.max(3, weights.percent)}%` }} /></div>
                <span><Loader2 size={11} className="i23d-spin" /> Downloading the TripoSR weights{onColab ? ' onto the Colab machine' : ''} (first use only) — {Math.round(weights.downloaded_mb)} of about {Math.round(weights.total_mb)} MB</span>
              </div>}
              {status && !isHy && missing.length === 0 && !tsrBlocked && weights?.state === 'missing' && <div className="i23d-weights">
                <small>The TripoSR weights (about {Math.round(weights.total_mb / 100) / 10} GB) download once{onColab ? ' per Colab session' : ''}, the first time you make a model.</small>
                <button className="i2s-btn" onClick={() => void downloadModel()}><Download size={11} /> Download now</button>
              </div>}
              {status && !isHy && missing.length === 0 && !tsrBlocked && weights?.state === 'error' && <div className="i2s-note i2s-bad">{weights.error} <button className="i2s-btn" onClick={() => void downloadModel()}><RefreshCw size={11} /> Try again</button></div>}
              {status && !isHy && missing.length === 0 && !tsrBlocked && weights?.state === 'ready' && <div className="i2s-note"><Check size={11} /> TripoSR weights are ready{onColab ? ' on the Colab machine' : status.model_loaded ? ' and loaded' : ''}.</div>}
              <div className="i2s-btns"><button className="i2s-btn" onClick={() => void loadStatus()} title="Check the backend again"><RefreshCw size={11} /> Recheck</button></div>
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>2 · Quality mode</legend>
              <Field label="Mode" value={(preset || 'custom') as PresetId | 'custom'} onChange={(v) => { if (v !== 'custom') applyPreset(v); }}
                options={[...(preset ? [] : [['custom', 'Custom (your own settings)'] as ['custom', string]]), ...PRESETS.map((p) => [p.id, p.label] as [PresetId, string])]} />
              <div className="i2s-note">{PRESETS.find((p) => p.id === preset)?.hint ?? 'Settings changed by hand. Pick a mode to start from a ready-made set.'}</div>
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>3 · Picture</legend>
              <div className="i2s-btns">
                <button className="i2s-btn" onClick={() => void orientBy({ turn: -1 })} disabled={!picture} title="Rotate 90° counter-clockwise"><RotateCcw size={12} /></button>
                <button className="i2s-btn" onClick={() => void orientBy({ turn: 1 })} disabled={!picture} title="Rotate 90° clockwise"><RotateCw size={12} /></button>
                <button className={`i2s-btn ${orient.flipH ? 'on' : ''}`} onClick={() => void orientBy({ flipH: true })} disabled={!picture} title="Flip horizontally"><FlipHorizontal2 size={12} /></button>
                <button className={`i2s-btn ${orient.flipV ? 'on' : ''}`} onClick={() => void orientBy({ flipV: true })} disabled={!picture} title="Flip vertically"><FlipVertical2 size={12} /></button>
                <button className="i2s-btn" onClick={() => setCrop(null)} disabled={!picture || !crop} title="Remove the crop box"><CropIcon size={11} /> Full image</button>
              </div>
              <Check1 label="Remove the background" checked={s.removeBackground} onChange={(v) => set({ removeBackground: v })} />
              <Slide label="Object size" value={s.foregroundRatio} min={0.5} max={1} step={0.05} onChange={(v) => set({ foregroundRatio: Math.round(v * 100) / 100 })}
                hint="How much of the frame the object fills. Lower leaves more room around it; 85% is the TripoSR default." format={(v) => `${Math.round(v * 100)}%`} />
              <Slide label="Cut-out edge" value={s.maskShift} min={-12} max={12} step={1} onChange={(v) => set({ maskShift: Math.round(v) })} format={(v) => (v > 0 ? `+${v} px` : `${v} px`)}
                hint="Negative shrinks the cut-out (trims a halo of background colour); positive grows it (restores thin parts the cut-out ate)." />
              <Check1 label="Fill holes in the cut-out" checked={s.maskFill} disabled={!s.removeBackground} onChange={(v) => set({ maskFill: v })} />
              <Check1 label="Even out lighting and contrast" checked={s.enhance} onChange={(v) => set({ enhance: v })} />
              <Field label="Cut-out model" value={s.cutoutModel} onChange={(v: CutoutModel) => set({ cutoutModel: v })} options={[['u2net', 'Standard (fast)'], ['isnet-general-use', 'Sharper edges'], ['birefnet-general', 'Finest detail (≈ 1 GB download)']]} />
              <div className="i2s-note">A cleaner cut-out is the biggest single help for busy backgrounds, hair, fur and thin parts. Check it in the Cut-out view before you generate.</div>
              <div className="i2s-btns"><button className="i2s-btn" onClick={() => { setView('cutout'); void showPreview(); }} disabled={!picture || preview.busy}><Layers size={11} /> Preview what {engineName} sees</button></div>
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>4 · 3D model</legend>
              {!isHy && <>
                <Slide label="Mesh resolution" value={s.mcResolution} min={32} max={512} step={32} onChange={(v) => set({ mcResolution: Math.round(v / 32) * 32 })} format={(v) => `${v}³`}
                  hint="The grid the surface is cut from (up to 512³). TripoSR's own scene is a coarse grid, so above about 384³ the surface mostly gets smoother and more exact rather than gaining new detail." />
                <Field label="Surface clean-up" value={s.polish} onChange={(v) => set({ polish: v })}
                  options={[['off', 'Off (raw TripoSR surface)'], ['standard', 'Standard (specks, bubbles, ripple)'], ['strong', 'Strong (also hair-thin spikes)']]} />
                <Check1 label="Cut a flat base when the figure stands on a slab" checked={s.flatBase} onChange={(v) => set({ flatBase: v })} />
                <Field label="Match my picture" value={s.matchPicture} onChange={(v) => set({ matchPicture: v })}
                  options={[['off', 'Off'], ['light', 'Light (about 30 steps)'], ['strong', 'Strong (about 80 steps, slower)']]} />
                <Field label="Picture reads" value={String(s.reads)} onChange={(v) => set({ reads: v === '5' ? 5 : v === '3' ? 3 : 1 })}
                  options={[['1', '1 (fastest)'], ['3', '3 (steadier)'], ['5', '5 (steadiest, slower)']]} />
                <div className="i2s-note">Match my picture nudges the model until its own front view lines up with your cut-out (outline and colours); it is undone automatically if the overlap does not improve or the volume changes by more than 25 %. It needs the cut-out, so keep “Remove the background” on. Reads average several slightly different looks at the picture. Both are new and need a GPU; the job note shows what they did.</div>
                <Check1 label="Paint colour while making the model (slower)" checked={s.colourWhenMaking} onChange={(v) => set({ colourWhenMaking: v })} />
                <div className="i2s-note">Colour off gives a clean shape to judge and print. After it is made, press <b>Add colour</b> to paint the same shape.</div>
                <Slide label="Surface level" value={s.threshold} min={10} max={50} step={1} onChange={(v) => set({ threshold: Math.round(v) })}
                  hint="Where the surface is placed in the model's density. Lower fills out thin parts, higher trims fuzz. 25 is the default." />
                <Field label="Memory use" value={s.memory} onChange={(v) => set({ memory: v })} options={[['standard', 'Standard (faster)'], ['low', 'Low (little GPU memory)']]} />
                <div className="i2s-note">Used when the model runs — press Generate again after changing these or the picture.</div>
                {onColab && rem?.reachable && !rem.error && (s.matchPicture !== 'off' || s.reads > 1) && (status?.features ?? []).includes('hq') && !(status?.features ?? []).includes('match') && <div className="i2s-note i2s-bad">This Colab session's notebook does not have Match my picture yet: upload the newest Faelyx_Hunyuan3D_Colab.ipynb, run it and paste the new connection code.</div>}
                {onColab && rem?.reachable && !rem.error && !(status?.features ?? []).includes('hq') && <div className="i2s-note i2s-bad">This Colab session runs an older notebook: models are made the old way (320³ at most) and colour cannot be added later. Upload the new Faelyx_Hunyuan3D_Colab.ipynb, run it and paste the new connection code.</div>}
              </>}
              {isHy && <>
                <Slide label="Surface detail" value={s.hyOctree} min={256} max={512} step={64} onChange={(v) => set({ hyOctree: Math.round(v / 64) * 64 })}
                  hint="The grid the surface is cut from (256³ … 512³). Higher captures finer detail such as hair spikes and thin parts; it needs more memory and time." format={(v) => `${v}³`} />
                <Slide label="Shape quality (steps)" value={s.hySteps} min={20} max={100} step={5} onChange={(v) => set({ hySteps: Math.round(v / 5) * 5 })}
                  hint="How many refinement steps the shape model takes. 50 is Tencent's default; more is slower and only slightly better." />
                <Slide label="Follow the picture" value={s.hyGuidance} min={2} max={9} step={0.5} onChange={(v) => set({ hyGuidance: v })} format={(v) => v.toFixed(1)}
                  hint="Guidance strength. Higher sticks closer to the picture; too high can look harsh and lumpy. 5 is Tencent's default and the best start for characters." />
                <Field label="Surface clean-up" value={s.hyPolish} onChange={(v) => set({ hyPolish: v })} options={[['off', 'Off (raw Hunyuan3D surface)'], ['standard', 'Standard (smooth, drop specks)'], ['strong', 'Strong (smoother, also removes thin threads)']]} />
                <Check1 label="Flat base (stands on its own)" checked={s.hyFlatBase} onChange={(v) => set({ hyFlatBase: v })} />
                <Field label="Tries (keeps the best)" value={String(s.hyVariants)} onChange={(v) => set({ hyVariants: v === '4' ? 4 : v === '3' ? 3 : v === '2' ? 2 : 1 })}
                  options={[['1', '1 (fastest)'], ['2', '2 — keep the one that matches your picture best'], ['3', '3'], ['4', '4 (slowest)']]} />
                <div className="i2s-note">Clean-up smooths the surface and removes floating specks before the mesh is made, and a flat base cuts a level foot plate. More tries multiply the shape time. On Google Colab these need the newest notebook.</div>
                <Field label="Colour" value={s.hyTexture} onChange={(v) => set({ hyTexture: v })} options={[['auto', hy?.texture_ok ? 'Paint colours (slowest step)' : 'Paint colours (not installed)'], ['off', 'Shape only (much faster)']]} />
                {s.hyTexture === 'auto' && hy?.texture_ok && <>
                  <Field label="Colour views" value={String(s.hyTexViews)} onChange={(v) => set({ hyTexViews: v === '8' ? 8 : 6 })} options={[['6', '6 views (default)'], ['8', '8 views (covers more sides)']]} />
                  <Field label="Colour detail" value={String(s.hyTexRes)} onChange={(v) => set({ hyTexRes: v === '768' ? 768 : 512 })} options={[['512', '512 px (default)'], ['768', '768 px (finer, needs more memory)']]} />
                </>}
                <Field label="GPU memory" value={s.hyMode} onChange={(v) => set({ hyMode: v })} options={[['auto', 'Automatic (by free video memory)'], ['full', 'Full speed (needs about 13 GB free)'], ['balanced', 'Balanced (about 9 GB free)'], ['low', 'Low memory (streams from RAM, slowest)']]} />
                <Num label="Seed" value={s.hySeed} min={0} max={2147483647} step={1} onChange={(v) => set({ hySeed: Math.round(v) })} />
                <div className="i2s-note"><Clock size={11} /> {slow ? 'Expect many minutes per model on this GPU.' : 'Expect a few minutes per model.'} Hunyuan3D runs in its own process; Stop ends it and frees the GPU. The same seed gives the same shape.</div>
              </>}
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>5 · Mesh finishing</legend>
              <Slide label="Smoothing" value={s.smooth} min={0} max={20} step={1} onChange={(v) => set({ smooth: Math.round(v) })} format={(v) => (v === 0 ? 'off' : String(v))}
                hint="Rounds off the stair-step ripple of the surface. Volume is kept, so the object does not shrink." />
              <Check1 label="Keep sharp edges when smoothing" checked={s.sharp} onChange={(v) => set({ sharp: v })} />
              <Field label="Loose pieces" value={s.pieces} onChange={(v) => set({ pieces: v })} options={[['all', 'Keep everything'], ['bits', 'Remove tiny floating bits'], ['largest', 'Keep only the largest']]} />
              <Check1 label="Close holes (watertight)" checked={s.fillHoles} onChange={(v) => set({ fillHoles: v })} />
              <Field label="Mesh detail" value={s.faces} onChange={(v) => set({ faces: v })} options={[['low', 'Light (≈ 20 000 faces)'], ['medium', 'Medium (≈ 60 000)'], ['high', 'High (≈ 150 000)'], ['ultra', 'Ultra (≈ 400 000)'], ['full', 'Everything (heavy)']]} />
              <div className="i2s-note">Applied to the finished model instantly — no new run.</div>
              {status && !isHy && status.quadric === false && <div className="i2s-note">Reducing faces is rough without <code className="i23d-code">pip install fast-simplification</code> (run it in the backend's environment, then restart cad_server.py).</div>}
            </fieldset>

            <fieldset className="i2s-sec">
              <legend>6 · Size &amp; placement</legend>
              <Num label="Longest side (mm)" value={s.size} min={1} max={5000} step={5} onChange={(v) => set({ size: v })} />
              <Field label="Axis that is up" value={s.up} onChange={(v) => set({ up: v })} options={[['z', 'Z is up (TripoSR default)'], ['y', 'Y is up (Hunyuan3D default)'], ['-y', '−Y is up'], ['-z', '−Z is up (upside down)'], ['x', 'X is up'], ['-x', '−X is up']]} />
              <Slide label="Turn" value={s.spin} min={-180} max={180} step={15} unit="°" onChange={(v) => set({ spin: v })} />
              <Field label="Place" value={s.place} onChange={(v) => set({ place: v })} options={[['ground', 'Standing on the XY plane'], ['center', 'Centered on the origin']]} />
              <div className="i2s-two">
                <Num label="X" value={s.x} step={5} onChange={(v) => set({ x: v })} /><Num label="Y" value={s.y} step={5} onChange={(v) => set({ y: v })} />
              </div>
              <Num label="Z" value={s.z} step={5} onChange={(v) => set({ z: v })} />
            </fieldset>
          </aside>
        </div>

        <footer className="i2s-foot">
          <div className="i2s-result">
            {!picture ? <span>No image loaded.</span>
              : running ? <span><Loader2 size={11} className="i2s-spin" /> {job?.message || 'Working…'}</span>
                : done && job?.stats ? <>
                  <span><b>{job.stats.faces.toLocaleString()}</b> faces{job.full_faces > job.stats.faces ? ` of ${job.full_faces.toLocaleString()}` : ''}</span>
                  <span className="i2s-size">{job.stats.size.map((v) => fmt(v)).join(' × ')} mm</span>
                  <span>{fmt(job.stats.volume / 1000, 2)} cm³</span>
                  <span className={job.stats.printable ? 'i2s-size' : 'i2s-warn'} title={job.stats.printable ? '' : 'Not watertight: fine for viewing and rendering. Turn on Close holes, or repair it in a slicer before printing.'}>
                    {job.stats.printable ? 'watertight' : job.stats.closed ? 'closed, check volume' : `${job.stats.non_manifold_edges.toLocaleString()} open edges`}</span>
                  {job.seconds > 0 && <span>{fmt(job.seconds, 1)} s on {job.device || 'this computer'}</span>}
                  {added && <span className="i2s-size"><Check size={11} /> {added} is in the model tree</span>}
                </> : <span>{picture.name} — press Generate 3D model.</span>}
          </div>
          <div className="i2s-actions">
            {done && <>
              {(['stl', 'ply', 'obj', 'glb'] as MeshFormat[]).map((f) => <button key={f} className="i2s-btn" onClick={() => void download(f)} title={`Download as ${f.toUpperCase()}`}><Download size={11} /> {f.toUpperCase()}</button>)}
              {job?.engine === 'triposr' && !job.has_colors && job.colour_state !== 'working' && <button className="i2s-btn" disabled={!job.can_colour} onClick={() => void addColour()} title="Paints this exact shape with TripoSR's colours — a few seconds, the shape does not change"><Palette size={11} /> Add colour</button>}
              {job?.colour_state === 'working' && <span className="i2s-note"><Loader2 size={11} className="i2s-spin" /> {job.colour_message || 'Painting the model…'}</span>}
              {job?.has_pbr && <button className="i2s-btn" onClick={() => { const base = (picture?.name ?? 'model').replace(/\.[^.]+$/, '') || 'model'; void saveUrlAs(pbrUrl(job), `${base}-pbr.glb`).catch((e) => setLocalError((e as Error).message)); }} title="Tencent's textured model with PBR materials, exactly as the colour stage made it"><Download size={11} /> PBR GLB</button>}
              <button className="i2s-btn" onClick={() => { void discardJob(); setView('image'); }} title="Throw this model away"><Trash2 size={11} /> Discard</button>
            </>}
            <span className="i2s-flex" />
            <button className="i2s-btn" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
            {running
              ? <button className="i2s-btn" onClick={() => void cancelJob()}><X size={11} /> Stop</button>
              : <button className={`i2s-btn ${done ? '' : 'i2s-primary'}`} onClick={() => void generate()} disabled={!canGenerate} title={!canGenerate ? (!picture ? 'Choose a picture first' : 'Fix the Engine section first') : ''}><Wand2 size={12} /> {st.starting ? 'Starting…' : done ? 'Generate again' : 'Generate 3D model'}</button>}
            {done && <button className="i2s-btn i2s-primary" onClick={() => void add()} disabled={busyAdd}><Check size={12} /> {busyAdd ? 'Adding…' : 'Add to model as a mesh body'}</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}
