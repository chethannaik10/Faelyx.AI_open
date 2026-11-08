// RenderX Engine — the data side of the photo studio: the material & finish
// library, environment / backdrop / lighting-rig presets, camera maths and the
// output (resolution, quality, format) settings. No three.js in here, so the
// UI and the engine can both import it freely.

export type MaterialCategory = 'Metals' | 'Plastics' | 'Glass & Clear' | 'Carbon Fiber' | 'Paints' | 'Wood' | 'Fabrics';
export const MATERIAL_CATEGORIES: MaterialCategory[] = ['Metals', 'Plastics', 'Glass & Clear', 'Carbon Fiber', 'Paints', 'Wood', 'Fabrics'];

/** Procedural height patterns (tileable) used for Bump / Normal mapping. 'custom' is an uploaded image. */
export type ReliefKind = 'none' | 'brushed' | 'weave' | 'twill' | 'grain' | 'dimple' | 'noise' | 'knurl' | 'custom';
export const RELIEF_LABELS: Record<ReliefKind, string> = { none: 'None', brushed: 'Brushed lines', weave: 'Plain weave', twill: 'Twill weave', grain: 'Wood grain', dimple: 'Dimples / leather', noise: 'Fine noise (matte)', knurl: 'Knurl', custom: 'Uploaded map' };

/** Procedural colour maps (wood, carbon, fabric) — tinted by the material colour. */
export type ColorMapKind = 'none' | 'oak' | 'walnut' | 'maple' | 'carbon-twill' | 'carbon-plain' | 'denim' | 'felt' | 'nylon';
export type Projection = 'box' | 'planarX' | 'planarY' | 'planarZ';
export const PROJECTION_LABELS: Record<Projection, string> = { box: 'Box (auto per face)', planarX: 'Planar · X axis', planarY: 'Planar · Y axis', planarZ: 'Planar · Z axis' };

export interface SurfaceParams {
  color: string;
  metalness: number;
  roughness: number;
  /** 0–1. Below 1 the surface is alpha-blended. */
  opacity: number;
  /** 0–1 light transmission (glass, clear plastics). */
  transmission: number;
  ior: number;
  /** Volume thickness for refraction, in scene units. */
  thickness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  anisotropy: number;
  colorMap: ColorMapKind;
  relief: ReliefKind;
  /** 'bump' reads the pattern as a height map, 'normal' converts it to a tangent-space normal map first. */
  reliefMode: 'bump' | 'normal';
  reliefStrength: number;
  /** Size of one texture tile, in model millimetres. */
  tileMm: number;
  /** Texture rotation, degrees. */
  rotation: number;
  projection: Projection;
}

export const DEFAULT_SURFACE: SurfaceParams = {
  color: '#c9ccd2', metalness: 0, roughness: 0.5, opacity: 1, transmission: 0, ior: 1.5, thickness: 0.05,
  clearcoat: 0, clearcoatRoughness: 0.1, sheen: 0, anisotropy: 0,
  colorMap: 'none', relief: 'none', reliefMode: 'bump', reliefStrength: 1, tileMm: 40, rotation: 0, projection: 'box',
};
export const surface = (patch: Partial<SurfaceParams>): SurfaceParams => ({ ...DEFAULT_SURFACE, ...patch });

export interface MaterialPreset { id: string; name: string; category: MaterialCategory; finish: string; params: SurfaceParams }

