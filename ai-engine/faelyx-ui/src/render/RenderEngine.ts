// RenderX Engine — the real-time PBR scene behind the RenderX workspace.
//
// A physically-based three.js scene (MeshPhysicalMaterial, image-based lighting,
// shadow-casting studio lights, depth of field, bloom, tone mapping) previewed
// live and written out as a still by rendering supersampled tiles, so 4K / 8K
// frames never need a single enormous GPU buffer. It is a rasteriser, not a
// path tracer: "quality" means supersampling + shadow resolution + optional
// denoise, and the UI says so.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { EXRExporter, ZIP_COMPRESSION } from 'three/examples/jsm/exporters/EXRExporter.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NAV_SCHEMES } from '../navigation';
import {
  DEFAULT_CAMERA, DEFAULT_ENV, DEFAULT_BACKDROP, DEFAULT_GROUND, DEFAULT_OUTPUT, QUALITY_LEVELS, findMaterial, focalFromFov, kelvinToRgb, outputSize,
  type BackdropSettings, type CameraSettings, type EnvId, type EnvSettings, type GroundSettings, type LightDef, type OutputSettings, type Projection, type SurfaceParams,
} from './renderData';
import { colorCanvas, heightCanvas, imageCanvas, normalCanvasFrom } from './proceduralTextures';
import { canvasToPngBlob, encodeTiff } from './exporters';
import { buildRoomScene } from './rooms';

const rad = (deg: number) => (deg * Math.PI) / 180;
function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh; m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); }
  });
}
export const MODEL_FIT_SIZE = 1.7; // the model's longest side, in scene units

// ---------------------------------------------------------------------------
// Surface binding: one MeshPhysicalMaterial driven by SurfaceParams

type CustomRelief = { canvas: HTMLCanvasElement; id: number } | null;
const canvasCache = new Map<string, HTMLCanvasElement>();
const cached = (key: string, make: () => HTMLCanvasElement) => { let c = canvasCache.get(key); if (!c) { c = make(); canvasCache.set(key, c); } return c; };

class SurfaceBinding {
  readonly material = new THREE.MeshPhysicalMaterial();
  private mapKey = ''; private reliefKey = '';
  private mapTex: THREE.CanvasTexture | null = null; private reliefTex: THREE.CanvasTexture | null = null;

  private makeTex(canvas: HTMLCanvasElement, srgb: boolean) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
    return t;
  }

  apply(p: SurfaceParams, custom: CustomRelief) {
    const m = this.material;
    m.color.set(p.color); m.metalness = p.metalness; m.roughness = p.roughness;
    const glass = p.transmission > 0.001;
    m.opacity = p.opacity; m.transparent = p.opacity < 0.999; m.depthWrite = true;
    m.transmission = p.transmission; m.ior = p.ior; m.thickness = p.thickness;
    m.attenuationColor.set(p.color); m.attenuationDistance = glass ? 0.6 : Infinity;
    m.side = glass ? THREE.DoubleSide : THREE.FrontSide;
    m.clearcoat = p.clearcoat; m.clearcoatRoughness = p.clearcoatRoughness;
    m.sheen = p.sheen; m.sheenRoughness = 0.55; m.sheenColor.set(p.color).lerp(new THREE.Color(1, 1, 1), 0.35);
    m.anisotropy = p.anisotropy;

    if (p.colorMap !== this.mapKey) {
      this.mapTex?.dispose(); this.mapTex = null;
      if (p.colorMap !== 'none') this.mapTex = this.makeTex(cached(`c:${p.colorMap}`, () => colorCanvas(p.colorMap as Exclude<typeof p.colorMap, 'none'>, 512)), true);
      m.map = this.mapTex; this.mapKey = p.colorMap; m.needsUpdate = true;
    }
    const reliefKey = `${p.relief}|${p.reliefMode}|${p.relief === 'custom' ? custom?.id ?? 0 : ''}`;
    if (reliefKey !== this.reliefKey) {
      this.reliefTex?.dispose(); this.reliefTex = null; m.bumpMap = null; m.normalMap = null;
      if (p.relief !== 'none') {
        let canvas: HTMLCanvasElement | null = null;
        if (p.relief === 'custom') canvas = custom?.canvas ?? null;
        else {
          const kind = p.relief;
          canvas = p.reliefMode === 'normal' ? cached(`n:${kind}`, () => normalCanvasFrom(cached(`h:${kind}`, () => heightCanvas(kind, 256)))) : cached(`h:${kind}`, () => heightCanvas(kind, 256));
        }
        if (canvas) {
          this.reliefTex = this.makeTex(canvas, false);
          if (p.reliefMode === 'normal') m.normalMap = this.reliefTex; else m.bumpMap = this.reliefTex;
        }
      }
      this.reliefKey = reliefKey; m.needsUpdate = true;
    }
    m.bumpScale = p.reliefStrength * 1.2;
    m.normalScale.set(p.reliefStrength, p.reliefStrength);
    for (const t of [this.mapTex, this.reliefTex]) {
      if (!t) continue;
      t.repeat.set(100 / Math.max(1, p.tileMm), 100 / Math.max(1, p.tileMm)); t.center.set(0.5, 0.5); t.rotation = rad(p.rotation);
    }
  }

  dispose() { this.mapTex?.dispose(); this.reliefTex?.dispose(); this.material.dispose(); }
}

