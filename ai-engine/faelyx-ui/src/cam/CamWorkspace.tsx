// "CAM & CNC": an AI-assisted Manufacturing workspace. Machine and process setup on the left,
// the digital twin and machine code in the centre, strategy / feeds / export on the right.
// All design tools (sketch, Pad, Pocket, Fillet…) and render controls are deliberately absent.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize2, Pencil, Eye, EyeOff, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Code2, Wrench, ListChecks, Info } from 'lucide-react';
import { NAV_SCHEMES } from '../navigation';
import { SAMPLE_PARTS, parseStl, rotateAC, type Mesh } from './geometry';
import { controllerById, printMaterialById, processById, stockMaterialById } from './camData';
import { type Cfg, defaultCfg, machineOf, resolvePart, UP_ROT } from './camConfig';
import { runCam, cancelChannel } from './camClient';
import type { AnyAnalysis, CamJob } from './camJobs';
import { type Res, type SimData } from './camTypes';
import { MillSim, TurnSim, eventLabel, type SimEvent, type SimReport } from './sim';
import { CamView, DEFAULT_FLAGS, type ViewFlags } from './camView';
import CamLeft, { type LeftTab } from './CamLeft';
import CamRight, { type RightTab } from './CamRight';
import CodeView from './CodeView';
import { fmtTime } from './camUi';
import { ModelLinkBar, meshSummary, stlFingerprint } from '../modelLink';

interface Session { cfg: Cfg; left: LeftTab; right: RightTab; upload: { name: string; mesh: Mesh } | null }
// Survives switching workspaces (the component unmounts, the setup should not).
let session: Session | null = null;
// Last "send to CAM" request from 3D Design that this workspace has acted on (it remounts on every tab switch).
let seenPush = 0;

type BottomTab = 'code' | 'issues' | 'ops';
const SPEEDS = [0.5, 1, 2, 4, 8, 16];

