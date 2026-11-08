// faelyx.AI — Image to 3D (TripoSR and Hunyuan3D 2.1, each on this computer or on a Google Colab GPU). Licensed under the faelyx.AI Image to 3D Module License
// (ai-engine/cad-server/LICENSE-faelyx-image-to-3d.md). The TripoSR model is MIT, © Tripo AI & Stability AI. Hunyuan3D 2.1 is
// © 2025 Tencent, used under the Tencent Hunyuan 3D 2.1 Community License (NOTICE-hunyuan3d.txt); faelyx.AI is not affiliated with Tencent.
//
// The client for the backend's /image_to_3d routes (cad-server/image_to_3d.py) and the small store behind the
// right-hand panel. The store lives at module level so a running job, the chosen picture and the options survive
// switching tools; polling continues in the background and the panel just re-renders from it.
import { useSyncExternalStore } from 'react';
import { API_BASE } from './config';

export type MeshStats = { vertices: number; faces: number; size: number[]; volume: number; area: number; closed: boolean; non_manifold_edges: number; printable: boolean };
export type JobInfo = {
  id: string; engine: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; progress: number; message: string;
  error: string | null; mask: string; has_colors: boolean; has_glb: boolean; has_cutout: boolean; up: string; full_faces: number; device: string; seconds: number;
  textured?: boolean; note?: string; has_pbr?: boolean;
  /** TripoSR: colour is added on request after the shape. none -> working -> done | failed */
  colour_state?: 'none' | 'working' | 'done' | 'failed'; colour_message?: string; can_colour?: boolean;
  stats?: MeshStats;
};
export type WeightsStatus = { state: 'ready' | 'missing' | 'downloading' | 'error'; percent: number; downloaded_mb: number; total_mb: number; error: string | null; folder: string; source: string; files: string[] };
export type EngineId = 'triposr' | 'hunyuan';
export type HunyuanStatus = {
  id: 'hunyuan'; name: string; installed: boolean; configured: boolean; ready: boolean; reasons: string[];
  texture_ok: boolean; texture_missing: string[]; gpu: string | null; vram_gb: number | null; ram_gb: number | null; torch: string | null;
  setup_command: string; setup_folder: string; runtime_folder: string;
  weights: WeightsStatus & { stage?: string; exact_total?: boolean };
  notice: string; license_terms: string[]; license_url: string; source: string;
  /** 'remote' = the engine runs on a Google Colab session (see Faelyx_Hunyuan3D_Colab.ipynb) instead of this computer */
  where?: 'local' | 'remote';
  remote?: RemoteInfo;
};
export type RemoteInfo = { configured: boolean; enabled: boolean; url: string; reachable: boolean | null; error: string | null };
export type EngineStatus = {
  engine: { id: string; name: string; license: string; source: string };
  hunyuan?: HunyuanStatus;
  /** TripoSR: 'remote' = it runs on the Google Colab session (hardware and weights then describe the Colab machine) */
  where?: 'local' | 'remote';
  remote?: RemoteInfo;
  python: string; missing: { module: string; pip: string }[]; install: string; install_packages: string;
  hardware: { torch: string | null; device: string; device_name: string; vram_gb: number | null; cuda: boolean; error?: string };
  weights: WeightsStatus; model_loaded: boolean; ready: boolean;
  /** What the TripoSR runner can do: 'hq' = high-detail mesh, 'colour' = colour added later. An older Colab notebook reports none. */
  features?: string[];
  /** fast-simplification is installed: the face cap uses quadric edge-collapse instead of grid clustering */
  quadric?: boolean;
};
export type Pieces = 'all' | 'bits' | 'largest';
export type CutoutModel = 'u2net' | 'isnet-general-use' | 'birefnet-general';
export type Settings = {
  engine: EngineId;
  // the picture (what the engine is given)
  removeBackground: boolean; foregroundRatio: number; maskShift: number; maskFill: boolean; enhance: boolean; cutoutModel: CutoutModel;
  // the model run — TripoSR
  mcResolution: number; threshold: number; memory: 'standard' | 'low';
  // TripoSR surface quality: clean-up of the density grid before the mesh is made, one flat bottom plane, and colour while making (off = clean grey shape, colour can be added afterwards)
  polish: 'off' | 'standard' | 'strong'; flatBase: boolean; colourWhenMaking: boolean;
  // better use of the picture: nudge the model's front view to your cut-out outline (off / light / strong) and average 1, 3 or 5 reads of the picture
  matchPicture: 'off' | 'light' | 'strong'; reads: 1 | 3 | 5;
  // the model run — Hunyuan3D 2.1
  hySteps: number; hyGuidance: number; hyOctree: number; hyMode: 'auto' | 'full' | 'balanced' | 'low'; hyTexture: 'auto' | 'off';
  hyTexViews: 6 | 8; hyTexRes: 512 | 768; hySeed: number;
  // Meshy-style clean-up of the Hunyuan3D shape (see faelyx_polish.py): surface clean-up strength, flat base, and how many seeds to try
  hyPolish: 'off' | 'standard' | 'strong'; hyFlatBase: boolean; hyVariants: 1 | 2 | 3 | 4;
  // finishing the mesh — applied to the finished model, so these change instantly without running TripoSR again
  faces: 'low' | 'medium' | 'high' | 'ultra' | 'full'; smooth: number; sharp: boolean; pieces: Pieces; fillHoles: boolean;
  // placement
  size: number; up: string; spin: number; place: 'ground' | 'center'; x: number; y: number; z: number;
};
/** `dataUrl` is the picture after rotate / flip (what the crop box is drawn on); `original` is the file as chosen. */
export type Picture = { name: string; original: string; dataUrl: string; width: number; height: number };
export type Crop = { x: number; y: number; w: number; h: number };       // fractions of the oriented picture
export type Orient = { rot: 0 | 1 | 2 | 3; flipH: boolean; flipV: boolean };
export type CutoutPreview = { url: string | null; busy: boolean; error: string | null };

