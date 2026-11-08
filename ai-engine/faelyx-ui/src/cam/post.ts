// Post-processors: turn the neutral toolpath IR into controller dialects.
//   CNC:      Fanuc, Haas, Mazak (EIA/ISO), Siemens 840D (MPF), Heidenhain Klartext, LinuxCNC / PathPilot
//   Printers: Marlin, Klipper, Bambu-style (Marlin compatible), neutral scan-vector G-code
// Every post returns the text plus a map from IR index to first output line, so the viewer can follow
// the simulation.

import { controllerById, type PrintSettings, type PrintMaterial } from './camData';
import { type Program, type Cmd } from './toolpath';
import { type PrintProgram, FLAG_RETRACT, FLAG_HOP, PT, PT_NAMES } from './printPlan';

export interface PostResult { text: string; lines: string[]; cmdLine: Int32Array; ext: string; mime: string; dialect: string }
export interface PostOptions { lineNumbers?: boolean; programNo?: number; comments?: boolean; now?: Date }

const ascii = (t: string) => t.replace(/Ø/g, 'D').replace(/[·•]/g, '-').replace(/−/g, '-').replace(/α|Α/g, 'a').replace(/₂/g, '2').normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
const trim = (v: number, d = 3) => {
  const s = v.toFixed(d);
  return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
};

class Out {
  lines: string[] = [];
  private n = 0;
  constructor(private numbered: boolean, private step = 10, private fmt: (n: number, s: string) => string = (n, s) => `N${n} ${s}`) {}
  add(s: string, number = true) {
    if (this.numbered && number && s && !s.startsWith('(') && !s.startsWith(';') && !s.startsWith('%') && s !== 'M30' ) { this.n += this.step; this.lines.push(this.fmt(this.n, s)); }
    else this.lines.push(s);
  }
  get length() { return this.lines.length; }
}

// ---------------------------------------------------------------------------
// CNC milling / turning / cutting