export const MATERIAL_LIBRARY: MaterialPreset[] = [
  // — Metals
  { id: 'alu-brushed', name: 'Aluminium', finish: 'Brushed', category: 'Metals', params: surface({ color: '#d5d8dc', metalness: 1, roughness: 0.38, anisotropy: 0.75, relief: 'brushed', reliefMode: 'bump', reliefStrength: 0.5, tileMm: 60 }) },
  { id: 'alu-polished', name: 'Aluminium', finish: 'Polished', category: 'Metals', params: surface({ color: '#e3e5e8', metalness: 1, roughness: 0.08 }) },
  { id: 'steel-brushed', name: 'Stainless steel', finish: 'Brushed', category: 'Metals', params: surface({ color: '#bfc3c8', metalness: 1, roughness: 0.34, anisotropy: 0.8, relief: 'brushed', reliefStrength: 0.55, tileMm: 50 }) },
  { id: 'chrome', name: 'Chrome', finish: 'Polished', category: 'Metals', params: surface({ color: '#f4f6f8', metalness: 1, roughness: 0.02 }) },
  { id: 'titanium', name: 'Titanium', finish: 'Brushed', category: 'Metals', params: surface({ color: '#9b9690', metalness: 1, roughness: 0.4, anisotropy: 0.6, relief: 'brushed', reliefStrength: 0.45, tileMm: 60 }) },
  { id: 'brass', name: 'Brass', finish: 'Polished', category: 'Metals', params: surface({ color: '#d9b25f', metalness: 1, roughness: 0.14 }) },
  { id: 'copper', name: 'Copper', finish: 'Polished', category: 'Metals', params: surface({ color: '#d98a64', metalness: 1, roughness: 0.16 }) },
  { id: 'gold', name: 'Gold', finish: 'Polished', category: 'Metals', params: surface({ color: '#f2c75c', metalness: 1, roughness: 0.1 }) },
  { id: 'anod-blue', name: 'Anodized blue', finish: 'Anodized', category: 'Metals', params: surface({ color: '#2f6bff', metalness: 0.92, roughness: 0.3, relief: 'noise', reliefStrength: 0.25, tileMm: 20 }) },
  { id: 'anod-red', name: 'Anodized red', finish: 'Anodized', category: 'Metals', params: surface({ color: '#d62839', metalness: 0.92, roughness: 0.3, relief: 'noise', reliefStrength: 0.25, tileMm: 20 }) },
  { id: 'anod-black', name: 'Anodized black', finish: 'Anodized', category: 'Metals', params: surface({ color: '#1b1c20', metalness: 0.9, roughness: 0.35, relief: 'noise', reliefStrength: 0.3, tileMm: 20 }) },
  { id: 'cast-iron', name: 'Cast iron', finish: 'Rough', category: 'Metals', params: surface({ color: '#4a4c50', metalness: 0.85, roughness: 0.62, relief: 'noise', reliefStrength: 0.9, tileMm: 12 }) },
  // — Plastics
  { id: 'abs-white', name: 'ABS white', finish: 'Gloss', category: 'Plastics', params: surface({ color: '#f1f1ef', roughness: 0.22, clearcoat: 0.3, clearcoatRoughness: 0.15 }) },
  { id: 'abs-black', name: 'ABS black', finish: 'Matte', category: 'Plastics', params: surface({ color: '#1a1a1c', roughness: 0.55, relief: 'noise', reliefStrength: 0.35, tileMm: 8 }) },
  { id: 'poly-grey', name: 'Polycarbonate', finish: 'Satin grey', category: 'Plastics', params: surface({ color: '#8c9096', roughness: 0.35, clearcoat: 0.2 }) },
  { id: 'nylon', name: 'Nylon PA12', finish: 'Natural', category: 'Plastics', params: surface({ color: '#e7e2d3', roughness: 0.7, relief: 'noise', reliefStrength: 0.6, tileMm: 6 }) },
  { id: 'rubber', name: 'Rubber', finish: 'Black', category: 'Plastics', params: surface({ color: '#161617', roughness: 0.85, relief: 'noise', reliefStrength: 0.5, tileMm: 8 }) },
  { id: 'soft-touch', name: 'Soft-touch', finish: 'Orange', category: 'Plastics', params: surface({ color: '#ff7a1a', roughness: 0.65, sheen: 0.4, relief: 'noise', reliefStrength: 0.3, tileMm: 6 }) },
  // — Glass & clear synthetics
  { id: 'glass-clear', name: 'Glass', finish: 'Clear', category: 'Glass & Clear', params: surface({ color: '#ffffff', roughness: 0.02, transmission: 1, ior: 1.52, thickness: 0.12 }) },
  { id: 'glass-frost', name: 'Glass', finish: 'Frosted', category: 'Glass & Clear', params: surface({ color: '#f4f8ff', roughness: 0.45, transmission: 1, ior: 1.52, thickness: 0.12 }) },
  { id: 'glass-bronze', name: 'Glass', finish: 'Bronze tint', category: 'Glass & Clear', params: surface({ color: '#a8754a', roughness: 0.03, transmission: 1, ior: 1.52, thickness: 0.2 }) },
  { id: 'acrylic', name: 'Acrylic', finish: 'Clear', category: 'Glass & Clear', params: surface({ color: '#ffffff', roughness: 0.05, transmission: 0.95, ior: 1.49, thickness: 0.1 }) },
  { id: 'pc-blue', name: 'Polycarbonate', finish: 'Blue translucent', category: 'Glass & Clear', params: surface({ color: '#5aa9ff', roughness: 0.12, transmission: 0.85, ior: 1.58, thickness: 0.12 }) },
  // — Carbon fibre
  { id: 'cf-twill-gloss', name: 'Carbon fibre', finish: '2×2 twill · gloss', category: 'Carbon Fiber', params: surface({ color: '#ffffff', metalness: 0.25, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04, colorMap: 'carbon-twill', relief: 'twill', reliefStrength: 0.4, tileMm: 24 }) },
  { id: 'cf-plain-matte', name: 'Carbon fibre', finish: 'Plain weave · matte', category: 'Carbon Fiber', params: surface({ color: '#ffffff', metalness: 0.2, roughness: 0.55, clearcoat: 0.15, colorMap: 'carbon-plain', relief: 'weave', reliefStrength: 0.45, tileMm: 24 }) },
  // — Paints
  { id: 'paint-red', name: 'Paint red', finish: 'Gloss', category: 'Paints', params: surface({ color: '#c8102e', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 }) },
  { id: 'paint-white', name: 'Paint white', finish: 'Gloss', category: 'Paints', params: surface({ color: '#d9d9d6', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 }) },
  { id: 'paint-silver', name: 'Paint silver', finish: 'Metallic', category: 'Paints', params: surface({ color: '#b9bec6', metalness: 0.75, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, relief: 'noise', reliefStrength: 0.15, tileMm: 4 }) },
  { id: 'paint-pearl-blue', name: 'Paint blue', finish: 'Metallic pearl', category: 'Paints', params: surface({ color: '#1e4fd8', metalness: 0.65, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03, relief: 'noise', reliefStrength: 0.15, tileMm: 4 }) },
  { id: 'paint-black-matte', name: 'Paint black', finish: 'Matte', category: 'Paints', params: surface({ color: '#151517', roughness: 0.78 }) },
  { id: 'paint-grey-matte', name: 'Paint grey', finish: 'Matte', category: 'Paints', params: surface({ color: '#7a7d82', roughness: 0.8 }) },
  { id: 'paint-orange', name: 'Paint orange', finish: 'Candy gloss', category: 'Paints', params: surface({ color: '#ff6a00', metalness: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.02 }) },
  // — Wood
  { id: 'wood-oak', name: 'Oak', finish: 'Satin', category: 'Wood', params: surface({ color: '#ffffff', roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35, colorMap: 'oak', relief: 'grain', reliefStrength: 0.35, tileMm: 120 }) },
  { id: 'wood-walnut', name: 'Walnut', finish: 'Satin', category: 'Wood', params: surface({ color: '#ffffff', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, colorMap: 'walnut', relief: 'grain', reliefStrength: 0.35, tileMm: 120 }) },
  { id: 'wood-maple', name: 'Maple', finish: 'Matte', category: 'Wood', params: surface({ color: '#ffffff', roughness: 0.7, colorMap: 'maple', relief: 'grain', reliefStrength: 0.25, tileMm: 120 }) },
  // — Fabrics
  { id: 'fabric-denim', name: 'Denim', finish: 'Woven', category: 'Fabrics', params: surface({ color: '#ffffff', roughness: 0.95, sheen: 0.5, colorMap: 'denim', relief: 'weave', reliefStrength: 0.9, tileMm: 18 }) },
  { id: 'fabric-felt', name: 'Felt', finish: 'Grey wool', category: 'Fabrics', params: surface({ color: '#ffffff', roughness: 1, sheen: 0.8, colorMap: 'felt', relief: 'noise', reliefStrength: 1.1, tileMm: 8 }) },
  { id: 'fabric-nylon', name: 'Ballistic nylon', finish: 'Black weave', category: 'Fabrics', params: surface({ color: '#ffffff', roughness: 0.75, sheen: 0.35, colorMap: 'nylon', relief: 'weave', reliefStrength: 0.8, tileMm: 14 }) },
  { id: 'fabric-velvet', name: 'Velvet', finish: 'Deep red', category: 'Fabrics', params: surface({ color: '#7b0f1f', roughness: 0.9, sheen: 1, relief: 'noise', reliefStrength: 0.3, tileMm: 6 }) },
];