type State = {
  picture: Picture | null; orient: Orient; crop: Crop | null; preview: CutoutPreview;
  settings: Settings; status: EngineStatus | null; statusError: string | null;
  job: JobInfo | null; starting: boolean; error: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  engine: 'triposr',
  removeBackground: true, foregroundRatio: 0.85, maskShift: 0, maskFill: false, enhance: false, cutoutModel: 'u2net',
  mcResolution: 384, threshold: 25, memory: 'standard', polish: 'standard', flatBase: true, colourWhenMaking: false, matchPicture: 'off', reads: 1,
  hySteps: 50, hyGuidance: 5, hyOctree: 384, hyMode: 'auto', hyTexture: 'auto', hyTexViews: 6, hyTexRes: 512, hySeed: 1234, hyPolish: 'standard', hyFlatBase: false, hyVariants: 1,
  faces: 'high', smooth: 0, sharp: true, pieces: 'bits', fillHoles: false,
  size: 60, up: 'z', spin: 0, place: 'ground', x: 0, y: 0, z: 0,
};

/** Ready-made combinations, like the Image to Sketch modes. They set the picture, model-run and finishing options together. */
export type PresetId = 'draft' | 'balanced' | 'best' | 'organic' | 'hard' | 'print' | 'figurine';
export const PRESETS: { id: PresetId; label: string; hint: string; values: Partial<Settings> }[] = [
  { id: 'draft', label: 'Quick draft', hint: 'Fast and light, to check the idea.', values: { mcResolution: 128, threshold: 25, polish: 'standard', flatBase: true, hySteps: 25, hyOctree: 256, smooth: 0, faces: 'low', sharp: true, pieces: 'bits', fillHoles: false } },
  { id: 'balanced', label: 'Balanced', hint: 'Clean surface, flat base, 384³ mesh (the default).', values: { mcResolution: 384, threshold: 25, polish: 'standard', flatBase: true, hySteps: 50, hyOctree: 384, smooth: 0, faces: 'high', sharp: true, pieces: 'bits', fillHoles: false } },
  { id: 'best', label: 'Best detail', hint: 'Finest mesh grid (512³) and the heaviest mesh; slowest.', values: { mcResolution: 512, threshold: 25, polish: 'standard', flatBase: true, matchPicture: 'light', hySteps: 75, hyOctree: 512, smooth: 0, faces: 'ultra', sharp: true, pieces: 'bits', fillHoles: false } },
  { id: 'organic', label: 'Smooth / organic', hint: 'Soft, rounded surfaces: figures, toys, food, plants.', values: { mcResolution: 384, threshold: 25, polish: 'strong', flatBase: true, hySteps: 50, hyOctree: 384, smooth: 6, faces: 'high', sharp: false, pieces: 'bits', fillHoles: true } },
  { id: 'hard', label: 'Hard-surface', hint: 'Keeps edges and corners crisp: parts, boxes, tools.', values: { mcResolution: 448, threshold: 25, polish: 'standard', flatBase: true, hySteps: 50, hyOctree: 384, smooth: 0, faces: 'ultra', sharp: true, pieces: 'bits', fillHoles: true } },
  { id: 'print', label: '3D-print ready', hint: 'One watertight piece, holes closed, flat base.', values: { mcResolution: 384, threshold: 25, polish: 'strong', flatBase: true, hySteps: 50, hyOctree: 384, smooth: 2, faces: 'high', sharp: true, pieces: 'largest', fillHoles: true } },
  { id: 'figurine', label: 'Clean figurine (Meshy-style)', hint: 'Characters, toys, statuettes: smooth clean surface, flat base. On Hunyuan3D: best of 2 tries, slower.', values: { mcResolution: 448, threshold: 25, polish: 'strong', flatBase: true, matchPicture: 'light', hySteps: 50, hyGuidance: 5, hyOctree: 512, hyPolish: 'strong', hyFlatBase: true, hyVariants: 2, smooth: 3, faces: 'high', sharp: false, pieces: 'bits', fillHoles: true } },
];
const TRIPO_ONLY: (keyof Settings)[] = ['mcResolution', 'threshold', 'polish', 'flatBase', 'matchPicture'];
const HUNYUAN_ONLY: (keyof Settings)[] = ['hySteps', 'hyOctree', 'hyGuidance', 'hyPolish', 'hyFlatBase', 'hyVariants'];
/** Which mode the current settings match — only the options of the chosen engine count. */
export const activePreset = (s: Settings): PresetId | '' => {
  const skip = s.engine === 'hunyuan' ? TRIPO_ONLY : HUNYUAN_ONLY;
  return PRESETS.find((p) => (Object.keys(p.values) as (keyof Settings)[]).filter((k) => !skip.includes(k)).every((k) => s[k] === p.values[k]))?.id ?? '';
};