export function postCnc(p: Program, opts: PostOptions = {}): PostResult {
  const ctrl = controllerById(p.controller);
  const numbered = opts.lineNumbers ?? ctrl.lineNumbers;
  const cm = opts.comments !== false;
  const dia = p.controller;
  const cmdLine = new Int32Array(p.cmds.length).fill(0);
  const progNo = opts.programNo ?? 1001;
  const now = opts.now ?? new Date();
  const out = new Out(numbered && dia !== 'heidenhain', 10);
  const comment = (t: string) => {
    const s = ascii(t).replace(/[()]/g, '');
    if (dia === 'siemens') return `; ${s}`;
    if (dia === 'heidenhain') return `; ${s}`;
    return `(${s.toUpperCase().slice(0, 70)})`;
  };
  const C = (t: string) => { if (cm) out.add(comment(t), false); };
  const isFan = dia === 'fanuc' || dia === 'haas' || dia === 'mazak';
  const num = (v: number) => (isFan ? (Number.isInteger(v) ? v.toFixed(1).replace(/0$/, '') : trim(v)) : trim(v));
  const word = (c: string, v: number | undefined, last: { [k: string]: number | undefined }, force = false) => {
    if (v === undefined) return '';
    if (!force && last[c] !== undefined && Math.abs((last[c] as number) - v) < 1e-5) return '';
    last[c] = v; return ` ${c}${num(v)}`;
  };
  const stockBox = p.sims[0]?.stockBox;
  const isTurn = p.kind === 'turn', isCut = p.kind === 'cut';
  const name = p.name;
  const tools = p.tools;

  // ---- Heidenhain has its own structure
  if (dia === 'heidenhain') return postHeidenhain(p, opts, cmdLine, comment);

  // ---- header
  if (isFan) out.add('%', false);
  if (dia === 'siemens') {
    out.add(`; ${name} - Faelyx CAM`, false);
    out.add(`; ${ascii(p.machine.brand + ' ' + p.machine.model)} - ${ctrl.name}`, false);
  } else if (dia === 'linuxcnc') {
    out.add('%', false);
    out.add(`(${name} - FAELYX CAM)`, false);
  } else {
    out.add(`O${String(progNo).padStart(4, '0')} (${name})`, false);
  }
  if (cm) {
    if (dia === 'siemens') {
      out.add(`; Machine: ${ascii(p.machine.brand + ' ' + p.machine.model)}`, false);
      out.add(`; Date: ${now.toISOString().slice(0, 10)}`, false);
      if (stockBox) out.add(`; Stock: ${trim(stockBox.x1 - stockBox.x0, 1)} x ${trim(stockBox.y1 - stockBox.y0, 1)} x ${trim(stockBox.zTop - stockBox.zBottom, 1)} MM, ${stockBox.round ? 'ROUND' : 'BLOCK'}`, false);
    } else {
      out.add(`(MACHINE ${ascii(p.machine.brand + ' ' + p.machine.model)})`.toUpperCase(), false);
      out.add(`(DATE ${now.toISOString().slice(0, 10)})`, false);
      if (stockBox) out.add(`(STOCK ${trim(stockBox.x1 - stockBox.x0, 1)} X ${trim(stockBox.y1 - stockBox.y0, 1)} X ${trim(stockBox.zTop - stockBox.zBottom, 1)} MM ${stockBox.round ? 'ROUND' : 'BLOCK'})`, false);
      if (isTurn) out.add(`(BAR DIA ${trim(p.stock.box[0], 1)} MM)`, false);
      for (const t of tools) out.add(`(T${t.n} ${ascii(t.tool.name).toUpperCase().replace(/[()]/g, '').slice(0, 40)})`, false);
    }
    if (dia === 'siemens') for (const t of tools) out.add(`; T${t.n} ${ascii(t.tool.name)}`, false);
    out.add(comment('TOOLPATH VERIFY BEFORE RUNNING - NOT PROVEN ON YOUR MACHINE'), false);
  }
  // safe start
  if (dia === 'siemens') out.add(isTurn ? 'G18 G90 G71 G94 G40 TRAFOOF' : 'G17 G90 G71 G94 G40 TRAFOOF');
  else if (dia === 'linuxcnc') out.add(isTurn ? 'G21 G18 G90 G40 G49 G80 G64 P0.01' : 'G21 G17 G90 G40 G49 G80 G64 P0.01');
  else if (isTurn) out.add(dia === 'haas' ? 'G00 G18 G40 G80 G90 G99' : 'G21 G18 G40 G80 G99');
  else if (dia === 'haas') out.add('G00 G17 G40 G49 G80 G90');
  else if (dia === 'mazak') out.add('G90 G17 G40 G49 G80 G21 G94');
  else out.add('G21 G17 G40 G49 G80 G90 G94');

  const last: { [k: string]: number | undefined } = {};
  let gMode = '', lastF: number | undefined;
  let toolNo = 0, needTLO = false, cycle = '', tcp = false, wcs = 'G54';
  const safeHome = () => {
    if (isTurn) { out.add(dia === 'siemens' ? 'SUPA G0 X200 Z200 D0' : 'G28 U0.'); if (dia !== 'siemens') out.add('G28 W0.'); return; }
    if (dia === 'haas') { out.add('G53 G00 Z0.'); }
    else if (dia === 'linuxcnc') out.add('G53 G0 Z0');
    else if (dia === 'siemens') out.add('SUPA G0 Z0 D0');
    else out.add('G91 G28 Z0.');
    if (isFan && dia !== 'haas') out.add('G90');
  };
  const cancelCycle = () => { if (cycle) { out.add(dia === 'siemens' ? 'MCALL' : 'G80'); cycle = ''; gMode = ''; } };
  const G = (g: string) => { if (g !== gMode) { gMode = g; return g; } return ''; };
  for (let i = 0; i < p.cmds.length; i++) {
    const c = p.cmds[i] as Cmd;
    cmdLine[i] = out.length;
    switch (c.k) {
      case 'comment': C(c.text); break;
      case 'setup': {
        cancelCycle();
        C(`SETUP ${c.name}${c.index ? ` (A${trim(c.a)} C${trim(c.c)})` : ''}`);
        wcs = c.wcs;
        if (c.index) {
          C('3+2: probe a separate work offset at this index position');
          safeHome();
          out.add(`G0 A${num(c.a)} C${num(c.c)}`);
          last.A = c.a; last.C = c.c;
        }
        out.add(dia === 'siemens' ? `${wcs.replace('G', 'G')}` : wcs);
        last.X = last.Y = last.Z = undefined; gMode = '';
        break;
      }
      case 'op': {
        cancelCycle();
        C(`${c.name.toUpperCase()}${c.note ? ' - ' + c.note : ''}`);
        if (isCut) {
          out.add(dia === 'siemens' ? 'G0 G90' : 'G0 G90 G54'); gMode = 'G0';
          break;
        }
        if (c.tool !== toolNo) {
          if (toolNo !== 0) { out.add('M5'); out.add('M9'); }
          if (!isTurn) safeHome();
          if (isTurn) {
            out.add(dia === 'siemens' ? `T${c.tool} D1` : `T${String(c.tool).padStart(2, '0')}${String(c.tool).padStart(2, '0')}`);
            if (dia === 'siemens') out.add('M6');
          } else if (dia === 'siemens') { out.add(`T="${p.tools.find((t) => t.n === c.tool)?.tool.id.toUpperCase() ?? 'T' + c.tool}"`); out.add('M6'); }
          else if (dia === 'haas') out.add(`T${c.tool} M06`);
          else out.add(`T${c.tool} M6`);
          toolNo = c.tool; needTLO = !isTurn;
          last.X = last.Y = last.Z = undefined;
        }
        if (isTurn && c.css) {
          out.add(dia === 'siemens' ? `G96 S${Math.round(c.css)} LIMS=${c.maxRpm ?? 3000} M3` : `G50 S${c.maxRpm ?? 3000}`);
          if (dia !== 'siemens') out.add(`G96 S${Math.round(c.css)} M3`);
          out.add(dia === 'siemens' ? 'G95' : 'G99'); // feed per rev
        } else out.add(`S${Math.round(c.rpm)} M3`);
        if (c.coolant) out.add('M8');
        gMode = '';
        break;
      }
      case 'rapid': {
        cancelCycle();
        const g = G(dia === 'siemens' ? 'G0' : 'G0');
        let s = '';
        if (isTurn) s = (g ? 'G0' : '') + word('X', c.x, last) + word('Z', c.z, last);
        else {
          if (needTLO && c.z !== undefined && !isCut) {
            s = (g ? 'G0' : '') + word('X', c.x, last) + word('Y', c.y, last);
            if (s.replace(/^\s*G0\s*$/, '').trim()) out.add(s.trim());
            const tlo = dia === 'siemens' ? '' : `G0 G43 H${toolNo} `;
            if (tcp) { last.Z = undefined; }
            out.add(`${tlo || (g ? 'G0 ' : '')}Z${num(c.z)}`.trim());
            last.Z = c.z; needTLO = false; gMode = 'G0';
            break;
          }
          s = (g ? 'G0' : '') + word('X', c.x, last) + word('Y', c.y, last) + word('Z', c.z, last) + word('A', c.a, last) + word('C', c.c, last);
        }
        if (s.replace(/^\s*G0\s*$/, '').trim()) out.add(s.trim()); else if (s.trim() === 'G0') gMode = '';
        break;
      }
      case 'feed': {
        cancelCycle();
        const g = G('G1');
        let s = (g ? 'G1' : '');
        if (isTurn) s += word('X', c.x, last) + word('Z', c.z, last);
        else s += word('X', c.x, last) + word('Y', c.y, last) + word('Z', c.z, last) + word('A', c.a, last) + word('C', c.c, last);
        if (lastF === undefined || Math.abs(lastF - c.f) > 1e-6) { s += ` F${isTurn ? trim(c.f, 3) : Math.round(c.f)}`; lastF = c.f; }
        if (s.trim()) out.add(s.trim());
        break;
      }
      case 'drill': {
        const peck = c.q !== undefined;
        if (dia === 'siemens') {
          if (!cycle) {
            out.add(peck ? `MCALL CYCLE83(${trim(c.r + 3)},${trim(c.r - 2)},2,${trim(c.z)},,${trim(c.q!)},,${trim(c.q! * 0.2)},0,0,1,0)`.replace(',,', ',,') : `MCALL CYCLE81(${trim(c.r + 3)},${trim(c.r - 2)},2,${trim(c.z)},)`);
            cycle = peck ? 'G83' : 'G81';
          }
          out.add(`X${num(c.x)} Y${num(c.y)}`);
        } else {
          const g = peck ? 'G83' : 'G81';
          const mod = cycle === g;
          let s = '';
          if (!mod) { s = `${dia === 'haas' ? 'G99 ' : 'G98 '}${g}`; cycle = g; }
          s += ` X${num(c.x)} Y${num(c.y)}`;
          if (!mod || last.CZ !== c.z) s += ` Z${num(c.z)}`;
          if (!mod || last.CR !== c.r) s += ` R${num(c.r)}`;
          if (peck && (!mod || last.CQ !== c.q)) s += ` Q${num(c.q!)}`;
          s += ` F${Math.round(c.f)}`;
          last.CZ = c.z; last.CR = c.r; last.CQ = c.q; last.X = c.x; last.Y = c.y;
          out.add(s.trim());
        }
        last.X = c.x; last.Y = c.y;
        break;
      }
      case 'on': {
        if (c.on) {
          if (p.process === 'laser') out.add(`M3 S${Math.round(p.tools[0]?.rpm ?? 1500)}`); else out.add('M3');
          if (c.pierce) out.add(`G4 P${trim(c.pierce, 2)}`);
          gMode = '';
        } else out.add('M5');
        break;
      }
      case 'tcp': {
        tcp = c.on;
        const code = c.on ? ({ fanuc: `G43.4 H${toolNo}`, haas: 'G234', mazak: `G43.4 H${toolNo}`, siemens: 'TRAORI', linuxcnc: '; TCP not available on this controller' } as Record<string, string>)[dia] : ({ fanuc: 'G49', haas: 'G49', mazak: 'G49', siemens: 'TRAFOOF', linuxcnc: '' } as Record<string, string>)[dia];
        if (code) out.add(code);
        if (c.on) needTLO = false;
        break;
      }
    }
  }
  cancelCycle();
  out.add('M9'); out.add('M5');
  if (isCut) { out.add('G0 X0 Y0'); out.add(dia === 'siemens' ? 'M30' : 'M30'); }
  else {
    safeHome();
    if (!isTurn) { if (dia === 'haas') out.add('G53 Y0.'); else if (dia === 'linuxcnc') out.add('G53 G0 Y0'); else if (dia === 'siemens') out.add('SUPA G0 Y0 D0'); else out.add('G91 G28 Y0.'); if (isFan && dia !== 'haas') out.add('G90'); }
    out.add('M30');
  }
  if (isFan || dia === 'linuxcnc') { out.add(dia === 'linuxcnc' ? '%' : '%', false); }
  const lines = out.lines;
  return { text: lines.join('\n') + '\n', lines, cmdLine, ext: ctrl.ext, mime: 'text/plain', dialect: ctrl.name };
}

