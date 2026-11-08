// "Engineering Analysis": a multi-physics CAE environment (structural, CFD / aerodynamics, civil, electrical, multiphysics).
// Pre-processing on the left, the FEA mesh / results viewport in the centre, post-processing and the report on the right.
// All modelling, drafting, render and CAM tools are deliberately absent.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Play, X, AlertTriangle } from 'lucide-react';
import { NAV_SCHEMES } from '../navigation';
import { parseStl } from '../cam/geometry';
import { CaeView, DEFAULT_OPTS, type PickInfo, type ViewInfo, type ViewOpts } from './CaeView';
import CaeLeft, { type Pending, type PickKind } from './CaeLeft';
import CaeRight from './CaeRight';
import CaeBottom, { type BottomTab } from './CaeBottom';
import { analysisSpec, defaultParams, type CaseInput, type Result } from './model';
import { SAMPLES, makeBody, sampleById } from './samples';
import { runCae, cancelCae } from './caeClient';
import { floodFace, loadGlyphs, pickEdge, pickPoint, regionHighlights, regionMarks, regionTris } from './regions';
import { prepare } from './prepare';
import { cmapCss, cmapRGB, fmtNum, type CmapId } from './colormaps';
import { buildReport, type ReportImage } from './reportModel';
import { renderPdf } from './reportPdf';
import { renderDocx } from './reportDocx';
import { ModelLinkBar, meshSummary, stlFingerprint } from '../modelLink';
import { BODY_COLORS, download, type LeftTab, type Probe, type RightTab, type Study, type V3 } from './caeUi';

interface Session {
  study: Study; left: LeftTab; right: RightTab; opts: ViewOpts; bottom: BottomTab; project: string; author: string;
  result: Result | null; resultInput: CaseInput | null; runKey: string; probes: Probe[]; projectFp: string;
}
// Survives switching workspaces (the component unmounts, the study and results should not).
let session: Session | null = null;
// Last "send to Analysis" request from 3D Design that this workspace has acted on (it remounts on every tab switch).
let seenPush = 0;

function studyFromSample(id: string, analysis?: Study['analysis']): Study {
  const smp = sampleById(id) ?? SAMPLES[0];
  const su = smp.build();
  return { name: smp.name, source: smp.id, analysis: analysis ?? su.analysis, bodies: su.bodies, regions: su.regions, loads: su.loads, mesh: su.mesh, params: su.params, customMats: [] };
}

function studyFromProject(stl: ArrayBuffer | null, name: string): Study | null {
  if (!stl || stl.byteLength <= 84) return null;
  try {
    const m = parseStl(stl);
    if (!m.n) return null;
    const nm = name || 'Project model';
    return { name: nm, source: 'project', analysis: 'static', bodies: [makeBody(nm, m, 'a36')], regions: [], loads: [], mesh: { preset: 'medium', cells: 48, size: 2 }, params: {}, customMats: [] };
  } catch { return null; }
}

/** Everything that changes the numerical answer (bulky triangle arrays are summarised by length). */
function studyKey(s: Study): string {
  return JSON.stringify([
    s.analysis, s.params[s.analysis] ?? {}, s.mesh,
    s.bodies.map((b) => [b.id, b.tris.length, b.mat, b.fibre, b.role, b.power, b.rjc, b.potential, b.magnet]),
    s.regions.map((r) => [r.id, r.kind, r.tris?.length, r.tris?.[0], r.bodyIndex, r.axis, r.side, r.box, r.segs?.length, r.segs?.[0], r.segs?.[r.segs.length - 1], r.pts?.length, r.pts?.[0], r.pts?.[r.pts.length - 1]]),
    s.loads.map((l) => [l.id, l.type, l.region, l.on, l.p]),
  ]);
}

