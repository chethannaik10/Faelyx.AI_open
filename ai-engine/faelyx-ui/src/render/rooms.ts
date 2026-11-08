// RenderX Engine — procedural 3D rooms and skies used as lighting environments
// and as visible backdrops. Each builder returns a small three.js scene that is
// centred on the camera (eye height ≈ the origin, floor ≈ 3.2 units below it).
// The scene is baked twice: once into a PMREM for image-based lighting and once
// into a crisp cube map for the visible background.

import * as THREE from 'three';
import type { EnvId } from './renderData';

const rad = (deg: number) => (deg * Math.PI) / 180;
const FLOOR = -3.2;

// Deterministic pseudo-random so a scene looks the same every time it is built.
function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

class Builder {
  readonly scene = new THREE.Scene();
  /** Lit, non-glowing surface (sRGB hex). */
  lam(hex: string, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) { return new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), ...extra }); }
  /** Self-lit surface; values above 1 are HDR light sources (linear). */
  glow(r: number, g: number, b: number, side: THREE.Side = THREE.FrontSide) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side }); }
  box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m); return m;
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, mat: THREE.Material, seg = 24) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); this.scene.add(m); return m;
  }
  ball(r: number, x: number, y: number, z: number, mat: THREE.Material) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); m.position.set(x, y, z); this.scene.add(m); return m;
  }
  /** Floor, ceiling and four walls of a rectangular room. */
  shell(w: number, h: number, d: number, wall: THREE.Material, floor: THREE.Material, ceil: THREE.Material) {
    const cy = FLOOR + h / 2;
    this.box(w, 0.2, d, 0, FLOOR - 0.1, 0, floor); this.box(w, 0.2, d, 0, FLOOR + h + 0.1, 0, ceil);
    this.box(w, h, 0.2, 0, cy, -d / 2 - 0.1, wall); this.box(w, h, 0.2, 0, cy, d / 2 + 0.1, wall);
    this.box(0.2, h, d, -w / 2 - 0.1, cy, 0, wall); this.box(0.2, h, d, w / 2 + 0.1, cy, 0, wall);
  }
  lights(sky = 0xffffff, ground = 0x8a8478, hemi = 1.8, pointColor = 0xfff1de, point = 140, at: [number, number, number] = [0, 4.5, 0]) {
    this.scene.add(new THREE.HemisphereLight(sky, ground, hemi));
    if (point > 0) { const p = new THREE.PointLight(pointColor, point, 0, 2); p.position.set(...at); this.scene.add(p); }
  }
  /** Office / dining chair, seat top at `seat` above the floor. */
  chair(x: number, z: number, ry: number, mat: THREE.Material, legMat: THREE.Material, swivel = false) {
    const g = new THREE.Group(); g.position.set(x, FLOOR, z); g.rotation.y = ry; this.scene.add(g);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); g.add(o); return o; };
    add(new THREE.BoxGeometry(1.5, 0.22, 1.5), mat, 0, 1.55, 0);
    add(new THREE.BoxGeometry(1.5, 1.7, 0.2), mat, 0, 2.5, -0.7);
    if (swivel) {
      add(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 12), legMat, 0, 0.9, 0);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leg = add(new THREE.BoxGeometry(0.1, 0.1, 1.0), legMat, Math.sin(a) * 0.5, 0.28, Math.cos(a) * 0.5); leg.rotation.y = a; add(new THREE.SphereGeometry(0.11, 10, 8), legMat, Math.sin(a) * 1.0, 0.14, Math.cos(a) * 1.0); }
      add(new THREE.BoxGeometry(0.16, 0.14, 1.0), legMat, -0.82, 2.05, 0); add(new THREE.BoxGeometry(0.16, 0.14, 1.0), legMat, 0.82, 2.05, 0);
    } else for (const [lx, lz] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]]) add(new THREE.BoxGeometry(0.12, 1.5, 0.12), legMat, lx, 0.75, lz);
  }
  table(x: number, z: number, w: number, d: number, topY: number, top: THREE.Material, leg: THREE.Material, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, FLOOR, z); g.rotation.y = ry; this.scene.add(g);
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), top); t.position.y = topY; g.add(t);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, topY, 0.16), leg); l.position.set(sx * (w / 2 - 0.2), topY / 2, sz * (d / 2 - 0.2)); g.add(l); }
    return g;
  }
  /** A paned window made of a bright pane and a dark frame grid. */
  window(cx: number, cy: number, z: number, w: number, h: number, cols: number, rows: number, light: [number, number, number], frame: THREE.Material, axis: 'z' | 'x' = 'z') {
    const pane = axis === 'z' ? this.box(w, h, 0.05, cx, cy, z, this.glow(...light)) : this.box(0.05, h, w, z, cy, cx, this.glow(...light));
    void pane;
    const t = 0.12;
    for (let i = 0; i <= cols; i++) { const o = -w / 2 + (w * i) / cols; if (axis === 'z') this.box(t, h + t, 0.12, cx + o, cy, z + 0.03, frame); else this.box(0.12, h + t, t, z + 0.03, cy, cx + o, frame); }
    for (let j = 0; j <= rows; j++) { const o = -h / 2 + (h * j) / rows; if (axis === 'z') this.box(w + t, t, 0.12, cx, cy + o, z + 0.03, frame); else this.box(0.12, t, w + t, z + 0.03, cy + o, cx, frame); }
  }
}