export const findMaterial = (id: string) => MATERIAL_LIBRARY.find((m) => m.id === id);

// ---------------------------------------------------------------------------
// Environments, backdrop, lights, ground

export type EnvId = 'studio' | 'softbox-hall' | 'showroom' | 'industrial' | 'office' | 'living-room' | 'loft' | 'outdoor' | 'golden-hour' | 'overcast' | 'night-city' | 'space' | 'custom';
export type EnvGroup = 'Studio' | 'Interior' | 'Outdoor & sky' | 'Custom';
/** `blur` is the background blur applied when the environment is picked (sceneries read best fairly sharp). */
export const ENVIRONMENTS: { id: EnvId; name: string; hint: string; group: EnvGroup; blur?: number }[] = [
  { id: 'studio', name: 'Studio HDRI', hint: 'Neutral photo studio with soft overhead panels', group: 'Studio', blur: 0.25 },
  { id: 'softbox-hall', name: 'Softbox hall', hint: 'Large white cyclorama, three tall softboxes', group: 'Studio', blur: 0.25 },
  { id: 'showroom', name: 'Showroom', hint: 'Bright white gallery with ceiling light strips', group: 'Studio', blur: 0.2 },
  { id: 'industrial', name: 'Industrial', hint: 'Dark concrete hall, hard factory strip lights', group: 'Studio', blur: 0.2 },
  { id: 'office', name: 'Office', hint: 'Open-plan office: windows, desks, monitors, swivel chairs, bookcase', group: 'Interior', blur: 0.03 },
  { id: 'living-room', name: 'Living room', hint: 'Sofa, armchairs, coffee table, dining set, warm sunlight', group: 'Interior', blur: 0.03 },
  { id: 'loft', name: 'Loft', hint: 'Brick loft with factory windows, long table and pendant lamps', group: 'Interior', blur: 0.03 },
  { id: 'outdoor', name: 'Outdoor sunlight', hint: 'Open sky and a high midday sun', group: 'Outdoor & sky', blur: 0.03 },
  { id: 'golden-hour', name: 'Golden hour', hint: 'Low warm sun over a pale horizon', group: 'Outdoor & sky', blur: 0.03 },
  { id: 'overcast', name: 'Overcast sky', hint: 'Soft grey cloud light, no hard shadows', group: 'Outdoor & sky', blur: 0.03 },
  { id: 'night-city', name: 'Night city', hint: 'Lit skyline, street lamps and a bright moon', group: 'Outdoor & sky', blur: 0.02 },
  { id: 'space', name: 'Deep space', hint: 'Stars, nebula, a planet and a hard sun', group: 'Outdoor & sky', blur: 0 },
  { id: 'custom', name: 'Custom HDRI', hint: 'Upload a .hdr, .exr, .jpg or .png panorama', group: 'Custom' },
];