export default function CamWorkspace({ stlData, projectName, onNavigate, pushNonce }: { stlData: ArrayBuffer | null; projectName: string; onNavigate: (label: string) => void; pushNonce: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CamView | null>(null);
  const [cfg, setCfgState] = useState<Cfg>(session?.cfg ?? defaultCfg());
  const [left, setLeft] = useState<LeftTab>(session?.left ?? 'machine');
  const [right, setRight] = useState<RightTab>(session?.right ?? 'ai');
  const [upload, setUpload] = useState<Session['upload']>(session?.upload ?? null);
  const [bottom, setBottom] = useState<BottomTab>('code');
  const [flags, setFlags] = useState<ViewFlags>(DEFAULT_FLAGS);
  const [webgl, setWebgl] = useState(true);

  const setCfg = useCallback((f: (c: Cfg) => Cfg) => setCfgState((c) => f(c)), []);
  useEffect(() => { session = { cfg, left, right, upload }; }, [cfg, left, right, upload]);

  // ---- the part ----------------------------------------------------------------
  const hasProject = !!stlData && stlData.byteLength > 84;
  const fp = useMemo(() => stlFingerprint(stlData), [stlData]);
  const partKey = resolvePart(cfg, hasProject);
  // "Machine" in 3D Design: switch to the current model.
  useEffect(() => {
    if (pushNonce <= seenPush) return;
    seenPush = pushNonce;
    if (hasProject) setCfg((c) => (c.part === 'project' ? c : { ...c, part: 'project' }));
  }, [pushNonce, hasProject, setCfg]);
  const [mesh, partName] = useMemo((): [Mesh | null, string] => {
    try {
      if (partKey === 'project') return [stlData ? parseStl(stlData) : null, projectName || 'Project model'];
      if (partKey === 'upload') return [upload?.mesh ?? null, upload?.name ?? 'Uploaded STL'];
      const s = SAMPLE_PARTS.find((x) => x.id === partKey);
      return [s ? s.build() : null, s?.name ?? 'Sample part'];
    } catch { return [null, 'Unreadable model']; }
  }, [partKey, stlData, upload, projectName]);
  const mesh0 = mesh && mesh.n > 0 ? mesh : null;
  const shown = useMemo(() => {
    if (!mesh0) return null;
    const [a, c] = UP_ROT[cfg.up];
    return a || c ? rotateAC(mesh0, a, c) : mesh0;
  }, [mesh0, cfg.up]);

  const onUpload = useCallback(async (file: File) => {
    try {
      const m = parseStl(await file.arrayBuffer());
      if (!m.n) throw new Error('no triangles');
      setUpload({ name: file.name.replace(/\.stl$/i, ''), mesh: m });
      setCfg((c) => ({ ...c, part: 'upload' }));
    } catch { setError('That file could not be read as an STL (binary or ASCII).'); }
  }, [setCfg]);

  // ---- requests ------------------------------------------------------------------
  const machine = machineOf(cfg);
  const family: 'mill' | 'turn' | 'cut' | 'print' = machine.kind === 'additive' ? 'print' : cfg.process === 'turn' ? 'turn' : cfg.process === 'laser' || cfg.process === 'plasma' ? 'cut' : 'mill';
  const jobKey = useMemo(() => JSON.stringify([partKey, upload?.name, mesh0?.n, partKey === 'project' ? fp : '', cfg.machineId, cfg.machineId === 'custom' ? cfg.custom : 0, cfg.controller, cfg.process, cfg.stockMat, cfg.printMat, cfg.stock, cfg.mill, cfg.print, cfg.up, cfg.tools, cfg.allSides, cfg.sheetThickness, cfg.lineNumbers]), [cfg, partKey, upload, mesh0]);

  const buildJob = useCallback((op: 'analyse' | 'plan'): CamJob | null => {
    if (!mesh0) return null;
    const post = { lineNumbers: cfg.lineNumbers, comments: true };
    const m = machineOf(cfg);
    const stockMat = stockMaterialById(cfg.stockMat);
    const base = { mesh: mesh0, machine: m, controller: cfg.controller };
    if (family === 'mill') {
      const req = { ...base, process: cfg.process as 'mill3' | 'mill5i' | 'mill5s', material: stockMat, stock: cfg.stock, opts: cfg.mill, up: cfg.up, tools: cfg.tools, allSides: cfg.allSides };
      return op === 'analyse' ? { op, family, req } : { op, family, req, post };
    }
    if (family === 'turn') {
      const req = { ...base, material: stockMat, stock: cfg.stock };
      return op === 'analyse' ? { op, family, req } : { op, family, req, post };
    }
    if (family === 'cut') {
      const req = { ...base, process: cfg.process as 'laser' | 'plasma', material: stockMat, stock: cfg.stock, thicknessOverride: cfg.sheetThickness > 0 ? cfg.sheetThickness : undefined };
      return op === 'analyse' ? { op, family, req } : { op, family, req, post };
    }
    const req = { ...base, process: cfg.process as 'fdm' | 'sla' | 'sls' | 'dmls', material: printMaterialById(cfg.printMat), s: cfg.print, up: cfg.up };
    return op === 'analyse' ? { op, family, req } : { op, family, req, post };
  }, [cfg, mesh0, family]);

  // ---- live AI analysis ------------------------------------------------------------
  const [analysis, setAnalysis] = useState<AnyAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisErr, setAnalysisErr] = useState('');
  useEffect(() => {
    const job = buildJob('analyse');
    if (!job) { setAnalysis(null); return; }
    setAnalysing(true); setAnalysisErr('');
    let alive = true;
    const t = setTimeout(() => {
      runCam(job, 'analyse').then((r) => { if (alive && r.op === 'analyse') { setAnalysis(r.analysis); setAnalysing(false); } })
        .catch((e: Error) => { if (alive && e.message !== 'cancelled') { setAnalysisErr(e.message); setAnalysing(false); } });
    }, 400);
    return () => { alive = false; clearTimeout(t); cancelChannel('analyse'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobKey]);

  // ---- generate ---------------------------------------------------------------------
  const [res, setRes] = useState<Res | null>(null);
  const [simData, setSimData] = useState<SimData | null>(null);
  const [genKey, setGenKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const token = useRef(0);
  const simsRef = useRef<MillSim[]>([]);
  const turnRef = useRef<TurnSim | null>(null);
  const [setup, setSetup] = useState(0);
  const stale = !!res && genKey !== jobKey;

  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const speedRef = useRef(2); speedRef.current = speed;

  const generate = useCallback(async () => {
    const job = buildJob('plan');
    if (!job || job.op !== 'plan') { setError('There is no model to machine yet. Pick a sample part or open an STL.'); return; }
    const my = ++token.current;
    setPlaying(false); setBusy('Analysing the part and planning toolpaths…'); setProgress(0.04); setError('');
    const tick = setInterval(() => setProgress((p) => Math.min(0.5, p + 0.012)), 250);
    try {
      const r = await runCam(job, 'plan');
      clearInterval(tick);
      if (token.current !== my || r.op !== 'plan') return;
      let out: Res;
      const data: SimData = { events: [], reports: [] };
      simsRef.current = []; turnRef.current = null;
      if (r.family === 'print') {
        out = { kind: 'print', print: r.print, post: r.post, analysis: r.analysis, ms: r.ms };
        for (const o of r.print.overhangs) {
          const seg = r.print.layers[Math.min(o.layer, r.print.layers.length - 1)]?.segStart ?? 0;
          data.events.push({ cmd: seg, kind: 'overhang', severity: o.supported ? 'warn' : 'error', setup: 0, x: o.x, y: o.y, z: o.z,
            msg: `${o.supported ? 'Supported' : 'Unsupported'} overhang of ${o.area.toFixed(1)} mm² at layer ${o.layer + 1}.` });
        }
      } else if (r.family === 'mill') {
        out = { kind: 'mill', program: r.program, post: r.post, analysis: r.analysis!, ms: r.ms };
        setBusy('Simulating stock removal and checking for collisions…');
        for (let i = 0; i < r.program.sims.length; i++) {
          const sim = new MillSim(r.program, i);
          const rep = await sim.runAll((f) => { if (token.current === my) setProgress(0.5 + 0.5 * ((i + f) / r.program.sims.length)); });
          if (token.current !== my) return;
          simsRef.current.push(sim); data.reports.push(rep); data.events.push(...rep.events);
        }
      } else if (r.family === 'turn') {
        out = { kind: 'turn', program: r.program, post: r.post, ms: r.ms };
        setBusy('Simulating the turning cycle…');
        const ts = new TurnSim(r.program);
        const rep = await ts.runAll((f) => { if (token.current === my) setProgress(0.5 + 0.5 * f); });
        if (token.current !== my) return;
        turnRef.current = ts; data.reports.push(rep); data.events.push(...rep.events);
      } else {
        out = { kind: 'cut', program: r.program, post: r.post, ms: r.ms };
      }
      // the posted text is the starting point of the editor
      setRes(out); setSimData(data); setGenKey(jobKey); setSetup(0); setEdited(null); setEditing(false);
      const start = out.kind === 'mill' ? out.program.sims[0]?.startCmd ?? 0 : 0;
      posRef.current = start; setPos(start);
      setBottom(data.events.some((e) => e.severity === 'error') ? 'issues' : 'code');
    } catch (e) {
      clearInterval(tick);
      if ((e as Error).message !== 'cancelled' && token.current === my) setError(`Planning failed: ${(e as Error).message}`);
    } finally {
      clearInterval(tick);
      if (token.current === my) { setBusy(null); setProgress(0); }
    }
  }, [buildJob, jobKey]);

  const cancel = useCallback(() => { token.current++; cancelChannel('plan'); setBusy(null); setProgress(0); }, []);

  // ---- code text -----------------------------------------------------------------------
  const [edited, setEdited] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [follow, setFollow] = useState(true);
  const lines = useMemo(() => (res ? res.post.lines : []), [res]);
  const codeText = edited ?? (res ? res.post.text : '');

  // ---- playback -----------------------------------------------------------------------
  const range = useMemo((): { a: number; b: number } => {
    if (!res) return { a: 0, b: 0 };
    if (res.kind === 'mill') { const s = res.program.sims[setup]; return { a: s.startCmd, b: s.endCmd }; }
    if (res.kind === 'print') return { a: 0, b: res.print.segCount };
    return { a: 0, b: res.program.cmds.length };
  }, [res, setup]);
  const rangeRef = useRef(range); rangeRef.current = range;
  const resRef = useRef<Res | null>(null); resRef.current = res;
  const setupRef = useRef(0); setupRef.current = setup;

  const applyPos = useCallback((p: number) => {
    const v = viewRef.current, r = resRef.current;
    if (!v || !r) return;
    const i = Math.floor(p);
    if (r.kind === 'mill') { const sim = simsRef.current[setupRef.current]; if (sim) { sim.seek(i); v.updateMill(sim); } }
    else if (r.kind === 'turn') { const sim = turnRef.current; if (sim) { sim.seek(i); v.updateTurn(sim); } }
    else if (r.kind === 'cut') v.updateCut(i, r.program);
    else v.updatePrint(i);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), lastUi = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      const { a, b } = rangeRef.current;
      posRef.current = Math.min(b, posRef.current + ((b - a) / 60) * speedRef.current * dt);
      applyPos(posRef.current);
      if (t - lastUi > 90) { lastUi = t; setPos(posRef.current); }
      if (posRef.current >= b) {
        setPos(b);
        const r = resRef.current;
        if (r && r.kind === 'mill' && setupRef.current + 1 < r.program.sims.length) {
          const ns = setupRef.current + 1;
          posRef.current = r.program.sims[ns].startCmd; setupRef.current = ns; setSetup(ns); setPos(posRef.current);
          raf = requestAnimationFrame(tick); return;
        }
        setPlaying(false); return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, applyPos]);

  const scrub = useCallback((p: number) => { posRef.current = p; setPos(p); applyPos(p); }, [applyPos]);
  const togglePlay = () => {
    if (!res) return;
    if (!playing && posRef.current >= range.b - 1) { const r0 = res.kind === 'mill' ? res.program.sims[0].startCmd : 0; setSetup(0); setupRef.current = 0; posRef.current = r0; }
    setPlaying((p) => !p);
  };

  // ---- 3D view --------------------------------------------------------------------------
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    try {
      const v = new CamView(host);
      viewRef.current = v;
      v.onPick = (i) => { setBottom('issues'); setSelEvt(i); };
      return () => { v.dispose(); viewRef.current = null; };
    } catch { setWebgl(false); return undefined; }
  }, []);
  const [selEvt, setSelEvt] = useState<number | null>(null);

  // content: part preview until a plan exists, the digital twin afterwards
  useEffect(() => {
    const v = viewRef.current; if (!v) return;
    if (!res) {
      const outline = analysis && analysis.family === 'mill' ? analysis.a.stockBox : undefined;
      v.showPart(shown, outline);
      return;
    }
    const events = simData?.events ?? [];
    if (res.kind === 'mill') v.showMill(res.program, setup, events);
    else if (res.kind === 'print') v.showPrint(res.print, events, shown);
    else if (res.kind === 'turn') v.showTurn(res.program, events);
    else v.showCut(res.program);
    v.setFlags(flags);
    applyPos(posRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, setup, simData, res ? 0 : shown, res ? 0 : analysis]);
  useEffect(() => { viewRef.current?.setFlags(flags); }, [flags]);

  // ---- code <-> simulation ------------------------------------------------------------
  const cmdLine = res?.post.cmdLine;
  const curIdx = Math.max(0, Math.min((cmdLine?.length ?? 1) - 1, Math.floor(pos) - 1));
  const activeLine = cmdLine ? cmdLine[curIdx] ?? 0 : 0;
  const flagMap = useMemo(() => {
    const m = new Map<number, 'error' | 'warn'>();
    if (!cmdLine || !simData) return m;
    for (const e of simData.events) { const l = cmdLine[Math.min(e.cmd, cmdLine.length - 1)]; if (l !== undefined && m.get(l) !== 'error') m.set(l, e.severity); }
    return m;
  }, [cmdLine, simData]);

  const gotoCmd = useCallback((cmd: number, setupIdx?: number) => {
    const r = resRef.current; if (!r) return;
    let target = cmd;
    if (r.kind === 'mill') {
      let si = setupIdx ?? r.program.sims.findIndex((s) => cmd >= s.startCmd && cmd < s.endCmd);
      if (si < 0) si = setupRef.current;
      if (si !== setupRef.current) { setupRef.current = si; setSetup(si); }
      const s = r.program.sims[si];
      target = Math.max(s.startCmd, Math.min(s.endCmd, cmd));
    }
    setPlaying(false); posRef.current = target; setPos(target);
    // when the set-up changes the effect rebuilds the view and applies posRef
    if (r.kind !== 'mill' || setupIdx === undefined || setupIdx === setupRef.current) applyPos(target);
  }, [applyPos]);

  const pickLine = useCallback((line: number) => {
    if (!cmdLine) return;
    let lo = 0, hi = cmdLine.length - 1, ans = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (cmdLine[mid] <= line) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    gotoCmd(ans + 1);
  }, [cmdLine, gotoCmd]);

  // ---- readouts --------------------------------------------------------------------------
  const op = useMemo(() => {
    if (!res || res.kind === 'print') return null;
    const i = Math.floor(pos);
    return res.program.ops.find((o) => i >= o.startCmd && i < o.endCmd) ?? null;
  }, [res, pos]);
  const printRes = res && res.kind === 'print' ? res.print : null;
  const layerNo = printRes ? (() => {
    const L = printRes.layers, i = Math.floor(pos);
    let lo = 0, hi = L.length - 1, a = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (L[mid].segStart <= i) { a = mid; lo = mid + 1; } else hi = mid - 1; }
    return a;
  })() : 0;
  const pose = res?.kind === 'mill' ? simsRef.current[setup]?.pose : null;
  const frac = range.b > range.a ? (pos - range.a) / (range.b - range.a) : 0;
  const totalMin = res ? (res.kind === 'print' ? res.print.time / 60 : res.program.totalTime) : 0;

  const errCount = simData?.events.filter((e) => e.severity === 'error').length ?? 0;
  const warnCount = (simData?.events.length ?? 0) - errCount;
  const ctrl = controllerById(cfg.controller);
  const material = machine.kind === 'additive' ? printMaterialById(cfg.printMat).name : stockMaterialById(cfg.stockMat).name;
  const sim3d = res && res.kind !== 'cut';
  const flagBtn = (k: keyof ViewFlags, label: string, show = true) => show && (
    <button key={k} className={`cam-flag${flags[k] ? ' cam-flag-on' : ''}`} onClick={() => setFlags((f) => ({ ...f, [k]: !f[k] }))}>{flags[k] ? <Eye size={10} /> : <EyeOff size={10} />}{label}</button>
  );

  return (
    <main className="rx-shell cam-shell">
      <CamLeft tab={left} setTab={setLeft} cfg={cfg} setCfg={setCfg} hasProject={hasProject} partMesh={mesh0} partName={partName} onUpload={onUpload} />

      <section className="rx-stage cam-stage">
        <div className="rx-topline">
          <span>{machine.brand.toUpperCase()} {machine.model.toUpperCase()} <b>/</b> {processById(cfg.process).short.toUpperCase()} <b>/</b> {ctrl.name.split(' (')[0].toUpperCase()} <b>/</b> {material.toUpperCase()}</span>
          <span className={`rx-topline-r${errCount ? ' cam-bad' : ''}`}>
            {busy ? 'WORKING…' : !res ? 'NO PLAN YET' : stale ? 'OUT OF DATE' : errCount ? `${errCount} PROBLEM${errCount === 1 ? '' : 'S'}` : warnCount ? `${warnCount} WARNING${warnCount === 1 ? '' : 'S'}` : 'SIMULATION CLEAN'}
          </span>
        </div>

        <ModelLinkBar state={!hasProject ? 'none' : partKey === 'project' ? 'linked' : 'available'} name={projectName || 'Project model'}
          detail={partKey === 'project' ? meshSummary(mesh0?.tris) : undefined} note={stale && partKey === 'project' ? 'model changed, regenerate the toolpaths' : undefined}
          onUse={() => setCfg((c) => ({ ...c, part: 'project' }))} onOpen={() => onNavigate('3D Design')} />

        <div className="cam-vp">
          <div className="cam-vp-host" ref={hostRef} />
          {!webgl && <div className="cam-empty"><AlertTriangle size={16} /> This browser could not start WebGL, so the 3D digital twin is unavailable. Toolpaths, G-code and exports still work.</div>}
          <div className="cam-vp-tools">
            <button onClick={() => viewRef.current?.fit()} title="Fit (F or double middle-click)"><Maximize2 size={11} /></button>
            {(['iso', 'top', 'front', 'right'] as const).map((k) => <button key={k} onClick={() => viewRef.current?.view(k)}>{k === 'iso' ? 'ISO' : k.toUpperCase()}</button>)}
            <i />
            {flagBtn('path', 'Path')}
            {flagBtn('rapids', 'Rapids', !!res && res.kind !== 'print')}
            {flagBtn('travel', 'Travel', res?.kind === 'print')}
            {flagBtn('fixtures', 'Fixtures', res?.kind === 'mill' || res?.kind === 'turn')}
            {flagBtn('part', res?.kind === 'print' ? 'Part' : 'Target', !!res && res.kind !== 'cut')}
            {flagBtn('tool', res?.kind === 'print' ? 'Nozzle' : 'Tool', !!res)}
            {flagBtn('markers', 'Issues', !!simData && simData.events.length > 0)}
          </div>

          {res && stale && <div className="cam-stale"><Info size={11} /> Settings changed since this plan. Regenerate to update the simulation and code.</div>}
          {!res && !busy && <div className="cam-prompt">Choose a machine, process and material, then press <b>GENERATE</b> in the AI Strategy tab.</div>}

          {res && (
            <div className="cam-readout">
              {res.kind === 'print' ? (
                <>
                  <b>Layer {layerNo + 1} / {res.print.layers.length}</b>
                  <span>Z {(res.print.layers[layerNo]?.z ?? 0).toFixed(2)} mm</span>
                  <span>{fmtTime(totalMin * frac)} of {fmtTime(totalMin)}</span>
                </>
              ) : (
                <>
                  <b>{op ? op.name : 'Setup'}</b>
                  {op && <span>{op.toolName}</span>}
                  {op && <span>{Math.round(op.rpm).toLocaleString()} rpm · {Math.round(op.feed).toLocaleString()} {res.kind === 'turn' ? 'mm/rev' : 'mm/min'}</span>}
                  {pose && <span className="cam-mono">X{pose.x.toFixed(2)} Y{pose.y.toFixed(2)} Z{pose.z.toFixed(2)} · {pose.mode === 'rapid' ? 'RAPID' : 'FEED'}</span>}
                  <span>{fmtTime(totalMin * (res.kind === 'mill' ? (pos - res.program.sims[0].startCmd) / Math.max(1, res.program.sims[res.program.sims.length - 1].endCmd - res.program.sims[0].startCmd) : frac))} of {fmtTime(totalMin)}</span>
                </>
              )}
            </div>
          )}

          {res && res.kind === 'mill' && (
            <div className="cam-setups">
              {res.program.sims.map((s, i) => (
                <button key={i} className={i === setup ? 'cam-setup-on' : ''} onClick={() => gotoCmd(s.startCmd, i)}>{s.name}{s.a || s.c ? ` · A${s.a} C${s.c}` : ''}</button>
              ))}
            </div>
          )}

          {res && res.kind === 'mill' && (
            <div className="cam-legend">
              <span><i style={{ background: '#939aab' }} />stock</span><span><i style={{ background: '#ebad60' }} />to remove</span>
              <span><i style={{ background: '#8cc7f2' }} />near size</span><span><i style={{ background: '#4dd1b8' }} />finished</span><span><i style={{ background: '#ff2e40' }} />gouge</span>
            </div>
          )}
          {res && res.kind === 'print' && (
            <div className="cam-legend">
              {[['Outer wall', '#39b6ff'], ['Inner wall', '#2a7fd4'], ['Skin', '#e8c54a'], ['Infill', '#57d17a'], ['Support', '#b36cf0'], ['Skirt', '#888899']].map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}
              <span><i style={{ background: '#ff3b54' }} />unsupported</span>
            </div>
          )}
          <div className="rx-hint">{NAV_SCHEMES.universal.hints.slice(0, 5).join(' · ')}</div>
        </div>

        <div className="cam-play">
          <button onClick={() => gotoCmd(range.a)} disabled={!res} title="To start"><SkipBack size={12} /></button>
          <button className="cam-play-main" onClick={togglePlay} disabled={!res}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
          <button onClick={() => gotoCmd(range.b)} disabled={!res} title="To end"><SkipForward size={12} /></button>
          <button onClick={() => { const e = nextEvent(simData?.events ?? [], Math.floor(pos), -1, res?.kind === 'mill' ? setup : undefined); if (e) gotoCmd(e.cmd, e.setup); }} disabled={!simData?.events.length} title="Previous issue"><ChevronLeft size={12} /></button>
          <button onClick={() => { const e = nextEvent(simData?.events ?? [], Math.floor(pos), 1, res?.kind === 'mill' ? setup : undefined); if (e) gotoCmd(e.cmd, e.setup); }} disabled={!simData?.events.length} title="Next issue"><ChevronRight size={12} /></button>
          <input type="range" className="cam-scrub" min={range.a} max={Math.max(range.a + 1, range.b)} step={1} value={Math.min(Math.max(pos, range.a), range.b)} disabled={!res}
            onChange={(e) => { setPlaying(false); scrub(Number(e.target.value)); }} aria-label="Simulation position" />
          <span className="cam-pct">{Math.round(frac * 100)}%</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select>
        </div>

        <div className="cam-bottom">
          <div className="rx-tabs cam-btabs">
            <button className={bottom === 'code' ? 'rx-tab-on' : ''} onClick={() => setBottom('code')}><Code2 size={11} /> {ctrl.family === 'cnc' ? 'G-code' : 'G-code'} {res ? <small>{lines.length.toLocaleString()} lines</small> : null}</button>
            <button className={bottom === 'issues' ? 'rx-tab-on' : ''} onClick={() => setBottom('issues')}><AlertTriangle size={11} /> Issues {simData && simData.events.length > 0 ? <small className={errCount ? 'cam-bad' : ''}>{simData.events.length}</small> : null}</button>
            <button className={bottom === 'ops' ? 'rx-tab-on' : ''} onClick={() => setBottom('ops')}><ListChecks size={11} /> Operations {res && res.kind !== 'print' ? <small>{res.program.ops.length}</small> : null}</button>
            <span className="cam-grow" />
            {bottom === 'code' && res && (
              <>
                <label className="cam-chk"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow</label>
                <button className={`cam-edit${editing ? ' cam-edit-on' : ''}`} onClick={() => setEditing((v) => !v)}><Pencil size={10} /> {editing ? 'Done' : 'Edit'}</button>
                {edited !== null && <button className="cam-edit" onClick={() => { setEdited(null); setEditing(false); }}>Reset</button>}
              </>
            )}
          </div>
          <div className="cam-bbody">
            {bottom === 'code' && (res
              ? <CodeView lines={edited !== null ? edited.split('\n') : lines} active={activeLine} flags={flagMap} follow={follow} editing={editing} onPick={pickLine} onEdit={setEdited} />
              : <div className="cam-empty-code"><Code2 size={16} /> Machine-ready code appears here after GENERATE: colour-coded, synchronised with the simulation, and editable.</div>)}
            {bottom === 'issues' && <IssueList events={simData?.events ?? []} res={res} reports={simData?.reports ?? []} sel={selEvt} onPick={(i, e) => { setSelEvt(i); gotoCmd(e.cmd, e.setup); }} />}
            {bottom === 'ops' && <OpList res={res} pos={pos} onPick={(c) => gotoCmd(c)} />}
          </div>
        </div>
        {!sim3d && res && res.kind === 'cut' && <div className="cam-note-cut">Sheet cutting is shown as path progress. Collisions are not simulated for laser / plasma.</div>}
      </section>

      <CamRight tab={right} setTab={setRight} cfg={cfg} setCfg={setCfg} analysis={analysis} analysing={analysing} analysisErr={analysisErr}
        res={res} stale={stale} sim={simData} busy={busy} progress={progress} error={error} onGenerate={generate} onCancel={cancel}
        codeText={codeText} edited={edited !== null} partName={partName} mesh={shown} />
    </main>
  );
}

function nextEvent(ev: SimEvent[], cur: number, dir: 1 | -1, setup?: number): SimEvent | null {
  const list = [...ev].sort((a, b) => a.cmd - b.cmd);
  if (!list.length) return null;
  if (dir > 0) return list.find((e) => e.cmd > cur + 1 && (setup === undefined || e.setup >= setup)) ?? list[0];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].cmd < cur - 1) return list[i];
  return list[list.length - 1];
}