const NO_PREVIEW: CutoutPreview = { url: null, busy: false, error: null };
let engineChosen = false;                        // once the user picks an engine, the status check no longer picks one for them
let state: State = {
  picture: null, orient: { rot: 0, flipH: false, flipV: false }, crop: null, preview: NO_PREVIEW,
  settings: DEFAULT_SETTINGS, status: null, statusError: null, job: null, starting: false, error: null,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const useImageTo3D = (): State => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state);
export const getImageTo3D = (): State => state;

const OLD_BACKEND = 'The backend does not have this version of Image to 3D yet — restart cad_server.py (it loads image_to_3d.py when it starts).';

async function api(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await fetch(`${API_BASE}${path}`, init); } catch { throw new Error('Cannot reach the Faelyx backend — is cad_server.py running on :8000?'); }
  if (res.status === 404 && path.startsWith('/image_to_3d/') && !path.includes('/jobs/')) throw new Error(OLD_BACKEND);
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
  return res;
}

const FINISH_KEYS: (keyof Settings)[] = ['size', 'up', 'spin', 'faces', 'smooth', 'sharp', 'pieces', 'fillHoles'];
const PICTURE_KEYS: (keyof Settings)[] = ['engine', 'removeBackground', 'foregroundRatio', 'maskShift', 'maskFill', 'enhance', 'cutoutModel'];