/** Gradient dome with optional sun disc — shared by the sky-style scenes. */
function skyDome(b: Builder, top: number[], horizon: number[], ground: number[], sun?: { az: number; el: number; color: number[]; size: number }) {
  const geo = new THREE.SphereGeometry(140, 48, 32); const pos = geo.getAttribute('position'); const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 140; let c: number[];
    if (y >= 0) { const t = Math.pow(y, 0.55); c = [horizon[0] + (top[0] - horizon[0]) * t, horizon[1] + (top[1] - horizon[1]) * t, horizon[2] + (top[2] - horizon[2]) * t]; }
    else { const t = Math.min(1, -y * 3); c = [horizon[0] * 0.6 + (ground[0] - horizon[0] * 0.6) * t, horizon[1] * 0.6 + (ground[1] - horizon[1] * 0.6) * t, horizon[2] * 0.6 + (ground[2] - horizon[2] * 0.6) * t]; }
    col.set(c, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  b.scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  if (sun) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(sun.size * 1.7, 20, 14), b.glow(sun.color[0], sun.color[1], sun.color[2]));
    s.position.set(Math.sin(rad(sun.az)) * Math.cos(rad(sun.el)) * 100, Math.sin(rad(sun.el)) * 100, Math.cos(rad(sun.az)) * Math.cos(rad(sun.el)) * 100); b.scene.add(s);
  }
}

function glowSprite(inner: string, outer: string) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(1, outer); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------------------