// ---------------------------------------------------------------------------
// Heidenhain Klartext

function postHeidenhain(p: Program, opts: PostOptions, cmdLine: Int32Array, _comment: (t: string) => string): PostResult {
  const ctrl = controllerById('heidenhain');
  const lines: string[] = [];
  let n = 0;
  const add = (s: string) => { lines.push(`${n} ${s}`); n++; };
  const sgn = (v: number) => (v >= 0 ? '+' : '') + trim(v);
  const name = p.name.toUpperCase();
  const now = opts.now ?? new Date();
  add(`BEGIN PGM ${name} MM`);
  const sb = p.sims[0]?.stockBox;
  if (sb) {
    add(`BLK FORM 0.1 Z X${sgn(sb.x0)} Y${sgn(sb.y0)} Z${sgn(sb.zBottom)}`);
    add(`BLK FORM 0.2 X${sgn(sb.x1)} Y${sgn(sb.y1)} Z${sgn(sb.zTop)}`);
  }
  if (opts.comments !== false) { add(`; ${ascii(p.machine.brand + ' ' + p.machine.model)} ${now.toISOString().slice(0, 10)}`); for (const t of p.tools) add(`; T${t.n} ${ascii(t.tool.name)}`); add('; VERIFY THE PROGRAM BEFORE RUNNING IT'); }
  const last: Record<string, number | undefined> = {};
  let lastF: number | undefined;
  let mode: 'L' | '' = '';
  const w = (c: string, v: number | undefined, force = false) => {
    if (v === undefined) return '';
    if (!force && last[c] !== undefined && Math.abs((last[c] as number) - v) < 1e-5) return '';
    last[c] = v; return ` ${c}${sgn(v)}`;
  };
  for (let i = 0; i < p.cmds.length; i++) {
    const c = p.cmds[i];
    cmdLine[i] = lines.length;
    switch (c.k) {
      case 'comment': add(`; ${c.text}`); break;
      case 'setup': add(`; SETUP ${c.name}`); if (c.index) { add('L Z+250 R0 FMAX'); add(`L A${sgn(c.a)} C${sgn(c.c)} R0 FMAX`); } add(`CYCL DEF 247 DATUM SETTING ~\n  Q339=${Math.max(1, WCS_INDEX(c.wcs))} ;DATUM NUMBER`); break;
      case 'op': add(`; ${c.name}`); add(`TOOL CALL ${c.tool} Z S${Math.round(c.rpm)}`); add('L Z+250 R0 FMAX M3 M8'); last.X = last.Y = last.Z = undefined; break;
      case 'rapid': { const s = w('X', c.x) + w('Y', c.y) + w('Z', c.z) + w('A', c.a) + w('C', c.c); if (s.trim()) add(`L${s} R0 FMAX`); break; }
      case 'feed': { const s = w('X', c.x) + w('Y', c.y) + w('Z', c.z) + w('A', c.a) + w('C', c.c); const f = lastF !== c.f ? ` F${Math.round(c.f)}` : ''; lastF = c.f; if (s.trim()) add(`L${s} R0${f}`); break; }
      case 'drill': {
        const peck = c.q !== undefined;
        const depth = c.r - c.z;
        if (peck) add(`CYCL DEF 203 UNIVERSAL DRILLING ~\n  Q200=2 ;SET-UP CLEARANCE ~\n  Q201=${sgn(c.z - c.r)} ;DEPTH ~\n  Q206=${Math.round(c.f)} ;FEED RATE FOR PLUNGING ~\n  Q202=${trim(c.q!)} ;PLUNGING DEPTH ~\n  Q210=0 ;DWELL TIME AT TOP ~\n  Q203=${sgn(c.r)} ;SURFACE COORDINATE ~\n  Q204=50 ;2ND SET-UP CLEARANCE ~\n  Q212=0 ;DECREMENT ~\n  Q213=0 ;BREAKS ~\n  Q205=0 ;MIN. PLUNGING DEPTH ~\n  Q211=0 ;DWELL TIME AT DEPTH ~\n  Q208=99999 ;RETRACTION FEED RATE ~\n  Q256=0.2 ;DIST. FOR CHIP BRKNG ~\n  Q395=0 ;DEPTH REFERENCE`);
        else add(`CYCL DEF 200 DRILLING ~\n  Q200=2 ;SET-UP CLEARANCE ~\n  Q201=${sgn(c.z - c.r)} ;DEPTH ~\n  Q206=${Math.round(c.f)} ;FEED RATE FOR PLUNGING ~\n  Q202=${trim(depth + 1)} ;PLUNGING DEPTH ~\n  Q210=0 ;DWELL TIME AT TOP ~\n  Q203=${sgn(c.r)} ;SURFACE COORDINATE ~\n  Q204=50 ;2ND SET-UP CLEARANCE ~\n  Q211=0 ;DWELL TIME AT DEPTH ~\n  Q395=0 ;DEPTH REFERENCE`);
        add(`L X${sgn(c.x)} Y${sgn(c.y)} R0 FMAX M99`);
        last.X = c.x; last.Y = c.y;
        break;
      }
      case 'tcp': add(c.on ? 'M128 F5000 ; TCP on' : 'M129 ; TCP off'); break;
      case 'on': break;
    }
  }
  add('L Z+250 R0 FMAX M5 M9');
  add('L Y+0 R0 FMAX');
  add('M30');
  add(`END PGM ${name} MM`);
  void mode;
  return { text: lines.join('\n') + '\n', lines, cmdLine, ext: ctrl.ext, mime: 'text/plain', dialect: ctrl.name };
}
const WCS_INDEX = (w: string) => ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'].indexOf(w) + 1;

