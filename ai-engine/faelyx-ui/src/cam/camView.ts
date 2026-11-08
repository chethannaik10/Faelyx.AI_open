// Digital-twin viewport for the CAM workspace (three.js).
// CAD space is Z-up in millimetres and lives under a group rotated into three's Y-up world, so the
// Universal navigation (universalNav.ts) works unchanged. One content set is shown at a time:
//   part preview · mill (stock-removal heightmap) · lathe (revolved bar) · sheet cutting · layer-by-layer print.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { installUniversalNav } from './universalNav';
import type { Mesh } from './geometry';
import type { Program, Box3 as FixBox } from './toolpath';
import type { Tool } from './camData';
import type { MillSim, TurnSim, SimEvent, SimPose } from './sim';
import type { PrintProgram } from './printPlan';

export interface ViewFlags { path: boolean; rapids: boolean; fixtures: boolean; markers: boolean; part: boolean; travel: boolean; tool: boolean }
export const DEFAULT_FLAGS: ViewFlags = { path: true, rapids: true, fixtures: true, markers: true, part: true, travel: false, tool: true };

const OP_COLORS = [0x9b7bff, 0x4ec9b0, 0x6ea8ff, 0xf29e4c, 0xe879b9, 0x8bd450, 0xe2d36b, 0x5ad1e6];
const PRINT_COLORS = [0x555566, 0x888899, 0x39b6ff, 0x2a7fd4, 0xe8c54a, 0x57d17a, 0xb36cf0, 0xff8a3d, 0xff5a8a, 0xf0a0ff];

