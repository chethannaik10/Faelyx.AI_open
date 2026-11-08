// Digital-twin simulation of the generated program.
//   Mill:  height-map stock removal with flat / ball / drill stamps, checkpoints for scrubbing, and
//          collision checks (rapid into material, holder, shank, fixtures, table, gouging the part).
//   Lathe: radius profile along Z with chuck / rapid-crash checks.
// Pure TypeScript so it runs in Node tests; the viewport only reads the arrays.

import { type Program, type Cmd, type SimSetup, type Box3 } from './toolpath';
import type { Tool } from './camData';
import { dilateFlat } from './geometry';

export type EventKind = 'rapid-crash' | 'holder' | 'shank' | 'fixture' | 'table' | 'gouge' | 'chuck' | 'overhang' | 'travel';
export interface SimEvent { cmd: number; kind: EventKind; severity: 'error' | 'warn'; msg: string; x: number; y: number; z: number; setup: number }
export interface SimPose { x: number; y: number; z: number; a: number; c: number; tool: Tool | null; toolNo: number; rpm: number; mode: 'rapid' | 'feed' }

export interface SimReport {
  events: SimEvent[]; gougeMax: number; gougeArea: number; leftoverVolume: number; leftoverMax: number; removed: number; ok: boolean;
}

const KIND_LABEL: Record<EventKind, string> = {
  'rapid-crash': 'Rapid move into material', holder: 'Tool holder collision', shank: 'Tool shank / flute length', fixture: 'Fixture collision',
  table: 'Tool below stock bottom', gouge: 'Gouge into the part', chuck: 'Chuck collision', overhang: 'Unsupported overhang', travel: 'Machine travel',
};
export const eventLabel = (k: EventKind) => KIND_LABEL[k];

interface Disc { n: number; di: Int16Array; dj: Int16Array; h: Float32Array }
const discCache = new Map<string, Disc>();
function disc(kind: 'flat' | 'ball', R: number, cell: number): Disc {
  const key = `${kind}|${R}|${cell}`;
  let d = discCache.get(key);
  if (d) return d;
  const rc = Math.ceil(R / cell);
  const di: number[] = [], dj: number[] = [], h: number[] = [];
  for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
    const r = Math.hypot(i * cell, j * cell);
    if (r <= R + 1e-9) { di.push(i); dj.push(j); h.push(kind === 'ball' ? R - Math.sqrt(Math.max(0, R * R - r * r)) : 0); }
  }
  d = { n: di.length, di: Int16Array.from(di), dj: Int16Array.from(dj), h: Float32Array.from(h) };
  if (discCache.size > 40) discCache.clear();
  discCache.set(key, d);
  return d;
}

const rectDist = (x: number, y: number, b: Box3) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.hypot(dx, dy);
};

export class MillSim {
  readonly s: SimSetup;
  readonly prog: Program;
  readonly setup: number;
  S: Float32Array;
  pose: SimPose = { x: 0, y: 0, z: 100, a: 0, c: 0, tool: null, toolNo: 0, rpm: 0, mode: 'rapid' };
  events: SimEvent[] = [];
  report: SimReport | null = null;
  cursor: number;          // next cmd to execute (absolute index into prog.cmds)
  private checkpoints: { at: number; S: Float32Array; pose: SimPose }[] = [];
  private record = false;
  private lastEvt = new Map<string, number>();
  private fix: Box3[];
  private tick = 0;
  private retract = false;

  constructor(prog: Program, setup: number) {
    this.prog = prog; this.setup = setup; this.s = prog.sims[setup];
    this.S = Float32Array.from(this.s.stock);
    this.cursor = this.s.startCmd;
    this.fix = this.s.fixtures.filter((f) => f.label !== 'Table' && f.label !== 'Fixture plate');
    this.pose = { ...this.pose, z: this.s.stockBox.zTop + 30 };
  }