function IssueList({ events, res, reports, sel, onPick }: { events: SimEvent[]; res: Res | null; reports: SimReport[]; sel: number | null; onPick: (i: number, e: SimEvent) => void }) {
  if (!res) return <div className="cam-empty-code"><AlertTriangle size={16} /> Collisions, rapid-move crashes, gouges and unsupported overhangs are listed here after the simulation.</div>;
  if (!events.length) {
    return (
      <div className="cam-empty-code cam-ok"><CheckCircle2 size={16} />
        {res.kind === 'cut' ? 'Cutting paths are not collision-checked; review the lead-ins and cut order in the viewport.' : 'No collisions, rapid-move crashes, gouges or unsupported overhangs were found.'}
        {reports.length > 0 && res.kind === 'mill' && <span>Left-over stock per set-up: {reports.map((r) => `${(r.leftoverVolume / 1000).toFixed(2)} cm³`).join(' · ')}</span>}
      </div>
    );
  }
  return (
    <div className="cam-issues">
      {events.map((e, i) => (
        <button key={i} className={`cam-issue${sel === i ? ' cam-issue-on' : ''}`} onClick={() => onPick(i, e)}>
          <i className={`cam-sev cam-sev-${e.severity}`} />
          <b>{eventLabel(e.kind)}</b><span>{e.msg}</span><small>{res.kind === 'mill' ? `${res.program.sims[e.setup]?.name ?? ''} · ` : ''}cmd {e.cmd}</small>
        </button>
      ))}
    </div>
  );
}