async function addLegend(url: string, info: ViewInfo, cmap: CmapId, reverse: boolean): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('image')); img.src = url; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); if (!g) return url;
  g.drawImage(img, 0, 0);
  const W = c.width, H = c.height, bw = 24, bh = Math.round(H * 0.56), bx = W - 150, by = Math.round(H * 0.2);
  g.fillStyle = 'rgba(8,7,14,0.78)'; g.fillRect(bx - 14, by - 46, 142, bh + 70);
  g.fillStyle = '#e7e2f2'; g.font = 'bold 15px Helvetica, Arial, sans-serif';
  const title = `${info.label}${info.unit ? ` (${info.unit})` : ''}`;
  g.fillText(title.length > 20 ? title.slice(0, 19) + '…' : title, bx - 8, by - 22);
  const col = [0, 0, 0];
  for (let y = 0; y < bh; y++) {
    const t = 1 - y / (bh - 1);
    cmapRGB(cmap, reverse ? 1 - t : t, col);
    g.fillStyle = `rgb(${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)})`;
    g.fillRect(bx, by + y, bw, 1.5);
  }
  g.strokeStyle = '#8d86a3'; g.strokeRect(bx, by, bw, bh);
  g.font = '14px "Courier New", monospace'; g.fillStyle = '#d6cdef';
  for (let i = 0; i <= 5; i++) {
    const v = info.lo + ((info.hi - info.lo) * (5 - i)) / 5, y = by + (bh * i) / 5;
    g.fillText(fmtNum(v), bx + bw + 7, y + 5);
  }
  return c.toDataURL('image/jpeg', 0.92);
}