/** Box / planar UV projection in model millimetres (1 UV unit = 100 mm). Needs non-indexed geometry. */
function projectUVs(geo: THREE.BufferGeometry, mode: Projection) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const n = new THREE.Vector3();
  const v = [a, b, c];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    let axis = mode === 'planarX' ? 0 : mode === 'planarY' ? 1 : mode === 'planarZ' ? 2 : -1;
    if (axis < 0) {
      n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const ax = Math.abs(n.x); const ay = Math.abs(n.y); const az = Math.abs(n.z);
      axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    }
    for (let k = 0; k < 3; k++) {
      const p = v[k];
      const [s, t] = axis === 0 ? [p.y, p.z] : axis === 1 ? [p.x, p.z] : [p.x, p.y];
      uv[(i + k) * 2] = s / 100; uv[(i + k) * 2 + 1] = t / 100;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ---------------------------------------------------------------------------
// Post-processing shaders

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uBalance: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 }, uContrast: { value: 1 },
    uVigAmount: { value: 0 }, uVigSoft: { value: 0.5 },
    uTile: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFullAspect: { value: 1.6 }, uPremul: { value: 0 },
    uBgMode: { value: 0 }, uBgTop: { value: new THREE.Vector3() }, uBgBottom: { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 uBalance; uniform float uSat, uContrast, uVigAmount, uVigSoft, uFullAspect, uPremul, uBgMode; uniform vec4 uTile; uniform vec3 uBgTop, uBgBottom;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 full = uTile.xy + vUv * uTile.zw;
      // Solid / gradient backdrops are composited here, in display space, so they keep their exact colours (no tone mapping).
      vec3 base = c.rgb;
      if (uBgMode > 0.5) { vec3 bg = uBgMode < 1.5 ? uBgTop : mix(uBgBottom, uBgTop, full.y); base = c.rgb * c.a + bg * (1.0 - c.a); c.a = 1.0; }
      vec3 rgb = base * uBalance;
      float l = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(l), rgb, uSat);
      rgb = (rgb - 0.5) * uContrast + 0.5;
      vec2 p = (full - 0.5) * 2.0; p.x *= uFullAspect;
      float d = length(p) / (1.0 + uFullAspect * 0.0) / 1.62;
      float start = mix(0.95, 0.15, uVigSoft);
      rgb *= 1.0 - uVigAmount * smoothstep(start, 1.15, d);
      rgb = clamp(rgb, 0.0, 1.0);
      gl_FragColor = vec4(uPremul > 0.5 ? rgb * c.a : rgb, c.a);
    }`,
};

// Renders are accumulated premultiplied (colour already × alpha). Tone mapping must see straight colour, so undo it first.
const UNPREMUL_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uOn: { value: 0 } },
  vertexShader: GRADE_SHADER.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uOn; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = uOn > 0.5 ? vec4(c.rgb / max(c.a, 1e-4), c.a) : c; }`,
};

