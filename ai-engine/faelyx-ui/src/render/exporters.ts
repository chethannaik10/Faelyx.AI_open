// RenderX Engine — file writers for the rendered image. PNG comes from the
// canvas; TIFF (8-bit RGBA, uncompressed, straight alpha) is written here.

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode the PNG (image too large?)'))), 'image/png'));
}

/** Baseline little-endian TIFF, RGBA 8-bit, one strip, ExtraSamples = unassociated alpha. */
export function encodeTiff(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): Blob {
  const entries = 12;
  const ifdOffset = 8;
  const ifdSize = 2 + entries * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize; // 4 × SHORT
  const resOffset = bitsOffset + 8; // two RATIONALs (X / Y resolution)
  const dataOffset = resOffset + 16;
  const dataSize = width * height * 4;
  const buffer = new ArrayBuffer(dataOffset + dataSize);
  const view = new DataView(buffer);
  view.setUint8(0, 0x49); view.setUint8(1, 0x49); view.setUint16(2, 42, true); view.setUint32(4, ifdOffset, true);
  let p = ifdOffset;
  view.setUint16(p, entries, true); p += 2;
  const put = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(p, tag, true); view.setUint16(p + 2, type, true); view.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(p + 8, value, true); else view.setUint32(p + 8, value, true);
    p += 12;
  };
  put(256, 4, 1, width);            // ImageWidth
  put(257, 4, 1, height);           // ImageLength
  put(258, 3, 4, bitsOffset);       // BitsPerSample 8,8,8,8
  put(259, 3, 1, 1);                // Compression: none
  put(262, 3, 1, 2);                // Photometric: RGB
  put(273, 4, 1, dataOffset);       // StripOffsets
  put(277, 3, 1, 4);                // SamplesPerPixel
  put(278, 4, 1, height);           // RowsPerStrip
  put(279, 4, 1, dataSize);         // StripByteCounts
  put(282, 5, 1, resOffset);        // XResolution
  put(283, 5, 1, resOffset + 8);    // YResolution
  put(338, 3, 1, 2);                // ExtraSamples: unassociated alpha
  view.setUint32(p, 0, true);
  for (let i = 0; i < 4; i++) view.setUint16(bitsOffset + i * 2, 8, true);
  view.setUint32(resOffset, 300, true); view.setUint32(resOffset + 4, 1, true); view.setUint32(resOffset + 8, 300, true); view.setUint32(resOffset + 12, 1, true);
  new Uint8Array(buffer, dataOffset, dataSize).set(rgba);
  return new Blob([buffer], { type: 'image/tiff' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