export interface EnvSettings { id: EnvId; intensity: number; rotation: number; blur: number; customName: string }
export type BackdropMode = 'environment' | 'solid' | 'gradient' | 'transparent';
export interface BackdropSettings { mode: BackdropMode; solid: string; gradTop: string; gradBottom: string }
export interface GroundSettings {
  enabled: boolean;
  mode: 'floor' | 'shadowCatcher';
  color: string;
  /** 0–1 strength of the mirror reflection. */
  reflections: number;
  /** 0–1 (1 = mirror-smooth floor). */
  glossiness: number;
  shadowOpacity: number;
  grid: boolean;
}

export type LightType = 'spot' | 'softbox' | 'directional' | 'ambient';
export const LIGHT_TYPE_LABELS: Record<LightType, string> = { spot: 'Spotlight', softbox: 'Softbox', directional: 'Directional', ambient: 'Ambient' };
export interface LightDef {
  id: string; name: string; type: LightType; enabled: boolean;
  /** Colour temperature, Kelvin. */
  kelvin: number;
  /** 0–100 (UI scale). */
  intensity: number;
  /** Degrees around the model, 0 = in front, positive to the right. */
  azimuth: number;
  /** Degrees above the floor. */
  elevation: number;
  /** Scene units (the model is ~1.6 units across). */
  distance: number;
  /** Softbox width (scene units). */
  size: number;
  /** Spotlight cone half-angle, degrees. */
  angle: number;
  /** 0–1: shadow edge softness (and spot penumbra). */
  softness: number;
  shadows: boolean;
}