function office(): THREE.Scene {
  const b = new Builder(); const W = 34; const D = 30; const H = 9.4;
  b.shell(W, H, D, b.lam('#dcdde0'), b.lam('#4a5058'), b.lam('#f2f2f2'));
  b.lights(0xffffff, 0x9a9a9a, 1.7, 0xf4f8ff, 160);
  // Ceiling light panels
  for (const x of [-9, 0, 9]) for (const z of [-8, 4]) b.box(5, 0.12, 2, x, FLOOR + H - 0.05, z, b.glow(5.5, 5.5, 5.6));
  // Window wall (−z) with a city-bright sky
  b.window(0, 0.6, -D / 2 + 0.05, 20, 5.6, 6, 2, [3.6, 4.2, 5.2], b.lam('#2a2d33'));
  b.box(34, 0.8, 0.3, 0, FLOOR + 0.4, -D / 2 + 0.2, b.lam('#c8c9cc'));
  // Main desk, monitor, keyboard, chair
  const desk = b.lam('#b08a5e'); const dark = b.lam('#25282d'); const grey = b.lam('#3a3e45');
  b.table(-3, -8.5, 7.5, 3.2, 3.0, desk, dark);
  b.box(2.6, 1.5, 0.12, -3, FLOOR + 4.05, -9.3, dark); b.box(2.4, 1.3, 0.04, -3, FLOOR + 4.05, -9.22, b.glow(0.9, 1.25, 1.9)); b.box(0.5, 0.7, 0.35, -3, FLOOR + 3.4, -9.4, dark);
  b.box(1.9, 0.08, 0.6, -3, FLOOR + 3.15, -7.9, b.lam('#1c1e22')); b.box(0.7, 0.04, 0.5, -0.9, FLOOR + 3.13, -7.9, b.lam('#1c1e22'));
  b.cyl(0.22, 0.2, 0.42, 0.2, FLOOR + 3.3, -9.1, b.lam('#e9e9e9')); // mug
  b.chair(-3, -5.6, 0.12, grey, dark, true);
  // Second desk to the right, with a facing chair
  b.table(10, -7, 7, 3, 3.0, desk, dark, 0.15); b.box(2.4, 1.4, 0.12, 10.2, FLOOR + 4.0, -7.8, dark); b.box(2.2, 1.2, 0.04, 10.2, FLOOR + 4.0, -7.72, b.glow(1.3, 1.3, 1.5), 0);
  b.chair(10.2, -4.4, 3.2, grey, dark, true);
  // Bookcase on the left wall (−x) filled with colourful books
  b.box(1.2, 7, 9, -W / 2 + 0.7, FLOOR + 3.5, -2, b.lam('#7a5c3e'));
  const r = rng(7); const cols = ['#c0392b', '#2f6db5', '#e8b923', '#3c8d5a', '#8e5fb0', '#e8e6df', '#d97b29'];
  for (let s = 0; s < 5; s++) { let z = -6.2; while (z < 2.2) { const w = 0.18 + r() * 0.25; b.box(0.8, 1.0 + r() * 0.5, w, -W / 2 + 1.05, FLOOR + 1.0 + s * 1.3, z + w / 2, b.lam(cols[Math.floor(r() * cols.length)])); z += w + 0.03; } }
  // Meeting table and chairs in the foreground (+z)
  b.table(-6, 7, 9, 3.6, 3.0, b.lam('#e8e6e1'), dark);
  for (const x of [-9, -6, -3]) { b.chair(x, 4.6, 0, grey, dark); b.chair(x, 9.4, Math.PI, grey, dark); }
  // Plants
  const pot = b.lam('#d8d4cc'); const leaf = b.lam('#3a7d44');
  for (const [x, z] of [[14, -12], [-14, 11]]) { b.cyl(0.9, 0.7, 1.4, x, FLOOR + 0.7, z, pot); for (let i = 0; i < 7; i++) b.ball(0.7 + (i % 3) * 0.12, x + Math.sin(i * 2.1) * 0.55, FLOOR + 2.0 + (i % 4) * 0.45, z + Math.cos(i * 2.1) * 0.55, leaf); }
  // Glass partition and whiteboard on the +x wall
  b.box(0.1, 6, 12, W / 2 - 3, FLOOR + 3, 0, b.glow(0.55, 0.65, 0.72)); b.box(0.15, 3.4, 8, W / 2 - 0.1, FLOOR + 5, 3, b.lam('#f7f7f7'));
  return b.scene;
}

