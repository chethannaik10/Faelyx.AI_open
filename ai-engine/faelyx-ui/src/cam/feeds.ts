// Speeds & feeds engine. Physics-based, not a lookup table:
//   spindle speed from surface speed, chip load per tooth with radial chip thinning,
//   cutting power from the Kienzle specific cutting force, tool deflection from a
//   cantilever model. The result is clamped to the machine spindle and power rating and
//   every adjustment is recorded so the UI can explain it.

import type { MachineDef, StockMaterial, Tool } from './camData';

export type CutMode = 'rough' | 'rest' | 'finish' | 'floor' | 'wall' | 'drill';
export interface Feeds {
  rpm: number; feed: number; plunge: number; ap: number; ae: number; fz: number;
  vc: number; mrr: number; powerKw: number; deflection: number; chipThinning: number;
  limited: string[]; notes: string[];
}

const E_CARBIDE = 600e3, E_HSS = 210e3; // N/mm²

export interface FeedOptions { apOverride?: number; aeOverride?: number; stickout?: number }

export function millFeeds(tool: Tool, mat: StockMaterial, machine: MachineDef, mode: CutMode, opt: FeedOptions = {}): Feeds {
  const d = tool.d, z = tool.flutes;
  const limited: string[] = [], notes: string[] = [];
  const carbide = tool.material === 'carbide';
  const vcBase = carbide ? mat.vcCarbide : mat.vcHss;
  // finishing runs a little faster, roughing a little slower, ball nose uses its effective diameter
  const vcMode = mode === 'rough' || mode === 'rest' ? 0.9 : mode === 'drill' ? 0.55 : 1.05;
  const vc = vcBase * vcMode;
  const dEff = tool.kind === 'ball' && (mode === 'finish') ? d * 0.8 : d; // contact diameter on a shallow cut
  let rpm = (vc * 1000) / (Math.PI * dEff);
  const maxRpm = machine.maxRpm && machine.maxRpm > 0 ? machine.maxRpm : 8000;
  if (rpm > maxRpm) { rpm = maxRpm; limited.push(`spindle limit ${maxRpm} rpm`); }
  rpm = Math.round(rpm / 10) * 10;
  const vcReal = (rpm * Math.PI * d) / 1000;

  // --- engagement
  let ap: number, ae: number;
  if (mode === 'rough' || mode === 'rest') {
    ap = opt.apOverride ?? Math.min(d * mat.apRough, tool.fluteLen * 0.9);
    ae = opt.aeOverride ?? d * mat.aeRough;
    if (mode === 'rest') { ap = Math.min(ap, d * 1.0); }
  } else if (mode === 'floor') {
    ap = 0.2; ae = d * 0.45;
  } else if (mode === 'wall') {
    ap = Math.min(tool.fluteLen * 0.6, d * 1.5); ae = 0.2;
  } else if (mode === 'drill') {
    ap = d * 3; ae = d;
  } else { // finish
    ap = 0.3; ae = d * 0.1;
  }
  ae = Math.min(ae, d);

  // --- chip load
  let fz = mat.fzRatio * 6 * Math.pow(d / 6, 0.55) * (tool.kind === 'ball' && mode === 'finish' ? 0.9 : 1) * (z <= 2 ? 0.9 : 1);
  if (mode === 'drill') fz = d * mat.fzRatio * 0.9; // per revolution handled below
  fz = Math.min(fz, 0.25);
  let thin = 1;
  if (ae < d / 2 && mode !== 'drill') {
    thin = Math.min(2.6, 1 / Math.sin(Math.acos(1 - (2 * ae) / d)));
    fz *= thin;
    notes.push(`Radial chip thinning ×${thin.toFixed(2)} at ${(ae / d * 100).toFixed(0)} % engagement`);
  }

  const toolOverhang = opt.stickout ?? (tool.fluteLen + 8);
  let feed = rpm * z * fz;
  const fLim = machine.maxFeed ?? (machine.rapid ? machine.rapid * 0.5 : 10000);
  if (feed > fLim) { feed = fLim; limited.push(`feed limit ${Math.round(fLim)} mm/min`); }

  // --- power and deflection, iteratively backing off feed then engagement
  const power = (apx: number, aex: number, fx: number) => {
    const fzx = fx / (rpm * z);
    const hm = Math.max(0.005, fzx * Math.sqrt(Math.min(1, aex / d)) * (aex >= d ? 0.64 : 1));
    const kc = mat.kc11 / Math.pow(hm, mat.mc);
    return (apx * aex * fx * kc) / (60e6 * 0.8);
  };
  const defl = (apx: number, aex: number, fx: number) => {
    const fzx = fx / (rpm * z);
    const hm = Math.max(0.005, fzx * Math.sqrt(Math.min(1, aex / d)));
    const kc = mat.kc11 / Math.pow(hm, mat.mc);
    const phi = Math.acos(1 - (2 * Math.min(aex, d)) / d);
    const zEng = Math.max(1, (z * phi) / (2 * Math.PI));
    const ft = kc * apx * hm * zEng;
    const fr = 0.4 * ft;
    const dCore = d * 0.7;
    const I = (Math.PI * Math.pow(dCore, 4)) / 64;
    return (fr * Math.pow(toolOverhang, 3)) / (3 * (carbide ? E_CARBIDE : E_HSS) * I);
  };
  const pMax = (machine.powerKw ?? 3) * 0.7;
  const dMax = mode === 'finish' || mode === 'wall' || mode === 'floor' ? 0.012 : 0.03;
  let pw = 0, df = 0;
  if (mode !== 'drill') {
    for (let it = 0; it < 40; it++) {
      pw = power(ap, ae, feed); df = defl(ap, ae, feed);
      const overP = pw > pMax, overD = df > dMax;
      if (!overP && !overD) break;
      if (overD && (mode === 'rough' || mode === 'rest')) {
        // deflection scales with ap and ae; trim engagement before slowing the feed
        if (!limited.includes('deflection')) limited.push('deflection');
        ap *= 0.9; if (it % 2) ae *= 0.92;
      } else if (overD) { if (!limited.includes('deflection')) limited.push('deflection'); ap *= 0.9; feed *= 0.92; }
      if (overP) {
        if (!limited.includes('power')) limited.push('power');
        feed *= 0.9; if (it % 3 === 2) ap *= 0.92;
      }
      ap = Math.max(ap, mode === 'wall' ? 0.5 : 0.1); ae = Math.max(ae, 0.1);
    }
    pw = power(ap, ae, feed); df = defl(ap, ae, feed);
    if (limited.includes('power')) notes.push(`Limited to ${(pMax).toFixed(1)} kW (70 % of the ${machine.powerKw} kW spindle)`);
    if (limited.includes('deflection')) notes.push(`Engagement trimmed to hold tool deflection near ${dMax * 1000} µm`);
  }
  const plunge = mode === 'drill' ? rpm * fz * 1 : Math.max(20, feed * 0.35);
  if (mode === 'drill') feed = rpm * 0.9 * (d * mat.fzRatio * 2.2); // mm/rev × rpm
  feed = Math.max(10, Math.round(feed));
  return {
    rpm, feed, plunge: Math.round(mode === 'drill' ? feed * 0.8 : plunge), ap: +ap.toFixed(2), ae: +ae.toFixed(2), fz: +(feed / (rpm * z)).toFixed(4),
    vc: Math.round(vcReal), mrr: +((ap * ae * feed) / 1000).toFixed(1), powerKw: +pw.toFixed(2), deflection: +df.toFixed(4), chipThinning: +thin.toFixed(2), limited, notes,
  };
}