export class CamView {
  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 20000);
  private controls: OrbitControls;
  private cad = new THREE.Group();
  private content = new THREE.Group();
  private ground: THREE.GridHelper | null = null;
  private raf = 0;
  private disposed = false;
  private cleanup: (() => void)[] = [];
  private flags: ViewFlags = { ...DEFAULT_FLAGS };
  onPick: ((eventIndex: number) => void) | null = null;

  // --- content handles
  private mode: 'none' | 'part' | 'mill' | 'turn' | 'cut' | 'print' = 'none';
  private disposables: { dispose: () => void }[] = [];
  private fixturesG: THREE.Group | null = null;
  private partG: THREE.Object3D | null = null;
  private markers: THREE.Group | null = null;
  private markerMeshes: THREE.Mesh[] = [];
  private toolG: THREE.Object3D | null = null;
  private toolId = '';
  private pathDone: THREE.LineSegments | null = null;
  private pathGhost: THREE.LineSegments | null = null;
  private rapidDone: THREE.LineSegments | null = null;
  private rapidGhost: THREE.LineSegments | null = null;
  private pathPref: Int32Array | null = null;
  private rapidPref: Int32Array | null = null;
  private segCmdStart = 0;
  private size = 100;
  private center = new THREE.Vector3();

  // mill
  private hm: { geo: THREE.BufferGeometry; pos: Float32Array; colr: Float32Array; gi: number[]; gj: number[]; GI: number; GJ: number; sk: { geo: THREE.BufferGeometry; pos: Float32Array; colr: Float32Array; src: Int32Array } | null; zBottom: number; zTop: number; target: Float32Array; stockInit: Float32Array; nx: number; cell: number; x0: number; y0: number } | null = null;
  // turn
  private lathe: { geo: THREE.BufferGeometry; pos: Float32Array; rings: number; seg: number; step: number; zMax: number; stride: number } | null = null;
  // print
  private printSegs: { pos: Float32Array; modelPref: Int32Array; travelPref: Int32Array } | null = null;
  private nozzle: THREE.Mesh | null = null;
  private printProg: PrintProgram | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0a0910, 1);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.outline = 'none';
    this.scene.background = null;

    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1b1a24, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(300, 500, 260); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fa6ff, 0.55); fill.position.set(-300, 200, -260); this.scene.add(fill);
    this.cad.rotation.x = -Math.PI / 2;
    this.cad.add(this.content);
    this.scene.add(this.cad);

    this.camera.position.set(220, 170, 260);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; this.controls.zoomToCursor = true; this.controls.minDistance = 5; this.controls.maxDistance = 8000;
    this.controls.addEventListener('change', () => this.requestRender());
    this.cleanup.push(installUniversalNav(this.renderer.domElement, this.camera, this.controls, {
      render: () => this.requestRender(), fit: () => this.fit(), pick: (e) => this.pick(e),
    }));
    const ro = new ResizeObserver(() => this.layout());
    ro.observe(host);
    this.cleanup.push(() => ro.disconnect());
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
    this.cleanup.forEach((c) => c());
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private track<T extends { dispose: () => void }>(o: T): T { this.disposables.push(o); return o; }

  private clear() {
    while (this.content.children.length) this.content.remove(this.content.children[0]);
    this.disposables.forEach((d) => { try { d.dispose(); } catch { /* already gone */ } });
    this.disposables = [];
    if (this.ground) { this.scene.remove(this.ground); this.ground.geometry.dispose(); (this.ground.material as THREE.Material).dispose(); this.ground = null; }
    this.fixturesG = this.partG = this.markers = this.toolG = null; this.markerMeshes = [];
    this.pathDone = this.pathGhost = this.rapidDone = this.rapidGhost = null; this.pathPref = this.rapidPref = null;
    this.hm = null; this.lathe = null; this.printSegs = null; this.nozzle = null; this.printProg = null; this.toolId = '';
    this.mode = 'none';
  }

  private finishContent(box: THREE.Box3, groundZ: number) {
    const s = new THREE.Vector3(); box.getSize(s); box.getCenter(this.center);
    this.size = Math.max(s.x, s.y, s.z, 20);
    // ground grid under the model (CAD z = groundZ)
    const g = Math.ceil((this.size * 2.4) / 50) * 50;
    this.ground = new THREE.GridHelper(g, Math.max(8, Math.round(g / 10)), 0x3a3550, 0x211d32);
    (this.ground.material as THREE.Material).transparent = true; (this.ground.material as THREE.Material).opacity = 0.7;
    this.ground.position.set(this.center.x, groundZ - 0.05, -this.center.y);
    this.scene.add(this.ground);
    this.camera.near = Math.max(0.2, this.size / 500); this.camera.far = this.size * 40; this.camera.updateProjectionMatrix();
    this.controls.maxDistance = this.size * 12; this.controls.minDistance = this.size * 0.05;
    this.fit();
  }

  fit() {
    const c = new THREE.Vector3(this.center.x, this.center.z, -this.center.y); // CAD → world
    const d = (this.size * 1.15) / Math.tan((this.camera.fov * Math.PI) / 360);
    const dir = new THREE.Vector3(0.62, 0.55, 0.78).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(dir.multiplyScalar(d));
    this.camera.lookAt(c);
    this.controls.update();
    this.requestRender();
  }

  /** Preset views, in CAD terms. */
  view(kind: 'iso' | 'top' | 'front' | 'right') {
    const c = this.controls.target.clone();
    const d = this.camera.position.distanceTo(c);
    const dirs = { iso: [0.62, 0.55, 0.78], top: [0, 1, 0.0001], front: [0, 0.0001, 1], right: [1, 0.0001, 0] } as const;
    const v = new THREE.Vector3(...dirs[kind]).normalize().multiplyScalar(d);
    this.camera.position.copy(c).add(v); this.camera.lookAt(c); this.controls.update(); this.requestRender();
  }

  setFlags(f: ViewFlags) {
    this.flags = { ...f };
    if (this.fixturesG) this.fixturesG.visible = f.fixtures;
    if (this.partG) this.partG.visible = f.part;
    if (this.markers) this.markers.visible = f.markers;
    if (this.toolG) this.toolG.visible = f.tool;
    if (this.pathDone) this.pathDone.visible = f.path;
    if (this.pathGhost) this.pathGhost.visible = f.path;
    const rv = this.mode === 'print' ? f.travel : f.path && f.rapids;
    if (this.rapidDone) this.rapidDone.visible = rv;
    if (this.rapidGhost) this.rapidGhost.visible = this.mode === 'print' ? false : rv;
    this.requestRender();
  }

  private pick(e: PointerEvent) {
    if (!this.markerMeshes.length || !this.flags.markers) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.markerMeshes, false)[0];
    if (hit) this.onPick?.(hit.object.userData.eventIndex as number);
  }

  // ------------------------------------------------------------------ shared builders

  private meshObject(m: Mesh, color: number, opacity = 1, shift: [number, number, number] = [0, 0, 0]) {
    const geo = this.track(new THREE.BufferGeometry());
    const pos = new Float32Array(m.tris.length);
    for (let i = 0; i < pos.length; i += 3) { pos[i] = m.tris[i] + shift[0]; pos[i + 1] = m.tris[i + 1] + shift[1]; pos[i + 2] = m.tris[i + 2] + shift[2]; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mat = this.track(new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.55, transparent: opacity < 1, opacity, side: THREE.DoubleSide }));
    return new THREE.Mesh(geo, mat);
  }

  private boxMesh(b: FixBox, color: number, opacity: number) {
    const geo = this.track(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0));
    const mat = this.track(new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.5, transparent: true, opacity }));
    const m = new THREE.Mesh(geo, mat);
    m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    const edges = this.track(new THREE.EdgesGeometry(geo));
    const lm = this.track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
    m.add(new THREE.LineSegments(edges, lm));
    return m;
  }

  private label(text: string, size: number, color = '#cdbfff') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d')!; x.font = '600 34px DM Mono, monospace'; x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, 6, 32);
    const tex = this.track(new THREE.CanvasTexture(c));
    const mat = this.track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const sp = new THREE.Sprite(mat); sp.scale.set(size * 4, size, 1); sp.center.set(0, 0.5);
    return sp;
  }

  private triad(len: number, name: string) {
    const g = new THREE.Group();
    const mk = (dir: THREE.Vector3, color: number) => {
      const geo = this.track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(len)]));
      const m = this.track(new THREE.LineBasicMaterial({ color, depthTest: false }));
      const l = new THREE.Line(geo, m); l.renderOrder = 10; g.add(l);
    };
    mk(new THREE.Vector3(1, 0, 0), 0xff5a5a); mk(new THREE.Vector3(0, 1, 0), 0x5aff7a); mk(new THREE.Vector3(0, 0, 1), 0x5a8bff);
    const l = this.label(name, len * 0.22); l.position.set(len * 0.1, len * 0.1, len * 0.1); l.renderOrder = 11; g.add(l);
    return g;
  }

  /** Tool + holder, tip at the origin, axis +Z (CAD). */
  private makeTool(t: Tool): THREE.Group {
    const g = new THREE.Group();
    const R = t.d / 2;
    const cyl = (r: number, h: number, z0: number, color: number, opacity = 1) => {
      const geo = this.track(new THREE.CylinderGeometry(r, r, h, 28)); geo.rotateX(Math.PI / 2); geo.translate(0, 0, z0 + h / 2);
      const mat = this.track(new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35, transparent: opacity < 1, opacity }));
      return new THREE.Mesh(geo, mat);
    };
    if (t.kind === 'ball') {
      const sg = this.track(new THREE.SphereGeometry(R, 24, 14)); sg.translate(0, 0, R);
      const sm = this.track(new THREE.MeshStandardMaterial({ color: 0xe8c54a, metalness: 0.6, roughness: 0.3 }));
      g.add(new THREE.Mesh(sg, sm));
      g.add(cyl(R, Math.max(0.1, t.fluteLen - R), R, 0xe8c54a));
    } else if (t.kind === 'drill') {
      const tip = R * 0.55;
      const cg = this.track(new THREE.ConeGeometry(R, tip, 24)); cg.rotateX(-Math.PI / 2); cg.translate(0, 0, tip / 2);
      g.add(new THREE.Mesh(cg, this.track(new THREE.MeshStandardMaterial({ color: 0xd8a63c, metalness: 0.6, roughness: 0.3 }))));
      g.add(cyl(R, t.fluteLen, tip, 0xd8a63c));
    } else g.add(cyl(R, t.fluteLen, 0, 0xe8c54a));
    if (t.stickout > t.fluteLen) g.add(cyl(Math.min(R * 0.98, R), t.stickout - t.fluteLen, t.fluteLen, 0xb8bcc8));
    g.add(cyl(t.holderD / 2, 36, t.stickout, 0x6a6f80, 0.9));
    g.add(cyl(t.holderD / 2 + 6, 50, t.stickout + 36, 0x474b59, 0.55));
    return g;
  }

  private placeTool(p: SimPose) {
    if (!this.toolG) return;
    this.toolG.position.set(p.x, p.y, p.z);
    if (p.a !== 0 || p.c !== 0) {
      const A = (p.a * Math.PI) / 180, C = (p.c * Math.PI) / 180;
      const ax = new THREE.Vector3(Math.sin(A) * Math.sin(C), Math.sin(A) * Math.cos(C), Math.cos(A)).normalize();
      this.toolG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax);
    } else this.toolG.quaternion.identity();
  }

  private events(events: SimEvent[], setup: number, rad: number) {
    const g = new THREE.Group(); this.markers = g; this.markerMeshes = [];
    const geo = this.track(new THREE.SphereGeometry(rad, 14, 10));
    const matE = this.track(new THREE.MeshBasicMaterial({ color: 0xff3b54, transparent: true, opacity: 0.9, depthTest: false }));
    const matW = this.track(new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.9, depthTest: false }));
    events.forEach((e, i) => {
      if (e.setup !== setup) return;
      const m = new THREE.Mesh(geo, e.severity === 'error' ? matE : matW);
      m.position.set(e.x, e.y, e.z); m.renderOrder = 20; m.userData.eventIndex = i;
      const ringGeo = this.track(new THREE.RingGeometry(rad * 1.5, rad * 1.9, 24));
      const ring = new THREE.Mesh(ringGeo, this.track(new THREE.MeshBasicMaterial({ color: e.severity === 'error' ? 0xff3b54 : 0xffb02e, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthTest: false })));
      ring.renderOrder = 20; m.add(ring);
      g.add(m); this.markerMeshes.push(m);
    });
    g.visible = this.flags.markers;
    this.content.add(g);
  }

  /** Ghost + done copies of one line buffer; `pref[k]` = number of segments that belong to commands before k. */
  private lineSet(pos: Float32Array, colors: Float32Array, ghostOpacity: number): { ghost: THREE.LineSegments; done: THREE.LineSegments } {
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const gm = this.track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: ghostOpacity, depthWrite: false }));
    const dm = this.track(new THREE.LineBasicMaterial({ vertexColors: true, depthWrite: false }));
    const ghost = new THREE.LineSegments(geo, gm); const done = new THREE.LineSegments(geo, dm);
    done.geometry.setDrawRange(0, 0);
    done.renderOrder = 4; ghost.renderOrder = 3;           // draw after the opaque bed / stock so depth-less lines are never painted over
    return { ghost, done };
  }

  // ------------------------------------------------------------------ part preview

  showPart(mesh: Mesh | null, outline?: [number, number, number], table?: [number, number]) {
    this.clear(); this.mode = 'part';
    const box = new THREE.Box3();
    if (mesh) {
      const sh: [number, number, number] = [-mesh.min[0], -mesh.min[1], -mesh.min[2]];
      const m = this.meshObject(mesh, 0x8c92a6);
      m.position.set(sh[0], sh[1], sh[2]); this.partG = m; this.content.add(m);
      box.expandByPoint(new THREE.Vector3(0, 0, 0)); box.expandByPoint(new THREE.Vector3(mesh.max[0] - mesh.min[0], mesh.max[1] - mesh.min[1], mesh.max[2] - mesh.min[2]));
    } else box.expandByPoint(new THREE.Vector3(0, 0, 0)).expandByPoint(new THREE.Vector3(60, 40, 20));
    if (outline) {
      const ps = new THREE.Vector3(); box.getSize(ps);
      const eg = this.track(new THREE.EdgesGeometry(new THREE.BoxGeometry(outline[0], outline[1], outline[2])));
      const l = new THREE.LineSegments(eg, this.track(new THREE.LineBasicMaterial({ color: 0x9b7bff, transparent: true, opacity: 0.7 })));
      l.position.set(ps.x / 2, ps.y / 2, ps.z / 2);
      this.content.add(l); box.expandByObject(l);
    }
    if (table) {
      const eg = this.track(new THREE.EdgesGeometry(new THREE.BoxGeometry(table[0], table[1], 0.5)));
      const l = new THREE.LineSegments(eg, this.track(new THREE.LineBasicMaterial({ color: 0x3a3550 }))); l.position.set(table[0] / 2, table[1] / 2, -0.25); this.content.add(l);
    }
    this.content.add(this.triad(Math.max(10, (box.max.x - box.min.x) * 0.25), 'part'));
    this.finishContent(box, box.min.z);
    this.setFlags(this.flags);
  }

  // ------------------------------------------------------------------ mill

  showMill(prog: Program, setup: number, events: SimEvent[]) {
    this.clear(); this.mode = 'mill';
    const s = prog.sims[setup];
    const sb = s.stockBox;
    const round = sb.round;
    const { cell, nx, ny, x0, y0 } = s;
    // grid over the stock rectangle, thinned to ≈ 300 samples across
    const i0 = Math.max(0, Math.floor((sb.x0 - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((sb.x1 - x0) / cell) - 1);
    const j0 = Math.max(0, Math.floor((sb.y0 - y0) / cell)), j1 = Math.min(ny - 1, Math.ceil((sb.y1 - y0) / cell) - 1);
    const st = Math.max(1, Math.ceil(Math.max(i1 - i0 + 1, j1 - j0 + 1) / 300));
    const gi: number[] = [], gj: number[] = [];
    for (let i = i0; i <= i1; i += st) gi.push(i);
    if (gi[gi.length - 1] !== i1) gi.push(i1);
    for (let j = j0; j <= j1; j += st) gj.push(j);
    if (gj[gj.length - 1] !== j1) gj.push(j1);
    const GI = gi.length, GJ = gj.length;
    const pos = new Float32Array(GI * GJ * 3), colr = new Float32Array(GI * GJ * 3);
    const valid = new Uint8Array(GI * GJ);
    for (let b = 0; b < GJ; b++) for (let a = 0; a < GI; a++) {
      const v = b * GI + a;
      pos[v * 3] = x0 + (gi[a] + 0.5) * cell; pos[v * 3 + 1] = y0 + (gj[b] + 0.5) * cell;
      valid[v] = s.stock[gj[b] * nx + gi[a]] > -Infinity ? 1 : 0;
    }
    const idx: number[] = [];
    for (let b = 0; b < GJ - 1; b++) for (let a = 0; a < GI - 1; a++) {
      const v0 = b * GI + a, v1 = v0 + 1, v2 = v0 + GI, v3 = v2 + 1;
      if (!(valid[v0] && valid[v1] && valid[v2] && valid[v3])) continue;
      idx.push(v0, v1, v3, v0, v3, v2);
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setIndex(idx);
    const mat = this.track(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.6, flatShading: true, side: THREE.DoubleSide }));
    const surface = new THREE.Mesh(geo, mat); surface.frustumCulled = false; this.content.add(surface);
    let sk: NonNullable<CamView['hm']>['sk'] = null;
    if (!round) {
      const edges: number[][] = [];
      const e0: number[] = [], e1: number[] = [], e2: number[] = [], e3: number[] = [];
      for (let a = 0; a < GI; a++) { e0.push(a); e1.push((GJ - 1) * GI + a); }
      for (let b = 0; b < GJ; b++) { e2.push(b * GI); e3.push(b * GI + GI - 1); }
      edges.push(e0, e1, e2, e3);
      const total = edges.reduce((n, e) => n + e.length * 2, 0);
      const spos = new Float32Array(total * 3), scol = new Float32Array(total * 3), src = new Int32Array(total).fill(-1);
      const sidx: number[] = [];
      let o = 0;
      for (const e of edges) {
        for (let k = 0; k < e.length; k++) {
          const top = o + k * 2, bot = top + 1;
          spos[top * 3] = spos[bot * 3] = pos[e[k] * 3]; spos[top * 3 + 1] = spos[bot * 3 + 1] = pos[e[k] * 3 + 1];
          src[top] = e[k]; src[bot] = -1;
          if (k < e.length - 1) { const t2 = top + 2, b2 = top + 3; sidx.push(top, bot, t2, t2, bot, b2); }
        }
        o += e.length * 2;
      }
      const sgeo = this.track(new THREE.BufferGeometry());
      sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3)); sgeo.setAttribute('color', new THREE.BufferAttribute(scol, 3)); sgeo.setIndex(sidx);
      const sm = new THREE.Mesh(sgeo, this.track(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.7, side: THREE.DoubleSide })));
      sm.frustumCulled = false; this.content.add(sm);
      const bgeo = this.track(new THREE.PlaneGeometry(sb.x1 - sb.x0, sb.y1 - sb.y0));
      const bm = new THREE.Mesh(bgeo, this.track(new THREE.MeshStandardMaterial({ color: 0x3c3f4b, side: THREE.DoubleSide })));
      bm.position.set((sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2, sb.zBottom); this.content.add(bm);
      sk = { geo: sgeo, pos: spos, colr: scol, src };
    } else {
      const R = (sb.x1 - sb.x0) / 2;
      const cg = this.track(new THREE.CylinderGeometry(R, R, sb.zTop - sb.zBottom, 64, 1, true)); cg.rotateX(Math.PI / 2);
      const cm = new THREE.Mesh(cg, this.track(new THREE.MeshStandardMaterial({ color: 0x8a8e9c, metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide })));
      cm.position.set((sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2, (sb.zTop + sb.zBottom) / 2); this.content.add(cm);
    }
    this.hm = { geo, pos, colr, gi, gj, GI, GJ, sk, zBottom: sb.zBottom, zTop: sb.zTop, target: s.target, stockInit: s.stock, nx, cell, x0, y0 };

    // fixtures
    const fg = new THREE.Group(); this.fixturesG = fg;
    for (const f of s.fixtures) {
      const table = f.label === 'Table';
      fg.add(this.boxMesh(f, table ? 0x2a2a38 : 0x3c78c8, table ? 0.9 : 0.55));
    }
    fg.visible = this.flags.fixtures; this.content.add(fg);

    // finished surface as a faint wire so the target is visible while material is still on
    {
      const tp = new Float32Array(GI * GJ * 3);
      for (let b = 0; b < GJ; b++) for (let a = 0; a < GI; a++) {
        const v = b * GI + a, k = gj[b] * nx + gi[a];
        tp[v * 3] = pos[v * 3]; tp[v * 3 + 1] = pos[v * 3 + 1];
        const t = s.target[k];
        tp[v * 3 + 2] = t > -Infinity && t > s.partBox.z0 + 0.05 ? t : s.partBox.z0;
      }
      const tg = this.track(new THREE.BufferGeometry()); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setIndex(idx);
      const tm = new THREE.Mesh(tg, this.track(new THREE.MeshBasicMaterial({ color: 0x57d1b0, wireframe: true, transparent: true, opacity: 0.16, depthWrite: false })));
      tm.frustumCulled = false; this.partG = tm; tm.visible = this.flags.part; this.content.add(tm);
    }
    // toolpath lines of this setup
    this.buildPath(prog, s.startCmd, s.endCmd, 0.2);
    this.events(events, setup, Math.max(0.9, Math.max(sb.x1 - sb.x0, sb.y1 - sb.y0) * 0.011));
    this.content.add(this.triad(Math.max(12, (sb.x1 - sb.x0) * 0.18), `${prog.stock.wcs}${prog.sims[setup].a || prog.sims[setup].c ? ' ·' + setup : ''}`));
    const box = new THREE.Box3(new THREE.Vector3(sb.x0, sb.y0, sb.zBottom - 5), new THREE.Vector3(sb.x1, sb.y1, sb.zTop + 40));
    for (const f of s.fixtures) if (f.label !== 'Table') { box.expandByPoint(new THREE.Vector3(f.x0, f.y0, f.z0)); box.expandByPoint(new THREE.Vector3(f.x1, f.y1, f.z1)); }
    this.finishContent(box, Math.min(sb.zBottom, ...s.fixtures.filter((f) => f.label === 'Table').map((f) => f.z1)) - 0.2);
    this.setFlags(this.flags);
  }

  /** Update the stock surface and the tool from a running MillSim. */
  updateMill(sim: MillSim) {
    const h = this.hm; if (!h) return;
    const S = sim.S, T = h.target;
    const { gi, gj, GI, GJ, pos, colr } = h;
    const stockTop = h.zTop;
    for (let b = 0; b < GJ; b++) {
      const row = gj[b] * h.nx;
      for (let a = 0; a < GI; a++) {
        const k = row + gi[a], v = b * GI + a;
        const s = S[k];
        if (!(h.stockInit[k] > -Infinity) || !(s > -Infinity)) { pos[v * 3 + 2] = h.zBottom; colr[v * 3] = 0.16; colr[v * 3 + 1] = 0.16; colr[v * 3 + 2] = 0.2; continue; }
        pos[v * 3 + 2] = s;
        const dev = s - T[k];
        let r: number, g: number, bl: number;
        if (s >= stockTop - 0.02) { r = 0.58; g = 0.6; bl = 0.67; }           // untouched stock
        else if (dev < -0.06) { r = 1; g = 0.18; bl = 0.25; }                  // gouge
        else if (dev < 0.14) { r = 0.3; g = 0.82; bl = 0.72; }                 // at finished size
        else if (dev < 0.8) { r = 0.55; g = 0.78; bl = 0.95; }                 // close to size (finish allowance)
        else { r = 0.92; g = 0.68; bl = 0.38; }                                // material still to remove
        colr[v * 3] = r; colr[v * 3 + 1] = g; colr[v * 3 + 2] = bl;
      }
    }
    (h.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (h.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    if (h.sk) {
      const { pos: sp, colr: sc, src } = h.sk;
      for (let q = 0; q < src.length; q += 1) {
        const s = src[q];
        if (s >= 0) { sp[q * 3 + 2] = pos[s * 3 + 2]; sc[q * 3] = colr[s * 3] * 0.55; sc[q * 3 + 1] = colr[s * 3 + 1] * 0.55; sc[q * 3 + 2] = colr[s * 3 + 2] * 0.55; }
        else { sp[q * 3 + 2] = h.zBottom; sc[q * 3] = 0.3; sc[q * 3 + 1] = 0.31; sc[q * 3 + 2] = 0.36; }
      }
      (h.sk.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (h.sk.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    const tool = sim.pose.tool;
    if (tool && (!this.toolG || this.toolId !== tool.id)) {
      if (this.toolG) this.content.remove(this.toolG);
      this.toolG = this.makeTool(tool); this.toolId = tool.id; this.content.add(this.toolG); this.toolG.visible = this.flags.tool;
    }
    if (!tool && this.toolG) { this.content.remove(this.toolG); this.toolG = null; this.toolId = ''; }
    this.placeTool(sim.pose);
    this.setPathProgress(sim.cursor);
    this.requestRender();
  }

  // ------------------------------------------------------------------ toolpath lines (mill / lathe / cut)

  private buildPath(prog: Program, from: number, to: number, ghost: number, map?: (x: number, y: number, z: number) => [number, number, number]) {
    const f: number[] = [], fc: number[] = [], fcmd: number[] = [];
    const r: number[] = [], rcmd: number[] = [];
    let px = 0, py = 0, pz = 0, have = false, op = -1;
    let torch = false;
    const m = map ?? ((x: number, y: number, z: number): [number, number, number] => [x, y, z]);
    const feedCol = new THREE.Color();
    for (let i = from; i < to; i++) {
      const c = prog.cmds[i];
      if (c.k === 'op') { op++; continue; }
      if (c.k === 'on') { torch = c.on; continue; }
      if (c.k !== 'rapid' && c.k !== 'feed' && c.k !== 'drill') continue;
      let nx = px, ny = py, nz = pz;
      if (c.k === 'drill') { nx = c.x; ny = c.y; nz = c.z; } else { nx = c.x ?? px; ny = c.y ?? py; nz = c.z ?? pz; }
      if (have) {
        const a = m(px, py, pz), b = m(nx, ny, nz);
        if (c.k === 'rapid') { r.push(...a, ...b); rcmd.push(i); }
        else {
          f.push(...a, ...b); fcmd.push(i);
          if (prog.kind === 'cut') feedCol.set(torch ? 0xff7a2e : 0x6a6f80); else feedCol.set(OP_COLORS[Math.max(0, op) % OP_COLORS.length]);
          fc.push(feedCol.r, feedCol.g, feedCol.b, feedCol.r, feedCol.g, feedCol.b);
        }
      }
      px = nx; py = ny; pz = nz; have = true;
      if (c.k === 'drill') { pz = c.r; }
    }
    this.segCmdStart = from;
    const mkPref = (cmds: number[]) => {
      // pref[k] = number of segments whose command index < from + k
      const n = to - from + 1;
      const pref = new Int32Array(n);
      let q = 0;
      for (let k = 0; k < n; k++) { while (q < cmds.length && cmds[q] < from + k) q++; pref[k] = q; }
      return pref;
    };
    if (f.length) {
      const ls = this.lineSet(new Float32Array(f), new Float32Array(fc), ghost);
      this.pathGhost = ls.ghost; this.pathDone = ls.done; this.pathPref = mkPref(fcmd);
      ls.ghost.visible = ls.done.visible = this.flags.path; this.content.add(ls.ghost, ls.done);
    }
    if (r.length) {
      const rc = new Float32Array(r.length); for (let k = 0; k < rc.length; k += 3) { rc[k] = 0.95; rc[k + 1] = 0.62; rc[k + 2] = 0.2; }
      const ls = this.lineSet(new Float32Array(r), rc, ghost * 0.6);
      this.rapidGhost = ls.ghost; this.rapidDone = ls.done; this.rapidPref = mkPref(rcmd);
      ls.ghost.visible = ls.done.visible = this.flags.path && this.flags.rapids; this.content.add(ls.ghost, ls.done);
    }
  }

  /** Absolute command index → how much of each line buffer is "done". */
  private setPathProgress(cursor: number) {
    const k = Math.max(0, cursor - this.segCmdStart);
    if (this.pathDone && this.pathPref) this.pathDone.geometry.setDrawRange(0, this.pathPref[Math.min(k, this.pathPref.length - 1)] * 2);
    if (this.rapidDone && this.rapidPref) this.rapidDone.geometry.setDrawRange(0, this.rapidPref[Math.min(k, this.rapidPref.length - 1)] * 2);
  }

  // ------------------------------------------------------------------ lathe

  showTurn(prog: Program, events: SimEvent[]) {
    this.clear(); this.mode = 'turn';
    const t = prog.turn!;
    const R = t.stockR;
    const step = 0.2, zMax = 8, zMin = -t.stockLen + 8;
    const n = Math.ceil((zMax - zMin) / step) + 1;
    const stride = Math.max(1, Math.ceil(n / 700));
    const rings = Math.floor((n - 1) / stride) + 1;
    const seg = 72;
    const pos = new Float32Array(rings * (seg + 1) * 3);
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < seg; i++) for (let j = 0; j < rings - 1; j++) {
      const a = i * rings + j, b = (i + 1) * rings + j, c = a + 1, d = b + 1;
      idx.push(a, b, c, c, b, d);
    }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, this.track(new THREE.MeshStandardMaterial({ color: 0xa4a9bb, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide })));
    mesh.frustumCulled = false;
    this.lathe = { geo, pos, rings, seg, step, zMax, stride };
    // CAD frame: bar axis = Z, we build vertices directly in CAD coordinates
    this.content.add(mesh);
    // finished profile (wire lathe)
    const prof = t.profile.filter((_p, i) => i % 2 === 0 || i === t.profile.length - 1);
    const pts = prof.map((p) => new THREE.Vector2(p[1] / 2, p[0]));
    const pg = this.track(new THREE.LatheGeometry(pts, 48)); pg.rotateX(Math.PI / 2);
    const pm = new THREE.Mesh(pg, this.track(new THREE.MeshBasicMaterial({ color: 0x57d1b0, wireframe: true, transparent: true, opacity: 0.25 })));
    this.partG = pm; this.content.add(pm);
    // chuck
    const cg = this.track(new THREE.CylinderGeometry(t.chuckR, t.chuckR, 40, 40)); cg.rotateX(Math.PI / 2); cg.translate(0, 0, t.chuckZ - 20);
    const chuck = new THREE.Mesh(cg, this.track(new THREE.MeshStandardMaterial({ color: 0x3c78c8, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.6 })));
    const fg = new THREE.Group(); fg.add(chuck); this.fixturesG = fg; fg.visible = this.flags.fixtures; this.content.add(fg);
    // path in (x/2, 0, z)
    this.buildPath(prog, 0, prog.cmds.length, 0.25, (x, _y, z) => [x / 2, 0, z]);
    // insert
    const ig = this.track(new THREE.BoxGeometry(8, 3, 10)); ig.translate(4, 0, 5);
    this.toolG = new THREE.Mesh(ig, this.track(new THREE.MeshStandardMaterial({ color: 0xe8c54a, metalness: 0.5, roughness: 0.4 })));
    this.content.add(this.toolG);
    this.events(events.map((e) => ({ ...e, x: e.x / 2, y: 0 })), 0, Math.max(0.8, R * 0.08));
    this.content.add(this.triad(Math.max(10, R), 'G54'));
    const box = new THREE.Box3(new THREE.Vector3(-R * 2, -R * 2, t.chuckZ - 40), new THREE.Vector3(R * 2, R * 2, zMax + 20));
    this.finishContent(box, -R * 2.2);
    this.setFlags(this.flags);
  }

  updateTurn(sim: TurnSim) {
    const l = this.lathe; if (!l) return;
    const { pos, rings, seg, step, zMax, stride } = l;
    const r = sim.r;
    for (let j = 0; j < rings; j++) {
      const k = Math.min(r.length - 1, j * stride);
      const z = zMax - k * step;
      const rad = r[k];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const v = (i * rings + j) * 3;
        pos[v] = rad * Math.cos(a); pos[v + 1] = rad * Math.sin(a); pos[v + 2] = z;
      }
    }
    (l.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    l.geo.computeVertexNormals();
    if (this.toolG) this.toolG.position.set(sim.pose.x / 2, 0, sim.pose.z);
    this.setPathProgress(sim.cursor);
    this.requestRender();
  }

  // ------------------------------------------------------------------ sheet cutting

  showCut(prog: Program) {
    this.clear(); this.mode = 'cut';
    const c = prog.cut!;
    const [sw, sh] = c.sheet; const th = c.thickness;
    const g = this.track(new THREE.BoxGeometry(sw, sh, th));
    const sheet = new THREE.Mesh(g, this.track(new THREE.MeshStandardMaterial({ color: 0x70758a, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.35 })));
    sheet.position.set(sw / 2, sh / 2, -th / 2); this.content.add(sheet);
    const eg = this.track(new THREE.EdgesGeometry(g)); const sl = new THREE.LineSegments(eg, this.track(new THREE.LineBasicMaterial({ color: 0x9b7bff, transparent: true, opacity: 0.5 }))); sl.position.copy(sheet.position); this.content.add(sl);
    // part outline loops
    const pts: number[] = [];
    for (const lp of c.loops) for (let i = 0; i < lp.pts.length; i++) { const a = lp.pts[i], b = lp.pts[(i + 1) % lp.pts.length]; pts.push(a[0], a[1], 0.05, b[0], b[1], 0.05); }
    const lg = this.track(new THREE.BufferGeometry()); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    const loops = new THREE.LineSegments(lg, this.track(new THREE.LineBasicMaterial({ color: 0x57d1b0, transparent: true, opacity: 0.55 })));
    this.partG = loops; this.content.add(loops);
    this.buildPath(prog, 0, prog.cmds.length, 0.25, (x, y, z) => [x, y, Math.max(z, 0) + 0.1]);
    const tg = this.track(new THREE.ConeGeometry(2.4, 12, 14)); tg.rotateX(Math.PI / 2); tg.translate(0, 0, 6);
    this.toolG = new THREE.Mesh(tg, this.track(new THREE.MeshStandardMaterial({ color: 0xff7a2e, emissive: 0x802d00, metalness: 0.4, roughness: 0.4 })));
    this.content.add(this.toolG);
    this.content.add(this.triad(Math.max(20, sw * 0.05), prog.stock.wcs));
    this.finishContent(new THREE.Box3(new THREE.Vector3(0, 0, -th), new THREE.Vector3(sw, sh, 40)), -th);
    this.setFlags(this.flags);
  }

  updateCut(cursor: number, prog: Program) {
    // torch position = target of the last motion command at or before the cursor
    let x = 0, y = 0, z = 20;
    for (let i = Math.min(cursor, prog.cmds.length) - 1; i >= 0; i--) {
      const c = prog.cmds[i];
      if (c.k === 'rapid' || c.k === 'feed') { if (c.x !== undefined) x = c.x; if (c.y !== undefined) y = c.y; if (c.z !== undefined) z = c.z; if (c.x !== undefined && c.y !== undefined) break; }
    }
    // fall back to scanning forward for missing components
    if (this.toolG) this.toolG.position.set(x, y, Math.max(z, 0) + 0.1);
    this.setPathProgress(cursor);
    this.requestRender();
  }

  // ------------------------------------------------------------------ additive

  showPrint(prog: PrintProgram, events: SimEvent[], partMesh: Mesh | null) {
    this.clear(); this.mode = 'print'; this.printProg = prog;
    const n = prog.segCount;
    const modelIdx: number[] = [], travelIdx: number[] = [];
    for (let i = 0; i < n; i++) (prog.segType[i] === 0 ? travelIdx : modelIdx).push(i);
    const build = (ids: number[], travel: boolean) => {
      const pos = new Float32Array(ids.length * 6), cc = new Float32Array(ids.length * 6);
      const c = new THREE.Color();
      for (let q = 0; q < ids.length; q++) {
        const i = ids[q];
        for (let k = 0; k < 6; k++) pos[q * 6 + k] = prog.segs[i * 6 + k];
        c.set(PRINT_COLORS[prog.segType[i]] ?? 0xffffff);
        if (travel) c.multiplyScalar(0.9);
        cc.set([c.r, c.g, c.b, c.r, c.g, c.b], q * 6);
      }
      return { pos, cc };
    };
    const pref = (ids: number[]) => {
      const p = new Int32Array(n + 1); let q = 0;
      for (let k = 0; k <= n; k++) { while (q < ids.length && ids[q] < k) q++; p[k] = q; }
      return p;
    };
    const m = build(modelIdx, false), tr = build(travelIdx, true);
    const ls = this.lineSet(m.pos, m.cc, 0.06);
    ls.ghost.visible = false;                              // the unprinted future stays hidden; the bed shows the build volume
    this.pathDone = ls.done; this.pathGhost = ls.ghost; this.content.add(ls.done);
    const lt = this.lineSet(tr.pos, tr.cc, 0.0);
    this.rapidDone = lt.done; this.rapidGhost = lt.ghost; this.content.add(lt.done);
    this.printSegs = { pos: m.pos, modelPref: pref(modelIdx), travelPref: pref(travelIdx) };
    this.pathPref = null; this.rapidPref = null;
    // bed
    const [bx, by, bz] = prog.bed;
    const bg = this.track(new THREE.BoxGeometry(bx, by, 2)); const bm = new THREE.Mesh(bg, this.track(new THREE.MeshStandardMaterial({ color: 0x2a2a38, metalness: 0.4, roughness: 0.7 })));
    bm.position.set(bx / 2, by / 2, -1); this.content.add(bm);
    const vg = this.track(new THREE.EdgesGeometry(new THREE.BoxGeometry(bx, by, bz)));
    const vl = new THREE.LineSegments(vg, this.track(new THREE.LineBasicMaterial({ color: 0x9b7bff, transparent: true, opacity: 0.25 }))); vl.position.set(bx / 2, by / 2, bz / 2); this.content.add(vl);
    // finished part ghost
    if (partMesh) {
      const g = this.meshObject(partMesh, 0x57d1b0, 0.07); this.partG = g; this.content.add(g);
    }
    // nozzle
    const ng = this.track(new THREE.ConeGeometry(2.2, 8, 12)); ng.rotateX(-Math.PI / 2); ng.translate(0, 0, 4);
    this.nozzle = new THREE.Mesh(ng, this.track(new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x6b2a00 }))); this.toolG = this.nozzle; this.content.add(this.nozzle);
    this.events(events, 0, Math.max(0.9, prog.size[0] * 0.018));
    this.content.add(this.triad(Math.max(12, bx * 0.06), 'bed'));
    const pw = prog.size, ox = prog.offset[0], oy = prog.offset[1];
    this.finishContent(new THREE.Box3(new THREE.Vector3(Math.max(0, ox - 10), Math.max(0, oy - 10), 0), new THREE.Vector3(ox + pw[0] + 10, oy + pw[1] + 10, pw[2] + 30)), 0);
    this.setFlags(this.flags);
    if (this.rapidDone) this.rapidDone.visible = this.flags.travel;
  }

  updatePrint(seg: number) {
    const p = this.printSegs, prog = this.printProg; if (!p || !prog) return;
    const s = Math.max(0, Math.min(prog.segCount, seg));
    if (this.pathDone) this.pathDone.geometry.setDrawRange(0, p.modelPref[s] * 2);
    if (this.rapidDone) { this.rapidDone.geometry.setDrawRange(0, p.travelPref[s] * 2); this.rapidDone.visible = this.flags.travel; }
    const i = Math.max(0, Math.min(prog.segCount - 1, s - 1));
    if (this.nozzle && prog.segCount) this.nozzle.position.set(prog.segs[i * 6 + 3], prog.segs[i * 6 + 4], prog.segs[i * 6 + 5]);
    this.requestRender();
  }

  currentMode() { return this.mode; }
}
