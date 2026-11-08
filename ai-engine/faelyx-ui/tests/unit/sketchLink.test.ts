import { describe, expect, it } from 'vitest';
import {
  PLANE_BASIS, PRIMARY_PLANE_SIZE_MM, SKETCH_LIFT_MM, buildOperation, defaultForm, featureSketchIds, relinkFeature, sketchFits, sketchPlaneFrame,
  supportFrame, toWorld, toWorldLifted, type KeptSketch, type LinkedFeature,
} from '../../src/partDesign';
import { PLANE_COLORS } from '../../src/sketch/constants';
import type { ProfileLoop } from '../../src/profileLoops';

// Sketch → 3D transfer: the float offset, the shared plane colours, and the
// link between a feature and the kept sketch it was built from.

const rect = (w: number, h: number): ProfileLoop => ({ kind: 'polygon', points: [[0, 0], [w, 0], [w, h], [0, h]] });
const kept = (over: Partial<KeptSketch> = {}): KeptSketch => ({
  id: 'sk1', name: 'Sketch.1', plane: 'Front', frame: sketchPlaneFrame('Front', 0), loops: [rect(40, 30)], openPath: null,
  points: [], support: { kind: 'plane', plane: 'Front', offset: 0 }, ...over,
});
// A Pad built from a kept sketch, as App.tsx stores it.
function padFrom(k: KeptSketch): LinkedFeature {
  const form = { ...defaultForm('Pad'), length: '20' };
  const built = buildOperation('Pad', form, { loops: k.loops, openPath: k.openPath, points: [], frame: k.frame, kept: [k], faces: [] });
  if (built.kind !== 'feature') throw new Error('not a feature');
  return { ...built.feature, plane: k.frame, tool: 'Pad', form, sketchId: k.id };
}

describe('sketch wireframes float off their plane', () => {
  it('is drawn 0.5 mm along the plane normal, on every plane', () => {
    expect(SKETCH_LIFT_MM).toBe(0.5);
    for (const plane of ['Top', 'Front', 'Right'] as const) {
      const frame = sketchPlaneFrame(plane, 7);
      const flat = toWorld(frame, [10, 5]);
      const lifted = toWorldLifted(frame, [10, 5]);
      const delta = lifted.map((v, i) => v - flat[i]);
      expect(delta).toEqual(PLANE_BASIS[plane].n.map((c) => c * 0.5));
    }
  });
  it('does not move the frame the geometry is built on', () => {
    const frame = sketchPlaneFrame('Top', 0);
    toWorldLifted(frame, [1, 1]);
    expect(frame).toEqual({ origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] });
    expect(toWorldLifted(frame, [1, 1], 0)).toEqual(toWorld(frame, [1, 1]));
  });
});

describe('primary planes', () => {
  it('use the Sketch & 2D plane colours and are 50 mm squares', () => {
    expect(PLANE_COLORS).toEqual({ Top: '#3f6fc9', Front: '#6a4bc2', Right: '#8a4fa8' });
    expect(PRIMARY_PLANE_SIZE_MM).toBe(50);
  });
});

describe('what a kept sketch sits on', () => {
  it('a plane support gives that plane at its offset; a face keeps the stored frame', () => {
    expect(supportFrame({ kind: 'plane', plane: 'Top', offset: 20 }, sketchPlaneFrame('Front', 0))).toEqual(sketchPlaneFrame('Top', 20));
    expect(supportFrame({ kind: 'ref', refId: 'r', axis: 'YZ', offset: 5 }, sketchPlaneFrame('Front', 0)).origin).toEqual([5, 0, 0]);
    const stored = { origin: [1, 2, 3], xDir: [0, 1, 0], normal: [0, 0, 1] };
    expect(supportFrame({ kind: 'face' }, stored)).toBe(stored);
    expect(supportFrame(undefined, stored)).toBe(stored);
  });
  it('knows which tools a sketch can feed', () => {
    const open = kept({ loops: [], openPath: { start: [0, 0], segments: [{ kind: 'line', end: [10, 0] }] } });
    expect(sketchFits(kept(), 'profile')).toBe(true);
    expect(sketchFits(kept(), 'circles')).toBe(false);
    expect(sketchFits(kept({ loops: [{ kind: 'circle', center: [0, 0], r: 5 }] }), 'circles')).toBe(true);
    expect(sketchFits(open, 'open')).toBe(true);
    expect(sketchFits(open, 'profile')).toBe(false);
  });
});

describe('features stay linked to their sketch', () => {
  it('lists the sketches a feature depends on: its own, a center curve, sections', () => {
    expect(featureSketchIds({ sketchId: 'a', form: { center: 'b' } })).toEqual(['a', 'b']);
    expect(featureSketchIds({ form: { sections: 'c,d' } })).toEqual(['c', 'd']);
    expect(featureSketchIds({})).toEqual([]);
  });
  it('an edited sketch changes the feature profile and nothing else', () => {
    const k = kept();
    const pad = padFrom(k);
    const next = relinkFeature(pad, [{ ...k, loops: [rect(50, 30)] }]);
    expect(next.loops).toEqual([rect(50, 30)]);
    expect(next).toMatchObject({ op: 'pad', depth: 20, sketchId: 'sk1', plane: k.frame });
    expect(pad.loops).toEqual([rect(40, 30)]);
  });
  it('a sketch moved to another plane takes the feature with it', () => {
    const k = kept();
    const moved = { ...k, plane: 'Top' as const, support: { kind: 'plane' as const, plane: 'Top' as const, offset: 12 }, frame: sketchPlaneFrame('Top', 12) };
    expect(relinkFeature(padFrom(k), [moved]).plane).toEqual({ origin: [0, 0, 12], xDir: [1, 0, 0], normal: [0, 0, 1] });
  });
  it('says why when the sketch no longer holds a profile', () => {
    const k = kept();
    expect(() => relinkFeature(padFrom(k), [{ ...k, loops: [] }])).toThrow(/closed profile/);
  });
  it('leaves a feature alone when its sketch is gone or it has no stored definition', () => {
    const pad = padFrom(kept());
    expect(relinkFeature(pad, [])).toBe(pad);
    const legacy: LinkedFeature = { op: 'pad', depth: 20, loops: [rect(40, 30)] };
    expect(relinkFeature(legacy, [kept()])).toBe(legacy);
  });
  it('a Rib follows its center-curve sketch', () => {
    const center = kept({ id: 'c', name: 'Sketch.1', loops: [], openPath: { start: [0, 0], segments: [{ kind: 'line', end: [60, 0] }] } });
    const profile = kept({ id: 'p', name: 'Sketch.2', plane: 'Right', frame: sketchPlaneFrame('Right', 0), loops: [{ kind: 'circle', center: [0, 0], r: 5 }], support: { kind: 'plane', plane: 'Right', offset: 0 } });
    const form = { ...defaultForm('Rib'), center: 'c' };
    const built = buildOperation('Rib', form, { loops: profile.loops, openPath: null, points: [], frame: profile.frame, kept: [center, profile], faces: [] });
    if (built.kind !== 'feature') throw new Error('not a feature');
    const rib: LinkedFeature = { ...built.feature, plane: profile.frame, tool: 'Rib', form, sketchId: 'p' };
    const longer = { ...center, openPath: { start: [0, 0] as [number, number], segments: [{ kind: 'line' as const, end: [80, 0] as [number, number] }] } };
    const next = relinkFeature(rib, [longer, profile]);
    expect((next.extra as { path: { segments: { end: number[] }[] } }).path.segments[0].end).toEqual([80, 0, 0]);
  });
});