export default function CaeWorkspace({ stlData, projectName, onNavigate, pushNonce }: { stlData: ArrayBuffer | null; projectName: string; onNavigate: (label: string) => void; pushNonce: number }) {
  const hasProject = !!stlData && stlData.byteLength > 84;
  const fp = useMemo(() => stlFingerprint(stlData), [stlData]);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CaeView | null>(null);
  const [viewReady, setViewReady] = useState(false);
  const [webgl, setWebgl] = useState(true);

  const [study, setStudyState] = useState<Study>(() => session?.study ?? studyFromProject(stlData, projectName) ?? studyFromSample('bracket'));
  const [left, setLeft] = useState<LeftTab>(session?.left ?? 'study');
  const [right, setRight] = useState<RightTab>(session?.right ?? 'display');
  const [bottom, setBottom] = useState<BottomTab>(session?.bottom ?? 'summary');
  const [opts, setOptsState] = useState<ViewOpts>(session?.opts ?? DEFAULT_OPTS);
  const [info, setInfo] = useState<ViewInfo | null>(null);
  const [result, setResult] = useState<Result | null>(session?.result ?? null);
  const [resultInput, setResultInput] = useState<CaseInput | null>(session?.resultInput ?? null);
  const [runKey, setRunKey] = useState(session?.runKey ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [pickKind, setPickKindState] = useState<PickKind>('off');
  const [hover, setHover] = useState<{ segs: number[]; pts: number[] } | null>(null);
  const [pickAngle, setPickAngle] = useState(30);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selRegion, setSelRegion] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [probes, setProbes] = useState<Probe[]>(session?.probes ?? []);
  const [playing, setPlaying] = useState(false);
  const [project, setProject] = useState(session?.project ?? (projectName || 'Engineering study'));
  const [author, setAuthor] = useState(session?.author ?? '');
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [reportErr, setReportErr] = useState('');
  const [meshPreviewing, setMeshPreviewing] = useState(false);
  const [meshBusy, setMeshBusy] = useState(false);
  const [linkNote, setLinkNote] = useState('');
  const loadedFp = useRef(session?.projectFp ?? (study.source === 'project' ? fp : ''));

  const studyRef = useRef(study); studyRef.current = study;
  const optsRef = useRef(opts); optsRef.current = opts;
  const angleRef = useRef(pickAngle); angleRef.current = pickAngle;
  const pickKindRef = useRef(pickKind); pickKindRef.current = pickKind;
  const probesRef = useRef(probes); probesRef.current = probes;

  const setPickKind = useCallback((k: PickKind) => { setPickKindState(k); setPending(null); setHover(null); if (k !== 'off') setOptsState((o) => ({ ...o, mode: 'model' })); }, []);
  const setStudy = useCallback((f: (s: Study) => Study) => setStudyState((s) => f(s)), []);
  const setOpts = useCallback((p: Partial<ViewOpts>) => setOptsState((o) => ({ ...o, ...p })), []);
  const spec = analysisSpec(study.analysis);
  const key = useMemo(() => studyKey(study), [study]);
  const stale = !!result && runKey !== key;

  useEffect(() => { session = { study, left, right, opts, bottom, project, author, result, resultInput, runKey, probes, projectFp: loadedFp.current }; }, [study, left, right, opts, bottom, project, author, result, resultInput, runKey, probes]);

  // ---- viewport ---------------------------------------------------------------------------------
  useEffect(() => {
    if (!hostRef.current) return;
    let v: CaeView | null = null;
    try { v = new CaeView(hostRef.current); } catch { setWebgl(false); return; }
    viewRef.current = v;
    setViewReady(true);
    return () => { cancelCae(); v?.dispose(); viewRef.current = null; setViewReady(false); };
  }, []);

  useEffect(() => { const v = viewRef.current; if (v && viewReady) v.setBodies(study.bodies, study.bodies.map((_, i) => BODY_COLORS[i % BODY_COLORS.length])); }, [viewReady, study.bodies]);

  useEffect(() => {
    const v = viewRef.current; if (!v || !viewReady) return;
    const usable = spec.loads;
    const loads = study.loads.filter((l) => usable.includes(l.type));
    const hl = regionHighlights(study.regions, loads, study.bodies, pending ? { sets: [{ body: pending.body, tris: pending.tris }] } : null);
    const used = new Set(loads.filter((l) => l.on).map((l) => l.region));
    for (const r of study.regions) {
      if (used.has(r.id) && selRegion !== r.id) continue;
      for (const s of regionTris(r, study.bodies)) hl.push({ body: s.body, tris: s.tris, color: selRegion === r.id ? '#ffffff' : r.color });
    }
    v.setOverlay(hl, loadGlyphs(study.bodies, study.regions, loads.filter((l) => l.on)));
  }, [viewReady, study.bodies, study.regions, study.loads, spec, pending, selRegion]);

  // picked edges and points (applied ones in their load colour, the pending pick in yellow, the hover candidate in cyan)
  useEffect(() => {
    const v = viewRef.current; if (!v || !viewReady) return;
    v.setMarks(regionMarks(study.regions, study.loads.filter((l) => spec.loads.includes(l.type)), pending && pending.kind !== 'face' ? pending : null, selRegion, pickKind === 'edge' || pickKind === 'point' ? hover : null));
  }, [viewReady, study.bodies, study.regions, study.loads, spec, pending, selRegion, hover, pickKind]);

  useEffect(() => { const v = viewRef.current; if (v && viewReady) v.setResult(result); }, [viewReady, result]);
  useEffect(() => {
    const v = viewRef.current; if (!v || !viewReady) return;
    setInfo(v.apply(opts));
  }, [viewReady, opts, result]);
  useEffect(() => {
    const v = viewRef.current; if (!v || !viewReady) return;
    v.setProbes(probes.map((q, i) => ({ id: q.id, p: q.p, label: `P${i + 1}` })));
  }, [viewReady, probes, result]);

  useEffect(() => {
    const v = viewRef.current; if (!v || !viewReady) return;
    v.pickMode = probing && opts.mode === 'result' ? 'probe' : pickKind !== 'off' && left === 'loads' && opts.mode === 'model' ? pickKind : 'none';
    v.onFacePick = (body, tri, additive) => {
      const b = studyRef.current.bodies[body]; if (!b) return;
      const ids = floodFace(b.tris, tri, angleRef.current);
      setPending((prev) => (additive && prev && prev.kind === 'face' && prev.body === body ? { ...prev, tris: Array.from(new Set([...prev.tris, ...ids])) } : { kind: 'face', body, tris: ids, segs: [], pts: [], count: 1 }));
    };
    const candidate = (body: number, tri: number, p: V3): { segs: number[]; pts: number[] } | null => {
      const b = studyRef.current.bodies[body]; if (!b) return null;
      if (pickKindRef.current === 'edge') { const e = pickEdge(b.tris, tri, p, angleRef.current); return e ? { segs: e.segs, pts: [] } : null; }
      const q = pickPoint(b.tris, tri, p);
      return { segs: [], pts: q.p };
    };
    v.onGeomPick = (body, tri, p, additive) => {
      const c = candidate(body, tri, p); if (!c) return;
      const kind = pickKindRef.current === 'edge' ? 'edge' : 'point';
      setPending((prev) => (additive && prev && prev.kind === kind ? { ...prev, segs: [...prev.segs, ...c.segs], pts: [...prev.pts, ...c.pts], count: prev.count + 1 } : { kind, body, tris: [], segs: c.segs, pts: c.pts, count: 1 }));
    };
    let lastHover = '';
    v.onGeomHover = (h) => {
      const c = h ? candidate(h.body, h.tri, h.p) : null;
      const key = c ? `${c.segs.length}:${c.segs[0]}:${c.segs[c.segs.length - 1]}:${c.pts.join(',')}` : '';
      if (key === lastHover) return;
      lastHover = key; setHover(c);
    };
    v.onEmptyPick = () => setPending(null);
    v.onProbe = (i: PickInfo) => setProbes((list) => [...list, { id: Date.now() + list.length, p: i.p, value: i.value, label: i.label, unit: i.unit }].slice(-12));
  }, [viewReady, probing, pickKind, left, opts.mode]);

  useEffect(() => {
    if (!playing || !result?.frames.length) return;
    const n = result.frames.length;
    const t = setInterval(() => setOptsState((o) => ({ ...o, frame: (Math.max(-1, o.frame) + 1) % n })), 220);
    return () => clearInterval(t);
  }, [playing, result]);

  // ---- study actions ---------------------------------------------------------------------------
  const resetResults = useCallback(() => {
    setResult(null); setResultInput(null); setRunKey(''); setProbes([]); setPlaying(false); setPending(null); setSelRegion(null);
    setMeshPreviewing(false); viewRef.current?.setMeshPreview(null, null);
    setOptsState((o) => ({ ...DEFAULT_OPTS, cmap: o.cmap, mode: 'model' }));
  }, []);

  const onSample = useCallback((id: string, analysis?: Study['analysis']) => { cancelCae(); setBusy(null); setError(''); setStudyState(studyFromSample(id, analysis)); resetResults(); }, [resetResults]);

  /** Take the 3D Design model. `follow` keeps what still applies to the new geometry (material, analysis, mesh settings and the
   *  loads on planes, boxes and "whole part"); face picks and per-part regions cannot survive a geometry change and are cleared. */
  const adoptProject = useCallback((follow: boolean) => {
    if (!stlData) return;
    try {
      const m = parseStl(stlData);
      if (!m.n) throw new Error('no triangles');
      const nm = projectName || 'Project model';
      const s0 = studyRef.current;
      const old = follow && s0.source === 'project' ? s0.bodies[0] : undefined;
      const b = makeBody(nm, m, 'a36', old ? { mat: old.mat, fibre: old.fibre, role: old.role, power: old.power, rjc: old.rjc, potential: old.potential, magnet: old.magnet } : {});
      cancelCae(); setBusy(null); setError('');
      let note = '';
      if (!old) {
        setStudyState((s) => ({ ...s, name: nm, source: 'project', bodies: [b], regions: [], loads: [], mesh: { preset: 'medium', cells: 48, size: 2 }, params: {} }));
      } else {
        const regions = s0.regions.filter((r) => r.kind === 'plane' || r.kind === 'box' || r.kind === 'all');
        const gone = new Set(s0.regions.filter((r) => !regions.includes(r)).map((r) => r.id));
        const loads = s0.loads.filter((l) => !gone.has(l.region));
        if (gone.size) note = `model updated, ${s0.loads.length - loads.length} load/restraint${s0.loads.length - loads.length === 1 ? '' : 's'} on picked faces cleared`;
        else note = 'model updated';
        setStudyState((s) => ({ ...s, name: nm, bodies: [b], regions, loads }));
      }
      loadedFp.current = fp;
      resetResults();
      setLinkNote(note);
      if (note) setTimeout(() => setLinkNote(''), 9000);
    } catch { setError('The project model could not be read.'); }
  }, [stlData, projectName, fp, resetResults]);
  const onProject = useCallback(() => adoptProject(false), [adoptProject]);

  // The link is live: while the study uses the 3D Design model it follows every change made there.
  useEffect(() => {
    if (!fp || studyRef.current.source !== 'project' || fp === loadedFp.current) return;
    adoptProject(true);
  }, [fp, adoptProject]);

  // "Analyse" in 3D Design: use the current model (keeping the set-up if it already used the previous version).
  useEffect(() => {
    if (pushNonce <= seenPush) return;
    seenPush = pushNonce;
    if (!hasProject) return;
    if (studyRef.current.source === 'project' && fp === loadedFp.current) return;
    adoptProject(studyRef.current.source === 'project');
  }, [pushNonce, hasProject, fp, adoptProject]);

  const onUpload = useCallback(async (file: File) => {
    try {
      const m = parseStl(await file.arrayBuffer());
      if (!m.n) throw new Error('no triangles');
      const name = file.name.replace(/\.stl$/i, '');
      const b = makeBody(name, m, 'a36');
      cancelCae(); setBusy(null); setError('');
      setStudyState((s) => ({ ...s, name, source: 'upload', bodies: [b], regions: [], loads: [], mesh: { preset: 'medium', cells: 48, size: 2 }, params: {} }));
      resetResults();
    } catch { setError('That file could not be read as an STL (binary or ASCII).'); }
  }, [resetResults]);

  // ---- run -------------------------------------------------------------------------------------
  const onRun = useCallback(async () => {
    const s = studyRef.current;
    if (busy || !s.bodies.length) return;
    const input: CaseInput = { analysis: s.analysis, params: { ...defaultParams(s.analysis), ...(s.params[s.analysis] ?? {}) }, bodies: s.bodies, regions: s.regions, loads: s.loads, mesh: s.mesh };
    const k = studyKey(s);
    setBusy('Preparing the model…'); setProgress(0); setError(''); setPlaying(false);
    try {
      const res = await runCae(input, (p, label) => { setProgress(p); setBusy(label); });
      setResult(res); setResultInput(input); setRunKey(k); setProbes([]); setMeshPreviewing(false); viewRef.current?.setMeshPreview(null, null);
      const fos = Number(input.params.fosTarget ?? 1.5);
      setOptsState((o) => ({
        ...DEFAULT_OPTS, cmap: o.cmap, mode: 'result', field: res.defaultField, fosTarget: Number.isFinite(fos) ? fos : 1.5,
        modeIdx: res.modes.length && !res.disp ? 0 : -1, animate: res.modes.length > 0 && !res.disp,
        section: o.section, slice: { on: res.fields.find((f) => f.id === res.defaultField)?.domain === 'fluid' && !!res.grid, axis: 1, pos: 0.5 },
      }));
      setBottom('summary');
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== 'cancelled') setError(msg || 'The analysis failed.');
    } finally { setBusy(null); }
  }, [busy]);

  const onCancel = useCallback(() => { cancelCae(); setBusy(null); }, []);

  // ---- mesh preview ------------------------------------------------------------------------------
  const onPreviewMesh = useCallback(() => {
    const v = viewRef.current; const s = studyRef.current;
    if (!v || !s.bodies.length) return;
    setMeshBusy(true); setError('');
    setTimeout(() => {
      try {
        const input: CaseInput = { analysis: s.analysis, params: { ...defaultParams(s.analysis), ...(s.params[s.analysis] ?? {}) }, bodies: s.bodies, regions: s.regions, loads: s.loads, mesh: s.mesh };
        const P = prepare(input, { maxElems: 250000 });
        const colors = P.bodyOf.map((i) => (i >= 0 ? BODY_COLORS[i % BODY_COLORS.length] : '#88ccee'));
        v.setMeshPreview(P.g, P.g.mat, colors);
        setMeshPreviewing(true); setOpts({ mode: 'mesh' });
      } catch (e) { setError(`The mesh could not be built: ${(e as Error).message}`); }
      finally { setMeshBusy(false); }
    }, 40);
  }, [setOpts]);

  // ---- report ------------------------------------------------------------------------------------
  const onExport = useCallback(async (kind: 'pdf' | 'docx') => {
    const v = viewRef.current; const res = result; const input = resultInput;
    if (!v || !res || !input) return;
    setReportBusy(kind); setReportErr('');
    const saved = optsRef.current;
    const W = 1200, H = 720;
    try {
      await new Promise((r) => setTimeout(r, 30));
      const images: ReportImage[] = [];
      const shot = async (title: string, o: Partial<ViewOpts>, legend: boolean) => {
        const full: ViewOpts = { ...DEFAULT_OPTS, ...o };
        const inf = v.apply(full);
        let data = v.capture(W, H);
        if (legend && inf.field) data = await addLegend(data, inf, full.cmap, full.reverse);
        else if (legend && res.tri) data = await addLegend(data, inf, full.cmap, full.reverse);
        images.push({ title, data, w: W, h: H });
      };
      v.fit();
      if (res.grid && (res.matIndex || res.mask) && res.analysis !== 'windtunnel' && res.analysis !== 'internal' && res.analysis !== 'highspeed') {
        v.setMeshPreview(res.grid, (res.matIndex ?? res.mask)!, BODY_COLORS);
        await shot('mesh', { mode: 'mesh' }, false);
        v.setMeshPreview(null, null);
      }
      await shot('loads', { mode: 'model' }, false);
      const base: Partial<ViewOpts> = { mode: 'result', cmap: saved.cmap, fosTarget: saved.fosTarget, ghost: true, hotspots: true, markers: true };
      const df = res.fields.find((f) => f.id === res.defaultField);
      if (df || res.tri) {
        const modeIdx = res.modes.length && !res.disp ? 0 : -1;
        await shot(df ? `${df.label}${df.unit ? ` (${df.unit})` : ''}${modeIdx >= 0 ? `, ${res.modes[0].label}` : ''}` : `${res.tri!.label} (${res.tri!.unit})`, { ...base, field: res.defaultField, modeIdx, slice: { on: df?.domain === 'fluid' && !!res.grid, axis: 1, pos: 0.5 } }, true);
      }
      const fos = res.fields.find((f) => f.id === 'fos');
      if (fos && fos.id !== res.defaultField) await shot('Factor of safety map (red: below 1, amber: below the requirement, green: acceptable)', { ...base, field: 'fos', thresholdOn: true, dispFactor: 1 }, false);
      if (res.modes.length > 1) for (let i = 1; i < Math.min(3, res.modes.length); i++) await shot(`${res.modes[i].label}${res.modes[i].freq > 0 ? `, ${fmtNum(res.modes[i].freq)} Hz` : ''}`, { ...base, field: res.defaultField, modeIdx: i }, true);
      if (res.streams.length) await shot('Streamlines coloured by speed', { ...base, field: res.defaultField, streams: true, ghost: false }, true);
      v.apply(saved);
      v.fit();
      const fosTarget = Number(input.params.fosTarget ?? 1.5);
      const blocks = buildReport({ project, input, result: res, images, date: new Date(), fosTarget: Number.isFinite(fosTarget) ? fosTarget : 1.5, author: author || undefined });
      const base2 = `${(project || 'study').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'study'}_${res.analysis}_report`;
      const title = `${res.title} – ${project}`, footer = 'Faelyx AI CAE · automated report';
      if (kind === 'pdf') download(`${base2}.pdf`, renderPdf(blocks, { title, footer }), 'application/pdf');
      else download(`${base2}.docx`, renderDocx(blocks, { title, footer }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } catch (e) {
      setReportErr(`The report could not be created: ${(e as Error).message}`);
      v.apply(saved);
    } finally { setReportBusy(null); }
  }, [result, resultInput, project, author]);

  // ---- render ------------------------------------------------------------------------------------
  const lowIsBad = !!info?.field?.lowIsBad;
  const lastProbe = probes[probes.length - 1];
  const status = busy ? 'SOLVING…' : !result ? 'NO RESULTS YET' : stale ? 'OUT OF DATE' : result.verdict.pass === true ? 'PASS' : result.verdict.pass === false ? 'FAIL' : 'COMPLETE';
  const hint = pickKind !== 'off' && left === 'loads' && opts.mode === 'model';

  return (
    <main className="rx-shell cae-shell">
      <CaeLeft
        tab={left} setTab={setLeft} study={study} setStudy={setStudy} hasProject={hasProject} projectName={projectName}
        onSample={onSample} onProject={onProject} onUpload={onUpload}
        pickKind={pickKind} setPickKind={setPickKind} pickAngle={pickAngle} setPickAngle={setPickAngle}
        pending={pending} setPending={setPending} selRegion={selRegion} setSelRegion={setSelRegion}
        busy={busy} progress={progress} error={error} onRun={onRun} onCancel={onCancel} result={result} stale={stale}
        onPreviewMesh={onPreviewMesh} meshPreviewing={meshPreviewing} meshBusy={meshBusy}
      />

      <section className="rx-stage cae-stage">
        <div className="rx-topline">
          <span>{study.name.toUpperCase()} <b>/</b> {spec.short.toUpperCase()} <b>/</b> {spec.group.split(' ')[0].toUpperCase()}{result ? <> <b>/</b> {result.mesh.elements.toLocaleString('en-US')} ELEMENTS</> : null}</span>
          <span className={`rx-topline-r${status === 'FAIL' || status === 'OUT OF DATE' ? ' cam-bad' : ''}`}>{status}</span>
        </div>

        <ModelLinkBar state={!hasProject ? 'none' : study.source === 'project' ? 'linked' : 'available'} name={projectName || 'Project model'}
          detail={hasProject && study.source === 'project' ? meshSummary(study.bodies[0]?.tris) : undefined} note={linkNote}
          onUse={() => adoptProject(false)} onOpen={() => onNavigate('3D Design')} />

        <div className="cae-vp">
          <div className="cae-vp-host" ref={hostRef} />
          {!webgl && <div className="cam-empty"><AlertTriangle size={16} /> This browser could not start WebGL, so the 3D viewport is unavailable. Charts, tables and reports still work.</div>}

          <div className="cae-vp-tools">
            <button onClick={() => viewRef.current?.fit()} title="Fit (double middle-click)"><Maximize2 size={11} /></button>
            {(['iso', 'top', 'front', 'right'] as const).map((k) => <button key={k} onClick={() => viewRef.current?.view(k)}>{k === 'iso' ? 'ISO' : k.toUpperCase()}</button>)}
            <i />
            <button className={opts.mode === 'model' ? 'cam-flag-on' : ''} onClick={() => setOpts({ mode: 'model' })}>Model</button>
            <button className={opts.mode === 'mesh' ? 'cam-flag-on' : ''} onClick={() => { if (meshPreviewing) setOpts({ mode: 'mesh' }); else { setLeft('mesh'); onPreviewMesh(); } }}>Mesh</button>
            <button className={opts.mode === 'result' ? 'cam-flag-on' : ''} disabled={!result} onClick={() => setOpts({ mode: 'result' })}>Results</button>
            <span className="cae-grow" />
            {busy ? (
              <div className="cae-run-busy"><div><i style={{ width: `${Math.round(progress * 100)}%` }} /></div><span>{busy}</span><button onClick={onCancel}><X size={10} /> Cancel</button></div>
            ) : (
              <button className="cae-run" disabled={!study.bodies.length} onClick={onRun}><Play size={11} /> RUN {spec.short.toUpperCase()}</button>
            )}
          </div>

          {opts.mode === 'result' && result && info?.field && (
            <div className="cae-legend">
              <b title={info.label}>{info.label}</b><em>{info.unit}</em>
              <div className="cae-legend-bar"><i style={{ background: cmapCss(opts.cmap, opts.reverse) }} />
                <div>{[0, 1, 2, 3, 4, 5].map((k) => <span key={k}>{fmtNum(info.hi - ((info.hi - info.lo) * k) / 5)}</span>)}</div>
              </div>
              {lowIsBad && opts.field === 'fos' && opts.thresholdOn && <small>red &lt; 1 · amber &lt; {opts.fosTarget}</small>}
            </div>
          )}
          {opts.mode === 'result' && result && !info?.field && result.tri && (
            <div className="cae-legend"><b>{result.tri.label}</b><em>{result.tri.unit}</em><div className="cae-legend-bar"><i style={{ background: cmapCss(opts.cmap, opts.reverse) }} /><div>{[0, 1, 2, 3, 4, 5].map((k) => <span key={k}>{fmtNum(info ? info.hi - ((info.hi - info.lo) * k) / 5 : 0)}</span>)}</div></div></div>
          )}

          {opts.mode === 'result' && stale && <div className="cam-stale"><AlertTriangle size={11} /> The study changed since this run. Re-run to update the results.</div>}
          {hint && <div className="cam-prompt">{pickKind === 'face' ? 'Click a face' : pickKind === 'edge' ? 'Click near an edge' : 'Click a corner or a spot on the surface'} · Shift / Ctrl + click adds</div>}
          {probing && opts.mode === 'result' && <div className="cam-prompt">Probe: left-click the result to read a value</div>}
          {!study.bodies.length && <div className="cam-prompt">Pick a sample part, use the project model or upload an STL in the Study tab.</div>}
          {lastProbe && opts.mode === 'result' && <div className="cae-probe-badge">P{probes.length}: <b>{lastProbe.value === null ? '–' : `${fmtNum(lastProbe.value)} ${lastProbe.unit}`}</b> <small>{lastProbe.label}</small></div>}
          {opts.mode === 'result' && result && opts.modeIdx >= 0 && result.modes[opts.modeIdx] && <div className="cae-mode-badge">{result.modes[opts.modeIdx].label}{result.modes[opts.modeIdx].freq > 0 ? ` · ${fmtNum(result.modes[opts.modeIdx].freq)} Hz` : ''}</div>}
          {opts.mode === 'result' && result && opts.frame >= 0 && result.frames[opts.frame] && <div className="cae-mode-badge">{result.frames[opts.frame].label}</div>}
          {busy && <div className="cae-busy-veil" />}
          {error && !busy && <div className="cae-error"><AlertTriangle size={12} /> {error}<button onClick={() => setError('')}><X size={10} /></button></div>}
          <div className="rx-hint">{NAV_SCHEMES.universal.hints.slice(0, 5).join(' · ')}</div>
        </div>

        <div className="cae-bottom">
          <div className="rx-tabs cam-btabs">
            {(['summary', 'curves', 'tables', 'log'] as const).map((t) => (
              <button key={t} className={bottom === t ? 'rx-tab-on' : ''} onClick={() => setBottom(t)}>
                {t === 'summary' ? 'Summary' : t === 'curves' ? 'Charts' : t === 'tables' ? 'Tables' : 'Solver log'}
                {result && t === 'curves' && result.curves.length ? <small>{result.curves.length}</small> : null}
                {result && t === 'tables' && result.tables.length ? <small>{result.tables.length}</small> : null}
                {result && t === 'summary' && result.checks.some((c) => !c.ok) ? <small className="cam-bad">{result.checks.filter((c) => !c.ok).length}</small> : null}
              </button>
            ))}
          </div>
          <div className="cae-bbody"><CaeBottom result={result} tab={bottom} analysis={study.analysis} stale={stale} /></div>
        </div>
      </section>

      <CaeRight
        tab={right} setTab={setRight} result={result} stale={stale} opts={opts} setOpts={setOpts} info={info}
        probing={probing} setProbing={setProbing} probes={probes} removeProbe={(id) => setProbes((l) => l.filter((q) => q.id !== id))} clearProbes={() => setProbes([])}
        onFocus={(p: V3) => { setOpts({ mode: 'result' }); viewRef.current?.focus(p); }}
        playing={playing} setPlaying={setPlaying}
        project={project} setProject={setProject} author={author} setAuthor={setAuthor}
        reportBusy={reportBusy} reportErr={reportErr} onExport={onExport}
      />
    </main>
  );
}

