// Hand-written PDF renderer for the report blocks (Helvetica, WinAnsi, embedded JPEG figures, vector charts).

import type { Block } from './reportModel';

const W = 595.28, H = 841.89, MX = 48, MT = 56, MB = 56;
const CW = W - 2 * MX;

// Helvetica / Helvetica-Bold advance widths for ASCII 32..126 (per 1000 em)
const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BW = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

const MAP: Record<string, string> = {
  '≥': '>=', '≤': '<=', '≈': '~', '→': '->', '←': '<-', '−': '-', '‑': '-', '×': '\xd7', '·': '\xb7', '°': '\xb0', '±': '\xb1', '²': '\xb2', '³': '\xb3', 'µ': '\xb5', 'μ': '\xb5', '½': '\xbd', '¼': '\xbc',
  '–': '\x96', '—': '\x97', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94', '•': '\x95', '…': '\x85', '∞': 'inf', '√': 'sqrt', '∂': 'd', '≠': '!=',
  'λ': 'lambda', 'σ': 'sigma', 'ν': 'nu', 'ζ': 'zeta', 'ω': 'omega', 'ε': 'eps', 'Δ': 'Delta', 'ρ': 'rho', 'α': 'alpha', 'β': 'beta', 'δ': 'delta', 'φ': 'phi', 'θ': 'theta', 'τ': 'tau', 'π': 'pi', 'Ω': 'Ohm', 'Σ': 'Sum', 'γ': 'gamma', 'κ': 'kappa', 'η': 'eta',
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '⁻': '-', '¹': '1', '⁰': '0', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ₘ': 'm', 'ₐ': 'a', '⁄': '/', '∕': '/', '\u00a0': ' ',
};

/** Unicode → WinAnsi (one byte per char, as a JS string with char codes < 256) */
function win(s: string): string {
  let out = '';
  for (const ch of s) {
    const m = MAP[ch];
    if (m !== undefined) { out += m; continue; }
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c < 127) out += ch;
    else if (c >= 160 && c < 256) out += ch;
    else if (c === 9 || c === 10) out += ' ';
    else out += '?';
  }
  return out;
}

function charW(c: number, bold: boolean): number {
  if (c >= 32 && c <= 126) return (bold ? BW : HW)[c - 32];
  if (c === 0x96) return 556; if (c === 0x97) return 1000; if (c === 0x95) return 350; if (c === 0x85) return 1000;
  return 556;
}
export function textW(s: string, size: number, bold = false): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charW(s.charCodeAt(i), bold);
  return (w * size) / 1000;
}

function wrap(text: string, size: number, maxW: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of win(text).split('\n')) {
    const words = para.split(/(\s+)/).filter((x) => x.length);
    let cur = '';
    for (const w of words) {
      const t = cur + w;
      if (textW(t, size, bold) <= maxW || !cur.trim()) { cur = t; if (textW(cur, size, bold) > maxW && !/\s/.test(w)) { /* a very long token: hard-split */
          let piece = '';
          for (const ch of cur) { if (textW(piece + ch, size, bold) > maxW) { lines.push(piece); piece = ch; } else piece += ch; }
          cur = piece;
        } }
      else { lines.push(cur.trimEnd()); cur = w.trimStart(); }
    }
    lines.push(cur.trimEnd());
  }
  return lines;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, (c) => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0'));
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = (c: [number, number, number]) => `${num(c[0] / 255)} ${num(c[1] / 255)} ${num(c[2] / 255)}`;

type Col = [number, number, number];
const INK: Col = [30, 34, 48], MUTED: Col = [100, 108, 128], ACCENT: Col = [88, 70, 200], LINE: Col = [214, 218, 228], HEAD: Col = [238, 240, 248], OK: Col = [30, 140, 80], BAD: Col = [200, 40, 50], WARN: Col = [200, 130, 20];