function livingRoom(): THREE.Scene {
  const b = new Builder(); const W = 32; const D = 30; const H = 9.2;
  b.shell(W, H, D, b.lam('#ece2d2'), b.lam('#936d49'), b.lam('#f6f1e8'));
  b.lights(0xfff4e6, 0x7a6a58, 1.5, 0xffd9a6, 150, [0, 4.4, 0]);
  // Big window with sun (−z) and curtains
  b.window(0, 0.6, -D / 2 + 0.05, 14, 6.4, 4, 2, [5.2, 4.7, 3.9], b.lam('#f4efe6'));
  b.box(2.2, 8, 0.4, -8.6, FLOOR + 4, -D / 2 + 0.4, b.lam('#c7b9a3')); b.box(2.2, 8, 0.4, 8.6, FLOOR + 4, -D / 2 + 0.4, b.lam('#c7b9a3'));
  // Rug, sofa, coffee table, armchair
  b.box(11, 0.08, 8, 0, FLOOR + 0.04, -3, b.lam('#d9cdb7'));
  const sofa = b.lam('#3f6f78'); const cushion = b.lam('#e0a458'); const wood = b.lam('#a97c50'); const dark = b.lam('#2a2622');
  b.box(7.4, 1.3, 2.6, 0, FLOOR + 0.9, -7.8, sofa); b.box(7.4, 2.2, 0.8, 0, FLOOR + 2.1, -8.9, sofa); b.box(0.8, 1.9, 2.6, -3.9, FLOOR + 1.5, -7.8, sofa); b.box(0.8, 1.9, 2.6, 3.9, FLOOR + 1.5, -7.8, sofa);
  b.box(1.1, 1.1, 0.4, -2, FLOOR + 2.1, -8.3, cushion); b.box(1.1, 1.1, 0.4, 2.2, FLOOR + 2.1, -8.3, b.lam('#f1ede4'));
  b.cyl(2.2, 2.2, 0.2, 0, FLOOR + 1.45, -3.4, wood, 40); b.cyl(0.18, 0.18, 1.35, 0, FLOOR + 0.7, -3.4, dark); b.cyl(1.1, 1.1, 0.1, 0, FLOOR + 0.3, -3.4, dark, 30);
  b.ball(0.38, 0.7, FLOOR + 1.85, -3.2, b.lam('#c0392b')); b.box(1.1, 0.12, 0.8, -0.8, FLOOR + 1.62, -3.6, b.lam('#2f4f6f'));
  const arm = b.lam('#b5654a'); b.box(2.6, 1.2, 2.4, -8, FLOOR + 0.85, -2.6, arm, 0.7); b.box(2.6, 2.2, 0.7, -8.5, FLOOR + 1.9, -3.4, arm, 0.7);
  b.box(2.6, 1.2, 2.4, 8, FLOOR + 0.85, -2.6, arm, -0.7); b.box(2.6, 2.2, 0.7, 8.5, FLOOR + 1.9, -3.4, arm, -0.7);
  // Dining set (+z / +x side): table + four chairs
  b.table(8, 8, 6.5, 3.4, 3.1, b.lam('#c79a68'), dark); for (const [dx, dz, ry] of [[-1.8, -2.4, 0], [1.8, -2.4, 0], [-1.8, 2.4, Math.PI], [1.8, 2.4, Math.PI]] as const) b.chair(8 + dx, 8 + dz, ry, b.lam('#e7e0d3'), wood);
  // Floor lamp and side table
  b.cyl(0.05, 0.05, 6, -12, FLOOR + 3, -8, dark, 8); b.cyl(0.9, 1.3, 1.6, -12, FLOOR + 6.3, -8, b.glow(3.4, 2.6, 1.6, THREE.DoubleSide), 24);
  b.cyl(0.8, 0.8, 1.6, 12, FLOOR + 0.8, -9, wood); b.cyl(0.5, 0.7, 0.9, 12, FLOOR + 2.1, -9, b.glow(3.0, 2.3, 1.4, THREE.DoubleSide));
  // Shelves and frames on the −x wall
  b.box(0.5, 0.15, 9, -W / 2 + 0.4, FLOOR + 4.2, 2, wood); b.box(0.5, 0.15, 9, -W / 2 + 0.4, FLOOR + 5.6, 2, wood);
  const r = rng(11); const bc = ['#3b6ea5', '#c0392b', '#e8b923', '#4a9d6a', '#8e5fb0', '#ece6da'];
  for (let i = 0; i < 12; i++) b.box(0.4, 0.8 + r() * 0.5, 0.35, -W / 2 + 0.5, FLOOR + 4.7 + (i % 2) * 1.4, -1.5 + i * 0.6, b.lam(bc[i % bc.length]));
  b.box(0.1, 2.6, 3.6, -W / 2 + 0.1, FLOOR + 6.2, -8, b.lam('#2f4f6f')); b.box(0.1, 2.2, 2.6, W / 2 - 0.1, FLOOR + 5.8, -4, b.lam('#c9a24a'));
  // Plant
  b.cyl(0.9, 0.7, 1.4, 13, FLOOR + 0.7, -12, b.lam('#f0ece4')); for (let i = 0; i < 7; i++) b.ball(0.75, 13 + Math.sin(i * 2) * 0.6, FLOOR + 2.1 + (i % 4) * 0.5, -12 + Math.cos(i * 2) * 0.6, b.lam('#3a7d44'));
  return b.scene;
}

