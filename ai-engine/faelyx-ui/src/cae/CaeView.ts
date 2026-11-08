// Three.js viewport of the CAE workspace: the model with its loads, the voxel mesh and the results (contours,
// deformation, sections, iso-surfaces, streamlines, probes). CAD space is Z-up in millimetres and lives under a group
// rotated into three's Y-up world, so the Universal navigation (cam/universalNav.ts) works unchanged.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { installUniversalNav } from '../cam/universalNav';
import { cmapRGB, type CmapId } from './colormaps';
import { buildSurface, cellValue, isoSurface, sliceField, toNodes, type Surf } from './surface';
import type { CaeBody, FieldDef, Result, VolGrid } from './model';

export type V3 = [number, number, number];
export interface GlyphSpec { p: V3; dir?: V3; kind: 'arrow' | 'fix' | 'slide' | 'spring' | 'pressure' | 'heat' | 'volt' | 'coil' | 'torque' | 'dot'; color: string; label?: string }
export interface Highlight { body: number; tris: number[]; color: string }
export interface MarkSpec { segs: { s: number[]; color: string }[]; pts: { p: number[]; color: string }[] }
export interface ProbeMark { id: number; p: V3; label: string }
export interface SectionOpt { on: boolean; axis: 0 | 1 | 2; pos: number }

export interface ViewOpts {
  mode: 'model' | 'mesh' | 'result';
  field: string; modeIdx: number; frame: number;
  dispFactor: number; animate: boolean;
  cmap: CmapId; reverse: boolean; bands: number;
  rangeAuto: boolean; rmin: number; rmax: number;
  thresholdOn: boolean; threshold: number; fosTarget: number;
  edges: boolean; ghost: boolean;
  section: SectionOpt;
  slice: SectionOpt;
  iso: { on: boolean; level: number };
  streams: boolean;
  markers: boolean; hotspots: boolean;
}

export const DEFAULT_OPTS: ViewOpts = {
  mode: 'model', field: '', modeIdx: -1, frame: -1, dispFactor: 1, animate: false, cmap: 'rainbow', reverse: false, bands: 0,
  rangeAuto: true, rmin: 0, rmax: 1, thresholdOn: false, threshold: 0, fosTarget: 1.5, edges: false, ghost: false,
  section: { on: false, axis: 0, pos: 0.5 }, slice: { on: false, axis: 0, pos: 0.5 }, iso: { on: false, level: 0.5 }, streams: true, markers: true, hotspots: true,
};

export interface ViewInfo {
  lo: number; hi: number; min: number; max: number; minP: V3 | null; maxP: V3 | null;
  failFrac: number; warnFrac: number; aboveFrac: number; field: FieldDef | null; unit: string; label: string; scale: number;
}

export interface PickInfo { p: V3; value: number | null; field: string; label: string; unit: string }

const BODY_COLORS = [0x8fa6c8, 0xc9a27a, 0x8cc7a0, 0xb08fd0, 0xd0a0a0, 0x9fb0b0, 0xc8c07a, 0x7ab4c8];
const GREY = 0.42;

const tmpC = [0, 0, 0];

