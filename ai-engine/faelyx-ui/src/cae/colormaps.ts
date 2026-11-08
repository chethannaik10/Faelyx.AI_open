// Contour colour maps for the results viewport.

export type CmapId = 'rainbow' | 'turbo' | 'viridis' | 'thermal' | 'grey' | 'coolwarm';
export const CMAPS: { id: CmapId; label: string }[] = [
  { id: 'rainbow', label: 'Rainbow (CAE standard)' }, { id: 'turbo', label: 'Turbo' }, { id: 'viridis', label: 'Viridis' },
  { id: 'thermal', label: 'Thermal' }, { id: 'grey', label: 'Grey' }, { id: 'coolwarm', label: 'Blue – white – red' },
];

type Stop = [number, number, number, number];     // t, r, g, b (0..255)
const STOPS: Record<CmapId, Stop[]> = {
  rainbow: [[0, 26, 51, 204], [0.25, 20, 190, 235], [0.5, 40, 200, 80], [0.75, 245, 225, 40], [1, 225, 30, 30]],
  turbo: [[0, 48, 18, 59], [0.15, 70, 107, 227], [0.3, 40, 188, 235], [0.45, 49, 241, 148], [0.6, 164, 252, 60], [0.75, 251, 185, 56], [0.9, 227, 69, 13], [1, 122, 4, 3]],
  viridis: [[0, 68, 1, 84], [0.25, 59, 82, 139], [0.5, 33, 144, 140], [0.75, 93, 201, 99], [1, 253, 231, 37]],
  thermal: [[0, 10, 10, 40], [0.25, 90, 20, 130], [0.5, 200, 40, 90], [0.75, 250, 140, 30], [1, 255, 240, 160]],
  grey: [[0, 30, 30, 34], [1, 235, 235, 240]],
  coolwarm: [[0, 38, 80, 190], [0.5, 235, 235, 238], [1, 200, 40, 40]],
};

/** Writes rgb (0..1) for t in [0,1] */
export function cmapRGB(id: CmapId, t: number, out: ArrayLike<number> & { [i: number]: number }, o = 0) {
  const s = STOPS[id];
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  let i = 0;
  while (i < s.length - 2 && x > s[i + 1][0]) i++;
  const a = s[i], b = s[i + 1], u = (x - a[0]) / (b[0] - a[0] || 1);
  out[o] = (a[1] + (b[1] - a[1]) * u) / 255; out[o + 1] = (a[2] + (b[2] - a[2]) * u) / 255; out[o + 2] = (a[3] + (b[3] - a[3]) * u) / 255;
}

export function cmapCss(id: CmapId, reverse = false): string {
  const tmp = [0, 0, 0], parts: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    cmapRGB(id, reverse ? 1 - t : t, tmp);
    parts.push(`rgb(${Math.round(tmp[0] * 255)},${Math.round(tmp[1] * 255)},${Math.round(tmp[2] * 255)}) ${(t * 100).toFixed(0)}%`);
  }
  return `linear-gradient(to top, ${parts.join(',')})`;
}

export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(2);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toPrecision(3);
}