function OpList({ res, pos, onPick }: { res: Res | null; pos: number; onPick: (cmd: number) => void }) {
  if (!res) return <div className="cam-empty-code"><Wrench size={16} /> The operation sequence appears here after GENERATE.</div>;
  if (res.kind === 'print') {
    return (
      <div className="cam-issues">
        {res.print.layers.filter((_, i) => i % Math.max(1, Math.round(res.print.layers.length / 40)) === 0).map((l) => (
          <button key={l.n} className={`cam-issue${pos >= l.segStart && pos < l.segEnd ? ' cam-issue-on' : ''}`} onClick={() => onPick(l.segStart)}>
            <b>Layer {l.n + 1}</b><span>Z {l.z.toFixed(2)} mm · {l.areaMm2.toFixed(0)} mm² · {fmtTime(l.timeS / 60)}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="cam-issues">
      {res.program.ops.map((o, i) => (
        <button key={i} className={`cam-issue${pos >= o.startCmd && pos < o.endCmd ? ' cam-issue-on' : ''}`} onClick={() => onPick(o.startCmd)}>
          <b>{i + 1}. {o.name}</b><span>{o.toolName} · {Math.round(o.rpm).toLocaleString()} rpm · {fmtTime(o.time)}</span><small>{o.strategy}</small>
        </button>
      ))}
    </div>
  );
}
