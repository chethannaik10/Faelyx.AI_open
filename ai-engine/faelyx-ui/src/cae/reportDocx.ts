// Word (.docx) renderer for the report blocks: a hand-assembled OOXML package (no external library).

import { zipStore } from '../cam/zip';
import type { Block } from './reportModel';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const TW = 9638;      // text width in twips (A4, 2 cm margins)

function b64(data: string): Uint8Array {
  const raw = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  const bin = atob(raw);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
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

const run = (t: string, o: { b?: boolean; color?: string; size?: number; i?: boolean } = {}) =>
  `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.size ? `<w:sz w:val="${o.size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner: string, o: { style?: string; jc?: string; before?: number; after?: number; shade?: string; keep?: boolean } = {}) =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.keep ? '<w:keepNext/>' : ''}${o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 100}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${inner}</w:p>`;

function cell(inner: string, w: number, o: { fill?: string; span?: number } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}<w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>${inner}</w:tc>`;
}
const BORDERS = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D6DAE4"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="4" w:color="D6DAE4"/><w:right w:val="nil"/><w:insideH w:val="single" w:sz="4" w:color="D6DAE4"/><w:insideV w:val="nil"/></w:tblBorders>';

function chartJpeg(b: Extract<Block, { t: 'chart' }>): string | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 560;
  const g = cv.getContext('2d'); if (!g) return null;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 1200, 560);
  const L = 110, T = 40, Rr = 1160, B = 480;
  const tr = (v: number, log?: boolean) => (log ? Math.log10(Math.max(v, 1e-300)) : v);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of b.series) for (let i = 0; i < s.x.length; i++) { const X = tr(s.x[i], b.logx), Y = tr(s.y[i], b.logy); if (Number.isFinite(X) && Number.isFinite(Y)) { x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); } }
  if (!(x1 > x0)) x1 = x0 + 1; if (!(y1 > y0)) y1 = y0 + 1;
  const pad = (y1 - y0) * 0.05; y0 -= pad; y1 += pad;
  const px = (X: number) => L + ((X - x0) / (x1 - x0)) * (Rr - L), py = (Y: number) => B - ((Y - y0) / (y1 - y0)) * (B - T);
  g.strokeStyle = '#e4e7f0'; g.fillStyle = '#6b7385'; g.font = '20px sans-serif'; g.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const yy = T + ((B - T) * i) / 5, v = y1 - ((y1 - y0) * i) / 5; g.beginPath(); g.moveTo(L, yy); g.lineTo(Rr, yy); g.stroke();
    g.textAlign = 'right'; const val = b.logy ? Math.pow(10, v) : v; g.fillText(Math.abs(val) >= 1e5 || (Math.abs(val) < 1e-3 && val !== 0) ? val.toExponential(1) : String(+val.toPrecision(3)), L - 8, yy + 6);
    const xx = L + ((Rr - L) * i) / 5, xv = x0 + ((x1 - x0) * i) / 5; g.beginPath(); g.moveTo(xx, T); g.lineTo(xx, B); g.stroke();
    g.textAlign = 'center'; const xval = b.logx ? Math.pow(10, xv) : xv; g.fillText(Math.abs(xval) >= 1e5 || (Math.abs(xval) < 1e-3 && xval !== 0) ? xval.toExponential(1) : String(+xval.toPrecision(3)), xx, B + 28);
  }
  g.fillStyle = '#1e2230'; g.font = 'bold 24px sans-serif'; g.textAlign = 'left'; g.fillText(b.title, L, 28);
  g.font = '20px sans-serif'; g.fillStyle = '#6b7385'; g.textAlign = 'center'; g.fillText(b.xlabel, (L + Rr) / 2, 540);
  g.save(); g.translate(26, (T + B) / 2); g.rotate(-Math.PI / 2); g.fillText(b.ylabel, 0, 0); g.restore();
  const cols = ['#5846c8', '#dc5a3c', '#1e9678', '#c89614', '#3c82dc', '#b43ca0'];
  b.series.forEach((s, si) => {
    g.strokeStyle = cols[si % cols.length]; g.lineWidth = 3; g.beginPath(); let first = true;
    const step = Math.max(1, Math.floor(s.x.length / 800));
    for (let i = 0; i < s.x.length; i += step) { const X = tr(s.x[i], b.logx), Y = tr(s.y[i], b.logy); if (!Number.isFinite(X) || !Number.isFinite(Y)) continue; if (first) { g.moveTo(px(X), py(Y)); first = false; } else g.lineTo(px(X), py(Y)); }
    g.stroke();
    g.fillStyle = cols[si % cols.length]; g.fillRect(L + 12 + si * 190, T + 10, 24, 6); g.fillStyle = '#1e2230'; g.font = '18px sans-serif'; g.textAlign = 'left'; g.fillText(s.name.slice(0, 18), L + 42 + si * 190, T + 18);
  });
  return cv.toDataURL('image/jpeg', 0.92);
}

export function renderDocx(blocks: Block[], opts: { title: string; footer: string }): Uint8Array {
  const media: { name: string; data: Uint8Array }[] = [];
  const rels: string[] = [];
  let body = '';
  const image = (data: string, caption: string, widthPt = 430) => {
    const u = b64(data), sz = jpegSize(u) ?? [1200, 800];
    const id = `rId${10 + media.length}`, name = `image${media.length + 1}.jpg`;
    media.push({ name: `word/media/${name}`, data: u }); rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    const cx = Math.round(widthPt * 12700), cy = Math.round((cx * sz[1]) / sz[0]), n = media.length;
    body += para(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Figure ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`, { jc: 'center', before: 120, after: 40, keep: true });
    body += para(run(caption, { size: 17, color: '6B7385', i: true }), { jc: 'center', after: 200, style: 'Caption' });
  };

  for (const b of blocks) {
    switch (b.t) {
      case 'title': body += para(run('FAELYX AI · ENGINEERING ANALYSIS REPORT', { b: true, size: 18, color: '5846C8' }), { after: 60 }) + para(run(b.text, { b: true, size: 44, color: '1E2230' }), { style: 'Title', after: 60 }) + para(run(b.sub, { size: 20, color: '6B7385' }), { after: 240 }); break;
      case 'h1': body += para(run(b.text), { style: 'Heading1', keep: true }); break;
      case 'h2': body += para(run(b.text), { style: 'Heading2', keep: true }); break;
      case 'p': body += para(run(b.text, { size: b.small ? 17 : 20, b: b.bold, color: b.small ? '6B7385' : undefined })); break;
      case 'bullets': for (const it of b.items) body += `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:spacing w:after="40"/></w:pPr>${run(it, { size: 19 })}</w:p>`; body += para('', { after: 60 }); break;
      case 'verdict': {
        const col = b.pass === null ? '6B7385' : b.pass ? '1E8C50' : 'C82832', fill = b.pass === null ? 'EEF0F6' : b.pass ? 'E3F4EA' : 'FBE6E8';
        body += para(run(b.pass === null ? 'NOT RATED  ' : b.pass ? 'PASS  ' : 'FAIL  ', { b: true, size: 26, color: col }) + run(b.text, { b: true, size: 20 }), { shade: fill, before: 80, after: 160 });
        break;
      }
      case 'kv': {
        const half = Math.ceil(b.rows.length / 2), cw = [Math.round(TW * 0.22), Math.round(TW * 0.28), Math.round(TW * 0.22), Math.round(TW * 0.28)];
        let rows = '';
        for (let i = 0; i < half; i++) {
          const a = b.rows[i], c = b.rows[i + half];
          const col = (s?: string) => (s === 'ok' ? '1E8C50' : s === 'fail' ? 'C82832' : s === 'warn' ? 'C88214' : undefined);
          rows += `<w:tr>${cell(para(run(a.k, { size: 18, color: '6B7385' }), { after: 0 }), cw[0])}${cell(para(run(a.v, { size: 19, b: true, color: col(a.status) }), { after: 0 }), cw[1])}${cell(c ? para(run(c.k, { size: 18, color: '6B7385' }), { after: 0 }) : para('', { after: 0 }), cw[2])}${cell(c ? para(run(c.v, { size: 19, b: true, color: col(c.status) }), { after: 0 }) : para('', { after: 0 }), cw[3])}</w:tr>`;
        }
        body += `<w:tbl><w:tblPr><w:tblW w:w="${TW}" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cw.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>` + para('', { after: 120 });
        break;
      }
      case 'table': {
        const wts = b.widths ?? b.cols.map(() => 1), tot = wts.reduce((a, c) => a + c, 0), cw = wts.map((w) => Math.round((w / tot) * TW));
        const sz = b.cols.length > 6 ? 16 : 17;
        if (b.caption) body += para(run(b.caption, { b: true, size: 19, color: '6B7385' }), { before: 100, after: 60, keep: true });
        let rows = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.cols.map((c, i) => cell(para(run(c, { b: true, size: sz }), { after: 0 }), cw[i], { fill: 'EEF0F8' })).join('')}</w:tr>`;
        for (const r of b.rows) rows += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((v, i) => { const s = String(v); return cell(para(run(s, { size: sz, b: s === 'PASS' || s === 'FAIL', color: s === 'PASS' ? '1E8C50' : s === 'FAIL' ? 'C82832' : undefined }), { after: 0 }), cw[i]); }).join('')}</w:tr>`;
        body += `<w:tbl><w:tblPr><w:tblW w:w="${TW}" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cw.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>` + para('', { after: 140 });
        break;
      }
      case 'img': image(b.data, b.caption); break;
      case 'chart': { const j = chartJpeg(b); if (j) image(j, b.title, 430); break; }
      case 'break': body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; break;
    }
  }
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${ns}><w:body>${body}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="5846C8"/></w:pBdr><w:spacing w:before="320" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="5846C8"/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:i/><w:sz w:val="17"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="360" w:hanging="260"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="260"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${ns}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="${TW}"/></w:tabs></w:pPr>${run(opts.footer, { size: 16, color: '6B7385' })}<w:r><w:tab/></w:r>${run('Page ', { size: 16, color: '6B7385' })}<w:r><w:rPr><w:sz w:val="16"/><w:color w:val="6B7385"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${rels.join('')}</Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(opts.title)}</dc:title><dc:creator>Faelyx AI CAE</dc:creator></cp:coreProperties>`;
  const enc = new TextEncoder();
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(types) }, { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'word/document.xml', data: enc.encode(doc) }, { name: 'word/styles.xml', data: enc.encode(styles) }, { name: 'word/numbering.xml', data: enc.encode(numbering) },
    { name: 'word/footer1.xml', data: enc.encode(footer) }, { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) }, { name: 'docProps/core.xml', data: enc.encode(core) },
    ...media,
  ]);
}
