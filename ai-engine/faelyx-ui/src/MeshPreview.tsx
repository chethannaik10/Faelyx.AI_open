// faelyx.AI — Image to 3D preview. A small three.js viewer for the TripoSR model, shown in the right-hand pane.
// Navigation is the app's Universal scheme (cam/universalNav.ts): left click selects (nothing
// to select here), middle button pans, middle + right drags to zoom / orbit, F or a double
// middle click fits the model.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { installUniversalNav } from './cam/universalNav';
import { meshUrl, type JobInfo, type Settings } from './imageTo3D';

export type PreviewMode = 'textured' | 'clay' | 'wire';
type Origin = Map<THREE.Mesh, THREE.Material | THREE.Material[]>;

export default function MeshPreview({ job, settings, mode, fill }: { job: JobInfo; settings: Settings; mode: PreviewMode; fill?: boolean }) {
  const host = useRef<HTMLDivElement | null>(null);
  const api = useRef<{ load: (job: JobInfo, s: Settings) => void; setMode: (m: PreviewMode) => void; fit: () => void } | null>(null);
  const [status, setStatus] = useState<string>('Loading the model…');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0a0910, 1);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.outline = 'none';
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1b1a24, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(3, 5, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fa6ff, 0.6); fill.position.set(-3, 2, -3); scene.add(fill);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.zoomToCursor = true;
    let raf = 0, disposed = false;
    const render = () => { if (raf || disposed) return; raf = requestAnimationFrame(() => { raf = 0; if (!disposed) renderer.render(scene, camera); }); };
    controls.addEventListener('change', render);

    const root = new THREE.Group();          // everything the model adds
    scene.add(root);
    let model: THREE.Object3D | null = null;
    const origins: Origin = new Map();
    let curMode: PreviewMode = 'textured';
    let token = 0;
    let grid: THREE.GridHelper | null = null;

    const clay = new THREE.MeshStandardMaterial({ color: 0xb9b2c7, roughness: 0.62, metalness: 0.05 });
    const wire = new THREE.MeshBasicMaterial({ color: 0x9d86ff, wireframe: true });

    const applyMode = () => {
      if (!model) return;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (curMode === 'clay') m.material = clay;
        else if (curMode === 'wire') m.material = wire;
        else m.material = origins.get(m) ?? clay;
      });
      render();
    };

    const fit = () => {
      if (!model) return;
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const r = Math.max(sphere.radius, 1e-6);
      const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.05;
      const dir = new THREE.Vector3(0.75, 0.5, 1).normalize();
      camera.near = r / 200; camera.far = r * 200; camera.updateProjectionMatrix();
      controls.minDistance = r * 0.15; controls.maxDistance = r * 40;
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(dir, dist);
      camera.lookAt(sphere.center);
      controls.update();
      render();
    };

    const clear = () => {
      if (model) {
        root.remove(model);
        model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); } });
      }
      origins.clear();
      model = null;
      if (grid) { scene.remove(grid); grid.geometry.dispose(); grid = null; }
    };

    let shownJob = '';
    const place = (obj: THREE.Object3D, refit: boolean) => {
      model = obj;
      root.add(obj);
      obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) origins.set(m, m.material); });
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.z, 1e-6) * 2.2;
      grid = new THREE.GridHelper(span, 12, 0x4b3d78, 0x2a2340);
      grid.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      scene.add(grid);
      applyMode();
      if (refit) fit(); else render();       // keep the camera while smoothing / re-orienting the same model
    };

    const loadFor = async (job: JobInfo, s: Settings) => {
      const mine = ++token;
      setStatus('Loading the model…');
      try {
        const url = meshUrl(job, 'ply', { ...s, place: 'ground' });
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        const buf = await res.arrayBuffer();
        if (mine !== token || disposed) return;
        clear();
        const geo = new PLYLoader().parse(buf);
        if (!geo.getAttribute('normal')) geo.computeVertexNormals();
        const colored = !!geo.getAttribute('color');
        const mat = new THREE.MeshStandardMaterial({ color: colored ? 0xffffff : 0xb9b2c7, vertexColors: colored, roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide });
        const cad = new THREE.Group();
        cad.rotation.x = -Math.PI / 2;          // CAD Z-up under the Y-up scene
        cad.add(new THREE.Mesh(geo, mat));
        place(cad, shownJob !== job.id);
        shownJob = job.id;
        setStatus('');
      } catch (err) {
        if (mine === token && !disposed) setStatus(`Could not load the preview: ${(err as Error).message}`);
      }
    };

    api.current = {
      load: (j, s) => { void loadFor(j, s); },
      setMode: (m) => { curMode = m; applyMode(); },
      fit,
    };

    const cleanNav = installUniversalNav(renderer.domElement, camera, controls, { render, fit });
    const layout = () => {
      const w = Math.max(el.clientWidth, 1), h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / h; camera.updateProjectionMatrix(); render();
    };
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    layout();
    camera.position.set(2, 1.5, 3);
    return () => {
      disposed = true;
      token++;
      cleanNav(); ro.disconnect(); controls.dispose();
      cancelAnimationFrame(raf);
      clear();
      clay.dispose(); wire.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  // A new model, or a change the server applies to the mesh (orientation, size, smoothing, loose pieces, holes, face cap).
  const liveKey = `${job.id}|${job.has_colors ? 1 : 0}|${settings.up}|${settings.spin}|${settings.size}|${settings.faces}|${settings.smooth}|${settings.sharp}|${settings.pieces}|${settings.fillHoles}`;
  const [reloadKey, setReloadKey] = useState(liveKey);
  useEffect(() => { const t = window.setTimeout(() => setReloadKey(liveKey), 300); return () => window.clearTimeout(t); }, [liveKey]);    // a slider drag is one reload
  useEffect(() => { api.current?.load(job, settings); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reloadKey]);
  useEffect(() => { api.current?.setMode(mode); }, [mode, reloadKey]);

  return <div className={`i23d-preview${fill ? ' fill' : ''}`} ref={host}>
    {/* null, not '' : an empty-string child makes React set textContent = '' and wipe the canvas three.js put in this div */}
    {status ? <div className="i23d-preview-note">{status}</div> : null}
  </div>;
}