/** Peck depth for a drill: full retract every 1×D at depth > 3×D, chip-break below that. */
export function peckFor(d: number, depth: number, mat: StockMaterial): number | undefined {
  if (depth <= d * 3) return undefined;
  const k = mat.group === 'Aluminium' || mat.group === 'Plastics' || mat.group === 'Wood & composite' ? 1.5 : mat.group === 'Titanium & superalloy' || mat.group === 'Stainless' ? 0.6 : 1.0;
  return +(Math.max(0.5, d * k)).toFixed(2);
}

/** Cutting data for laser / plasma sheet cutting. thickness in mm. */
export function cutData(mat: StockMaterial, thickness: number, process: 'laser' | 'plasma', machine: MachineDef) {
  const base = mat.cutFeed3 ?? 2000;
  // feed falls roughly with thickness^1.3 from the 3 mm reference
  let feed = base * Math.pow(3 / Math.max(0.5, thickness), 1.3);
  if (process === 'plasma') feed *= 0.9;
  if (process === 'laser' && machine.laserW) feed *= machine.laserW / 1500;
  feed = Math.max(60, Math.round(feed / 10) * 10);
  const kerf = process === 'laser' ? 0.18 + thickness * 0.012 : 1.4 + thickness * 0.05;
  const pierce = process === 'laser' ? 0.3 + thickness * 0.1 : 0.4 + thickness * 0.07;
  const standoff = process === 'laser' ? 0.8 : 3.8;
  const leadIn = Math.max(1.5, thickness * 1.2);
  return { feed, kerf: +kerf.toFixed(2), pierce: +pierce.toFixed(2), standoff, leadIn: +leadIn.toFixed(1), power: process === 'laser' ? machine.laserW ?? 1500 : 45, assist: process === 'laser' ? (mat.group === 'Steel' || mat.id === 'sheet-steel' ? 'O₂' : 'N₂') : 'air' };
}

/** Turning data: cutting speed → rpm (constant surface speed, G96), feed per rev, depths. */
export function turnData(mat: StockMaterial, machine: MachineDef, diameter: number, mode: 'rough' | 'finish') {
  const vc = mat.vcCarbide * (mode === 'rough' ? 0.85 : 1.1);
  let rpm = (vc * 1000) / (Math.PI * Math.max(8, diameter));
  const maxRpm = machine.maxRpm ?? 3000;
  const limited = rpm > maxRpm;
  rpm = Math.min(rpm, maxRpm);
  const f = mode === 'rough' ? Math.min(0.35, 0.05 + mat.fzRatio * 12) : Math.min(0.15, 0.03 + mat.fzRatio * 4);
  const ap = mode === 'rough' ? Math.min(3.0, 0.2 + mat.apRough * 1.8) : 0.25;
  return { vc: Math.round(vc), rpm: Math.round(rpm), maxRpm, feedRev: +f.toFixed(3), ap: +ap.toFixed(2), limited };
}