function b64(data: string): Uint8Array {
  const raw = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  const bin = atob(raw);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

class Doc {
  pages: string[][] = [[]];
  y = MT;
  images: { w: number; h: number; data: Uint8Array }[] = [];
  pageImages: Set<number>[] = [new Set()];
  header = '';
  get page() { return this.pages[this.pages.length - 1]; }
  add(s: string) { this.page.push(s); }
  newPage() { this.pages.push([]); this.pageImages.push(new Set()); this.y = MT; }
  need(h: number) { if (this.y + h > H - MB) this.newPage(); }
  text(x: number, y: number, s: string, size: number, o: { bold?: boolean; color?: Col; align?: 'l' | 'r' | 'c'; w?: number } = {}) {
    const t = win(s), tw = textW(t, size, o.bold);
    const xx = o.align === 'r' ? x + (o.w ?? 0) - tw : o.align === 'c' ? x + ((o.w ?? 0) - tw) / 2 : x;
    this.add(`BT /${o.bold ? 'F2' : 'F1'} ${size} Tf ${rgb(o.color ?? INK)} rg ${num(xx)} ${num(H - y)} Td (${esc(t)}) Tj ET`);
  }
  rect(x: number, y: number, w: number, h: number, fill?: Col, stroke?: Col, lw = 0.6) {
    let op = '';
    if (fill) op += `${rgb(fill)} rg `;
    if (stroke) op += `${rgb(stroke)} RG ${lw} w `;
    this.add(`${op}${num(x)} ${num(H - y - h)} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  }
  line(x1: number, y1: number, x2: number, y2: number, c: Col = LINE, lw = 0.6) { this.add(`${rgb(c)} RG ${lw} w ${num(x1)} ${num(H - y1)} m ${num(x2)} ${num(H - y2)} l S`); }
  poly(pts: [number, number][], c: Col, lw = 1.2) {
    if (pts.length < 2) return;
    this.add(`${rgb(c)} RG ${lw} w ${pts.map((p, i) => `${num(p[0])} ${num(H - p[1])} ${i ? 'l' : 'm'}`).join(' ')} S`);
  }
  image(idx: number, x: number, y: number, w: number, h: number) {
    this.pageImages[this.pages.length - 1].add(idx);
    this.add(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(H - y - h)} cm /Im${idx} Do Q`);
  }
}

function jpegSize(u: Uint8Array): [number, number] | null {
  let i = 2;
  while (i < u.length) {
    if (u[i] !== 0xff) { i++; continue; }
    const m = u[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [(u[i + 7] << 8) | u[i + 8], (u[i + 5] << 8) | u[i + 6]];
    i += 2 + ((u[i + 2] << 8) | u[i + 3]);
  }
  return null;
}

function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
const tickLabel = (v: number) => { const a = Math.abs(v); return a !== 0 && (a >= 1e5 || a < 1e-3) ? v.toExponential(1) : String(+v.toPrecision(4)); };
const SERIES: Col[] = [[88, 70, 200], [220, 90, 60], [30, 150, 120], [200, 150, 20], [60, 130, 220], [180, 60, 160]];

export function renderPdf(blocks: Block[], opts: { title: string; footer: string }): Uint8Array {
  const d = new Doc();
  d.header = opts.title;

  const paragraph = (text: string, size: number, o: { bold?: boolean; color?: Col; indent?: number; gap?: number } = {}) => {
    const lines = wrap(text, size, CW - (o.indent ?? 0), o.bold);
    const lh = size * 1.35;
    for (const l of lines) { d.need(lh); d.text(MX + (o.indent ?? 0), d.y + size, l, size, { bold: o.bold, color: o.color }); d.y += lh; }
    d.y += o.gap ?? 4;
  };

  for (const b of blocks) {
    switch (b.t) {
      case 'title': {
        d.rect(0, 0, W, 118, ACCENT);
        d.text(MX, 54, win('FAELYX AI · ENGINEERING ANALYSIS REPORT'), 9, { color: [220, 214, 255], bold: true });
        const tl = wrap(b.text, 22, CW, true);
        tl.slice(0, 2).forEach((l, i) => d.text(MX, 82 + i * 26, l, 22, { bold: true, color: [255, 255, 255] }));
        d.text(MX, 82 + Math.min(2, tl.length) * 26 - 8, b.sub, 9.5, { color: [226, 222, 255] });
        d.y = 138;
        break;
      }
      case 'h1': d.need(96); d.y += 10; d.text(MX, d.y + 13, b.text, 14, { bold: true, color: ACCENT }); d.y += 20; d.line(MX, d.y, W - MX, d.y, ACCENT, 1); d.y += 8; break;
      case 'h2': d.need(70); d.y += 4; d.text(MX, d.y + 11, b.text, 11, { bold: true }); d.y += 18; break;
      case 'p': paragraph(b.text, b.small ? 8.5 : 10, { bold: b.bold, color: b.small ? MUTED : INK }); break;
      case 'bullets':
        for (const it of b.items) {
          const lines = wrap(it, 9.5, CW - 14);
          const lh = 12.5;
          d.need(lh * Math.min(lines.length, 2));
          d.text(MX + 2, d.y + 9.5, '•', 9.5, { color: ACCENT });
          lines.forEach((l, i) => { d.need(lh); d.text(MX + 14, d.y + 9.5, l, 9.5); d.y += lh; void i; });
          d.y += 2;
        }
        d.y += 4;
        break;
      case 'verdict': {
        d.need(46);
        const col = b.pass === null ? MUTED : b.pass ? OK : BAD;
        d.rect(MX, d.y, CW, 34, [col[0] * 0.12 + 225, col[1] * 0.12 + 225, col[2] * 0.12 + 225] as Col, col, 1);
        d.rect(MX, d.y, 6, 34, col);
        d.text(MX + 16, d.y + 14, b.pass === null ? 'NOT RATED' : b.pass ? 'PASS' : 'FAIL', 12, { bold: true, color: col });
        const tl = wrap(b.text, 9.5, CW - 90);
        d.text(MX + 74, d.y + 14, tl[0] ?? '', 9.5, { bold: true });
        if (tl[1]) d.text(MX + 74, d.y + 27, tl[1] + (tl.length > 2 ? ' …' : ''), 9);
        d.y += 44;
        break;
      }
      case 'kv': {
        const rows = b.rows, half = Math.ceil(rows.length / 2), colW = CW / 2 - 6;
        const draw = (list: typeof rows, x: number, y0: number) => {
          let y = y0;
          for (const r of list) {
            const vl = wrap(r.v, 9.5, colW * 0.46, true), kl = wrap(r.k, 9, colW * 0.52);
            const hh = Math.max(vl.length, kl.length) * 12 + 5;
            kl.forEach((l, i) => d.text(x, y + 9 + i * 12, l, 9, { color: MUTED }));
            const sc = r.status === 'ok' ? OK : r.status === 'fail' ? BAD : r.status === 'warn' ? WARN : INK;
            vl.forEach((l, i) => d.text(x + colW * 0.54, y + 9.5 + i * 12, l, 9.5, { bold: true, color: sc }));
            d.line(x, y + hh - 1, x + colW, y + hh - 1, LINE, 0.4);
            y += hh;
          }
          return y;
        };
        // measure heights first so the block does not split across pages awkwardly
        const meas = (list: typeof rows) => list.reduce((s, r) => s + Math.max(wrap(r.v, 9.5, colW * 0.46, true).length, wrap(r.k, 9, colW * 0.52).length) * 12 + 5, 0);
        const hLeft = meas(rows.slice(0, half)), hRight = meas(rows.slice(half));
        if (rows.length > 14 && Math.max(hLeft, hRight) > H - MB - MT) {
          // very long list: single column flowing across pages
          for (const r of rows) { const hh = Math.max(wrap(r.v, 9.5, CW * 0.5, true).length, 1) * 12 + 5; d.need(hh); const y = d.y; wrap(r.k, 9, CW * 0.45).forEach((l, i) => d.text(MX, y + 9 + i * 12, l, 9, { color: MUTED })); wrap(r.v, 9.5, CW * 0.5, true).forEach((l, i) => d.text(MX + CW * 0.5, y + 9.5 + i * 12, l, 9.5, { bold: true })); d.line(MX, y + hh - 1, W - MX, y + hh - 1, LINE, 0.4); d.y += hh; }
        } else {
          d.need(Math.max(hLeft, hRight) + 6);
          const y0 = d.y;
          const y1 = draw(rows.slice(0, half), MX, y0), y2 = draw(rows.slice(half), MX + CW / 2 + 6, y0);
          d.y = Math.max(y1, y2);
        }
        d.y += 8;
        break;
      }
      case 'table': {
        const n = b.cols.length, wts = b.widths ?? b.cols.map(() => 1), tot = wts.reduce((a, c) => a + c, 0);
        const cw = wts.map((w) => (w / tot) * CW);
        const size = n > 6 ? 7.8 : 8.6, lh = size * 1.3;
        if (b.caption) { d.need(40); d.text(MX, d.y + 10, b.caption, 9.5, { bold: true, color: MUTED }); d.y += 15; }
        const header = () => {
          const hl = b.cols.map((c, i) => wrap(c, size, cw[i] - 8, true));
          const hh = Math.max(...hl.map((l) => l.length)) * lh + 7;
          d.need(hh + lh * 2);
          d.rect(MX, d.y, CW, hh, HEAD);
          let x = MX;
          hl.forEach((l, i) => { l.forEach((s, k) => d.text(x + 4, d.y + size + 3 + k * lh, s, size, { bold: true })); x += cw[i]; });
          d.line(MX, d.y + hh, W - MX, d.y + hh, LINE, 0.8);
          d.y += hh;
        };
        header();
        b.rows.forEach((row, ri) => {
          const cells = row.map((c, i) => wrap(String(c), size, cw[i] - 8));
          const maxLines = Math.min(6, Math.max(...cells.map((c) => c.length)));
          const hh = maxLines * lh + 5;
          if (d.y + hh > H - MB) { d.newPage(); header(); }
          if (ri % 2 === 1) d.rect(MX, d.y, CW, hh, [248, 249, 252]);
          let x = MX;
          cells.forEach((cl, i) => {
            const st = String(row[i]);
            const col = st === 'PASS' ? OK : st === 'FAIL' ? BAD : INK;
            cl.slice(0, 6).forEach((s, k) => d.text(x + 4, d.y + size + 2 + k * lh, s, size, { color: col, bold: st === 'PASS' || st === 'FAIL' }));
            x += cw[i];
          });
          d.line(MX, d.y + hh, W - MX, d.y + hh, LINE, 0.3);
          d.y += hh;
        });
        d.y += 10;
        break;
      }
      case 'img': {
        const u = b64(b.data);
        const sz = jpegSize(u) ?? [b.w, b.h];
        const w = Math.min(CW, 440), h = (w * sz[1]) / sz[0];
        d.need(h + 30);
        d.images.push({ w: sz[0], h: sz[1], data: u });
        d.rect(MX + (CW - w) / 2 - 1, d.y - 1, w + 2, h + 2, undefined, LINE, 0.8);
        d.image(d.images.length - 1, MX + (CW - w) / 2, d.y, w, h);
        d.y += h + 12;
        d.text(MX, d.y, b.caption, 8.5, { color: MUTED, align: 'c', w: CW }); d.y += 16;
        break;
      }
      case 'chart': {
        const ch = 170, cwid = CW;
        d.need(ch + 56);
        d.text(MX, d.y + 10, b.title, 9.5, { bold: true }); d.y += 16;
        const x0 = MX + 46, y0 = d.y + 4, pw = cwid - 56, ph = ch - 36;
        d.rect(x0, y0, pw, ph, [252, 252, 254], LINE, 0.6);
        const tr = (v: number, log: boolean | undefined) => (log ? Math.log10(Math.max(v, 1e-300)) : v);
        let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
        for (const s of b.series) for (let i = 0; i < s.x.length; i++) {
          const X = tr(s.x[i], b.logx), Y = tr(s.y[i], b.logy);
          if (Number.isFinite(X) && Number.isFinite(Y)) { xmin = Math.min(xmin, X); xmax = Math.max(xmax, X); ymin = Math.min(ymin, Y); ymax = Math.max(ymax, Y); }
        }
        if (!(xmax > xmin)) { xmax = xmin + 1; }
        if (!(ymax > ymin)) { ymax = ymin + 1; }
        const pad = (ymax - ymin) * 0.05; ymin -= pad; ymax += pad;
        const px = (X: number) => x0 + ((X - xmin) / (xmax - xmin)) * pw, py = (Y: number) => y0 + ph - ((Y - ymin) / (ymax - ymin)) * ph;
        for (const t of niceTicks(ymin, ymax, 4)) { const yy = py(t); if (yy < y0 || yy > y0 + ph) continue; d.line(x0, yy, x0 + pw, yy, [232, 234, 242], 0.4); d.text(x0 - 4, yy + 3, tickLabel(b.logy ? Math.pow(10, t) : t), 7.5, { color: MUTED, align: 'r', w: 0 }); }
        for (const t of niceTicks(xmin, xmax, 5)) { const xx = px(t); if (xx < x0 || xx > x0 + pw) continue; d.line(xx, y0, xx, y0 + ph, [232, 234, 242], 0.4); d.text(xx, y0 + ph + 11, tickLabel(b.logx ? Math.pow(10, t) : t), 7.5, { color: MUTED, align: 'c', w: 0 }); }
        d.text(x0, y0 + ph + 23, b.xlabel, 8, { color: MUTED, align: 'c', w: pw });
        d.text(MX, y0 - 6, b.ylabel, 8, { color: MUTED });
        b.series.forEach((s, si) => {
          const step = Math.max(1, Math.floor(s.x.length / 600)), pts: [number, number][] = [];
          for (let i = 0; i < s.x.length; i += step) { const X = tr(s.x[i], b.logx), Y = tr(s.y[i], b.logy); if (Number.isFinite(X) && Number.isFinite(Y)) pts.push([px(X), py(Y)]); }
          d.poly(pts, SERIES[si % SERIES.length], 1.2);
        });
        let lx = x0 + 6;
        b.series.slice(0, 5).forEach((s, si) => { d.line(lx, y0 + 9, lx + 12, y0 + 9, SERIES[si % SERIES.length], 1.6); d.text(lx + 15, y0 + 12, s.name, 7.5); lx += 22 + textW(win(s.name), 7.5); });
        d.y += ch + 8;
        break;
      }
      case 'break': d.newPage(); break;
    }
  }

  // ---- serialise ------------------------------------------------------------------
  const objs: (string | Uint8Array)[] = [];
  const enc = new TextEncoder();
  const latin = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const nPages = d.pages.length;
  // object numbering: 1 catalog, 2 pages, 3 F1, 4 F2, 5.. images, then pages (page, content)
  const imgBase = 5, pageBase = imgBase + d.images.length;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const emit = (u: Uint8Array) => { parts.push(u); pos += u.length; };
  const obj = (n: number, body: Uint8Array | string) => { offsets[n] = pos; emit(latin(`${n} 0 obj\n`)); emit(typeof body === 'string' ? latin(body) : body); emit(latin('\nendobj\n')); };
  emit(latin('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${nPages} /Kids [${d.pages.map((_, i) => `${pageBase + 2 * i} 0 R`).join(' ')}] >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  d.images.forEach((im, i) => {
    const head = latin(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`);
    const all = new Uint8Array(head.length + im.data.length + 10);
    all.set(head); all.set(im.data, head.length); all.set(latin('\nendstream'), head.length + im.data.length);
    obj(imgBase + i, all.subarray(0, head.length + im.data.length + 10));
  });
  d.pages.forEach((lines, i) => {
    // header / footer
    const foot = [`BT /F1 8 Tf ${rgb(MUTED)} rg ${num(MX)} ${num(30)} Td (${esc(win(opts.footer))}) Tj ET`,
      `BT /F1 8 Tf ${rgb(MUTED)} rg ${num(W - MX - textW(`Page ${i + 1} of ${nPages}`, 8))} ${num(30)} Td (Page ${i + 1} of ${nPages}) Tj ET`,
      `${rgb(LINE)} RG 0.5 w ${MX} 42 m ${W - MX} 42 l S`];
    if (i > 0) foot.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${num(MX)} ${num(H - 32)} Td (${esc(win(opts.title))}) Tj ET`, `${rgb(LINE)} RG 0.5 w ${MX} ${H - 38} m ${W - MX} ${H - 38} l S`);
    const content = latin([...lines, ...foot].join('\n'));
    const xo = [...d.pageImages[i]].map((k) => `/Im${k} ${imgBase + k} 0 R`).join(' ');
    obj(pageBase + 2 * i, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(W)} ${num(H)}] /Contents ${pageBase + 2 * i + 1} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xo} >> >> >>`);
    const sh = latin(`<< /Length ${content.length} >>\nstream\n`);
    const all = new Uint8Array(sh.length + content.length + 10);
    all.set(sh); all.set(content, sh.length); all.set(latin('\nendstream'), sh.length + content.length);
    obj(pageBase + 2 * i + 1, all);
  });
  const total = pageBase + 2 * nPages;
  const xrefAt = pos;
  let xr = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) xr += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  emit(latin(xr + `trailer\n<< /Size ${total} /Root 1 0 R /Info << /Title (${esc(win(opts.title))}) /Producer (Faelyx AI CAE) >> >>\nstartxref\n${xrefAt}\n%%EOF\n`));
  void objs; void enc;
  const out = new Uint8Array(pos);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