// ---------------------------------------------------------------------------
// Printers

export function postPrint(p: PrintProgram, opts: PostOptions = {}): PostResult {
  const ctrl = controllerById(p.controller);
  const out: string[] = [];
  const segLine = new Int32Array(p.segCount).fill(0);
  const s = p.s, mat = p.material, M = p.machine;
  const now = opts.now ?? new Date();
  const laser = p.process !== 'fdm';
  const f3 = (v: number) => trim(v, 3), f4 = (v: number) => trim(v, 4);
  const add = (l: string) => out.push(l);
  const kl = p.controller === 'klipper';
  add(`; Faelyx CAM - ${ctrl.name}`);
  add(`; machine: ${ascii(M.brand + ' ' + M.model)}`);
  add(`; process: ${p.process.toUpperCase()}  material: ${ascii(mat.name)}`);
  add(`; date: ${now.toISOString().slice(0, 10)}`);
  add(`; layers: ${p.layers.length}  layer height: ${f3(s.layer)} mm  size: ${p.size.map((v) => trim(v, 1)).join(' x ')} mm`);
  add(`; estimated time: ${Math.round(p.time / 60)} min`);
  if (!laser) add(`; filament: ${trim(p.filamentMm / 1000, 2)} m  (${trim(p.massG, 1)} g)`);
  add('; VERIFY BEFORE PRINTING');
  if (!laser) {
    const nT = s.nozzleC, bT = s.bedC;
    if (kl) {
      add(`START_PRINT BED_TEMP=${bT} EXTRUDER_TEMP=${nT}`);
      add(`SET_VELOCITY_LIMIT ACCEL=${s.accel} ACCEL_TO_DECEL=${Math.round(s.accel / 2)}`);
      add('SET_PRESSURE_ADVANCE ADVANCE=0.04');
    } else {
      if (p.controller === 'bambu') add('; Bambu-style header (Marlin compatible)');
      add(`M140 S${bT}`); add(`M104 S${Math.min(nT, 150)}`);
      add('G28 ; home'); add(`M190 S${bT}`); add(`M109 S${nT}`);
    }
    add('G90'); add('M83 ; relative extrusion'); add('G92 E0');
    if (!kl) add('G1 Z5 F3000');
    add(`G1 X${f3(5)} Y${f3(5)} F${s.travel * 60}`);
  } else {
    add('G90'); add('G21');
    add(`; laser power ${s.power} W  scan speed ${s.scan} mm/s  hatch ${f3(p.hatchUsed)} mm`);
    add('M5');
  }
  let curType = -1, retracted = false, lastF = -1, lastZ = -1, layer = -1;
  const fan = (k: number) => (laser ? -1 : k === 0 ? 0 : k < 3 ? Math.round((255 * s.fan) / 100 * (k / 3)) : Math.round((255 * s.fan) / 100));
  let lastFan = -2;
  for (let i = 0; i < p.segCount; i++) {
    const L = p.segLayer[i];
    segLine[i] = out.length;
    if (L !== layer) {
      layer = L;
      const info = p.layers[L];
      add(`;LAYER:${L}`);
      add(`;Z:${f3(info.z)}`);
      if (kl && !laser) add(`SET_PRINT_STATS_INFO CURRENT_LAYER=${L + 1}`);
      if (!laser) {
        const fv = fan(L);
        if (fv !== lastFan) { add(fv > 0 ? `M106 S${fv}` : 'M107'); lastFan = fv; }
      } else {
        add(p.process === 'sla' ? `; exposure ${f3(L < s.bottomLayers2 ? s.bottomExposure : s.exposure)} s` : '; recoat');
      }
      lastZ = -1;
    }
    const b = i * 6;
    const x0 = p.segs[b], y0 = p.segs[b + 1], z0 = p.segs[b + 2], x1 = p.segs[b + 3], y1 = p.segs[b + 4], z1 = p.segs[b + 5];
    const t = p.segType[i];
    if (t === PT.travel) {
      const fl = p.segFlag[i];
      const hop = !laser && (fl & FLAG_HOP) !== 0;
      if (!laser) {
        if ((fl & FLAG_RETRACT) && !retracted && s.retract > 0) { add(`G1 E${f3(-s.retract)} F${s.retractSpeed * 60}`); retracted = true; }
      } else add('M5');
      if (hop) add(`G1 Z${f3(z1 + s.zhop)} F${s.travel * 60}`);
      else if (Math.abs(z1 - lastZ) > 1e-6) add(`G0 Z${f3(z1)}`);
      add(`G0 X${f3(x1)} Y${f3(y1)}${laser ? '' : ` F${Math.round(p.segF[i])}`}`);
      if (hop) add(`G1 Z${f3(z1)} F${s.travel * 60}`);
      lastZ = z1;
      lastF = -1;
    } else {
      if (t !== curType) { add(`;TYPE:${PT_NAMES[t].toUpperCase().replace(/[ /]/g, '-')}`); curType = t; }
      if (!laser) {
        if (retracted) { add(`G1 E${f3(s.retract)} F${s.retractSpeed * 60}`); retracted = false; }
        const f = Math.round(p.segF[i]);
        add(`G1 X${f3(x1)} Y${f3(y1)} E${f4(p.segE[i])}${f !== lastF ? ` F${f}` : ''}`);
        lastF = f;
      } else {
        if (lastF === -1) add(`M3 S${s.power}`);
        const f = Math.round(p.segF[i]);
        add(`G1 X${f3(x1)} Y${f3(y1)}${f !== lastF ? ` F${f}` : ''}`);
        lastF = f;
      }
    }
    void z0; void x0; void y0;
  }
  if (laser) add('M5');
  if (!laser) {
    if (retracted === false && s.retract > 0) add(`G1 E${f3(-s.retract)} F${s.retractSpeed * 60}`);
    if (kl) add('END_PRINT');
    else { add('M107'); add('M104 S0'); add('M140 S0'); add('G91'); add('G1 Z10 F3000'); add('G90'); add('G28 X0 ; park'); add('M84'); }
  } else add('G28 Z');
  add(`; total extruded/printed layers: ${p.layers.length}`);
  return { text: out.join('\n') + '\n', lines: out, cmdLine: segLine, ext: ctrl.ext, mime: 'text/plain', dialect: ctrl.name };
}

export function postPrintSettingsComment(_s: PrintSettings, _m: PrintMaterial) { return ''; }