let lightCounter = 0;
export const newLight = (type: LightType, patch: Partial<LightDef> = {}): LightDef => {
  lightCounter += 1;
  const base: LightDef = { id: `light-${Date.now().toString(36)}-${lightCounter}`, name: `${LIGHT_TYPE_LABELS[type]} ${lightCounter}`, type, enabled: true, kelvin: 5600, intensity: 50, azimuth: 35, elevation: 40, distance: 4, size: 1.6, angle: 28, softness: 0.5, shadows: type !== 'ambient' && type !== 'softbox' };
  return { ...base, ...patch };
};

export interface LightRigPreset { id: string; name: string; hint: string; make: () => LightDef[] }
export const LIGHT_RIGS: LightRigPreset[] = [
  { id: 'three-point', name: 'Three-point studio', hint: 'Key, fill and rim', make: () => [
    newLight('softbox', { name: 'Key softbox', azimuth: -40, elevation: 38, distance: 3.6, size: 2, intensity: 55, kelvin: 5400 }),
    newLight('softbox', { name: 'Fill softbox', azimuth: 55, elevation: 18, distance: 4, size: 2.4, intensity: 22, kelvin: 6200 }),
    newLight('spot', { name: 'Rim spot', azimuth: 165, elevation: 32, distance: 4, intensity: 55, kelvin: 6500, angle: 24 }),
    newLight('directional', { name: 'Key shadow', azimuth: -40, elevation: 52, distance: 5, intensity: 30, kelvin: 5400, softness: 0.8 }),
  ] },
  { id: 'hero-top', name: 'Product hero', hint: 'Big overhead softbox + kicker', make: () => [
    newLight('softbox', { name: 'Overhead softbox', azimuth: 0, elevation: 82, distance: 3.4, size: 3, intensity: 62, kelvin: 5600 }),
    newLight('spot', { name: 'Kicker', azimuth: 120, elevation: 22, distance: 4, intensity: 50, kelvin: 6800, angle: 22 }),
    newLight('directional', { name: 'Soft shadow', azimuth: 20, elevation: 70, distance: 5, intensity: 28, softness: 0.9 }),
    newLight('ambient', { name: 'Ambient lift', intensity: 12, kelvin: 6000 }),
  ] },
  { id: 'dramatic', name: 'Dramatic rim', hint: 'Dark, hard edge lighting', make: () => [
    newLight('spot', { name: 'Left rim', azimuth: -130, elevation: 25, distance: 3.6, intensity: 70, kelvin: 7200, angle: 18, softness: 0.25 }),
    newLight('spot', { name: 'Right rim', azimuth: 130, elevation: 25, distance: 3.6, intensity: 70, kelvin: 3800, angle: 18, softness: 0.25 }),
    newLight('softbox', { name: 'Low fill', azimuth: 0, elevation: 8, distance: 4, size: 1.2, intensity: 10 }),
  ] },
  { id: 'even-soft', name: 'Even & soft', hint: 'Shadow-free catalogue look', make: () => [
    newLight('softbox', { name: 'Left softbox', azimuth: -60, elevation: 35, distance: 3.8, size: 2.6, intensity: 40 }),
    newLight('softbox', { name: 'Right softbox', azimuth: 60, elevation: 35, distance: 3.8, size: 2.6, intensity: 40 }),
    newLight('softbox', { name: 'Top softbox', azimuth: 0, elevation: 85, distance: 3.4, size: 3, intensity: 35 }),
    newLight('ambient', { name: 'Ambient', intensity: 18 }),
  ] },
  { id: 'sun', name: 'Outdoor sun', hint: 'One hard sun and sky fill', make: () => [
    newLight('directional', { name: 'Sun', azimuth: 40, elevation: 52, distance: 6, intensity: 80, kelvin: 5200, softness: 0.25 }),
    newLight('ambient', { name: 'Sky fill', intensity: 14, kelvin: 8500 }),
  ] },
];