function loft(): THREE.Scene {
  const b = new Builder(); const W = 38; const D = 32; const H = 11;
  b.shell(W, H, D, b.lam('#8e4d3b'), b.lam('#6e6e70'), b.lam('#4a4a4d'));
  b.lights(0xfff0dc, 0x6d645c, 1.1, 0xffcf96, 220, [0, 5, 0]);
  // Brick courses on the back wall
  const r = rng(3);
  for (let row = 0; row < 14; row++) for (let i = 0; i < 18; i++) if (r() > 0.55) b.box(1.9, 0.5, 0.06, -W / 2 + 1 + i * 2.1 + (row % 2) * 1.0, FLOOR + 0.5 + row * 0.74, D / 2 - 0.02, b.lam(r() > 0.5 ? '#a15a45' : '#7a3f30'));
  // Tall factory windows on the −z wall
  for (const x of [-11, 0, 11]) b.window(x, 1.4, -D / 2 + 0.05, 8, 7.6, 4, 5, [3.2, 3.6, 4.4], b.lam('#16181b'));
  // Ceiling beams, pendants and pipes
  for (let i = -3; i <= 3; i++) b.box(0.6, 0.8, D, i * 5.5, FLOOR + H - 0.5, 0, b.lam('#2c2c30'));
  for (const [x, z] of [[-6, -4], [0, -9], [6, -4], [0, 4]]) { b.cyl(0.03, 0.03, 3, x, FLOOR + H - 2, z, b.lam('#111'), 6); b.cyl(0.35, 0.9, 0.8, x, FLOOR + H - 3.4, z, b.lam('#1a1a1a'), 20); b.ball(0.45, x, FLOOR + H - 3.9, z, b.glow(8, 6.2, 3.6)); }
  b.cyl(0.35, 0.35, W, 0, FLOOR + H - 1.6, -D / 2 + 2, b.lam('#7e8a92'), 12).rotation.z = Math.PI / 2;
  // Long dining table, bench and chairs
  const wood = b.lam('#9a6e44'); const metal = b.lam('#1d1f22');
  b.table(-2, -4, 11, 3.6, 3.1, wood, metal);
  for (const x of [-6, -2, 2]) { b.chair(x, -7, 0, b.lam('#33363b'), metal); b.chair(x, -1, Math.PI, b.lam('#33363b'), metal); }
  b.cyl(0.55, 0.45, 0.7, -2, FLOOR + 3.6, -4, b.lam('#e8e1d0'), 20); // vase
  // Leather armchair & lamp (+x)
  b.box(3.2, 1.4, 3, 11, FLOOR + 0.9, 5, b.lam('#6a3b22'), -0.5); b.box(3.2, 2.4, 0.8, 10, FLOOR + 2.1, 6.3, b.lam('#6a3b22'), -0.5);
  b.cyl(0.04, 0.04, 6.4, 14, FLOOR + 3.2, 1, metal, 8); b.ball(0.7, 14, FLOOR + 6.6, 1, b.glow(5.2, 4.0, 2.2));
  // Concrete columns
  for (const x of [-14, 14]) b.box(1.6, H, 1.6, x, FLOOR + H / 2, -3, b.lam('#85858a'));
  return b.scene;
}