export function updateSettings(patch: Partial<Settings>) {
  set({ settings: { ...state.settings, ...patch } });
  const keys = Object.keys(patch) as (keyof Settings)[];
  if (keys.some((k) => FINISH_KEYS.includes(k)) && state.job?.status === 'succeeded') scheduleStats();
  if (keys.some((k) => PICTURE_KEYS.includes(k)) && state.preview.url) schedulePreview();    // keep an open cut-out preview current
}
/** Chooses the engine. The up-axis follows it (Hunyuan3D builds models Y-up, TripoSR Z-up) and Hunyuan gets the sharper cut-out model. */
export function setEngine(engine: EngineId) {
  engineChosen = true;
  const s = state.settings;
  updateSettings({
    engine, up: engine === 'hunyuan' ? 'y' : 'z',
    ...(engine === 'hunyuan' && s.cutoutModel === 'u2net' ? { cutoutModel: 'isnet-general-use' as CutoutModel } : {}),
  });
}
export function applyPreset(id: PresetId) {
  const p = PRESETS.find((x) => x.id === id);
  if (p) updateSettings(p.values);
}

// ---- setup status (packages, GPU, model weights) ------------------------------
let statusTimer: number | null = null;
const stopStatusPolling = () => { if (statusTimer !== null) { window.clearInterval(statusTimer); statusTimer = null; } };

export async function loadStatus(): Promise<void> {
  try {
    const status = await api('/image_to_3d/status').then((r) => r.json()) as EngineStatus;
    set({ status, statusError: null });
    // first look: when Hunyuan3D 2.1 is set up, it is the engine to start with (the user can still choose TripoSR)
    if (!engineChosen && state.settings.engine === 'triposr' && status.hunyuan?.ready) { engineChosen = true; setEngine('hunyuan'); }
    // keep watching while the weights download, so the progress bar moves
    const downloading = status.weights.state === 'downloading' || status.hunyuan?.weights.state === 'downloading';
    if (downloading && statusTimer === null) statusTimer = window.setInterval(() => { void loadStatus(); }, 1000);
    if (!downloading) stopStatusPolling();
  } catch (err) {
    stopStatusPolling();
    set({ statusError: (err as Error).message });
  }
}

const JSON_POST = { method: 'POST', headers: { 'Content-Type': 'application/json' } };

const REMOTE_ROUTE: Record<EngineId, string> = { hunyuan: '/image_to_3d/hunyuan/remote', triposr: '/image_to_3d/triposr/remote' };

/** Saves the connection code printed by the Colab notebook and switches the chosen engine to run there (the other engine keeps its own
 *  choice; both use the same Colab session). Returns an error message, or null when it worked. */
export async function connectColab(code: string, engine: EngineId = state.settings.engine): Promise<string | null> {
  try {
    await api(REMOTE_ROUTE[engine], { ...JSON_POST, body: JSON.stringify({ code }) });
    await loadStatus();
    return null;
  } catch (err) { return (err as Error).message; }
}

/** Switches an engine between this computer and the saved Colab connection. */
export async function runEngineOn(engine: EngineId, where: 'local' | 'remote'): Promise<void> {
  try {
    await api(REMOTE_ROUTE[engine], { ...JSON_POST, body: JSON.stringify({ enabled: where === 'remote' }) });
    set({ error: null });
    await loadStatus();
  } catch (err) { set({ error: (err as Error).message }); }
}

/** Deletes the saved Colab connection (for both engines). */
export async function forgetColab(): Promise<void> {
  try {
    await api('/image_to_3d/hunyuan/remote', { method: 'DELETE' });
    await loadStatus();
  } catch (err) { set({ error: (err as Error).message }); }
}

/** Starts the one-time download of the chosen engine's weights (the first picture also starts it by itself). */
export async function downloadModel(): Promise<void> {
  try {
    await api(state.settings.engine === 'hunyuan' ? '/image_to_3d/hunyuan/download' : '/image_to_3d/model/download', { method: 'POST' });
    set({ error: null });
    await loadStatus();
  } catch (err) { set({ error: (err as Error).message }); }
}

// ---- picture -----------------------------------------------------------------
const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that picture.')); i.src = url; });
const readFile = (file: Blob) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
const MAX_SIDE = 2048;