  private emit(kind: EventKind, cmd: number, x: number, y: number, z: number, msg: string, sev: 'error' | 'warn' = 'error') {
    const key = `${kind}|${Math.round(x / 4)}|${Math.round(y / 4)}`;
    const prev = this.lastEvt.get(key);
    if (prev !== undefined && cmd - prev < 400) return;
    this.lastEvt.set(key, cmd);
    if (this.events.length < 300) this.events.push({ cmd, kind, severity: sev, msg, x, y, z, setup: this.setup });
  }

  /** stamp the tool at a position (tip coordinates) */
  private stamp(x: number, y: number, z: number, tool: Tool, axisX = 0, axisY = 0, axisZ = 1) {
    const { cell, nx, ny, x0, y0 } = this.s;
    const S = this.S;
    const R = tool.d / 2;
    if (tool.kind === 'ball') {
      // sphere centre sits R along the axis from the tip
      const cx = x + R * axisX, cy = y + R * axisY, cz = z + R * axisZ;
      const d = disc('ball', R, cell);
      const ci = Math.floor((cx - x0) / cell), cj = Math.floor((cy - y0) / cell);
      const ox = (cx - x0) / cell - ci - 0.5, oy = (cy - y0) / cell - cj - 0.5;
      void ox; void oy;
      for (let q = 0; q < d.n; q++) {
        const i = ci + d.di[q], j = cj + d.dj[q];
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        // sphere bottom height over this cell: cz - sqrt(R² - r²) = cz - R + h
        const v = cz - R + d.h[q];
        const k = j * nx + i;
        if (S[k] > v) S[k] = v;
      }
      return;
    }
    const d = disc('flat', R, cell);
    const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell);
    for (let q = 0; q < d.n; q++) {
      const i = ci + d.di[q], j = cj + d.dj[q];
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const k = j * nx + i;
      if (S[k] > z) S[k] = z;
    }
  }

  /** maximum stock height under a disc of radius r */
  private maxUnder(x: number, y: number, r: number): number {
    const { cell, nx, ny, x0, y0 } = this.s;
    const S = this.S;
    const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell), rc = Math.ceil(r / cell);
    let m = -Infinity;
    for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
      if (i * i + j * j > rc * rc) continue;
      const ii = ci + i, jj = cj + j;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const v = S[jj * nx + ii];
      if (v > m) m = v;
    }
    return m;
  }

  /** highest point where stock rises into a ball-nose of radius R (tip at z); returns an equivalent tip height */
  private maxUnderBall(x: number, y: number, r: number, z: number, R: number): number {
    const { cell, nx, ny, x0, y0 } = this.s;
    const S = this.S;
    const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell), rc = Math.ceil(Math.max(0.1, r) / cell);
    let m = -Infinity;
    for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
      const rr = Math.hypot(i, j) * cell;
      if (rr > r) continue;
      const ii = ci + i, jj = cj + j;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const v = S[jj * nx + ii] - (R - Math.sqrt(Math.max(0, R * R - rr * rr)));
      if (v > m) m = v;
    }
    void z;
    return m;
  }

  private check(i: number, x: number, y: number, z: number, rapid: boolean, cutting: boolean, heavy: boolean) {
    const t = this.pose.tool;
    if (!t) return;
    const R = t.d / 2;
    const sb = this.s.stockBox;
    if (z < sb.zBottom - 0.05) this.emit('table', i, x, y, z, `${t.name} reaches Z${z.toFixed(1)}, below the stock bottom (Z${sb.zBottom.toFixed(1)}).`);
    for (const f of this.fix) {
      const dd = rectDist(x, y, f);
      if (dd < R - 0.01 && z < f.z1 - 0.01 && z + t.fluteLen > f.z0) this.emit('fixture', i, x, y, z, `${t.name} hits the ${f.label.toLowerCase()} at Z${z.toFixed(1)}.`);
      else if (dd < t.holderD / 2 && z + t.stickout < f.z1 - 0.01 && z + t.stickout + 10 > f.z0) this.emit('holder', i, x, y, z, `Tool holder hits the ${f.label.toLowerCase()}.`);
    }
    if (rapid) {
      const m = t.kind === 'ball' ? this.maxUnderBall(x, y, R - this.s.cell * 0.5, z, R) : this.maxUnder(x, y, Math.max(0.1, R - this.s.cell * 0.8));
      if (m > z + 0.05 && !this.retract) this.emit('rapid-crash', i, x, y, z, `Rapid move with ${t.name} at Z${z.toFixed(1)} while stock stands at Z${m.toFixed(1)}.`);
    }
    if (heavy) {
      const mh = this.maxUnder(x, y, t.holderD / 2);
      if (mh > z + t.stickout) this.emit('holder', i, x, y, z, `Holder (Ø${t.holderD}) touches stock at Z${mh.toFixed(1)}: needs a longer tool or a smaller holder.`);
      if (cutting && t.kind !== 'drill') {
        const ms = this.maxUnder(x, y, R * 0.98);
        if (ms > z + t.fluteLen + 0.2) this.emit('shank', i, x, y, z, `Shank rubs stock ${(ms - z - t.fluteLen).toFixed(1)} mm above the ${t.fluteLen.toFixed(0)} mm flutes.`);
      }
    }
  }

  private exec(i: number) {
    const c = this.prog.cmds[i] as Cmd;
    const P = this.pose;
    const step = this.s.cell * 0.6;
    const move = (nx: number, ny: number, nz: number, na: number, nc: number, rapid: boolean) => {
      const L = Math.hypot(nx - P.x, ny - P.y, nz - P.z);
      this.retract = rapid && nz >= P.z && Math.hypot(nx - P.x, ny - P.y) < 1e-6;
      const n = Math.max(1, Math.ceil(L / (rapid ? this.s.cell * 2 : step)));
      const t = P.tool;
      const R = t ? t.d / 2 : 0;
      for (let q = 1; q <= n; q++) {
        const u = q / n;
        const x = P.x + (nx - P.x) * u, y = P.y + (ny - P.y) * u, z = P.z + (nz - P.z) * u;
        const aa = P.a + (na - P.a) * u, cc = P.c + (nc - P.c) * u;
        if (t) {
          this.tick++;
          if (this.record) this.check(i, x, y, z, rapid, !rapid, this.tick % 4 === 0);
          if (!rapid) {
            if (t.kind === 'ball' && (aa !== 0)) {
              const A = (aa * Math.PI) / 180, C = (cc * Math.PI) / 180;
              this.stamp(x, y, z, t, Math.sin(A) * Math.sin(C), Math.sin(A) * Math.cos(C), Math.cos(A));
            } else this.stamp(x, y, z, t);
          }
        }
      }
      void R;
      P.x = nx; P.y = ny; P.z = nz; P.a = na; P.c = nc; P.mode = rapid ? 'rapid' : 'feed';
    };
    switch (c.k) {
      case 'op': P.toolNo = c.tool; P.tool = this.prog.tools.find((t) => t.n === c.tool)?.tool ?? null; P.rpm = c.rpm; break;
      case 'rapid': move(c.x ?? P.x, c.y ?? P.y, c.z ?? P.z, c.a ?? P.a, c.c ?? P.c, true); break;
      case 'feed': move(c.x ?? P.x, c.y ?? P.y, c.z ?? P.z, c.a ?? P.a, c.c ?? P.c, false); break;
      case 'drill': {
        const t = P.tool;
        move(c.x, c.y, c.r, P.a, P.c, true);
        if (t) {
          if (this.record) { this.check(i, c.x, c.y, c.z, false, false, true); }
          this.stamp(c.x, c.y, c.z, { ...t, kind: 'flat' });
        }
        P.z = c.r; P.mode = 'feed';
        break;
      }
      default: break;
    }
  }

  /** Run the whole setup once, recording checkpoints, collisions and the final accuracy report. */
  async runAll(onProgress?: (frac: number) => void): Promise<SimReport> {
    this.events = []; this.lastEvt.clear(); this.checkpoints = [];
    this.S = Float32Array.from(this.s.stock);
    this.pose = { x: 0, y: 0, z: this.s.stockBox.zTop + 30, a: 0, c: 0, tool: null, toolNo: 0, rpm: 0, mode: 'rapid' };
    this.record = true;
    const a = this.s.startCmd, b = this.s.endCmd;
    const total = Math.max(1, b - a);
    const every = Math.max(60, Math.ceil(total / 36));
    let t0 = performance.now();
    this.checkpoints.push({ at: a, S: Float32Array.from(this.S), pose: { ...this.pose } });
    for (let i = a; i < b; i++) {
      this.exec(i);
      if ((i - a) % every === every - 1) this.checkpoints.push({ at: i + 1, S: Float32Array.from(this.S), pose: { ...this.pose } });
      if (performance.now() - t0 > 14) {
        onProgress?.((i - a) / total);
        await new Promise((r) => setTimeout(r, 0));
        t0 = performance.now();
      }
    }
    this.record = false;
    // accuracy against the finished surface
    const { cell, nx, ny } = this.s;
    const T = this.s.target;
    // lateral tolerance: a cut counts as a gouge only if it is below the lowest surface within ~0.4 mm
    const neg = new Float32Array(T.length);
    for (let k = 0; k < neg.length; k++) neg[k] = T[k] > -Infinity ? -T[k] : -Infinity;
    const negMax = dilateFlat(neg, nx, ny, Math.max(1, Math.round(0.45 / cell)));
    let gMax = 0, gArea = 0, lVol = 0, lMax = 0, removed = 0;
    const gx: number[] = [], gy: number[] = [];
    const allow = 0.45;
    for (let k = 0; k < this.S.length; k++) {
      if (!(this.s.stock[k] > -Infinity)) continue;
      removed += (this.s.stock[k] - this.S[k]) * cell * cell;
      const d = this.S[k] - T[k];
      const dTol = this.S[k] - (negMax[k] > -Infinity ? -negMax[k] : T[k]);
      if (T[k] <= this.s.partBox.z0 + 0.05) { if (d > allow) { lVol += d * cell * cell; if (d > lMax) lMax = d; } continue; }
      // drills break through the bottom of the part on purpose (point + clearance)
      if (dTol < -0.06 && (negMax[k] > -Infinity ? -negMax[k] : T[k]) <= this.s.partBox.z0 + 0.05 && this.S[k] >= this.s.partBox.z0 - 3.0) continue;
      if (dTol < -0.06) { gArea += cell * cell; if (-dTol > gMax) gMax = -dTol; if (gx.length < 3000) { gx.push((k % nx)); gy.push(Math.floor(k / nx)); } }
      else if (d > allow) { lVol += d * cell * cell; if (d > lMax) lMax = d; }
    }
    void ny;
    if (gArea > cell * cell * 4) {
      const kx = gx[Math.floor(gx.length / 2)] ?? 0, ky = gy[Math.floor(gy.length / 2)] ?? 0;
      this.events.push({ cmd: b - 1, kind: 'gouge', severity: 'error', msg: `Gouges ${gArea.toFixed(1)} mm² of the finished surface, up to ${gMax.toFixed(2)} mm deep.`, x: this.s.x0 + (kx + 0.5) * cell, y: this.s.y0 + (ky + 0.5) * cell, z: 0, setup: this.setup });
    }
    this.events.sort((p, q) => p.cmd - q.cmd);
    this.report = { events: this.events, gougeMax: gMax, gougeArea: gArea, leftoverVolume: lVol, leftoverMax: lMax, removed, ok: !this.events.some((e) => e.severity === 'error') };
    // leave the sim at the end state
    this.cursor = b;
    return this.report;
  }

  /** Move playback to just before command `idx` (absolute cmd index). */
  seek(idx: number) {
    const a = this.s.startCmd, b = this.s.endCmd;
    idx = Math.max(a, Math.min(b, idx));
    if (idx >= this.cursor && this.cursor > a) {
      for (let i = this.cursor; i < idx; i++) this.exec(i);
      this.cursor = idx;
      return;
    }
    let cp = this.checkpoints[0];
    for (const c of this.checkpoints) if (c.at <= idx) cp = c; else break;
    if (cp) { this.S.set(cp.S); this.pose = { ...cp.pose }; this.cursor = cp.at; }
    else { this.S.set(this.s.stock); this.cursor = a; this.pose = { x: 0, y: 0, z: this.s.stockBox.zTop + 30, a: 0, c: 0, tool: null, toolNo: 0, rpm: 0, mode: 'rapid' }; }
    for (let i = this.cursor; i < idx; i++) this.exec(i);
    this.cursor = idx;
  }
}