function nightCity(): THREE.Scene {
  const b = new Builder();
  skyDome(b, [0.004, 0.008, 0.03], [0.07, 0.05, 0.1], [0.012, 0.012, 0.016], { az: -50, el: 32, color: [7, 7.4, 8.6], size: 2.2 });
  b.lights(0x4a5a90, 0x151822, 0.5, 0xffc88a, 0);
  // Window-lit tower texture: 6 × 12 windows per tile, one tile ≈ 6 × 12 scene units
  const c = document.createElement('canvas'); c.width = 96; c.height = 192; const x = c.getContext('2d')!; x.fillStyle = '#06070b'; x.fillRect(0, 0, 96, 192);
  const r = rng(19); for (let j = 0; j < 12; j++) for (let i = 0; i < 6; i++) if (r() > 0.66) { x.fillStyle = r() > 0.85 ? '#8fb7ff' : r() > 0.4 ? '#ffd9a0' : '#fff0c8'; x.fillRect(i * 16 + 3, j * 16 + 4, 10, 8); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  const g = new THREE.Group(); b.scene.add(g);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + (r() - 0.5) * 0.08; const dist = 38 + r() * 30; const w = 5 + r() * 7; const h = 14 + r() * 34 * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37)));
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 12)));
    const m = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.5, 1.5, 1.5) });
    const bx = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m); bx.position.set(Math.sin(a) * dist, FLOOR + h / 2, Math.cos(a) * dist); bx.rotation.y = a; g.add(bx);
    if (r() > 0.7) { const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), b.glow(10, 0.6, 0.5)); beacon.position.set(bx.position.x, FLOOR + h + 0.5, bx.position.z); g.add(beacon); }
  }
  b.box(200, 0.2, 200, 0, FLOOR - 0.1, 0, b.lam('#101218'));
  // Street lamps lining a road
  for (let i = 0; i < 6; i++) { const z = -8 - i * 7; b.cyl(0.07, 0.09, 6.5, 9, FLOOR + 3.25, z, b.lam('#111'), 8); b.ball(0.35, 9, FLOOR + 6.6, z, b.glow(9, 6.4, 3.4)); b.cyl(0.07, 0.09, 6.5, -9, FLOOR + 3.25, z, b.lam('#111'), 8); b.ball(0.35, -9, FLOOR + 6.6, z, b.glow(9, 6.4, 3.4)); }
  b.box(7, 0.04, 120, 0, FLOOR + 0.02, -30, b.lam('#1b1d24'));
  return b.scene;
}

function space(): THREE.Scene {
  const b = new Builder();
  b.scene.add(new THREE.Mesh(new THREE.SphereGeometry(95, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.002, 0.003, 0.012), side: THREE.BackSide })));
  // Stars
  const r = rng(5); const N = 3200; const pos = new Float32Array(N * 3); const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = r() * 2 - 1; const a = r() * Math.PI * 2; const s = Math.sqrt(1 - u * u); const R = 88;
    pos.set([R * s * Math.cos(a), R * u, R * s * Math.sin(a)], i * 3);
    const k = 0.5 + Math.pow(r(), 3) * 6; const tint = r(); col.set([k * (0.8 + tint * 0.2), k * 0.9, k * (1.1 - tint * 0.3)], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  b.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.4, vertexColors: true, sizeAttenuation: false })));
  // Nebula glows
  for (const [x, y, z, s, a, bcol] of [[-40, 22, -55, 90, 'rgba(120,70,220,0.55)', 'rgba(120,70,220,0)'], [50, -10, -50, 80, 'rgba(40,120,230,0.45)', 'rgba(40,120,230,0)'], [10, 30, 60, 70, 'rgba(220,70,140,0.35)', 'rgba(220,70,140,0)']] as const) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(a, bcol), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.position.set(x, y, z); sp.scale.set(s, s, 1); b.scene.add(sp);
  }
  // Planet with a thin atmosphere, lit from the sun side
  const pc = document.createElement('canvas'); pc.width = 512; pc.height = 256; const px = pc.getContext('2d')!; const pr = rng(2);
  const grd = px.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#2a5da8'); grd.addColorStop(0.5, '#3b86c4'); grd.addColorStop(1, '#1d3f78'); px.fillStyle = grd; px.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 60; i++) { px.fillStyle = `rgba(${pr() > 0.5 ? '70,140,70' : '200,190,150'},${0.25 + pr() * 0.4})`; px.beginPath(); px.ellipse(pr() * 512, 40 + pr() * 180, 14 + pr() * 40, 8 + pr() * 18, pr() * 3, 0, 7); px.fill(); }
  for (let i = 0; i < 70; i++) { px.fillStyle = `rgba(255,255,255,${0.18 + pr() * 0.3})`; px.beginPath(); px.ellipse(pr() * 512, pr() * 256, 20 + pr() * 60, 3 + pr() * 7, 0, 0, 7); px.fill(); }
  const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
  const planet = new THREE.Mesh(new THREE.SphereGeometry(20, 64, 40), new THREE.MeshLambertMaterial({ map: ptex })); planet.position.set(-34, -12, -62); b.scene.add(planet);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(21.2, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.55, 1.4), side: THREE.BackSide, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })); atmo.position.copy(planet.position); b.scene.add(atmo);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 24), new THREE.MeshLambertMaterial({ color: new THREE.Color('#9a968f') })); moon.position.set(30, 20, -70); b.scene.add(moon);
  // Sun: a hot disc plus the light that shades the planet and moon
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3.0, 24, 16), b.glow(60, 56, 46)); sun.position.set(70, 26, 20); b.scene.add(sun);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,236,200,0.85)', 'rgba(255,200,120,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.position.copy(sun.position); halo.scale.set(34, 34, 1); b.scene.add(halo);
  const dl = new THREE.DirectionalLight(0xfff0dc, 3.2); dl.position.copy(sun.position); b.scene.add(dl); b.scene.add(new THREE.AmbientLight(0x1a2240, 0.35));
  return b.scene;
}