/** The original picture with the rotate / flip applied, scaled so the longest side is at most 2048 px. */
async function orientPicture(original: string, o: Orient): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(original);
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const sw = Math.max(8, Math.round(img.naturalWidth * k)), sh = Math.max(8, Math.round(img.naturalHeight * k));
  const odd = o.rot % 2 === 1;
  const c = document.createElement('canvas');
  c.width = odd ? sh : sw; c.height = odd ? sw : sh;
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2);
  g.rotate((o.rot * Math.PI) / 2);
  g.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  return { dataUrl: c.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight };
}

export async function setPicture(file: File): Promise<void> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { set({ error: 'Use a PNG, JPG or WebP picture.' }); return; }
  try {
    const original = await readFile(file);
    const orient: Orient = { rot: 0, flipH: false, flipV: false };
    const o = await orientPicture(original, orient);
    clearPreview();
    set({ picture: { name: file.name, original, dataUrl: o.dataUrl, width: o.width, height: o.height }, orient, crop: null, error: null });
    void discardJob();
  } catch { set({ error: 'Could not read that picture.' }); }
}
export function clearPicture() { clearPreview(); set({ picture: null, crop: null, orient: { rot: 0, flipH: false, flipV: false } }); void discardJob(); }

/** Rotate by quarter turns (+1 = clockwise) and / or flip. The crop box is cleared, since it was drawn on the old orientation. */
export async function orientBy(change: { turn?: 1 | -1; flipH?: boolean; flipV?: boolean }): Promise<void> {
  const pic = state.picture;
  if (!pic) return;
  const o = state.orient;
  const next: Orient = {
    rot: (((o.rot + (change.turn ?? 0)) % 4 + 4) % 4) as Orient['rot'],
    flipH: change.flipH ? !o.flipH : o.flipH, flipV: change.flipV ? !o.flipV : o.flipV,
  };
  try {
    const r = await orientPicture(pic.original, next);
    set({ orient: next, crop: null, picture: { ...pic, dataUrl: r.dataUrl } });
    if (state.preview.url) schedulePreview();
  } catch (err) { set({ error: (err as Error).message }); }
}
export function setCrop(c: Crop | null) {
  const ok = c && c.w > 0.03 && c.h > 0.03 ? { x: Math.max(0, c.x), y: Math.max(0, c.y), w: Math.min(1 - Math.max(0, c.x), c.w), h: Math.min(1 - Math.max(0, c.y), c.h) } : null;
  set({ crop: ok });
  if (state.preview.url) schedulePreview();
}

/** The picture exactly as it is sent: oriented, then cropped. */
export async function preparedImage(): Promise<string> {
  const pic = state.picture, crop = state.crop;
  if (!pic) throw new Error('Choose a picture first.');
  if (!crop) return pic.dataUrl;
  const img = await loadImage(pic.dataUrl);
  const sx = Math.round(crop.x * img.naturalWidth), sy = Math.round(crop.y * img.naturalHeight);
  const sw = Math.max(8, Math.min(img.naturalWidth - sx, Math.round(crop.w * img.naturalWidth)));
  const sh = Math.max(8, Math.min(img.naturalHeight - sy, Math.round(crop.h * img.naturalHeight)));
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c.toDataURL('image/png');
}