// ---------------------------------------------------------------------------
// Lathe

export class TurnSim {
  readonly prog: Program;
  r: Float32Array; r0: Float32Array;
  step = 0.2;
  pose = { x: 0, z: 0, mode: 'rapid' as 'rapid' | 'feed' };
  cursor = 0;
  faceAt: Uint8Array;
  events: SimEvent[] = [];
  report: SimReport | null = null;
  private checkpoints: { at: number; r: Float32Array; pose: { x: number; z: number; mode: 'rapid' | 'feed' } }[] = [];
  readonly zMin: number; readonly zMax: number;

  constructor(prog: Program) {
    this.prog = prog;
    const t = prog.turn!;
    this.faceAt = new Uint8Array(prog.cmds.length);
    { let f = 0; prog.cmds.forEach((cc, ii) => { if (cc.k === 'op') f = /facing/i.test(cc.name) ? 1 : 0; this.faceAt[ii] = f; }); }
    this.zMax = 8; this.zMin = -t.stockLen + 8;
    const n = Math.ceil((this.zMax - this.zMin) / this.step) + 1;
    this.r0 = new Float32Array(n);
    for (let i = 0; i < n; i++) { const z = this.zMax - i * this.step; this.r0[i] = z > 2 ? 0 : t.stockR; }
    this.r = Float32Array.from(this.r0);
    this.pose = { x: t.stockR * 2 + 6, z: 7, mode: 'rapid' };
  }
  private idx(z: number) { return Math.round((this.zMax - z) / this.step); }