const DENOISE_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, uSpatial: { value: 1.2 }, uRange: { value: 0.15 } },
  vertexShader: GRADE_SHADER.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uSpatial, uRange; varying vec2 vUv;
    void main(){
      vec4 c0 = texture2D(tDiffuse, vUv);
      float l0 = dot(c0.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec4 sum = vec4(0.0); float wsum = 0.0;
      for (int j = -2; j <= 2; j++) { for (int i = -2; i <= 2; i++) {
        vec2 o = vec2(float(i), float(j));
        vec4 c = texture2D(tDiffuse, vUv + o * uTexel);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float ws = exp(-dot(o, o) / (2.0 * uSpatial * uSpatial));
        float dl = (l - l0) / (uRange * (0.25 + l0));
        float w = ws * exp(-dl * dl);
        sum += c * w; wsum += w;
      } }
      gl_FragColor = sum / wsum;
    }`,
};

// ---------------------------------------------------------------------------
// Public types

export interface PartInfo { id: string; name: string; materialId: string | null; params: SurfaceParams }
export interface ModelInfo { sample: boolean; sizeMm: [number, number, number]; triangles: number }
export interface EngineEvents {
  onSelect: (id: string | null) => void;
  onParts: (parts: PartInfo[], info: ModelInfo) => void;
}

interface Part { id: string; name: string; mesh: THREE.Mesh; binding: SurfaceBinding; materialId: string | null; params: SurfaceParams; custom: CustomRelief }
interface LightEntry { type: LightDef['type']; light: THREE.Light; target?: THREE.Object3D }

const TONE: Record<CameraSettings['toneMap'], THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, reinhard: THREE.ReinhardToneMapping, linear: THREE.LinearToneMapping,
};

export class RenderEngine {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1.6, 0.05, 120);
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bokeh: BokehPass; private bloom: UnrealBloomPass; private denoise: ShaderPass; private grade: ShaderPass; private unpremul: ShaderPass; private outputPass: OutputPass;
  private pmrem: THREE.PMREMGenerator;
  private envCache = new Map<string, THREE.Texture>();
  private bgCubes = new Map<EnvId, THREE.WebGLCubeRenderTarget>();
  private customEnv: THREE.Texture | null = null;
  private gradientTex: THREE.CanvasTexture | null = null;
  private modelGroup = new THREE.Group();
  private mirrorGroup = new THREE.Group();
  private parts: Part[] = [];
  private lights = new Map<string, LightEntry>();
  private lightDefs: LightDef[] = [];
  private gizmos = new THREE.Group();
  private selectedLightId: string | null = null;
  private floor: THREE.Mesh; private grid: THREE.GridHelper;
  private helpers = new THREE.Group();
  private selBox: THREE.BoxHelper | null = null;
  private raycaster = new THREE.Raycaster();
  private resizeObserver: ResizeObserver;
  private raf = 0; private busy = false; private disposed = false; private cancelFlag = false;
  private modelCenterY = 0.8; private modelRadius = 1.2; private zUp = true; private lastStl: ArrayBuffer | null = null;
  private env: EnvSettings = { ...DEFAULT_ENV }; private backdrop: BackdropSettings = { ...DEFAULT_BACKDROP }; private ground: GroundSettings = { ...DEFAULT_GROUND };
  private cam: CameraSettings = { ...DEFAULT_CAMERA }; private out: OutputSettings = { ...DEFAULT_OUTPUT };
  private showGizmos = true; private customCounter = 1;
  private thumbRig: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; binding: SurfaceBinding; mesh: THREE.Mesh } | null = null;
  private cleanups: (() => void)[] = [];
  private projectionOf = new Map<string, Projection>();

  constructor(private host: HTMLElement, private events: EngineEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);
    (host as HTMLElement & { __rx?: RenderEngine }).__rx = this; // handle for devtools / automated tests
    RectAreaLightUniformsLib.init();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.camera.position.set(3.4, 2.1, 4.4);
    this.scene.add(this.camera, this.modelGroup, this.mirrorGroup, this.gizmos, this.helpers);

    // Floor (circular, fades to nothing at the rim so it melts into any backdrop) and grid.
    const fade = document.createElement('canvas'); fade.width = fade.height = 256;
    const fctx = fade.getContext('2d')!; const grad = fctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.5, '#fff'); grad.addColorStop(1, '#000'); fctx.fillStyle = grad; fctx.fillRect(0, 0, 256, 256);
    const fadeTex = new THREE.CanvasTexture(fade);
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(16, 96), new THREE.MeshStandardMaterial({ color: 0x2c2d34, transparent: true, alphaMap: fadeTex, side: THREE.FrontSide }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; this.floor.renderOrder = 1;
    this.scene.add(this.floor);
    this.grid = new THREE.GridHelper(24, 48, 0x8a8aa0, 0x55556a);
    (this.grid.material as THREE.Material).transparent = true; (this.grid.material as THREE.Material).opacity = 0.35;
    this.grid.position.y = 0.003; this.scene.add(this.grid);

    // Post stack: render → depth of field → bloom → denoise → tone map → grade / vignette.
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 4, aperture: 0.01, maxblur: 0.01 });
    const frag = this.bokeh.materialBokeh.fragmentShader; if (frag.includes('gl_FragColor.a = 1.0;')) { this.bokeh.materialBokeh.fragmentShader = frag.replace('gl_FragColor.a = 1.0;', 'gl_FragColor.a = col.a * 0.04761;'); this.bokeh.materialBokeh.needsUpdate = true; }
    this.bokeh.enabled = false; this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.5, 0.9); this.bloom.enabled = false;
    // Bloom adds light, not coverage: keep the destination alpha so a transparent background stays transparent.
    const bm = (this.bloom as unknown as { blendMaterial: THREE.ShaderMaterial }).blendMaterial;
    bm.blending = THREE.CustomBlending; bm.blendEquation = THREE.AddEquation; bm.blendSrc = THREE.OneFactor; bm.blendDst = THREE.OneFactor; bm.blendSrcAlpha = THREE.ZeroFactor; bm.blendDstAlpha = THREE.OneFactor; bm.needsUpdate = true;
    this.composer.addPass(this.bloom);
    this.denoise = new ShaderPass(DENOISE_SHADER); this.denoise.enabled = false; this.composer.addPass(this.denoise);
    this.unpremul = new ShaderPass(UNPREMUL_SHADER); this.composer.addPass(this.unpremul);
    this.outputPass = new OutputPass(); this.composer.addPass(this.outputPass);
    this.grade = new ShaderPass(GRADE_SHADER); this.composer.addPass(this.grade);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; this.controls.zoomToCursor = true; this.controls.minDistance = 0.4; this.controls.maxDistance = 40;
    this.controls.target.set(0, this.modelCenterY, 0);
    // Universal scheme: the left button only selects; MMB pans; MMB+RMB orbits; MMB-hold + RMB-click latches zoom.
    this.controls.mouseButtons = { LEFT: undefined as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: undefined as unknown as THREE.MOUSE };
    this.controls.addEventListener('change', () => { this.requestRender(); });
    this.installPointerHandlers();

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(host);
    this.applyEnvironment(); this.applyCamera(); this.applyGround();
    this.layout();
    this.setModel(null);
  }

  // ---- pointer: selection + the Universal navigation chords --------------

  private installPointerHandlers() {
    const el = this.renderer.domElement;
    const controls = this.controls; const camera = this.camera;
    const def = NAV_SCHEMES.universal;
    let downX = 0; let downY = 0; let downBtn = -1;
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; downBtn = e.button; };
    const onUp = (e: PointerEvent) => {
      if (downBtn === 0 && e.button === 0 && Math.hypot(e.clientX - downX, e.clientY - downY) < 4) this.pick(e);
      downBtn = -1;
    };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp);
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener('contextmenu', noMenu);

    let chordActive = false; let chordX = 0; let chordY = 0;
    let prevButtons = 0; let zoomLatched = false; let chordMoved = false; let chordStartX = 0; let chordStartY = 0;
    const onChordMove = (event: PointerEvent) => {
      const was = prevButtons; prevButtons = event.buttons;
      if (!def.chord) { chordActive = false; return; }
      if ((event.buttons & 4) === 0) { zoomLatched = false; chordMoved = false; }
      const syncStarts = () => {
        const starts = controls as unknown as Record<'_panStart' | '_rotateStart' | '_dollyStart', THREE.Vector2 | undefined>;
        starts._panStart?.set(event.clientX, event.clientY); starts._rotateStart?.set(event.clientX, event.clientY); starts._dollyStart?.set(event.clientX, event.clientY);
      };
      if (def.chordZoom && (event.buttons & 4) !== 0) {
        if ((event.buttons & 2) !== 0 && (was & 2) === 0) { chordMoved = false; chordStartX = event.clientX; chordStartY = event.clientY; }
        if ((event.buttons & 2) === 0 && (was & 2) !== 0 && !chordMoved) zoomLatched = true;
        if (zoomLatched) {
          event.stopImmediatePropagation();
          if (chordActive) {
            const offset = camera.position.clone().sub(controls.target);
            const next = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * Math.exp((event.clientY - chordY) * 0.006)));
            camera.position.copy(controls.target).add(offset.setLength(next)); camera.lookAt(controls.target); this.requestRender();
          }
          chordActive = true; chordX = event.clientX; chordY = event.clientY; syncStarts();
          return;
        }
        if ((event.buttons & 2) !== 0 && !chordMoved) {
          if (Math.hypot(event.clientX - chordStartX, event.clientY - chordStartY) <= 3) { event.stopImmediatePropagation(); chordActive = false; chordX = event.clientX; chordY = event.clientY; syncStarts(); return; }
          chordMoved = true;
        }
      }
      if ((event.buttons & 6) !== 6) { chordActive = false; return; }
      event.stopImmediatePropagation();
      if (chordActive) {
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        const turn = (2 * Math.PI) / Math.max(el.clientHeight, 1);
        spherical.theta -= (event.clientX - chordX) * turn; spherical.phi -= (event.clientY - chordY) * turn; spherical.makeSafe();
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical)); camera.lookAt(controls.target); this.requestRender();
      }
      chordActive = true; chordX = event.clientX; chordY = event.clientY; syncStarts();
    };
    el.addEventListener('pointermove', onChordMove, true);
    const resetChord = (event: PointerEvent) => { if (event.type === 'pointerdown' || event.button === 1) { zoomLatched = false; chordMoved = false; chordActive = false; prevButtons = event.type === 'pointerdown' ? event.buttons : 0; } };
    el.addEventListener('pointerdown', resetChord, true); window.addEventListener('pointerup', resetChord);
    let middleAt = 0; let middleX = 0; let middleY = 0;
    const onMiddle = (event: PointerEvent) => {
      if (event.button !== 1) return;
      const now = performance.now();
      if (now - middleAt < 400 && Math.hypot(event.clientX - middleX, event.clientY - middleY) < 6) { middleAt = 0; this.fit(); return; }
      middleAt = now; middleX = event.clientX; middleY = event.clientY;
    };
    el.addEventListener('pointerdown', onMiddle);
    const noMiddleScroll = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
    el.addEventListener('mousedown', noMiddleScroll);
    let hover = false;
    const onEnter = () => { hover = true; }; const onLeave = () => { hover = false; };
    el.addEventListener('pointerenter', onEnter); el.addEventListener('pointerleave', onLeave);
    const onKey = (e: KeyboardEvent) => {
      if (!hover || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key === 'f' || e.key === 'F') this.fit();
      if (e.key === 'Escape') this.selectPart(null);
    };
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); el.removeEventListener('contextmenu', noMenu);
      el.removeEventListener('pointermove', onChordMove, true); el.removeEventListener('pointerdown', resetChord, true); window.removeEventListener('pointerup', resetChord);
      el.removeEventListener('pointerdown', onMiddle); el.removeEventListener('mousedown', noMiddleScroll); el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
    });
  }

  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.parts.map((p) => p.mesh), false)[0];
    this.selectPart(hit ? (hit.object.userData.partId as string) : null);
  }

  // ---- layout / render loop ---------------------------------------------

  /** Aspect of the frame the final image will have (the preview is letter-boxed to it). */
  private frameAspect(hostAspect: number) { const o = outputSize(this.out, hostAspect); return o.w / o.h; }

  private layout() {
    if (this.busy || this.disposed) return;
    const hw = this.host.clientWidth; const hh = this.host.clientHeight;
    if (hw < 8 || hh < 8) return;
    const aspect = this.frameAspect(hw / hh);
    let w = hw; let h = hw / aspect;
    if (h > hh) { h = hh; w = hh * aspect; }
    w = Math.max(8, Math.floor(w)); h = Math.max(8, Math.floor(h));
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    const el = this.renderer.domElement;
    el.style.width = `${w}px`; el.style.height = `${h}px`;
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.denoise.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
    this.camera.aspect = w / h; this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
    this.grade.uniforms.uFullAspect.value = w / h; this.grade.uniforms.uTile.value.set(0, 0, 1, 1);
    this.requestRender();
  }

  requestRender() {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  private draw() {
    if (this.busy || this.disposed) return;
    this.updateDof();
    this.composer.render();
  }

  private updateDof() {
    const c = this.cam;
    const focus = c.focusAuto ? this.camera.position.distanceTo(this.controls.target) : c.focusDistance;
    const focal = focalFromFov(c.fov);
    const u = this.bokeh.uniforms as Record<string, { value: number }>;
    u.focus.value = focus;
    u.aperture.value = (0.0011 * focal * c.bokeh) / Math.max(0.7, c.fstop);
    u.maxblur.value = 0.012 * c.bokeh * (2.8 / Math.max(0.7, c.fstop)) ** 0.5 * 1.6;
  }

  // ---- settings ----------------------------------------------------------

  setCamera(cam: CameraSettings) { this.cam = cam; this.applyCamera(); this.requestRender(); }

  private applyCamera() {
    const c = this.cam;
    this.renderer.toneMapping = TONE[c.toneMap]; this.renderer.toneMappingExposure = 2 ** c.exposure;
    this.camera.fov = c.fov; this.camera.updateProjectionMatrix();
    this.bokeh.enabled = c.dof;
    this.bloom.enabled = c.bloom; this.bloom.strength = c.bloomStrength; this.bloom.radius = c.bloomRadius; this.bloom.threshold = c.bloomThreshold;
    const g = this.grade.uniforms;
    g.uBalance.value.set(1 + 0.3 * c.temperature, 1 - 0.18 * c.tint, 1 - 0.3 * c.temperature);
    g.uSat.value = c.saturation; g.uContrast.value = c.contrast;
    g.uVigAmount.value = c.vignette ? c.vignetteAmount : 0; g.uVigSoft.value = c.vignetteSoftness;
  }

  setOutput(out: OutputSettings) {
    this.out = out;
    const dn = out.denoise; this.denoise.enabled = dn !== 'off';
    this.denoise.uniforms.uSpatial.value = dn === 'strong' ? 1.7 : 1.1; this.denoise.uniforms.uRange.value = dn === 'strong' ? 0.3 : 0.14;
    this.grade.uniforms.uPremul.value = out.transparent ? 1 : 0;
    this.applyBackground(); this.applyShadowQuality(); this.layout();
  }

  setEnvironment(env: EnvSettings, backdrop: BackdropSettings) {
    this.env = env; this.backdrop = backdrop; this.applyEnvironment();
  }
  setGround(g: GroundSettings) { this.ground = g; this.applyGround(); this.requestRender(); }
  setGizmosVisible(on: boolean) { this.showGizmos = on; this.gizmos.visible = on; this.requestRender(); }

  private applyEnvironment() {
    const e = this.env;
    const tex = e.id === 'custom' ? this.customEnv : this.getEnv(e.id);
    this.scene.environment = tex ?? this.getEnv('studio');
    this.scene.environmentIntensity = e.intensity;
    this.scene.environmentRotation.y = rad(e.rotation);
    this.applyBackground();
    this.requestRender();
  }

  private backdropComposited() { const b = this.backdrop; return !(b.mode === 'transparent' || this.out.transparent) && (b.mode === 'solid' || b.mode === 'gradient'); }

  private applyBackground() {
    const b = this.backdrop; const s = this.scene; const e = this.env;
    const transparent = b.mode === 'transparent' || this.out.transparent;
    const comp = this.backdropComposited();
    const hex = (h: string) => { const v = parseInt(h.replace('#', ''), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255] as const; };
    const u = this.grade.uniforms;
    if (transparent || comp) {
      s.background = null; this.renderer.setClearColor(0x000000, 0);
      this.unpremul.uniforms.uOn.value = 1;
      u.uBgMode.value = comp ? (b.mode === 'solid' ? 1 : 2) : 0;
      const top = hex(b.mode === 'solid' ? b.solid : b.gradTop); const bot = hex(b.mode === 'solid' ? b.solid : b.gradBottom);
      u.uBgTop.value.set(top[0], top[1], top[2]); u.uBgBottom.value.set(bot[0], bot[1], bot[2]);
    } else {
      this.unpremul.uniforms.uOn.value = 0; u.uBgMode.value = 0;
      this.renderer.setClearColor(0x000000, 1);
      s.background = (e.id !== 'custom' && this.getBackdropCube(e.id)) || s.environment; s.backgroundBlurriness = e.blur; s.backgroundIntensity = e.intensity; s.backgroundRotation.y = rad(e.rotation);
    }
  }

  /** A scene background for the EXR path, which bypasses the post stack (so the composited backdrops need a real one). */
  private exrBackground(): THREE.Color | THREE.Texture | null {
    const b = this.backdrop;
    if (b.mode === 'solid') return new THREE.Color(b.solid);
    const c = document.createElement('canvas'); c.width = 4; c.height = 512;
    const ctx = c.getContext('2d')!; const g = ctx.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, b.gradTop); g.addColorStop(1, b.gradBottom); ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 512);
    this.gradientTex?.dispose(); this.gradientTex = new THREE.CanvasTexture(c); this.gradientTex.colorSpace = THREE.SRGBColorSpace; return this.gradientTex;
  }

  private getEnv(id: EnvId): THREE.Texture {
    let t = this.envCache.get(id);
    if (!t) { t = this.buildEnv(id); this.envCache.set(id, t); }
    return t;
  }

  private buildEnv(id: EnvId): THREE.Texture {
    const room = buildRoomScene(id);
    if (!room) return this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const tex = this.pmrem.fromScene(room, 0.02, 0.1, 300).texture; disposeScene(room); return tex;
  }

  /** Crisp cube-map render of a built-in room, used as the visible backdrop (the PMREM above is for lighting and is too soft to look at). */
  private getBackdropCube(id: EnvId): THREE.Texture | null {
    const cached = this.bgCubes.get(id);
    if (cached) { this.bgCubes.delete(id); this.bgCubes.set(id, cached); return cached.texture; }
    const room = buildRoomScene(id); if (!room) return null;
    const rt = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const prevTone = this.renderer.toneMapping; this.renderer.toneMapping = THREE.NoToneMapping;
    new THREE.CubeCamera(0.1, 300, rt).update(this.renderer, room);
    this.renderer.toneMapping = prevTone; disposeScene(room);
    this.bgCubes.set(id, rt);
    while (this.bgCubes.size > 2) { const k = this.bgCubes.keys().next().value as EnvId; this.bgCubes.get(k)?.dispose(); this.bgCubes.delete(k); }
    return rt.texture;
  }

  /** Load a panorama (.hdr / .exr / .jpg / .png) as the environment. */
  async loadCustomHdri(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let tex: THREE.Texture;
      if (ext === 'hdr') tex = await new RGBELoader().loadAsync(url);
      else if (ext === 'exr') tex = await new EXRLoader().loadAsync(url);
      else { tex = await new THREE.TextureLoader().loadAsync(url); tex.colorSpace = THREE.SRGBColorSpace; }
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pm = this.pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      this.customEnv?.dispose(); this.customEnv = pm;
      return file.name;
    } finally { URL.revokeObjectURL(url); }
  }
  refreshEnvironment() { this.applyEnvironment(); }

  // ---- ground ------------------------------------------------------------

  private applyGround() {
    const g = this.ground;
    this.floor.visible = g.enabled; this.grid.visible = g.grid;
    const old = this.floor.material as THREE.Material;
    if (g.mode === 'shadowCatcher') {
      if (!(old as THREE.ShadowMaterial).isShadowMaterial) {
        old.dispose(); this.floor.material = new THREE.ShadowMaterial({ opacity: g.shadowOpacity, transparent: true });
      }
      (this.floor.material as THREE.ShadowMaterial).opacity = g.shadowOpacity;
      this.mirrorGroup.visible = false;
    } else {
      if (!(old as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        old.dispose(); this.floor.material = new THREE.MeshStandardMaterial({ color: g.color, transparent: true });
      }
      const m = this.floor.material as THREE.MeshStandardMaterial;
      m.color.set(g.color); m.roughness = Math.max(0.04, 1 - g.glossiness * 0.96); m.metalness = 0;
      m.opacity = 1 - 0.7 * g.reflections * g.glossiness; m.needsUpdate = true;
      this.mirrorGroup.visible = g.enabled && g.reflections > 0.01;
    }
    this.requestRender();
  }

  // ---- model & parts ----------------------------------------------------------

  setModel(stl: ArrayBuffer | null, zUp = this.zUp) {
    this.zUp = zUp; this.lastStl = stl;
    for (const p of this.parts) { p.mesh.geometry.dispose(); p.binding.dispose(); }
    this.parts = []; this.modelGroup.clear(); this.selBox = null; this.helpers.clear();
    let sample = false; let triangles = 0;
    if (stl) {
      try {
        let geo = new STLLoader().parse(stl);
        geo = toCreasedNormals(geo, rad(34));
        triangles = geo.getAttribute('position').count / 3;
        this.addPart('body', 'Part body', geo, 'steel-brushed');
      } catch { stl = null; }
    }
    if (!stl) {
      sample = true;
      const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
      const rr = new THREE.Shape(); const w = 60; const h = 40; const r = 8;
      rr.moveTo(-w + r, -h); rr.lineTo(w - r, -h); rr.quadraticCurveTo(w, -h, w, -h + r); rr.lineTo(w, h - r); rr.quadraticCurveTo(w, h, w - r, h); rr.lineTo(-w + r, h); rr.quadraticCurveTo(-w, h, -w, h - r); rr.lineTo(-w, -h + r); rr.quadraticCurveTo(-w, -h, -w + r, -h);
      const base = new THREE.ExtrudeGeometry(rr, { depth: 10, bevelEnabled: true, bevelSize: 1.5, bevelThickness: 1.5, bevelSegments: 4, curveSegments: 16 }); base.rotateX(-Math.PI / 2); base.translate(0, 1.5, 0);
      const housing = new THREE.CylinderGeometry(28, 32, 45, 72); housing.translate(0, 10 + 1.5 + 22.5, 0);
      const dome = new THREE.SphereGeometry(27, 64, 28, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(0, 10 + 1.5 + 45, 0);
      const ring = new THREE.TorusGeometry(34, 3.4, 28, 120); ring.rotateX(Math.PI / 2); ring.translate(0, 10 + 1.5 + 14, 0);
      triangles = 0;
      for (const [id, name, g, mat] of [['base', 'Base plate', base, 'alu-brushed'], ['housing', 'Housing', housing, 'paint-white'], ['dome', 'Glass dome', dome, 'glass-clear'], ['ring', 'Trim ring', ring, 'chrome']] as const) {
        const ng = flat(g); triangles += ng.getAttribute('position').count / 3; this.addPart(id, name, ng, mat);
      }
    }
    // Normalise: longest side → MODEL_FIT_SIZE, sitting on the floor, centred on it.
    this.modelGroup.rotation.set(!sample && this.zUp ? -Math.PI / 2 : 0, 0, 0); this.modelGroup.scale.setScalar(1); this.modelGroup.position.set(0, 0, 0); this.modelGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.modelGroup); const size = box.getSize(new THREE.Vector3());
    const s = MODEL_FIT_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
    this.modelGroup.scale.setScalar(s); this.modelGroup.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(this.modelGroup); const c = box2.getCenter(new THREE.Vector3());
    this.modelGroup.position.set(-c.x, -box2.min.y, -c.z); this.modelGroup.updateMatrixWorld(true);
    const fin = new THREE.Box3().setFromObject(this.modelGroup);
    this.modelCenterY = (fin.min.y + fin.max.y) / 2; this.modelRadius = fin.getSize(new THREE.Vector3()).length() / 2;
    this.rebuildMirror(); this.syncLights(this.lightDefs); this.applyShadowQuality();
    this.fit();
    this.events.onParts(this.parts.map((p) => ({ id: p.id, name: p.name, materialId: p.materialId, params: p.params })), { sample, sizeMm: [size.x, size.y, size.z], triangles });
    this.events.onSelect(null);
  }

  setUpAxis(zUp: boolean) { if (zUp !== this.zUp && this.lastStl) { this.setModel(this.lastStl, zUp); } this.zUp = zUp; }

  private addPart(id: string, name: string, geo: THREE.BufferGeometry, materialId: string) {
    const params = { ...(findMaterial(materialId)?.params ?? findMaterial('abs-white')!.params) };
    const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
    projectUVs(nonIndexed, params.projection);
    const binding = new SurfaceBinding(); binding.apply(params, null);
    const mesh = new THREE.Mesh(nonIndexed, binding.material); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.partId = id;
    this.modelGroup.add(mesh);
    this.projectionOf.set(id, params.projection);
    this.parts.push({ id, name, mesh, binding, materialId, params, custom: null });
  }

  getParts(): PartInfo[] { return this.parts.map((p) => ({ id: p.id, name: p.name, materialId: p.materialId, params: p.params })); }

  setSurface(partId: string, params: SurfaceParams, materialId: string | null) {
    const p = this.parts.find((x) => x.id === partId); if (!p) return;
    p.params = params; p.materialId = materialId;
    if (this.projectionOf.get(partId) !== params.projection) { projectUVs(p.mesh.geometry, params.projection); this.projectionOf.set(partId, params.projection); }
    p.binding.apply(params, p.custom);
    this.requestRender();
  }

  /** Load an image as the part's bump (height) or normal map. */
  async uploadRelief(partId: string, file: File): Promise<void> {
    const p = this.parts.find((x) => x.id === partId); if (!p) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image')); i.src = url; });
      this.customCounter += 1; p.custom = { canvas: imageCanvas(img, 1024), id: this.customCounter };
    } finally { URL.revokeObjectURL(url); }
  }

  selectPart(id: string | null) {
    this.helpers.clear(); this.selBox = null;
    const p = this.parts.find((x) => x.id === id);
    if (p && this.parts.length > 1) { this.selBox = new THREE.BoxHelper(p.mesh, 0xa98bff); this.helpers.add(this.selBox); }
    this.events.onSelect(p ? p.id : null);
    this.requestRender();
  }

  private rebuildMirror() {
    this.mirrorGroup.clear();
    this.mirrorGroup.scale.set(1, -1, 1);
    const copy = new THREE.Group(); copy.position.copy(this.modelGroup.position); copy.rotation.copy(this.modelGroup.rotation); copy.scale.copy(this.modelGroup.scale);
    for (const p of this.parts) { const m = new THREE.Mesh(p.mesh.geometry, p.mesh.material); m.castShadow = false; m.receiveShadow = false; copy.add(m); }
    this.mirrorGroup.add(copy);
  }

  // ---- lights ------------------------------------------------------------

  setLights(defs: LightDef[], selectedId: string | null) { this.lightDefs = defs; this.selectedLightId = selectedId; this.syncLights(defs); this.requestRender(); }

  private lightCenter() { return new THREE.Vector3(0, this.modelCenterY, 0); }

  private syncLights(defs: LightDef[]) {
    const seen = new Set<string>();
    const center = this.lightCenter();
    const shadowSize = QUALITY_LEVELS.find((q) => q.id === this.out.quality)?.shadowMap ?? 2048;
    for (const d of defs) {
      seen.add(d.id);
      let e = this.lights.get(d.id);
      if (e && e.type !== d.type) { this.removeLight(d.id); e = undefined; }
      if (!e) e = this.createLight(d);
      const L = e.light; const [r, g, b] = kelvinToRgb(d.kelvin);
      L.color.setRGB(r, g, b, THREE.SRGBColorSpace); L.visible = d.enabled;
      const az = rad(d.azimuth); const el = rad(d.elevation);
      const pos = new THREE.Vector3(Math.sin(az) * Math.cos(el) * d.distance, Math.sin(el) * d.distance, Math.cos(az) * Math.cos(el) * d.distance).add(center);
      const k = d.intensity;
      if (d.type === 'ambient') L.intensity = k * 0.012;
      else {
        L.position.copy(pos);
        if (d.type === 'directional') { const dl = L as THREE.DirectionalLight; dl.intensity = k * 0.034; dl.castShadow = d.shadows && d.enabled; this.shadowFor(dl, d, shadowSize); if (e.target) { e.target.position.copy(center); dl.target = e.target; } }
        else if (d.type === 'spot') { const sl = L as THREE.SpotLight; sl.intensity = k * 0.04 * d.distance * d.distance; sl.angle = rad(d.angle); sl.penumbra = d.softness; sl.decay = 2; sl.castShadow = d.shadows && d.enabled; this.shadowFor(sl, d, shadowSize); if (e.target) { e.target.position.copy(center); sl.target = e.target; } }
        else { const rl = L as THREE.RectAreaLight; rl.width = d.size; rl.height = d.size * 0.7; rl.intensity = (k * 0.035 * d.distance * d.distance) / (rl.width * rl.height); rl.lookAt(center); }
      }
    }
    for (const id of [...this.lights.keys()]) if (!seen.has(id)) this.removeLight(id);
    this.rebuildGizmos(defs, center);
  }

  private shadowFor(l: THREE.DirectionalLight | THREE.SpotLight, d: LightDef, size: number) {
    l.shadow.mapSize.set(size, size); l.shadow.radius = 1 + d.softness * 9; l.shadow.blurSamples = 16;
    l.shadow.bias = -0.0004; l.shadow.normalBias = 0.012;
    if ((l as THREE.DirectionalLight).isDirectionalLight) { const c = (l as THREE.DirectionalLight).shadow.camera; c.left = -2.4; c.right = 2.4; c.top = 2.4; c.bottom = -2.4; c.near = 0.2; c.far = 24; c.updateProjectionMatrix(); }
    else { const c = (l as THREE.SpotLight).shadow.camera as THREE.PerspectiveCamera; c.near = 0.4; c.far = 24; c.fov = Math.min(120, d.angle * 2 + 8); c.updateProjectionMatrix(); }
  }

  private createLight(d: LightDef): LightEntry {
    let light: THREE.Light; let target: THREE.Object3D | undefined;
    if (d.type === 'ambient') light = new THREE.AmbientLight(0xffffff, 0.5);
    else if (d.type === 'directional') { light = new THREE.DirectionalLight(0xffffff, 1); target = new THREE.Object3D(); this.scene.add(target); }
    else if (d.type === 'spot') { light = new THREE.SpotLight(0xffffff, 1); target = new THREE.Object3D(); this.scene.add(target); }
    else light = new THREE.RectAreaLight(0xffffff, 4, d.size, d.size * 0.7);
    this.scene.add(light);
    const e: LightEntry = { type: d.type, light, target }; this.lights.set(d.id, e); return e;
  }

  private removeLight(id: string) {
    const e = this.lights.get(id); if (!e) return;
    this.scene.remove(e.light); if (e.target) this.scene.remove(e.target);
    (e.light as THREE.Light & { dispose?: () => void }).dispose?.(); this.lights.delete(id);
  }

  private rebuildGizmos(defs: LightDef[], center: THREE.Vector3) {
    this.gizmos.clear();
    for (const d of defs) {
      if (d.type === 'ambient' || !d.enabled) continue;
      const [r, g, b] = kelvinToRgb(d.kelvin); const col = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
      const az = rad(d.azimuth); const el = rad(d.elevation);
      const pos = new THREE.Vector3(Math.sin(az) * Math.cos(el) * d.distance, Math.sin(el) * d.distance, Math.cos(az) * Math.cos(el) * d.distance).add(center);
      const sel = d.id === this.selectedLightId;
      const mat = new THREE.MeshBasicMaterial({ color: col, toneMapped: false, depthTest: false, transparent: true, opacity: sel ? 1 : 0.55 });
      const geo = d.type === 'softbox' ? new THREE.PlaneGeometry(d.size * 0.3, d.size * 0.21) : d.type === 'spot' ? new THREE.ConeGeometry(0.07, 0.18, 14) : new THREE.SphereGeometry(0.07, 14, 10);
      const m = new THREE.Mesh(geo, mat); m.position.copy(pos); m.renderOrder = 10; m.lookAt(center);
      if (d.type === 'spot') m.rotateX(Math.PI / 2);
      if (d.type === 'softbox') m.rotateY(Math.PI);
      const lg = new THREE.BufferGeometry().setFromPoints([pos, center]);
      const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: col, toneMapped: false, depthTest: false, transparent: true, opacity: sel ? 0.7 : 0.18 })); line.renderOrder = 9;
      this.gizmos.add(m, line);
    }
    this.gizmos.visible = this.showGizmos;
  }

  private applyShadowQuality() { this.syncLights(this.lightDefs); }

  // ---- camera moves ------------------------------------------------------

  fit() {
    const dist = (this.modelRadius / Math.sin(rad(this.camera.fov) / 2)) * 0.86;
    const dir = this.camera.position.clone().sub(this.controls.target); if (dir.lengthSq() < 1e-6) dir.set(1, 0.5, 1.3);
    this.controls.target.set(0, this.modelCenterY, 0);
    this.camera.position.copy(this.controls.target).add(dir.normalize().multiplyScalar(dist)); this.camera.lookAt(this.controls.target);
    this.controls.update(); this.requestRender();
  }

  setView(name: 'iso' | 'front' | 'back' | 'left' | 'right' | 'top') {
    const dirs: Record<string, [number, number, number]> = { iso: [1, 0.42, 1.3], front: [0, 0.12, 1], back: [0, 0.12, -1], left: [-1, 0.12, 0], right: [1, 0.12, 0], top: [0.001, 1, 0.001] };
    const dist = (this.modelRadius / Math.sin(rad(this.camera.fov) / 2)) * 0.86;
    this.controls.target.set(0, this.modelCenterY, 0);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(...dirs[name]).normalize().multiplyScalar(dist)); this.camera.lookAt(this.controls.target);
    this.controls.update(); this.requestRender();
  }

  /** Distance from the camera to the model centre (for the focus controls). */
  focusDistance() { return this.camera.position.distanceTo(this.controls.target); }

  // ---- thumbnails ---------------------------------------------------------

  thumbnail(p: SurfaceParams): string {
    if (!this.thumbRig) {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(120, 120, false); renderer.setPixelRatio(1); renderer.toneMapping = THREE.NeutralToneMapping;
      const scene = new THREE.Scene(); const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 1;
      const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 3); scene.add(key);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20); camera.position.set(0, 0, 4.1);
      const binding = new SurfaceBinding();
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), binding.material);
      // Sphere UVs are in 0–1: scale the texture tile so patterns read at thumbnail size.
      scene.add(mesh); this.thumbRig = { renderer, scene, camera, binding, mesh };
    }
    const t = this.thumbRig;
    const q = { ...p, tileMm: 100 / 3 }; // three tiles across the sphere
    t.binding.apply(q, null);
    t.mesh.material = t.binding.material;
    t.renderer.setClearColor(0x16151f, 1);
    t.renderer.render(t.scene, t.camera);
    return t.renderer.domElement.toDataURL('image/png');
  }

  // ---- final render --------------------------------------------------------

  cancelRender() { this.cancelFlag = true; }

  async renderStill(out: OutputSettings, onProgress: (fraction: number, message: string) => void): Promise<{ blob: Blob; width: number; height: number; ext: string }> {
    if (this.busy) throw new Error('A render is already running');
    const hostAspect = Math.max(0.2, this.host.clientWidth / Math.max(1, this.host.clientHeight));
    const { w, h } = outputSize(out, hostAspect);
    if (w * h > 268_000_000) throw new Error('That resolution is larger than the browser can hold in one image');
    this.busy = true; this.cancelFlag = false;
    const el = this.renderer.domElement; const prevVis = el.style.visibility; el.style.visibility = 'hidden';
    const hadGizmos = this.gizmos.visible; this.gizmos.visible = false; this.helpers.visible = false;
    const prevOut = this.out; this.out = out;
    this.applyBackground();
    const q = QUALITY_LEVELS.find((x) => x.id === out.quality) ?? QUALITY_LEVELS[1];
    this.syncLights(this.lightDefs);
    try {
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.denoise.enabled = out.denoise !== 'off'; this.grade.uniforms.uPremul.value = out.transparent ? 1 : 0;
      this.grade.uniforms.uFullAspect.value = w / h;
      this.updateDof();
      if (out.format === 'exr') return await this.renderExr(w, h, out.transparent, onProgress);

      const ss = q.supersample; const post = this.cam.dof || this.cam.bloom || out.denoise !== 'off';
      const margin = post ? 96 : 6; const maxRender = 2048;
      const core = Math.max(64, Math.floor(maxRender / ss) - 2 * margin);
      const cols = Math.ceil(w / core); const rows = Math.ceil(h / core);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      let n = 0;
      for (let ty = 0; ty < rows; ty++) {
        for (let tx = 0; tx < cols; tx++) {
          if (this.cancelFlag) throw new Error('Render cancelled');
          const x0 = tx * core; const y0 = ty * core; const tw = Math.min(core, w - x0); const th = Math.min(core, h - y0);
          const mx0 = Math.min(margin, x0); const my0 = Math.min(margin, y0);
          const mx1 = Math.min(margin, w - (x0 + tw)); const my1 = Math.min(margin, h - (y0 + th));
          const rx = x0 - mx0; const ry = y0 - my0; const rw = tw + mx0 + mx1; const rh = th + my0 + my1;
          this.renderer.setPixelRatio(1); this.renderer.setSize(rw * ss, rh * ss, false);
          this.composer.setPixelRatio(1); this.composer.setSize(rw * ss, rh * ss);
          this.denoise.uniforms.uTexel.value.set(1 / (rw * ss), 1 / (rh * ss));
          this.camera.setViewOffset(w * ss, h * ss, rx * ss, ry * ss, rw * ss, rh * ss);
          this.grade.uniforms.uTile.value.set(rx / w, 1 - (ry + rh) / h, rw / w, rh / h);
          this.composer.render();
          ctx.drawImage(el, mx0 * ss, my0 * ss, tw * ss, th * ss, x0, y0, tw, th);
          n += 1; onProgress(n / (cols * rows), `Rendering tile ${n} / ${cols * rows}`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      onProgress(0.98, `Encoding ${out.format.toUpperCase()}…`);
      if (out.format === 'tiff') {
        const data = ctx.getImageData(0, 0, w, h).data;
        return { blob: encodeTiff(w, h, data), width: w, height: h, ext: 'tif' };
      }
      return { blob: await canvasToPngBlob(canvas), width: w, height: h, ext: 'png' };
    } finally {
      this.out = prevOut; this.camera.clearViewOffset(); this.grade.uniforms.uTile.value.set(0, 0, 1, 1); this.grade.uniforms.uPremul.value = prevOut.transparent ? 1 : 0;
      this.denoise.enabled = prevOut.denoise !== 'off';
      this.gizmos.visible = hadGizmos; this.helpers.visible = true; el.style.visibility = prevVis;
      this.busy = false; this.applyBackground(); this.syncLights(this.lightDefs); this.layout();
    }
  }

  private async renderExr(w: number, h: number, transparent: boolean, onProgress: (f: number, m: string) => void) {
    if (Math.max(w, h) > 4096) throw new Error('EXR export is limited to 4096 px on the long edge — choose Full HD or 4K');
    onProgress(0.2, 'Rendering scene-linear frame…');
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    const prevTone = this.renderer.toneMapping; const prevBg = this.scene.background;
    try {
      this.renderer.toneMapping = THREE.NoToneMapping;
      if (transparent) this.renderer.setClearColor(0x000000, 0);
      else if (this.backdropComposited()) { this.scene.background = this.exrBackground(); this.renderer.setClearColor(0x000000, 1); }
      this.renderer.setRenderTarget(rt); this.renderer.clear(); this.renderer.render(this.scene, this.camera); this.renderer.setRenderTarget(null);
      onProgress(0.7, 'Encoding EXR…');
      const data = await new EXRExporter().parse(this.renderer, rt, { type: THREE.HalfFloatType, compression: ZIP_COMPRESSION });
      return { blob: new Blob([data as BlobPart], { type: 'image/x-exr' }), width: w, height: h, ext: 'exr' };
    } finally { this.renderer.toneMapping = prevTone; this.scene.background = prevBg; rt.dispose(); }
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.resizeObserver.disconnect();
    for (const c of this.cleanups) c();
    for (const p of this.parts) { p.mesh.geometry.dispose(); p.binding.dispose(); }
    for (const t of this.envCache.values()) t.dispose(); for (const rt of this.bgCubes.values()) rt.dispose(); this.customEnv?.dispose(); this.gradientTex?.dispose();
    this.controls.dispose(); this.composer.dispose(); this.pmrem.dispose();
    if (this.thumbRig) { this.thumbRig.binding.dispose(); this.thumbRig.renderer.dispose(); this.thumbRig.renderer.forceContextLoss(); }
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