// ---- cut-out preview ("what the engine sees"): runs only the picture step on the backend ----
let previewTimer: number | null = null;
let previewSeq = 0;
function clearPreview() {
  previewSeq++;
  if (previewTimer !== null) { window.clearTimeout(previewTimer); previewTimer = null; }
  if (state.preview.url) URL.revokeObjectURL(state.preview.url);
  set({ preview: NO_PREVIEW });
}
export function closePreview() { clearPreview(); }
function schedulePreview() {
  if (previewTimer !== null) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => { previewTimer = null; void showPreview(); }, 600);
}
export async function showPreview(): Promise<void> {
  if (!state.picture) return;
  const seq = ++previewSeq;
  set({ preview: { ...state.preview, busy: true, error: null } });
  try {
    const image = await preparedImage();
    const res = await api('/image_to_3d/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, options: modelOptions() }) });
    const url = URL.createObjectURL(await res.blob());
    if (seq !== previewSeq) { URL.revokeObjectURL(url); return; }
    if (state.preview.url) URL.revokeObjectURL(state.preview.url);
    set({ preview: { url, busy: false, error: null } });
  } catch (err) {
    if (seq === previewSeq) set({ preview: { url: state.preview.url, busy: false, error: (err as Error).message } });
  }
}

// ---- jobs --------------------------------------------------------------------
let pollTimer: number | null = null;
let statsTimer: number | null = null;
const stopPolling = () => { if (pollTimer !== null) { window.clearInterval(pollTimer); pollTimer = null; } };

const finishQuery = (s: Settings) => `faces=${s.faces}&smooth=${Math.round(s.smooth)}&sharp=${s.sharp}&pieces=${s.pieces}&fill=${s.fillHoles}`;
const jobParams = () => {
  const s = state.settings;
  return `size_mm=${encodeURIComponent(String(s.size))}&up=${encodeURIComponent(s.up)}&spin=${encodeURIComponent(String(s.spin))}&${finishQuery(s)}`;
};
/** What the model run depends on (the finishing options travel on the mesh requests instead). */
const modelOptions = () => {
  const s = state.settings;
  return {
    engine: s.engine, cutout_model: s.cutoutModel,
    remove_background: s.removeBackground, foreground_ratio: s.foregroundRatio, mask_shift: Math.round(s.maskShift), mask_fill: s.maskFill, enhance: s.enhance,
    mc_resolution: s.mcResolution, threshold: s.threshold, memory: s.memory, polish: s.polish, flat_base: s.flatBase, colour: s.colourWhenMaking, match: s.matchPicture, reads: s.reads, up: s.engine === 'hunyuan' ? 'y' : 'z',
    hy_steps: Math.round(s.hySteps), hy_guidance: s.hyGuidance, hy_octree: Math.round(s.hyOctree), hy_mode: s.hyMode, hy_texture: s.hyTexture,
    hy_tex_views: s.hyTexViews, hy_tex_res: s.hyTexRes, hy_seed: Math.round(s.hySeed),
    hy_polish: s.hyPolish, hy_flat_base: s.hyFlatBase, hy_variants: s.hyVariants,
  };
};
async function fetchInfo(id: string): Promise<JobInfo> {
  return api(`/image_to_3d/jobs/${id}?${jobParams()}`).then((r) => r.json());
}
function scheduleStats() {
  if (statsTimer !== null) window.clearTimeout(statsTimer);
  statsTimer = window.setTimeout(async () => {
    const j = state.job;
    if (!j || j.status !== 'succeeded') return;
    try { const info = await fetchInfo(j.id); if (state.job?.id === j.id) set({ job: info }); } catch { /* the job may have been cleared */ }
  }, 250);
}

export async function generate(): Promise<void> {
  const pic = state.picture;
  if (!pic) { set({ error: 'Choose a picture first.' }); return; }
  const options = modelOptions();
  set({ starting: true, error: null });
  stopPolling();
  stopColourPolling();
  const old = state.job;
  if (old) void api(`/image_to_3d/jobs/${old.id}`, { method: 'DELETE' }).catch(() => undefined);
  try {
    const image = await preparedImage();
    const r = await api('/image_to_3d/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, options }) });
    const { job_id } = await r.json();
    set({ starting: false, job: { id: job_id, engine: options.engine, status: 'queued', progress: 0, message: 'Starting…', error: null, mask: '', has_colors: false, has_glb: false, has_cutout: false, up: 'z', full_faces: 0, device: '', seconds: 0 } });
    pollTimer = window.setInterval(async () => {
      const cur = state.job;
      if (!cur) { stopPolling(); return; }
      try {
        const info = await fetchInfo(cur.id);
        if (state.job?.id !== cur.id) return;
        set({ job: info });
        if (info.status !== 'queued' && info.status !== 'running') {
          stopPolling();
          void loadStatus();                       // weights / model-loaded state may have changed
        }
      } catch (err) { stopPolling(); set({ error: (err as Error).message }); }
    }, 1000);
  } catch (err) { set({ starting: false, error: (err as Error).message }); }
}

let colourTimer: number | null = null;
const stopColourPolling = () => { if (colourTimer !== null) { window.clearInterval(colourTimer); colourTimer = null; } };

/** TripoSR: paints the finished model (the shape stays exactly as it is). Colour is read at the vertices of the mesh, so it takes a few seconds. */
export async function addColour(): Promise<void> {
  const j = state.job;
  if (!j || j.status !== 'succeeded') return;
  try {
    await api(`/image_to_3d/jobs/${j.id}/colour`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    set({ error: null, job: { ...j, colour_state: 'working', colour_message: 'Starting…', can_colour: false } });
    stopColourPolling();
    colourTimer = window.setInterval(async () => {
      const cur = state.job;
      if (!cur || cur.id !== j.id) { stopColourPolling(); return; }
      try {
        const info = await fetchInfo(cur.id);
        if (state.job?.id !== cur.id) return;
        set({ job: info });
        if (info.colour_state !== 'working') {
          stopColourPolling();
          if (info.colour_state === 'failed') set({ error: info.colour_message || 'Adding colour failed.' });
        }
      } catch (err) { stopColourPolling(); set({ error: (err as Error).message }); }
    }, 1000);
  } catch (err) { set({ error: (err as Error).message }); }
}

export async function cancelJob(): Promise<void> {
  const j = state.job;
  if (!j) return;
  try { await api(`/image_to_3d/jobs/${j.id}/cancel`, { method: 'POST' }); } catch (err) { set({ error: (err as Error).message }); }
}

export async function discardJob(): Promise<void> {
  stopPolling();
  stopColourPolling();
  const j = state.job;
  set({ job: null });
  if (j) void api(`/image_to_3d/jobs/${j.id}`, { method: 'DELETE' }).catch(() => undefined);
}

// ---- results -----------------------------------------------------------------
export type MeshFormat = 'stl' | 'ply' | 'obj' | 'glb';
export const meshUrl = (job: JobInfo, fmt: MeshFormat, s: Settings = state.settings) =>
  `${API_BASE}/image_to_3d/jobs/${job.id}/mesh?format=${fmt}&size_mm=${encodeURIComponent(String(s.size))}&place=${s.place}&up=${encodeURIComponent(s.up)}&spin=${encodeURIComponent(String(s.spin))}&${finishQuery(s)}`;
export const pbrUrl = (job: JobInfo) => `${API_BASE}/image_to_3d/jobs/${job.id}/original.glb`;
export const cutoutUrl = (job: JobInfo) => `${API_BASE}/image_to_3d/jobs/${job.id}/cutout`;

/** The finished mesh as a binary STL (what the 3D Design viewport shows), moved by the X/Y/Z offset. */
export async function fetchMeshStl(): Promise<ArrayBuffer> {
  const j = state.job;
  if (!j || j.status !== 'succeeded') throw new Error('There is no finished model to add yet.');
  const res = await api(`/image_to_3d/jobs/${j.id}/mesh?${meshQuery()}`);
  const buf = await res.arrayBuffer();
  return translateStl(buf, state.settings.x, state.settings.y, state.settings.z);
}
const meshQuery = () => {
  const s = state.settings;
  return `format=stl&size_mm=${encodeURIComponent(String(s.size))}&place=${s.place}&up=${encodeURIComponent(s.up)}&spin=${encodeURIComponent(String(s.spin))}&${finishQuery(s)}`;
};

export function translateStl(buf: ArrayBuffer, dx: number, dy: number, dz: number): ArrayBuffer {
  if (!dx && !dy && !dz) return buf;
  const out = buf.slice(0);
  const dv = new DataView(out);
  const n = dv.getUint32(80, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;                      // skip the normal
    for (let v = 0; v < 3; v++) {
      const p = o + v * 12;
      dv.setFloat32(p, dv.getFloat32(p, true) + dx, true);
      dv.setFloat32(p + 4, dv.getFloat32(p + 4, true) + dy, true);
      dv.setFloat32(p + 8, dv.getFloat32(p + 8, true) + dz, true);
    }
  }
  return out;
}

export function abToB64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToAb(b64: string): ArrayBuffer {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}