  private exec(i: number, record: boolean) {
    const c = this.prog.cmds[i];
    const t = this.prog.turn!;
    if (c.k === 'op') return;
    if (c.k !== 'rapid' && c.k !== 'feed') return;
    const nx = c.x ?? this.pose.x, nz = c.z ?? this.pose.z;
    const L = Math.hypot((nx - this.pose.x) / 2, nz - this.pose.z);
    const n = Math.max(1, Math.ceil(L / (this.step * 0.8)));
    for (let q = 1; q <= n; q++) {
      const u = q / n, x = this.pose.x + (nx - this.pose.x) * u, z = this.pose.z + (nz - this.pose.z) * u;
      const k = this.idx(z);
      if (k < 0 || k >= this.r.length) continue;
      if (c.k === 'feed') {
        if (this.r[k] > x / 2) this.r[k] = x / 2;
        // a facing cut removes the whole layer between the old face and the tool tip
        if (this.faceAt[i]) for (let q2 = 0; q2 < k; q2++) if (this.r[q2] > x / 2) this.r[q2] = x / 2;
      }
      else if (record && x / 2 < this.r[k] - 0.05 && z > this.zMin) {
        this.push({ cmd: i, kind: 'rapid-crash', severity: 'error', msg: `Rapid move to Ø${x.toFixed(1)} at Z${z.toFixed(1)} cuts into the bar.`, x, y: 0, z, setup: 0 });
      }
      if (record && z < t.chuckZ && x / 2 < t.chuckR) this.push({ cmd: i, kind: 'chuck', severity: 'error', msg: `Tool enters the chuck jaws at Z${z.toFixed(1)}.`, x, y: 0, z, setup: 0 });
    }
    this.pose = { x: nx, z: nz, mode: c.k === 'rapid' ? 'rapid' : 'feed' };
  }
  private push(e: SimEvent) {
    const last = this.events[this.events.length - 1];
    if (last && last.kind === e.kind && Math.abs(last.z - e.z) < 3 && e.cmd - last.cmd < 5) return;
    if (this.events.length < 200) this.events.push(e);
  }
  async runAll(onProgress?: (f: number) => void): Promise<SimReport> {
    this.events = []; this.checkpoints = [];
    this.r.set(this.r0);
    const t = this.prog.turn!;
    this.pose = { x: t.stockR * 2 + 6, z: 7, mode: 'rapid' };
    const n = this.prog.cmds.length, every = Math.max(20, Math.ceil(n / 30));
    this.checkpoints.push({ at: 0, r: Float32Array.from(this.r), pose: { ...this.pose } });
    for (let i = 0; i < n; i++) {
      this.exec(i, true);
      if (i % every === every - 1) this.checkpoints.push({ at: i + 1, r: Float32Array.from(this.r), pose: { ...this.pose } });
      if (i % 400 === 399) { onProgress?.(i / n); await new Promise((r) => setTimeout(r, 0)); }
    }
    // accuracy vs the finished profile
    let gMax = 0, lMax = 0, lVol = 0;
    const prof = t.profile;
    const at = (z: number) => { for (let i = 0; i < prof.length - 1; i++) if (z <= prof[i][0] && z >= prof[i + 1][0]) { const u = (prof[i][0] - z) / Math.max(1e-9, prof[i][0] - prof[i + 1][0]); return (prof[i][1] + (prof[i + 1][1] - prof[i][1]) * u) / 2; } return prof[prof.length - 1][1] / 2; };
    const partLen = Math.abs(prof[prof.length - 1][0]);
    for (let k = 0; k < this.r.length; k++) {
      const z = this.zMax - k * this.step;
      if (z > -0.3 || z < -partLen + 0.3) continue;
      // at a shoulder the profile jumps: compare with the nearest surface within ±0.4 mm along Z
      let lo = Infinity, hi = 0;
      for (const [pz, pd] of prof) if (Math.abs(pz - z) <= 0.4) { lo = Math.min(lo, pd / 2); hi = Math.max(hi, pd / 2); }
      if (!isFinite(lo)) { lo = hi = at(z); }
      const d = this.r[k] - lo, dh = this.r[k] - hi;
      if (d < -0.05) gMax = Math.max(gMax, -d);
      else if (dh > 0.1) { lMax = Math.max(lMax, dh); lVol += Math.PI * (this.r[k] * this.r[k] - hi * hi) * this.step; }
    }
    if (gMax > 0.06) this.events.push({ cmd: n - 1, kind: 'gouge', severity: 'error', msg: `Cuts ${gMax.toFixed(2)} mm under the finished diameter.`, x: 0, y: 0, z: 0, setup: 0 });
    this.report = { events: this.events, gougeMax: gMax, gougeArea: 0, leftoverVolume: lVol, leftoverMax: lMax, removed: 0, ok: !this.events.some((e) => e.severity === 'error') };
    this.cursor = n;
    return this.report;
  }
  seek(idx: number) {
    idx = Math.max(0, Math.min(this.prog.cmds.length, idx));
    if (idx >= this.cursor && this.cursor > 0) { for (let i = this.cursor; i < idx; i++) this.exec(i, false); this.cursor = idx; return; }
    let cp = this.checkpoints[0];
    for (const c of this.checkpoints) if (c.at <= idx) cp = c; else break;
    if (cp) { this.r.set(cp.r); this.pose = { ...cp.pose }; this.cursor = cp.at; } else { this.r.set(this.r0); this.cursor = 0; }
    for (let i = this.cursor; i < idx; i++) this.exec(i, false);
    this.cursor = idx;
  }
}
