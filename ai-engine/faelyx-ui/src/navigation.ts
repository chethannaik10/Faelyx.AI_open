// Mouse navigation schemes for the 3D Design viewport, so someone used to
// another CAD package can orbit / pan / zoom the way their hands already
// expect. Every scheme also keeps the wheel (zoom toward the cursor),
// Alt + left-drag (orbit) and F / double middle-click (fit) so those work
// the same whichever scheme is picked.

export type NavScheme = 'universal' | 'catia' | 'solidworks' | 'blender' | 'autodesk';
export type NavAction = 'orbit' | 'pan' | 'zoom';
export type NavMods = { shift: boolean; ctrl: boolean };

export type NavSchemeDef = {
  label: string;
  /** What a middle-button drag does, given the modifier keys held when it starts. */
  middle: (mods: NavMods) => NavAction;
  /** What a right-button drag does (null = nothing; the button is left free). */
  right: NavAction | null;
  /** Middle + right held together orbit (CATIA's chord). */
  chord: boolean;
  /** With the chord on: a single right-click while the middle button is held latches zoom (drag up = in, down = out) until the middle button is released; holding middle + right and dragging orbits. */
  chordZoom?: boolean;
  /** The left button only selects: no drag (or Alt-drag) ever rotates the 3D view, and a left-drag draws a selection box instead. */
  leftSelectOnly?: boolean;
  /** Short bindings for the status line at the bottom of the viewport. */
  hints: string[];
  /** Full list for the Hotkeys & Navigation panel: [action, binding]. */
  rows: [string, string][];
};

export const NAV_SCHEMES: Record<NavScheme, NavSchemeDef> = {
  universal: {
    label: 'Universal (2D & 3D)',
    middle: () => 'pan',
    right: null,
    chord: true,
    chordZoom: true,
    leftSelectOnly: true,
    hints: ['LMB: Select', 'LMB drag: Box select', 'Double-click: Edit', 'MMB: Pan', 'MMB + RMB click, drag ↑↓: Zoom', 'MMB + RMB hold: Orbit', 'Scroll: Zoom'],
    rows: [['Select', 'Left-click'], ['Box select', 'Left-drag (right = window, left = crossing)'], ['Open / edit', 'Double left-click (sketch, plane, reference plane)'], ['Pan', 'MMB drag'], ['Zoom', 'Hold MMB, click RMB once, drag up / down (or scroll)'], ['Orbit (3D)', 'Hold MMB + RMB and drag']],
  },
  catia: {
    label: 'CATIA',
    middle: (m) => (m.ctrl ? 'zoom' : 'pan'),
    right: 'pan',
    chord: true,
    hints: ['MMB: Pan', 'MMB+RMB: Rotate', 'Ctrl+MMB: Zoom', 'Scroll: Zoom', 'Alt+Drag: Rotate'],
    rows: [['Pan', 'MMB drag or RMB drag'], ['Rotate', 'MMB + RMB drag or Alt + LMB drag'], ['Zoom', 'Scroll or Ctrl + MMB drag']],
  },
  solidworks: {
    label: 'SolidWorks',
    middle: (m) => (m.ctrl ? 'pan' : m.shift ? 'zoom' : 'orbit'),
    right: null,
    chord: false,
    hints: ['MMB: Rotate', 'Ctrl+MMB: Pan', 'Shift+MMB: Zoom', 'Scroll: Zoom', 'Alt+Drag: Rotate'],
    rows: [['Rotate', 'MMB drag or Alt + LMB drag'], ['Pan', 'Ctrl + MMB drag'], ['Zoom', 'Scroll or Shift + MMB drag']],
  },
  blender: {
    label: 'Blender',
    middle: (m) => (m.shift ? 'pan' : m.ctrl ? 'zoom' : 'orbit'),
    right: null,
    chord: false,
    hints: ['MMB: Rotate', 'Shift+MMB: Pan', 'Ctrl+MMB: Zoom', 'Scroll: Zoom', 'Alt+Drag: Rotate'],
    rows: [['Rotate', 'MMB drag or Alt + LMB drag'], ['Pan', 'Shift + MMB drag'], ['Zoom', 'Scroll or Ctrl + MMB drag']],
  },
  autodesk: {
    label: 'Autodesk (Fusion)',
    middle: (m) => (m.shift ? 'orbit' : m.ctrl ? 'zoom' : 'pan'),
    right: null,
    chord: false,
    hints: ['MMB: Pan', 'Shift+MMB: Rotate', 'Ctrl+MMB: Zoom', 'Scroll: Zoom', 'Alt+Drag: Rotate'],
    rows: [['Pan', 'MMB drag'], ['Rotate', 'Shift + MMB drag or Alt + LMB drag'], ['Zoom', 'Scroll or Ctrl + MMB drag']],
  },
};

export const NAV_SCHEME_LIST = (Object.keys(NAV_SCHEMES) as NavScheme[]).map((key) => ({ key, label: NAV_SCHEMES[key].label }));

/** Editing keys, the same in every scheme. */
export const COMMON_KEYS: [string, string][] = [
  ['Undo', 'Ctrl + Z'], ['Redo', 'Ctrl + Y or Ctrl + Shift + Z'], ['Select all', 'Ctrl + A'],
  ['Delete selection', 'Delete or Backspace'], ['Cancel / deselect', 'Esc'], ['Fit all', 'F or double MMB'],
];

export type NavSettings = { scheme: NavScheme; zoomToCursor: boolean };
export const DEFAULT_NAV_SETTINGS: NavSettings = { scheme: 'universal', zoomToCursor: true };

const KEY = 'faelyx.navSettings.v2'; // v2: the Universal scheme became the default
// Per-browser convenience: every read/write is guarded because storage can be blocked or empty.
export function loadNavSettings(): NavSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (parsed && parsed.scheme in NAV_SCHEMES) return { scheme: parsed.scheme, zoomToCursor: parsed.zoomToCursor !== false };
  } catch { /* fall through to the default */ }
  return DEFAULT_NAV_SETTINGS;
}
export function saveNavSettings(settings: NavSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable — the choice lasts for this session */ }
}