// ---------------------------------------------------------------------------

/** Scene for a built-in environment; null for ids that are not procedural (studio, custom). */
export function buildRoomScene(id: EnvId): THREE.Scene | null {
  const b = new Builder();
  const room = (w: number, h: number, d: number, floor: number, wallRGB: number[], floorRGB: number[]) => {
    b.box(w, h, d, 0, floor + h / 2 - 0.2, 0, b.glow(wallRGB[0], wallRGB[1], wallRGB[2], THREE.BackSide));
    b.box(w, 0.2, d, 0, floor, 0, b.glow(floorRGB[0], floorRGB[1], floorRGB[2]));
  };
  const bx = (w: number, h: number, d: number, x: number, y: number, z: number, r: number, g: number, bl: number) => b.box(w, h, d, x, y, z, b.glow(r, g, bl));
  switch (id) {
    case 'outdoor': skyDome(b, [0.22, 0.45, 0.95], [0.85, 0.92, 1.0], [0.28, 0.27, 0.24], { az: 40, el: 58, color: [90, 84, 72], size: 3.2 }); break;
    case 'golden-hour': skyDome(b, [0.18, 0.28, 0.6], [1.0, 0.62, 0.34], [0.2, 0.15, 0.12], { az: 70, el: 9, color: [120, 70, 32], size: 3.6 }); break;
    case 'overcast': skyDome(b, [0.62, 0.66, 0.72], [0.82, 0.84, 0.86], [0.32, 0.32, 0.32]); break;
    case 'softbox-hall':
      room(30, 30, 30, -7, [0.28, 0.29, 0.31], [0.5, 0.5, 0.52]);
      bx(0.2, 12, 8, -12, 3, 2, 7, 7, 7.4); bx(0.2, 12, 8, 12, 3, 2, 6, 6, 6.2); bx(14, 0.2, 10, 0, 13, 0, 5, 5, 5.2); bx(8, 8, 0.2, 0, 3, -13, 2.2, 2.2, 2.3); break;
    case 'showroom':
      room(34, 16, 34, -4, [0.62, 0.62, 0.64], [0.78, 0.78, 0.8]);
      for (let i = -2; i <= 2; i++) bx(2.2, 0.2, 28, i * 6, 11.8, 0, 6.5, 6.4, 6.0); bx(0.2, 7, 12, -16.5, 3, -4, 4.5, 4.7, 5.2); break;
    case 'industrial':
      room(40, 20, 40, -4, [0.1, 0.1, 0.11], [0.14, 0.14, 0.15]);
      for (let i = -3; i <= 3; i++) bx(0.5, 0.3, 12, i * 5, 13, 0, 9, 9.4, 10.5); bx(0.2, 5, 9, 19.5, 5, 3, 3.4, 2.8, 2.2); bx(8, 5, 0.2, -3, 5, -19.5, 1.4, 1.5, 1.8); break;
    case 'office': return office();
    case 'living-room': return livingRoom();
    case 'loft': return loft();
    case 'night-city': return nightCity();
    case 'space': return space();
    default: return null;
  }
  return b.scene;
}
