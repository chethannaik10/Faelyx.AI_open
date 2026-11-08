// config.ts — values shared by the Sketch & 2D and 3D Design workspaces.

// Where cad_server.py runs, first match wins:
//   1. ?api=<url> in the page address (remembered for next time) — lets
//      the GitHub Pages copy talk to a backend you run or host,
//   2. the URL saved from a previous ?api= or the Style popover's
//      "Backend URL" field,
//   3. VITE_API_BASE at build time,
//   4. this machine: http://127.0.0.1:8000.
const API_KEY = 'faelyx-api-base';
function resolveApiBase(): string {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('api');
    if (fromQuery) { localStorage.setItem(API_KEY, fromQuery); return fromQuery.replace(/\/+$/, ''); }
    const saved = localStorage.getItem(API_KEY);
    if (saved) return saved.replace(/\/+$/, '');
  } catch { /* no window/storage (tests) — fall through */ }
  return ((import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
}
export const API_BASE: string = resolveApiBase();
export const DEFAULT_API_BASE = 'http://127.0.0.1:8000';

// Saves (or, with an empty value, clears) the backend URL; takes effect on reload.
export function setSavedApiBase(url: string) {
  try {
    if (url.trim()) localStorage.setItem(API_KEY, url.trim());
    else localStorage.removeItem(API_KEY);
  } catch { /* storage unavailable */ }
}

// The sketch canvas's origin marker, in canvas (SVG) units — the center of
// its default 400 x 300 view. A traced profile keeps canvas X and negates
// Y, so this origin sits at (x, -y) in profile coordinates; Sketch on Face
// uses that to put the sketch origin on the picked point.
export const SKETCH_ORIGIN_SVG = { x: 200, y: 150 } as const;