export class CaeView {
  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200000);
  private controls: OrbitControls;
  private cad = new THREE.Group();
  private content = new THREE.Group();
  private raf = 0;
  private disposed = false;
  private cleanup: (() => void)[] = [];
  private size = 100;
  private center = new THREE.Vector3();
  private opts: ViewOpts = { ...DEFAULT_OPTS };
  private clipOn = false;
  private animRaf = 0;

  onFacePick: ((body: number, tri: number, additive: boolean) => void) | null = null;
  onProbe: ((i: PickInfo) => void) | null = null;
  /** Edge / point picking: the triangle that was hit and the hit position in CAD space (mm). */
  onGeomPick: ((body: number, tri: number, p: V3, additive: boolean) => void) | null = null;
  onGeomHover: ((hit: { body: number; tri: number; p: V3 } | null) => void) | null = null;
  onEmptyPick: (() => void) | null = null;
  pickMode: 'face' | 'edge' | 'point' | 'probe' | 'none' = 'none';

  // model
  private modelG = new THREE.Group();
  private bodyMeshes: THREE.Mesh[] = [];
  private bodyKey = '';
  private overlayG = new THREE.Group();
  private glyphG = new THREE.Group();
  private marksG = new THREE.Group();
  private axes: THREE.Group | null = null;
  private bounds: { min: V3; max: V3 } | null = null;
  // mesh preview
  private meshG = new THREE.Group();
  // result
  private resG = new THREE.Group();
  private r: Result | null = null;
  private surf: Surf | null = null;
  private surfGeo: THREE.BufferGeometry | null = null;
  private surfMesh: THREE.Mesh | null = null;
  private edgeLines: THREE.LineSegments | null = null;
  private ghostLines: THREE.LineSegments | null = null;
  private triMesh: THREE.Mesh | null = null;
  private triGeo: THREE.BufferGeometry | null = null;
  private slMesh: THREE.Mesh | null = null;
  private capMesh: THREE.Mesh | null = null;
  private isoMesh: THREE.Mesh | null = null;
  private isoKey = '';
  private streamLines: THREE.LineSegments | null = null;
  private markerG = new THREE.Group();
  private probeG = new THREE.Group();
  private nodeCache = new Map<string, Float32Array>();
  private vals: Float32Array = new Float32Array(0);
  private posKey = '';
  private sliceCells: { vals: Float32Array; w: number; h: number; axis: number; origin: V3; du: V3; dv: V3; layer: number } | null = null;
  private capCells: { vals: Float32Array; w: number; h: number; axis: number; origin: V3; du: V3; dv: V3; layer: number } | null = null;
  private info: ViewInfo = { lo: 0, hi: 1, min: 0, max: 1, minP: null, maxP: null, failFrac: 0, warnFrac: 0, aboveFrac: 0, field: null, unit: '', label: '', scale: 1 };
  private t0 = performance.now();

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0a0910, 1);
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.outline = 'none';

    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1b1a24, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(300, 500, 260); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fa6ff, 0.55); fill.position.set(-300, 200, -260); this.scene.add(fill);
    this.cad.rotation.x = -Math.PI / 2;
    this.cad.add(this.content);
    this.scene.add(this.cad);
    this.content.add(this.modelG, this.overlayG, this.glyphG, this.marksG, this.meshG, this.resG, this.markerG, this.probeG);

    this.camera.position.set(220, 170, 260);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; this.controls.zoomToCursor = true; this.controls.minDistance = 0.5; this.controls.maxDistance = 100000;
    this.controls.addEventListener('change', () => this.requestRender());
    this.cleanup.push(installUniversalNav(this.renderer.domElement, this.camera, this.controls, {
      render: () => this.requestRender(), fit: () => this.fit(), pick: (e) => this.pick(e),
    }));
    const ro = new ResizeObserver(() => this.layout());
    ro.observe(host);
    this.cleanup.push(() => ro.disconnect());

    // Hover preview while picking edges / points (does nothing else: navigation is untouched)
    let hoverRaf = 0, hoverEv: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      if ((this.pickMode !== 'edge' && this.pickMode !== 'point') || e.buttons !== 0) { if (hoverEv) { hoverEv = null; this.onGeomHover?.(null); } return; }
      hoverEv = e;
      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        const ev = hoverEv; if (!ev || this.disposed) return;
        const h = this.hit(ev);
        this.onGeomHover?.(h ? { body: h.body, tri: h.tri, p: h.p } : null);
      });
    };
    const onLeave = () => { hoverEv = null; this.onGeomHover?.(null); };
    this.renderer.domElement.addEventListener('pointermove', onMove);
    this.renderer.domElement.addEventListener('pointerleave', onLeave);
    this.cleanup.push(() => { this.renderer.domElement.removeEventListener('pointermove', onMove); this.renderer.domElement.removeEventListener('pointerleave', onLeave); if (hoverRaf) cancelAnimationFrame(hoverRaf); });
    this.layout();
  }

  // ------------------------------------------------------------------ infrastructure

  private layout() {
    if (this.disposed) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (w < 8 || h < 8) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`; this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender() {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; if (!this.disposed) this.renderer.render(this.scene, this.camera); });
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.animRaf) cancelAnimationFrame(this.animRaf);
    this.cleanup.forEach((c) => c());
    this.disposeGroup(this.modelG); this.disposeGroup(this.overlayG); this.disposeGroup(this.glyphG); this.disposeGroup(this.marksG); this.disposeGroup(this.meshG); this.disposeGroup(this.resG); this.disposeGroup(this.markerG); this.disposeGroup(this.probeG);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private disposeGroup(g: THREE.Group) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(mat)) mat.forEach((x) => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); });
      else if (mat) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose(); }
    });
    while (g.children.length) g.remove(g.children[0]);
  }

  private setBounds(min: V3, max: V3) {
    this.bounds = { min, max };
    this.size = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    this.center.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    this.camera.near = Math.max(0.05, this.size / 500); this.camera.far = this.size * 200; this.camera.updateProjectionMatrix();
    this.buildAxes();
  }

  private buildAxes() {
    if (this.axes) { this.content.remove(this.axes); this.disposeGroup(this.axes); }
    const g = new THREE.Group();
    const b = this.bounds; if (!b) { this.axes = null; return; }
    const L = this.size * 0.35;
    const mk = (d: V3, c: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...d).multiplyScalar(L)]);
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.8 }));
    };
    g.add(mk([1, 0, 0], 0xff5d5d), mk([0, 1, 0], 0x5dff7a), mk([0, 0, 1], 0x5d8cff));
    g.position.set(b.min[0] - this.size * 0.05, b.min[1] - this.size * 0.05, b.min[2]);
    g.renderOrder = 5;
    this.axes = g; this.content.add(g);
  }

  fit() {
    const c = new THREE.Vector3(this.center.x, this.center.z, -this.center.y);
    const d = (this.size * 1.25) / Math.tan((this.camera.fov * Math.PI) / 360);
    const dir = new THREE.Vector3(0.62, 0.55, 0.78).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(dir.multiplyScalar(d));
    this.camera.lookAt(c);
    this.controls.update();
    this.requestRender();
  }

  focus(p: V3) {
    const t = new THREE.Vector3(p[0], p[2], -p[1]);
    const off = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(t); this.camera.position.copy(t).add(off.setLength(Math.min(off.length(), this.size * 1.6)));
    this.camera.lookAt(t); this.controls.update(); this.requestRender();
  }

  view(kind: 'iso' | 'top' | 'front' | 'right' | 'back' | 'left') {
    const c = this.controls.target.clone();
    const d = this.camera.position.distanceTo(c);
    const dirs = { iso: [0.62, 0.55, 0.78], top: [0, 1, 0.0001], front: [0, 0.0001, 1], right: [1, 0.0001, 0], back: [0, 0.0001, -1], left: [-1, 0.0001, 0] } as const;
    const v = new THREE.Vector3(...dirs[kind]).normalize().multiplyScalar(d);
    this.camera.position.copy(c).add(v); this.camera.lookAt(c); this.controls.update(); this.requestRender();
  }

  /** Renders the current scene at a given size and returns a JPEG data URL (for the report). */
  capture(w: number, h: number, mime = 'image/jpeg'): string {
    const ow = this.host.clientWidth, oh = this.host.clientHeight, pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL(mime, 0.92);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(ow, oh, false);
    this.camera.aspect = ow / Math.max(1, oh); this.camera.updateProjectionMatrix();
    this.requestRender();
    return url;
  }

  // ------------------------------------------------------------------ picking

  /** The model triangle under the pointer, with the hit position in CAD space. */
  private hit(e: PointerEvent): { body: number; tri: number; p: V3 } | null {
    if (!this.bodyMeshes.length || (this.opts.mode !== 'model' && this.opts.mode !== 'mesh')) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.bodyMeshes, false)[0];
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) return null;
    const local = this.content.worldToLocal(hit.point.clone());
    return { body: hit.object.userData.bodyIndex as number, tri: hit.faceIndex, p: [local.x, local.y, local.z] };
  }

  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const geoPick = this.pickMode === 'face' || this.pickMode === 'edge' || this.pickMode === 'point';
    if (this.opts.mode === 'model' || (this.opts.mode === 'mesh' && geoPick)) {
      if (!geoPick || !this.bodyMeshes.length) return;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (this.pickMode === 'face') {
        const hit = ray.intersectObjects(this.bodyMeshes, false)[0];
        if (hit && hit.faceIndex !== undefined && hit.faceIndex !== null) this.onFacePick?.(hit.object.userData.bodyIndex as number, hit.faceIndex, additive);
        else if (!e.shiftKey) this.onEmptyPick?.();
      } else {
        const h = this.hit(e);
        if (h) this.onGeomPick?.(h.body, h.tri, h.p, additive);
        else if (!e.shiftKey) this.onEmptyPick?.();
      }
      return;
    }
    if (this.opts.mode === 'result' && this.pickMode === 'probe') {
      const targets: THREE.Object3D[] = [];
      for (const m of [this.surfMesh, this.triMesh, this.slMesh, this.capMesh]) if (m && m.visible) targets.push(m);
      const hit = ray.intersectObjects(targets, false)[0];
      if (!hit) return;
      const local = this.content.worldToLocal(hit.point.clone());
      const f = this.info.field;
      let value: number | null = null;
      if (hit.object === this.surfMesh && this.surf && hit.faceIndex != null) value = this.quadValue(Math.floor(hit.faceIndex / 2), [local.x, local.y, local.z]);
      else if (hit.object === this.triMesh && hit.faceIndex != null && this.r?.tri) value = this.r.tri.val[hit.faceIndex];
      else if ((hit.object === this.slMesh || hit.object === this.capMesh) && hit.uv) {
        const sc = hit.object === this.slMesh ? this.sliceCells : this.capCells;
        if (sc) { const u = Math.min(sc.w - 1, Math.max(0, Math.floor(hit.uv.x * sc.w))), v = Math.min(sc.h - 1, Math.max(0, Math.floor(hit.uv.y * sc.h))); value = sc.vals[v * sc.w + u]; }
      }
      const tri = hit.object === this.triMesh && this.r?.tri;
      this.onProbe?.({ p: [local.x, local.y, local.z], value: value !== null && Number.isFinite(value) ? value : null, field: tri ? 'tri' : f?.id ?? '', label: tri ? this.r!.tri!.label : f?.label ?? '', unit: tri ? this.r!.tri!.unit : f?.unit ?? '' });
    }
  }

  /** Bilinear value of the current vertex values at a point of quad q (current, possibly deformed positions). */
  private quadValue(q: number, p: V3): number {
    if (!this.surfGeo || !this.surf) return NaN;
    const pos = this.surfGeo.getAttribute('position') as THREE.BufferAttribute;
    const a = new THREE.Vector3().fromBufferAttribute(pos, 4 * q), b = new THREE.Vector3().fromBufferAttribute(pos, 4 * q + 1), d = new THREE.Vector3().fromBufferAttribute(pos, 4 * q + 3);
    const P = new THREE.Vector3(p[0], p[1], p[2]);
    // quad a-b-c-d: s along a→b (and d→c), t along a→d (and b→c)
    const ab = b.clone().sub(a), ad = d.clone().sub(a), ap = P.clone().sub(a);
    const s = Math.min(1, Math.max(0, ab.lengthSq() ? ap.dot(ab) / ab.lengthSq() : 0)), t = Math.min(1, Math.max(0, ad.lengthSq() ? ap.dot(ad) / ad.lengthSq() : 0));
    const v = this.vals, v0 = v[4 * q], v1 = v[4 * q + 1], v2 = v[4 * q + 2], v3 = v[4 * q + 3];
    return (1 - s) * (1 - t) * v0 + s * (1 - t) * v1 + s * t * v2 + (1 - s) * t * v3;
  }

  // ------------------------------------------------------------------ model (pre-processing) content

  setBodies(bodies: CaeBody[], colors?: string[]) {
    const key = bodies.map((b, i) => `${b.id}:${b.tris.length}:${b.role}:${colors?.[i] ?? ''}`).join('|');
    if (key === this.bodyKey) return;
    this.bodyKey = key;
    this.disposeGroup(this.modelG);
    this.bodyMeshes = [];
    const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
    bodies.forEach((b, i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(b.tris, 3));
      geo.computeVertexNormals();
      for (let k = 0; k < b.tris.length; k += 3) for (let a = 0; a < 3; a++) { const v = b.tris[k + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
      const col = colors?.[i] ? new THREE.Color(colors[i]) : new THREE.Color(BODY_COLORS[i % BODY_COLORS.length]);
      const fluid = b.role === 'fluid', carve = b.role === 'carve';
      const mat = new THREE.MeshStandardMaterial({
        color: carve ? 0xff6b6b : fluid ? 0x4fc3f7 : col, roughness: 0.62, metalness: 0.15, side: THREE.DoubleSide,
        transparent: fluid || carve, opacity: fluid ? 0.28 : carve ? 0.35 : 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.bodyIndex = i;
      this.modelG.add(mesh); this.bodyMeshes.push(mesh);
      if (b.tris.length / 9 < 120000) {
        const eg = new THREE.EdgesGeometry(geo, 32);
        const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1a1d28, transparent: true, opacity: 0.55 }));
        this.modelG.add(lines);
      }
    });
    if (bodies.length && Number.isFinite(min[0])) {
      const had = !!this.bounds;
      this.setBounds(min, max);
      if (!had || this.opts.mode === 'model') this.fit();
    }
    this.requestRender();
  }

  /** Picked edges (as thin tubes) and points (as spheres), drawn on top of the model. */
  setMarks(m: MarkSpec) {
    this.disposeGroup(this.marksG);
    const rad = Math.max(0.05, this.size * 0.007);
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const grp of m.segs) {
      const n = Math.floor(grp.s.length / 6); if (!n) continue;
      const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
      const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(grp.color) }), n);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), mat = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        a.set(grp.s[6 * i], grp.s[6 * i + 1], grp.s[6 * i + 2]); b.set(grp.s[6 * i + 3], grp.s[6 * i + 4], grp.s[6 * i + 5]);
        const d = b.clone().sub(a), len = d.length(); if (len < 1e-9) { mat.makeScale(0, 0, 0); inst.setMatrixAt(i, mat); continue; }
        q.setFromUnitVectors(yAxis, d.clone().divideScalar(len));
        mat.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(rad, len, rad));
        inst.setMatrixAt(i, mat);
      }
      inst.renderOrder = 5; inst.frustumCulled = false;
      this.marksG.add(inst);
    }
    for (const grp of m.pts) {
      const n = Math.floor(grp.p.length / 3); if (!n) continue;
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(grp.color), depthTest: false, transparent: true, opacity: 0.95 }), n);
      const mat = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { mat.compose(new THREE.Vector3(grp.p[3 * i], grp.p[3 * i + 1], grp.p[3 * i + 2]), new THREE.Quaternion(), new THREE.Vector3(rad * 3.4, rad * 3.4, rad * 3.4)); inst.setMatrixAt(i, mat); }
      inst.renderOrder = 7; inst.frustumCulled = false;
      this.marksG.add(inst);
    }
    this.requestRender();
  }

  setOverlay(hl: Highlight[], glyphs: GlyphSpec[]) {
    this.disposeGroup(this.overlayG); this.disposeGroup(this.glyphG);
    // highlighted faces
    const pos: number[] = [], col: number[] = [];
    for (const h of hl) {
      const b = this.bodyMeshes[h.body]; if (!b) continue;
      const src = (b.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const c = new THREE.Color(h.color);
      for (const t of h.tris) {
        for (let k = 0; k < 9; k++) pos.push(src[t * 9 + k]);
        for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
      }
    }
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
      this.overlayG.add(m);
    }
    // glyphs
    const L = this.size * 0.2;
    for (const g of glyphs) {
      const color = new THREE.Color(g.color);
      const dir = g.dir ? new THREE.Vector3(...g.dir).normalize() : null;
      const at = new THREE.Vector3(...g.p);
      const mat = () => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
      let obj: THREE.Object3D;
      switch (g.kind) {
        case 'arrow': case 'pressure': case 'torque': {
          const d = dir ?? new THREE.Vector3(0, 0, -1);
          obj = new THREE.ArrowHelper(d, at.clone().sub(d.clone().multiplyScalar(L)), L, color.getHex(), L * 0.32, L * 0.2);
          (obj as THREE.ArrowHelper).traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { m.depthTest = false; m.transparent = true; } });
          if (g.kind === 'torque') { const ring = new THREE.Mesh(new THREE.TorusGeometry(L * 0.35, L * 0.04, 8, 28, Math.PI * 1.5), mat()); ring.position.copy(at); if (dir) ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); obj.add(ring); }
          break;
        }
        case 'fix': { const m = new THREE.Mesh(new THREE.ConeGeometry(L * 0.16, L * 0.3, 4), mat()); m.position.copy(at); m.position.z -= L * 0.15; m.rotation.x = Math.PI / 2; obj = m; break; }
        case 'slide': { const m = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.11, L * 0.11, L * 0.3, 14), mat()); m.position.copy(at); m.position.z -= L * 0.12; m.rotation.x = Math.PI / 2; obj = m; break; }
        case 'spring': { const m = new THREE.Mesh(new THREE.TorusKnotGeometry(L * 0.1, L * 0.03, 40, 6, 2, 5), mat()); m.position.copy(at); m.position.z -= L * 0.14; obj = m; break; }
        case 'heat': { const m = new THREE.Mesh(new THREE.OctahedronGeometry(L * 0.14), mat()); m.position.copy(at).addScaledVector(dir ?? new THREE.Vector3(0, 0, 1), L * 0.12); obj = m; break; }
        case 'volt': { const m = new THREE.Mesh(new THREE.BoxGeometry(L * 0.2, L * 0.2, L * 0.2), mat()); m.position.copy(at).addScaledVector(dir ?? new THREE.Vector3(0, 0, 1), L * 0.12); obj = m; break; }
        case 'coil': { const m = new THREE.Mesh(new THREE.TorusGeometry(L * 0.5, L * 0.04, 8, 36), mat()); m.position.copy(at); if (dir) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); obj = m; break; }
        default: { const m = new THREE.Mesh(new THREE.SphereGeometry(L * 0.07, 10, 8), mat()); m.position.copy(at); obj = m; }
      }
      obj.renderOrder = 6;
      this.glyphG.add(obj);
    }
    this.requestRender();
  }

  // ------------------------------------------------------------------ mesh preview

  setMeshPreview(grid: VolGrid | null, mat: Uint8Array | null, colors?: string[]) {
    this.disposeGroup(this.meshG);
    if (!grid || !mat) { this.requestRender(); return; }
    const s = buildSurface(grid, mat);
    if (!s.quads) { this.requestRender(); return; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(s.base, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(s.nrm, 3));
    geo.setIndex(new THREE.BufferAttribute(s.index, 1));
    const col = new Float32Array(s.quads * 12);
    const palette = (colors && colors.length ? colors : BODY_COLORS.map((c) => '#' + c.toString(16).padStart(6, '0'))).map((c) => new THREE.Color(c));
    for (let q = 0; q < s.quads; q++) {
      const m = mat[s.cell[q]] - 1;
      const c = palette[((m % palette.length) + palette.length) % palette.length];
      for (let a = 0; a < 4; a++) { col[(4 * q + a) * 3] = c.r; col[(4 * q + a) * 3 + 1] = c.g; col[(4 * q + a) * 3 + 2] = c.b; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    this.meshG.add(mesh);
    if (s.quads < 220000) {
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.BufferAttribute(s.base, 3));
      eg.setIndex(new THREE.BufferAttribute(s.lines, 1));
      this.meshG.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x0c0e16, transparent: true, opacity: 0.6 })));
    }
    this.requestRender();
  }

  // ------------------------------------------------------------------ results

  setResult(r: Result | null) {
    this.disposeGroup(this.resG); this.disposeGroup(this.markerG);
    this.surf = null; this.surfGeo = null; this.surfMesh = null; this.edgeLines = null; this.ghostLines = null; this.triMesh = null; this.triGeo = null;
    this.slMesh = null; this.capMesh = null; this.isoMesh = null; this.isoKey = ''; this.streamLines = null; this.nodeCache.clear(); this.posKey = '';
    this.sliceCells = null; this.capCells = null;
    this.r = r;
    if (!r || !r.grid) { this.requestRender(); return; }
    const g = r.grid;
    if (r.mask) {
      const s = buildSurface(g, r.mask);
      this.surf = s;
      const geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(s.base), 3); pos.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pos);
      geo.setAttribute('normal', new THREE.BufferAttribute(s.nrm, 3));
      const col = new THREE.BufferAttribute(new Float32Array(s.quads * 12), 3); col.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('color', col);
      geo.setIndex(new THREE.BufferAttribute(s.index, 1));
      this.surfGeo = geo;
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide });
      this.surfMesh = new THREE.Mesh(geo, mat); this.surfMesh.frustumCulled = false;
      this.resG.add(this.surfMesh);
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', pos); eg.setIndex(new THREE.BufferAttribute(s.lines, 1));
      this.edgeLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x0c0e16, transparent: true, opacity: 0.55 }));
      this.edgeLines.frustumCulled = false;
      this.resG.add(this.edgeLines);
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s.base), 3)); gg.setIndex(new THREE.BufferAttribute(s.lines, 1));
      this.ghostLines = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x8890a8, transparent: true, opacity: 0.35 }));
      this.resG.add(this.ghostLines);
    }
    if (r.tri) {
      const t = r.tri, n = t.val.length;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 9), 3));
      geo.computeVertexNormals();
      this.triGeo = geo;
      this.triMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      this.resG.add(this.triMesh);
    }
    if (r.streams.length) {
      let nseg = 0; for (const s of r.streams) nseg += Math.max(0, s.speed.length - 1);
      const pos = new Float32Array(nseg * 6);
      let o = 0;
      for (const s of r.streams) for (let i = 0; i + 1 < s.speed.length; i++) { pos.set(s.pts.subarray(3 * i, 3 * i + 3), o); pos.set(s.pts.subarray(3 * i + 3, 3 * i + 6), o + 3); o += 6; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nseg * 6), 3));
      this.streamLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
      this.streamLines.frustumCulled = false;
      this.resG.add(this.streamLines);
    }
    // bounds from the grid (or the solid cells)
    const mn: V3 = [g.ox, g.oy, g.oz], mx: V3 = [g.ox + g.nx * g.h, g.oy + g.ny * g.h, g.oz + g.nz * g.h];
    if (r.mask && !r.fields.some((f) => f.domain === 'fluid')) {
      const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
      for (let q = 0; q < this.surf!.quads * 4; q += 1) for (let a = 0; a < 3; a++) { const v = this.surf!.base[q * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
      if (Number.isFinite(lo[0])) { mn[0] = lo[0]; mn[1] = lo[1]; mn[2] = lo[2]; mx[0] = hi[0]; mx[1] = hi[1]; mx[2] = hi[2]; }
    } else if (r.mask) {
      const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
      const { nx, ny } = g, nxy = nx * ny;
      for (let c = 0; c < r.mask.length; c++) if (r.mask[c]) {
        const k = Math.floor(c / nxy), rr = c - k * nxy, j = Math.floor(rr / nx), i = rr - j * nx;
        if (i < lo[0]) lo[0] = i; if (i > hi[0]) hi[0] = i; if (j < lo[1]) lo[1] = j; if (j > hi[1]) hi[1] = j; if (k < lo[2]) lo[2] = k; if (k > hi[2]) hi[2] = k;
      }
      void lo; void hi;
    }
    this.setBounds(mn, mx);
    this.fit();
    this.requestRender();
  }

  setProbes(list: ProbeMark[]) {
    this.disposeGroup(this.probeG);
    const rad = this.size * 0.012;
    list.forEach((p, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      m.position.set(...p.p); m.renderOrder = 8;
      const ring = new THREE.Mesh(new THREE.SphereGeometry(rad * 1.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0xc084fc, depthTest: false, transparent: true, opacity: 0.55 }));
      ring.position.copy(m.position); ring.renderOrder = 7;
      void i;
      this.probeG.add(ring, m);
    });
    this.requestRender();
  }

  // ------------------------------------------------------------------ applying display options

  getInfo() { return this.info; }

  private fieldFor(id: string): FieldDef | null {
    return this.r?.fields.find((f) => f.id === id) ?? null;
  }

  private nodeVals(f: FieldDef, data?: Float32Array): Float32Array {
    if (f.loc === 'node') return data ?? f.data;
    const key = f.id + (data ? ':f' : '');
    let c = this.nodeCache.get(key);
    if (!c) { c = toNodes(this.r!.grid!, data ? { ...f, data } : f); this.nodeCache.set(key, c); }
    return c;
  }

  apply(o: ViewOpts): ViewInfo {
    const prev = this.opts;
    this.opts = o;
    const modeChanged = prev.mode !== o.mode;
    this.modelG.visible = true;
    this.overlayG.visible = o.mode === 'model'; this.glyphG.visible = o.mode === 'model';
    this.meshG.visible = o.mode === 'mesh';
    this.resG.visible = o.mode === 'result'; this.markerG.visible = o.mode === 'result'; this.probeG.visible = o.mode === 'result';
    this.bodyMeshes.forEach((m) => { m.visible = o.mode === 'model'; });
    this.modelG.children.forEach((c) => { if ((c as THREE.LineSegments).isLineSegments) c.visible = o.mode === 'model'; });
    if (o.mode === 'result' && this.r) this.applyResult(o, prev, modeChanged);
    else this.requestRender();
    this.updateAnim();
    return this.info;
  }

  private updateAnim() {
    const want = this.opts.mode === 'result' && this.opts.animate && this.opts.modeIdx >= 0 && !!this.r?.modes[this.opts.modeIdx];
    if (want && !this.animRaf) {
      const loop = () => {
        this.animRaf = 0;
        if (this.disposed || !(this.opts.mode === 'result' && this.opts.animate && this.opts.modeIdx >= 0)) return;
        this.updatePositions(true);
        this.animRaf = requestAnimationFrame(loop);
      };
      this.animRaf = requestAnimationFrame(loop);
    } else if (!want && this.animRaf) { cancelAnimationFrame(this.animRaf); this.animRaf = 0; this.updatePositions(false); }
  }

  private dispSource(): { d: Float32Array | null; scale: number } {
    const r = this.r!, o = this.opts;
    let d: Float32Array | null = r.disp;
    if (o.modeIdx >= 0 && r.modes[o.modeIdx]) d = r.modes[o.modeIdx].disp;
    else if (o.frame >= 0 && r.frames[o.frame]?.disp) d = r.frames[o.frame].disp!;
    return { d, scale: r.dispScale * o.dispFactor };
  }

  private updatePositions(animated: boolean) {
    const s = this.surf, geo = this.surfGeo; if (!s || !geo || !this.r) return;
    const { d, scale } = this.dispSource();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute, arr = pos.array as Float32Array;
    const ph = animated ? Math.sin(((performance.now() - this.t0) / 1000) * 2 * Math.PI / 1.4) : 1;
    const k = scale * ph;
    if (d && k !== 0) {
      for (let v = 0; v < s.node.length; v++) {
        const nd = s.node[v] * 3, o = v * 3;
        arr[o] = s.base[o] + d[nd] * k; arr[o + 1] = s.base[o + 1] + d[nd + 1] * k; arr[o + 2] = s.base[o + 2] + d[nd + 2] * k;
      }
    } else arr.set(s.base);
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
    this.info = { ...this.info, scale };
    this.requestRender();
  }

  private applyResult(o: ViewOpts, prev: ViewOpts, modeChanged: boolean) {
    const r = this.r!;
    const f = this.fieldFor(o.field) ?? this.fieldFor(r.defaultField) ?? r.fields[0] ?? null;
    const lowIsBad = !!f?.lowIsBad;
    // ----- range
    let lo = f ? f.min : 0, hi = f ? f.max : 1;
    let frameData: Float32Array | undefined;
    if (f && o.frame >= 0 && r.frames[o.frame]?.fields?.[f.id]) {
      frameData = r.frames[o.frame].fields![f.id];
      lo = Infinity; hi = -Infinity; for (let i = 0; i < frameData.length; i++) { const v = frameData[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (f.diverging) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
    } else if (f?.diverging) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
    if (f && lowIsBad && o.rangeAuto) hi = Math.min(hi, Math.max(lo * 4, o.fosTarget * 2));
    if (!o.rangeAuto) { lo = o.rmin; hi = o.rmax; }
    if (!(hi > lo)) hi = lo + (Math.abs(lo) || 1) * 1e-6;
    const dataMin = f ? f.min : 0, dataMax = f ? f.max : 1;
    // ----- vertex values on the surface
    const s = this.surf;
    let fail = 0, warn = 0, above = 0, minV = Infinity, maxV = -Infinity, minP: V3 | null = null, maxP: V3 | null = null;
    if (s && this.surfGeo && f && f.domain === 'solid') {
      const nq4 = s.quads * 4;
      if (this.vals.length !== nq4) this.vals = new Float32Array(nq4);
      const vals = this.vals;
      const data = frameData ?? f.data;
      if (f.loc === 'node') { for (let v = 0; v < nq4; v++) vals[v] = data[s.node[v]]; }
      else { for (let q = 0; q < s.quads; q++) { const cv = data[s.cell[q]]; vals[4 * q] = cv; vals[4 * q + 1] = cv; vals[4 * q + 2] = cv; vals[4 * q + 3] = cv; } }
      const col = this.surfGeo.getAttribute('color') as THREE.BufferAttribute, carr = col.array as Float32Array;
      const flip = lowIsBad !== o.reverse;
      const bands = o.bands;
      const thr = o.thresholdOn;
      for (let q = 0; q < s.quads; q++) {
        let qmin = Infinity;
        for (let a = 0; a < 4; a++) {
          const v = vals[4 * q + a], oo = (4 * q + a) * 3;
          if (!Number.isFinite(v)) { carr[oo] = carr[oo + 1] = carr[oo + 2] = GREY; continue; }
          if (v < qmin) qmin = v;
          if (v < minV) { minV = v; minP = [s.base[oo], s.base[oo + 1], s.base[oo + 2]]; }
          if (v > maxV) { maxV = v; maxP = [s.base[oo], s.base[oo + 1], s.base[oo + 2]]; }
          if (thr && lowIsBad) {
            if (v < 1) { carr[oo] = 0.92; carr[oo + 1] = 0.12; carr[oo + 2] = 0.12; }
            else if (v < o.fosTarget) { carr[oo] = 0.98; carr[oo + 1] = 0.72; carr[oo + 2] = 0.1; }
            else { carr[oo] = 0.18; carr[oo + 1] = 0.66; carr[oo + 2] = 0.38; }
            continue;
          }
          if (thr && !lowIsBad && v < o.threshold) { carr[oo] = 0.26; carr[oo + 1] = 0.3; carr[oo + 2] = 0.4; continue; }
          let t = (v - lo) / (hi - lo);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          if (flip) t = 1 - t;
          if (bands > 0) t = Math.min(1, (Math.floor(t * bands - 1e-9) + 0.5) / bands);
          cmapRGB(o.cmap, t, tmpC);
          carr[oo] = tmpC[0]; carr[oo + 1] = tmpC[1]; carr[oo + 2] = tmpC[2];
        }
        if (lowIsBad && Number.isFinite(qmin)) { if (qmin < 1) fail++; else if (qmin < o.fosTarget) warn++; }
        else if (Number.isFinite(qmin) && o.thresholdOn && qmin >= o.threshold) above++;
      }
      col.needsUpdate = true;
      this.surfMesh!.visible = true;
    } else if (this.surfMesh) {
      // fluid-domain results: the body is drawn in grey (or hidden when the surface is coloured by triangles)
      const col = this.surfGeo!.getAttribute('color') as THREE.BufferAttribute, carr = col.array as Float32Array;
      carr.fill(0.5); col.needsUpdate = true;
      this.surfMesh.visible = !this.triMesh;
    }
    if (s) { fail /= Math.max(1, s.quads); warn /= Math.max(1, s.quads); above /= Math.max(1, s.quads); }
    // ----- coloured triangle surface (CFD pressure etc.)
    if (this.triMesh && r.tri) {
      const t = r.tri, col = this.triGeo!.getAttribute('color') as THREE.BufferAttribute, carr = col.array as Float32Array;
      const tl = t.min, th = t.max, span = th - tl || 1;
      const flip = o.reverse;
      for (let i = 0; i < t.val.length; i++) {
        let v = t.val[i];
        let u = (v - (t.diverging ? -Math.max(Math.abs(tl), Math.abs(th)) : tl)) / (t.diverging ? 2 * Math.max(Math.abs(tl), Math.abs(th)) || 1 : span);
        if (!Number.isFinite(v)) u = 0.5;
        u = u < 0 ? 0 : u > 1 ? 1 : u; if (flip) u = 1 - u;
        if (o.bands > 0) u = Math.min(1, (Math.floor(u * o.bands - 1e-9) + 0.5) / o.bands);
        cmapRGB(t.diverging ? 'coolwarm' : o.cmap, u, tmpC);
        for (let a = 0; a < 3; a++) { carr[(3 * i + a) * 3] = tmpC[0]; carr[(3 * i + a) * 3 + 1] = tmpC[1]; carr[(3 * i + a) * 3 + 2] = tmpC[2]; }
        void v;
      }
      col.needsUpdate = true;
    }
    // ----- positions
    const pk = [o.modeIdx, o.frame, o.dispFactor, o.animate].join('|');
    if (pk !== this.posKey || modeChanged) { this.posKey = pk; this.updatePositions(o.animate && o.modeIdx >= 0); }
    if (this.edgeLines) this.edgeLines.visible = o.edges;
    if (this.ghostLines) this.ghostLines.visible = o.ghost && !!this.dispSource().d;
    // ----- section & slices
    this.applySlices(o, f, lo, hi, frameData);
    // ----- iso-surface
    this.applyIso(o, f, lo, hi, frameData);
    // ----- streamlines
    if (this.streamLines) {
      this.streamLines.visible = o.streams;
      if (o.streams && (prev.cmap !== o.cmap || prev.reverse !== o.reverse || !prev.streams || modeChanged || this.streamLines.userData.cm !== o.cmap + o.reverse)) {
        this.streamLines.userData.cm = o.cmap + o.reverse;
        let smin = Infinity, smax = -Infinity;
        for (const st of r.streams) for (let i = 0; i < st.speed.length; i++) { const v = st.speed[i]; if (v < smin) smin = v; if (v > smax) smax = v; }
        const col = this.streamLines.geometry.getAttribute('color') as THREE.BufferAttribute, carr = col.array as Float32Array;
        let w = 0;
        for (const st of r.streams) for (let i = 0; i + 1 < st.speed.length; i++) {
          for (let e = 0; e < 2; e++) { let u = (st.speed[i + e] - smin) / (smax - smin || 1); if (o.reverse) u = 1 - u; cmapRGB(o.cmap, u, tmpC); carr[w++] = tmpC[0]; carr[w++] = tmpC[1]; carr[w++] = tmpC[2]; }
        }
        col.needsUpdate = true;
      }
    }
    // ----- markers
    this.disposeGroup(this.markerG);
    const rad = this.size * 0.014;
    const mk = (p: V3, color: number, scale = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(rad * scale, 12, 10), new THREE.MeshBasicMaterial({ color, depthTest: false })); m.position.set(...p); m.renderOrder = 7; this.markerG.add(m); };
    if (o.markers && minP && maxP && f && f.domain === 'solid') {
      mk(this.displaced(maxP), lowIsBad ? 0x3b82f6 : 0xff3b3b, 1.3); mk(this.displaced(minP), lowIsBad ? 0xff3b3b : 0x3b82f6, 1.0);
    }
    if (o.hotspots) for (const h of r.hotspots) if (!f || h.fieldId === f.id || !r.hotspots.some((x) => x.fieldId === f.id)) mk([h.x, h.y, h.z], 0xffb020, 0.8);
    this.info = { lo, hi, min: Number.isFinite(minV) ? minV : dataMin, max: Number.isFinite(maxV) ? maxV : dataMax, minP, maxP, failFrac: fail, warnFrac: warn, aboveFrac: above, field: f, unit: f?.unit ?? r.tri?.unit ?? '', label: f?.label ?? r.tri?.label ?? '', scale: this.info.scale };
    this.requestRender();
  }

  private displaced(p: V3): V3 {
    if (!this.surf || !this.surfGeo) return p;
    // find the surface vertex at p (first match) and use its current position
    const s = this.surf, arr = (this.surfGeo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let v = 0; v < s.node.length; v++) { const o = v * 3; if (s.base[o] === p[0] && s.base[o + 1] === p[1] && s.base[o + 2] === p[2]) return [arr[o], arr[o + 1], arr[o + 2]]; }
    return p;
  }

  private makeSliceTexture(vals: Float32Array, w: number, h: number, lo: number, hi: number, o: ViewOpts, flip: boolean): THREE.DataTexture {
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (!Number.isFinite(v)) { data[4 * i + 3] = 0; continue; }
      let t = (v - lo) / (hi - lo); t = t < 0 ? 0 : t > 1 ? 1 : t; if (flip) t = 1 - t;
      if (o.bands > 0) t = Math.min(1, (Math.floor(t * o.bands - 1e-9) + 0.5) / o.bands);
      if (o.thresholdOn && this.info.field?.lowIsBad) {
        const rgb = v < 1 ? [235, 30, 30] : v < o.fosTarget ? [250, 184, 26] : [46, 168, 97];
        data[4 * i] = rgb[0]; data[4 * i + 1] = rgb[1]; data[4 * i + 2] = rgb[2]; data[4 * i + 3] = 255; continue;
      }
      cmapRGB(o.cmap, t, tmpC);
      data[4 * i] = tmpC[0] * 255; data[4 * i + 1] = tmpC[1] * 255; data[4 * i + 2] = tmpC[2] * 255; data[4 * i + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
    return tex;
  }

  private planeMesh(tex: THREE.DataTexture, origin: V3, du: V3, dv: V3): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      origin[0], origin[1], origin[2],
      origin[0] + du[0], origin[1] + du[1], origin[2] + du[2],
      origin[0] + du[0] + dv[0], origin[1] + du[1] + dv[1], origin[2] + du[2] + dv[2],
      origin[0] + dv[0], origin[1] + dv[1], origin[2] + dv[2],
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  }

  private applySlices(o: ViewOpts, f: FieldDef | null, lo: number, hi: number, frameData?: Float32Array) {
    const r = this.r!, g = r.grid!;
    const flip = !!f?.lowIsBad !== o.reverse;
    const clearM = (m: THREE.Mesh | null) => { if (m) { this.resG.remove(m); m.geometry.dispose(); const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); } };
    clearM(this.slMesh); this.slMesh = null; this.sliceCells = null;
    clearM(this.capMesh); this.capMesh = null; this.capCells = null;
    // clipping of the surface by the section plane
    let clip: THREE.Plane[] = [];
    if (o.section.on && f) {
      const ax = o.section.axis, n = [g.nx, g.ny, g.nz][ax];
      const L = Math.max(1, Math.min(n, Math.round(o.section.pos * n)));
      const coord = [g.ox, g.oy, g.oz][ax] + L * g.h;
      const nrm = new THREE.Vector3(0, 0, 0);
      // plane normal in world axes: CAD (x, y, z) → world (x, z, −y); keep the side with smaller coordinate (negative CAD axis)
      if (ax === 0) nrm.set(-1, 0, 0); else if (ax === 1) nrm.set(0, 0, 1); else nrm.set(0, -1, 0);
      const worldPoint = ax === 0 ? new THREE.Vector3(coord, 0, 0) : ax === 1 ? new THREE.Vector3(0, 0, -coord) : new THREE.Vector3(0, coord, 0);
      clip = [new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, worldPoint.add(nrm.clone().multiplyScalar(-1e-3 * g.h)))];
      if (f.domain === 'solid' && r.mask) {
        const sl = sliceField(g, frameData ? { ...f, data: frameData } : f, ax as 0 | 1 | 2, L - 1, (c) => r.mask![c] !== 0);
        const origin: V3 = [...sl.origin]; origin[ax] = coord;
        // lower in-plane corner = grid origin
        const a = ax === 0 ? 1 : 0, b = ax === 2 ? 1 : 2;
        origin[a] = [g.ox, g.oy, g.oz][a]; origin[b] = [g.ox, g.oy, g.oz][b];
        const tex = this.makeSliceTexture(sl.vals, sl.w, sl.h, lo, hi, o, flip);
        this.capMesh = this.planeMesh(tex, origin, sl.du, sl.dv);
        this.capCells = { vals: sl.vals, w: sl.w, h: sl.h, axis: ax, origin, du: sl.du, dv: sl.dv, layer: L - 1 };
        this.resG.add(this.capMesh);
      }
    }
    if (this.surfMesh) { const mat = this.surfMesh.material as THREE.MeshLambertMaterial; mat.clippingPlanes = clip; mat.clipShadows = false; mat.needsUpdate = mat.needsUpdate || (clip.length > 0) !== this.clipOn; }
    if (this.triMesh) { (this.triMesh.material as THREE.MeshLambertMaterial).clippingPlanes = clip; }
    this.clipOn = clip.length > 0;
    // fluid slice
    if (o.slice.on && f && f.domain === 'fluid') {
      const ax = o.slice.axis, n = [g.nx, g.ny, g.nz][ax];
      const L = Math.max(0, Math.min(n - 1, Math.floor(o.slice.pos * n)));
      const sl = sliceField(g, frameData ? { ...f, data: frameData } : f, ax as 0 | 1 | 2, L, (c) => !(r.mask && r.mask[c]));
      const origin: V3 = [...sl.origin];
      const a = ax === 0 ? 1 : 0, b = ax === 2 ? 1 : 2;
      origin[a] = [g.ox, g.oy, g.oz][a]; origin[b] = [g.ox, g.oy, g.oz][b];
      const tex = this.makeSliceTexture(sl.vals, sl.w, sl.h, lo, hi, o, !!f.lowIsBad !== o.reverse);
      this.slMesh = this.planeMesh(tex, origin, sl.du, sl.dv);
      this.sliceCells = { vals: sl.vals, w: sl.w, h: sl.h, axis: ax, origin, du: sl.du, dv: sl.dv, layer: L };
      this.resG.add(this.slMesh);
    }
  }

  private applyIso(o: ViewOpts, f: FieldDef | null, lo: number, hi: number, frameData?: Float32Array) {
    const r = this.r!, g = r.grid!;
    const key = o.iso.on && f ? [f.id, o.iso.level.toFixed(3), o.frame, lo, hi].join('|') : '';
    if (key === this.isoKey) { if (this.isoMesh) this.isoMesh.visible = o.iso.on; return; }
    this.isoKey = key;
    if (this.isoMesh) { this.resG.remove(this.isoMesh); this.isoMesh.geometry.dispose(); (this.isoMesh.material as THREE.Material).dispose(); this.isoMesh = null; }
    if (!o.iso.on || !f) return;
    const nv = this.nodeVals(f, frameData);
    const level = lo + o.iso.level * (hi - lo);
    const cells = g.nx * g.ny * g.nz;
    const step = cells > 1_500_000 ? 3 : cells > 500_000 ? 2 : 1;
    const valid = f.domain === 'solid' && r.mask ? (c: number) => r.mask![c] !== 0 : f.domain === 'fluid' && r.mask ? (c: number) => !r.mask![c] : undefined;
    const pos = isoSurface(g, nv, level, valid, step);
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    cmapRGB(o.cmap, o.reverse !== !!f.lowIsBad ? 1 - o.iso.level : o.iso.level, tmpC);
    this.isoMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(tmpC[0], tmpC[1], tmpC[2]), transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
    this.resG.add(this.isoMesh);
  }

  /** Values of the fluid/solid field at a point (for the point probe in the UI). */
  sample(fieldId: string, p: V3): number | null {
    const r = this.r; if (!r?.grid) return null;
    const f = this.fieldFor(fieldId); if (!f) return null;
    const g = r.grid;
    const i = Math.floor((p[0] - g.ox) / g.h), j = Math.floor((p[1] - g.oy) / g.h), k = Math.floor((p[2] - g.oz) / g.h);
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return null;
    const v = cellValue(g, f, (k * g.ny + j) * g.nx + i);
    return Number.isFinite(v) ? v : null;
  }
}