export const DEFAULT_ENV: EnvSettings = { id: 'studio', intensity: 1, rotation: 0, blur: 0.25, customName: '' };
export const DEFAULT_BACKDROP: BackdropSettings = { mode: 'gradient', solid: '#2a2b31', gradTop: '#3a3c46', gradBottom: '#111216' };
export const DEFAULT_GROUND: GroundSettings = { enabled: true, mode: 'floor', color: '#2c2d34', reflections: 0.35, glossiness: 0.7, shadowOpacity: 0.55, grid: false };

// ---------------------------------------------------------------------------
// Camera & post-processing

export type ToneMap = 'aces' | 'agx' | 'neutral' | 'reinhard' | 'linear';
export const TONE_MAPS: { id: ToneMap; label: string }[] = [
  { id: 'aces', label: 'ACES filmic' }, { id: 'agx', label: 'AgX' }, { id: 'neutral', label: 'Neutral (product-true)' }, { id: 'reinhard', label: 'Reinhard' }, { id: 'linear', label: 'Linear' },
];
export interface CameraSettings {
  /** Vertical field of view, degrees. */
  fov: number;
  /** Exposure compensation, EV stops. */
  exposure: number;
  toneMap: ToneMap;
  dof: boolean;
  focusAuto: boolean;
  /** Focus distance in scene units (used when focusAuto is off). */
  focusDistance: number;
  fstop: number;
  /** Bokeh size multiplier (0.2–3). */
  bokeh: number;
  bloom: boolean; bloomStrength: number; bloomRadius: number; bloomThreshold: number;
  vignette: boolean; vignetteAmount: number; vignetteSoftness: number;
  /** Colour balance. */
  temperature: number; tint: number; saturation: number; contrast: number;
}
export const DEFAULT_CAMERA: CameraSettings = {
  fov: 32, exposure: 0, toneMap: 'neutral', dof: false, focusAuto: true, focusDistance: 4, fstop: 4, bokeh: 1,
  bloom: false, bloomStrength: 0.25, bloomRadius: 0.5, bloomThreshold: 0.9,
  vignette: false, vignetteAmount: 0.35, vignetteSoftness: 0.5,
  temperature: 0, tint: 0, saturation: 1, contrast: 1,
};

/** 36 × 24 mm full-frame sensor: vertical FOV ↔ focal length. */
export const SENSOR_HEIGHT_MM = 24;
export const focalFromFov = (fovDeg: number) => SENSOR_HEIGHT_MM / 2 / Math.tan((fovDeg * Math.PI) / 360);
export const fovFromFocal = (mm: number) => (2 * Math.atan(SENSOR_HEIGHT_MM / 2 / mm) * 180) / Math.PI;

export const CAMERA_PRESETS: { id: string; name: string; fov: number; dof: boolean; fstop: number }[] = [
  { id: 'product', name: 'Product 85 mm', fov: fovFromFocal(85), dof: false, fstop: 8 },
  { id: 'portrait', name: 'Portrait 100 mm · f/2.8', fov: fovFromFocal(100), dof: true, fstop: 2.8 },
  { id: 'macro', name: 'Macro 135 mm · f/2', fov: fovFromFocal(135), dof: true, fstop: 2 },
  { id: 'wide', name: 'Wide 35 mm', fov: fovFromFocal(35), dof: false, fstop: 8 },
  { id: 'hero', name: 'Hero 50 mm', fov: fovFromFocal(50), dof: false, fstop: 5.6 },
];

