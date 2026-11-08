// The Universal mouse scheme for a three.js viewport — the same chord state machine the
// RenderX viewport uses (render/RenderEngine.ts), so every 3D view in the app navigates alike:
//   LMB click      select (callback)         MMB drag            pan
//   MMB held + one RMB click, then drag ↑↓   zoom               MMB + RMB held, drag  orbit
//   double MMB     fit                       scroll              zoom (OrbitControls)
// The camera must be Y-up (the scene puts CAD Z-up content under a rotated group).

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NAV_SCHEMES } from '../navigation';

export interface NavHooks { render: () => void; fit: () => void; pick?: (e: PointerEvent) => void; onEscape?: () => void }

export function installUniversalNav(el: HTMLElement, camera: THREE.PerspectiveCamera, controls: OrbitControls, hooks: NavHooks): () => void {
  const def = NAV_SCHEMES.universal;
  controls.mouseButtons = { LEFT: undefined as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: undefined as unknown as THREE.MOUSE };
  let downX = 0, downY = 0, downBtn = -1;
  const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; downBtn = e.button; };
  const onUp = (e: PointerEvent) => {
    if (downBtn === 0 && e.button === 0 && Math.hypot(e.clientX - downX, e.clientY - downY) < 4) hooks.pick?.(e);
    downBtn = -1;
  };
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp);
  const noMenu = (e: Event) => e.preventDefault();
  el.addEventListener('contextmenu', noMenu);

  let chordActive = false, chordX = 0, chordY = 0;
  let prevButtons = 0, zoomLatched = false, chordMoved = false, chordStartX = 0, chordStartY = 0;
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
          camera.position.copy(controls.target).add(offset.setLength(next)); camera.lookAt(controls.target); hooks.render();
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
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical)); camera.lookAt(controls.target); hooks.render();
    }
    chordActive = true; chordX = event.clientX; chordY = event.clientY; syncStarts();
  };
  el.addEventListener('pointermove', onChordMove, true);
  const resetChord = (event: PointerEvent) => { if (event.type === 'pointerdown' || event.button === 1) { zoomLatched = false; chordMoved = false; chordActive = false; prevButtons = event.type === 'pointerdown' ? event.buttons : 0; } };
  el.addEventListener('pointerdown', resetChord, true); window.addEventListener('pointerup', resetChord);
  let middleAt = 0, middleX = 0, middleY = 0;
  const onMiddle = (event: PointerEvent) => {
    if (event.button !== 1) return;
    const now = performance.now();
    if (now - middleAt < 400 && Math.hypot(event.clientX - middleX, event.clientY - middleY) < 6) { middleAt = 0; hooks.fit(); return; }
    middleAt = now; middleX = event.clientX; middleY = event.clientY;
  };
  el.addEventListener('pointerdown', onMiddle);
  const noMiddleScroll = (event: MouseEvent) => { if (event.button === 1) event.preventDefault(); };
  el.addEventListener('mousedown', noMiddleScroll);
  let hover = false;
  const onEnter = () => { hover = true; }, onLeave = () => { hover = false; };
  el.addEventListener('pointerenter', onEnter); el.addEventListener('pointerleave', onLeave);
  const onKey = (e: KeyboardEvent) => {
    if (!hover || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'f' || e.key === 'F') hooks.fit();
    if (e.key === 'Escape') hooks.onEscape?.();
  };
  window.addEventListener('keydown', onKey);
  return () => {
    el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); el.removeEventListener('contextmenu', noMenu);
    el.removeEventListener('pointermove', onChordMove, true); el.removeEventListener('pointerdown', resetChord, true); window.removeEventListener('pointerup', resetChord);
    el.removeEventListener('pointerdown', onMiddle); el.removeEventListener('mousedown', noMiddleScroll); el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('keydown', onKey);
  };
}
