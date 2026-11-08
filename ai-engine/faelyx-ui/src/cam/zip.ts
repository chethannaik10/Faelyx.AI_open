// Minimal ZIP writer (STORE, no compression) and a 3MF model exporter.
// 3MF is a ZIP of XML files; the mesh is exported in millimetres with shared vertices.

import type { Mesh } from './geometry';

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v: number) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  const cat = (...a: Uint8Array[]) => { const n = a.reduce((s, x) => s + x.length, 0); const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
  // fixed DOS date 2026-01-01 00:00 keeps the archive reproducible
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), name);
    chunks.push(local, f.data);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name));
    offset += local.length + f.data.length;
  }
  const cd = cat(...central);
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0));
  return cat(...chunks, cd, end);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A valid 3MF package holding one mesh object (mm). `meta` becomes <metadata> entries. */
export function make3mf(mesh: Mesh, name: string, meta: Record<string, string> = {}): Uint8Array {
  const enc = new TextEncoder();
  const verts = new Map<string, number>();
  const vx: string[] = [];
  const tri: string[] = [];
  const t = mesh.tris;
  const idx = (x: number, y: number, z: number) => {
    const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let i = verts.get(k);
    if (i === undefined) { i = verts.size; verts.set(k, i); vx.push(`<vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}"/>`); }
    return i;
  };
  // shift so the part sits on the build plate at the origin
  const ox = mesh.min[0], oy = mesh.min[1], oz = mesh.min[2];
  for (let f = 0; f < t.length; f += 9) {
    const a = idx(t[f] - ox, t[f + 1] - oy, t[f + 2] - oz), b = idx(t[f + 3] - ox, t[f + 4] - oy, t[f + 5] - oz), c = idx(t[f + 6] - ox, t[f + 7] - oy, t[f + 8] - oz);
    if (a === b || b === c || a === c) continue;
    tri.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
  }
  const metaXml = Object.entries(meta).map(([k, v]) => `<metadata name="${esc(k)}">${esc(v)}</metadata>`).join('');
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">${metaXml}<resources><object id="1" type="model" name="${esc(name)}"><mesh><vertices>${vx.join('')}</vertices><triangles>${tri.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(types) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: '3D/3dmodel.model', data: enc.encode(model) },
  ]);
}