// ---------------------------------------------------------------------------
// Output

export type AspectId = 'viewport' | '16:9' | '3:2' | '4:3' | '1:1' | '4:5' | '21:9' | 'custom';
export const ASPECTS: { id: AspectId; label: string; ratio: number | null }[] = [
  { id: 'viewport', label: 'Match viewport', ratio: null }, { id: '16:9', label: '16 : 9', ratio: 16 / 9 }, { id: '3:2', label: '3 : 2', ratio: 3 / 2 }, { id: '4:3', label: '4 : 3', ratio: 4 / 3 },
  { id: '1:1', label: '1 : 1 square', ratio: 1 }, { id: '4:5', label: '4 : 5 portrait', ratio: 4 / 5 }, { id: '21:9', label: '21 : 9 cinema', ratio: 21 / 9 }, { id: 'custom', label: 'Custom', ratio: null },
];
export type ResPreset = 'fhd' | '4k' | '8k' | 'custom';
export const RES_PRESETS: { id: ResPreset; label: string; longEdge: number | null }[] = [
  { id: 'fhd', label: 'Full HD · 1920', longEdge: 1920 }, { id: '4k', label: '4K · 3840', longEdge: 3840 }, { id: '8k', label: '8K · 7680', longEdge: 7680 }, { id: 'custom', label: 'Custom size', longEdge: null },
];
export type QualityLevel = 'draft' | 'final' | 'production';
export const QUALITY_LEVELS: { id: QualityLevel; label: string; hint: string; supersample: number; shadowMap: number }[] = [
  { id: 'draft', label: 'Draft', hint: '1 sample / pixel · fastest', supersample: 1, shadowMap: 1024 },
  { id: 'final', label: 'Final', hint: '4 samples / pixel (2× supersampled)', supersample: 2, shadowMap: 2048 },
  { id: 'production', label: 'Production', hint: '9 samples / pixel (3× supersampled), 4K shadows', supersample: 3, shadowMap: 4096 },
];
export type DenoiseLevel = 'off' | 'light' | 'strong';
export type ExportFormat = 'png' | 'tiff' | 'exr';
export const EXPORT_FORMATS: { id: ExportFormat; label: string; alpha: boolean; note: string }[] = [
  { id: 'png', label: 'PNG', alpha: true, note: '8-bit, sRGB, alpha' },
  { id: 'tiff', label: 'TIFF', alpha: true, note: '8-bit uncompressed, alpha' },
  { id: 'exr', label: 'EXR', alpha: true, note: '16-bit float, scene-linear, no post effects' },
];
export interface OutputSettings {
  aspect: AspectId; preset: ResPreset; customW: number; customH: number;
  quality: QualityLevel; denoise: DenoiseLevel; format: ExportFormat; transparent: boolean;
}
export const DEFAULT_OUTPUT: OutputSettings = { aspect: '16:9', preset: 'fhd', customW: 2400, customH: 1350, quality: 'final', denoise: 'off', format: 'png', transparent: false };

/** Pixel size of the final image. `viewportAspect` is used for the "match viewport" aspect. */
export function outputSize(o: OutputSettings, viewportAspect: number): { w: number; h: number } {
  const clampPx = (v: number) => Math.max(16, Math.min(16384, Math.round(v)));
  if (o.preset === 'custom' || o.aspect === 'custom') return { w: clampPx(o.customW), h: clampPx(o.customH) };
  const long = RES_PRESETS.find((p) => p.id === o.preset)?.longEdge ?? 1920;
  const ratio = ASPECTS.find((a) => a.id === o.aspect)?.ratio ?? viewportAspect;
  return ratio >= 1 ? { w: clampPx(long), h: clampPx(long / ratio) } : { w: clampPx(long * ratio), h: clampPx(long) };
}

// ---------------------------------------------------------------------------
// Helpers

/** Colour temperature (K) → linear-ish RGB 0–1 (Tanner Helland's approximation). */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return [c(r), c(g), c(b)];
}

export interface RenderSceneState {
  env: EnvSettings; backdrop: BackdropSettings; ground: GroundSettings; lights: LightDef[]; rigId: string;
}
