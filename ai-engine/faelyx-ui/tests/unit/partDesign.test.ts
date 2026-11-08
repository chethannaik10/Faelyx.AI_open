import { describe, expect, it } from 'vitest';
import {
  TOOLS, TOOL_GROUPS, buildOperation, defaultForm, extractOpenPath, frameFor, mirrorFeatureLoop, pathTo3D, toLocal,
  mergeStl, refPlaneFrame, sketchPlaneFrame, standalonePoints, toWorld, type OpContext,
} from '../../src/partDesign';
import type { ProfileLoop } from '../../src/profileLoops';

// Sketch-local coordinates: the sketch origin marker is (0, 0).
const O: [number, number] = [0, 0];
const rect: ProfileLoop = { kind: 'polygon', points: [[0, 0], [40, 0], [40, 20], [0, 20]] };
const ctx = (over: Partial<OpContext> = {}): OpContext => ({
  loops: [rect], openPath: null, points: [], frame: sketchPlaneFrame('Front', 0), kept: [], faces: [], ...over,
});
const P = (id: string, x: number, y: number) => ({ id, x, y });

describe('sketch plane → 3D frame', () => {
  it('shifts traced profiles (canvas x, −canvas y) onto the sketch origin marker', () => {
    expect(toLocal({ kind: 'circle', center: [210, -140], r: 3 })).toEqual({ kind: 'circle', center: [10, 10], r: 3 });
  });
  it('puts the sketch origin marker on the world origin for every plane', () => {
    for (const plane of ['Top', 'Front', 'Right'] as const) expect(toWorld(sketchPlaneFrame(plane, 0), O)).toEqual([0, 0, 0]);
  });
  it('maps sketch H/V onto the axes the plane picker names', () => {
    // Front = XZ: H → +X, V (profile +y) → +Z, pads grow toward −Y.
    const front = sketchPlaneFrame('Front', 0);
    expect(toWorld(front, [O[0] + 10, O[1] + 5])).toEqual([10, 0, 5]);
    expect(front.normal).toEqual([0, -1, 0]);
    // Right = YZ: H → +Y, V → +Z, normal +X.
    expect(toWorld(sketchPlaneFrame('Right', 0), [O[0] + 10, O[1] + 5])).toEqual([0, 10, 5]);
    // Top = XY: H → +X, V → +Y, normal +Z.
    expect(toWorld(sketchPlaneFrame('Top', 0), [O[0] + 10, O[1] + 5])).toEqual([10, 5, 0]);
  });
  it('offsets a sketch plane along its own normal', () => {
    expect(toWorld(sketchPlaneFrame('Front', 20), O)).toEqual([0, -20, 0]);
    expect(toWorld(sketchPlaneFrame('Top', 7), O)).toEqual([0, 0, 7]);
  });
  it('places reference planes along the axis their offset is drawn on', () => {
    expect(toWorld(refPlaneFrame('XZ', 12), O)).toEqual([0, 12, 0]);
    expect(toWorld(refPlaneFrame('YZ', 3), O)).toEqual([3, 0, 0]);
    expect(frameFor('Top', [1, 2, 3]).normal).toEqual([0, 0, 1]);
  });
});

describe('open sketch geometry', () => {
  it('walks an open line + arc chain from a free end', () => {
    const data = {
      points: [P('a', 200, 150), P('b', 240, 150), P('c', 240, 110), P('k', 240, 130)],
      lines: [{ id: 'l1', p1: 'a', p2: 'b' }],
      circles: [], constraints: [],
      // Quarter-ish arc b → c around k (radius 20).
      arcs: [{ id: 'r', center: 'k', r: 20, start: 90, end: 270, p1: 'b', p2: 'c' }],
    };
    const path = extractOpenPath(data)!;
    expect(path).not.toBeNull();
    const ends = [path.start, path.segments.at(-1)!.end].map((p) => p.map((v) => Math.round(v)));
    expect(ends).toContainEqual([0, 0]);
    expect(ends).toContainEqual([40, 40]);
    expect(path.segments.map((s) => s.kind).sort()).toEqual(['arc', 'line']);
  });
  it('returns null for a closed sketch and ignores construction lines', () => {
    const pts = [P('a', 0, 0), P('b', 10, 0), P('c', 10, 10)];
    const closed = { points: pts, lines: [{ id: '1', p1: 'a', p2: 'b' }, { id: '2', p1: 'b', p2: 'c' }, { id: '3', p1: 'c', p2: 'a' }], circles: [], constraints: [] };
    expect(extractOpenPath(closed)).toBeNull();
    const construction = { points: pts, lines: [{ id: '1', p1: 'a', p2: 'b', style: 'construction' as const }], circles: [], constraints: [] };
    expect(extractOpenPath(construction)).toBeNull();
  });
  it('finds standalone points only', () => {
    const data = { points: [P('a', 0, 0), P('b', 10, 0), P('s', 5, 5)], lines: [{ id: '1', p1: 'a', p2: 'b' }], circles: [], constraints: [] };
    expect(standalonePoints(data)).toEqual([[5 - 200, 150 - 5]]);
  });
  it('maps a 2D center curve to 3D through its frame', () => {
    const p = pathTo3D({ start: O, segments: [{ kind: 'line', end: [O[0] + 50, O[1]] }] }, sketchPlaneFrame('Front', 0));
    expect(p.start).toEqual([0, 0, 0]);
    expect(p.segments[0].end).toEqual([50, 0, 0]);
  });
  it('mirrors a feature about the sketch origin', () => {
    const m = mirrorFeatureLoop(rect, 'Y') as { points: [number, number][] };
    expect(m.points.map(([x]) => x + 0).sort((a, b) => a - b)).toEqual([-40, -40, 0, 0]);
  });
});

describe('buildOperation', () => {
  it('Pad sends the CATIA limit options and raises the plane for a plain pad', () => {
    const op = buildOperation('Pad', { ...defaultForm('Pad'), length: '25', second: true, length2: '5' }, ctx());
    expect(op.kind).toBe('feature');
    if (op.kind !== 'feature') return;
    expect(op.feature).toMatchObject({ op: 'pad', depth: 25, extra: { limit: 'dimension', depth2: 5 } });
    expect(op.advancesPlane).toBe(25);
    const mirrored = buildOperation('Pad', { ...defaultForm('Pad'), mirrored: true }, ctx());
    expect(mirrored.kind === 'feature' && mirrored.feature.extra.mirrored).toBe(true);
    expect(mirrored.kind === 'feature' && mirrored.advancesPlane).toBeUndefined();
  });
  it('Pocket Up to last and thick', () => {
    const op = buildOperation('Pocket', { ...defaultForm('Pocket'), type: 'up_to_last', thick: true, thin1: '2' }, ctx());
    expect(op.kind === 'feature' && op.feature).toMatchObject({ op: 'pocket', extra: { limit: 'up_to_last', thin1: 2, thin2: 0 } });
  });
  it('refuses a pad with no closed profile, with the sketch\'s own reason', () => {
    expect(() => buildOperation('Pad', defaultForm('Pad'), ctx({ loops: [], profileError: 'Profile is open' }))).toThrow('Profile is open');
  });
  it('Shaft/Groove take first and second angles', () => {
    const g = buildOperation('Groove', { ...defaultForm('Groove'), angle1: '100', angle2: '60', axis: 'Y' }, ctx());
    expect(g.kind === 'feature' && g.feature).toMatchObject({ op: 'groove', angle: 100, axis: 'Y', extra: { angle2: 60 } });
    expect(() => buildOperation('Shaft', { ...defaultForm('Shaft'), angle1: '300', angle2: '100' }, ctx())).toThrow('360');
  });
  it('Hole builds a counterbored threaded spec from the sketch circles', () => {
    const circle: ProfileLoop = { kind: 'circle', center: [210, -140], r: 5 };
    const op = buildOperation('Hole', { ...defaultForm('Hole'), type: 'counterbored', threaded: true }, ctx({ loops: [rect, circle] }));
    if (op.kind !== 'feature') throw new Error('expected feature');
    expect(op.feature.loops).toEqual([circle]);
    expect(op.feature.extra).toMatchObject({ limit: 'dimension', hole: { type: 'counterbored', depth: 20, cbDiameter: 16, cbDepth: 5, thread: { designation: 'M10' } } });
    expect(() => buildOperation('Hole', defaultForm('Hole'), ctx())).toThrow('circle');
  });
  it('Rib needs a kept sketch with an open chain and sends its 3D path', () => {
    expect(() => buildOperation('Rib', defaultForm('Rib'), ctx())).toThrow('center curve');
    const kept = { id: 'k1', name: 'Sketch.1', plane: 'Front' as const, frame: sketchPlaneFrame('Front', 0), loops: [], openPath: { start: O, segments: [{ kind: 'line' as const, end: [O[0] + 40, O[1]] as [number, number] }] } };
    const op = buildOperation('Rib', { ...defaultForm('Rib'), center: 'k1' }, ctx({ kept: [kept] }));
    expect(op.kind === 'feature' && op.feature.extra.path).toEqual({ start: [0, 0, 0], segments: [{ kind: 'line', end: [40, 0, 0] }] });
  });
  it('Multi-sections needs two single-profile sections', () => {
    const k = (id: string, off: number) => ({ id, name: id, plane: 'Top' as const, frame: sketchPlaneFrame('Top', off), loops: [rect], openPath: null });
    const op = buildOperation('Multi-sections Solid', { sections: 'a,b', ruled: false }, ctx({ kept: [k('a', 0), k('b', 30)] }));
    expect(op.kind === 'feature' && (op.feature.extra.sections as unknown[]).length).toBe(2);
    expect(() => buildOperation('Multi-sections Solid', { sections: 'a' }, ctx({ kept: [k('a', 0)] }))).toThrow('two');
  });
  it('dress-up tools use picked faces', () => {
    const faces = [{ point: [1, 2, 3], type: 'plane' }];
    const f = buildOperation('Edge Fillet', defaultForm('Edge Fillet'), ctx({ faces }));
    expect(f.kind === 'modifier' && f.modifier).toMatchObject({ op: 'fillet', extra: { radius: 2, facePoints: [[1, 2, 3]] } });
    expect(() => buildOperation('Thickness', defaultForm('Thickness'), ctx())).toThrow('Pick at least one face');
    const d = buildOperation('Draft', defaultForm('Draft'), ctx());
    expect(d.kind === 'modifier' && d.modifier.extra).toMatchObject({ draftAngle: 5, pullDirection: [0, 0, 1], faceSelector: 'side' });
  });
  it('chamfer reverse keeps the same bevel (L·tan a at 90° − a)', () => {
    const c = buildOperation('Chamfer', { ...defaultForm('Chamfer'), length: '2', angle: '30', reverse: true }, ctx());
    if (c.kind !== 'modifier') throw new Error('expected modifier');
    expect(c.modifier.extra.chamferAngle).toBeCloseTo(60);
    expect(c.modifier.extra.radius as number).toBeCloseTo(2 * Math.tan(Math.PI / 6), 6);
  });
  it('transformations', () => {
    const t = buildOperation('Translation', { dir: 'Y', distance: '15' }, ctx());
    expect(t.kind === 'modifier' && t.modifier.extra.vector).toEqual([0, 15, 0]);
    const s = buildOperation('Split', { plane: 'XY', offset: '5', keep: '-' }, ctx());
    expect(s.kind === 'modifier' && s.modifier.extra).toEqual({ planeSpec: { origin: [0, 0, 5], normal: [0, 0, 1] }, keep: '-' });
    const aff = buildOperation('Scaling', { mode: 'axis', ratio: '1.6', center: '0,0,0', axis: 'Y' }, ctx());
    expect(aff.kind === 'modifier' && aff.modifier.extra.scaleVector).toEqual([1, 1.6, 1]);
    const circ = buildOperation('Circular Pattern', { axis: 'X', origin: '0,0,0', count: '3', mode: 'spacing', spacing: '30' }, ctx());
    expect(circ.kind === 'modifier' && circ.modifier.extra).toMatchObject({ count: 3, angle: 90, axisDirection: [1, 0, 0] });
  });
  it('User Pattern takes standalone sketch points relative to the sketch origin', () => {
    const op = buildOperation('User Pattern', defaultForm('User Pattern'), ctx({ points: [[O[0] + 30, O[1] + 10]] }));
    expect(op.kind === 'modifier' && op.modifier.extra.offsets).toEqual([[30, 0, 10]]);
  });
  it('every enabled toolbox tool is known to buildOperation or handled by the app', () => {
    const appHandled = new Set(['keep', 'reference', 'body', 'boolean', 'inspect', 'mirror-feature', 'unavailable']);
    for (const g of TOOL_GROUPS) for (const t of g.tools) {
      if (appHandled.has(t.kind)) continue;
      expect(() => { try { buildOperation(t.name, defaultForm(t.name), ctx({ faces: [{ point: [0, 0, 0], type: 'plane' }], points: [O], openPath: { start: O, segments: [{ kind: 'line', end: [O[0] + 1, O[1]] }] }, kept: [] })); } catch (e) { if ((e as Error).message.includes('not an operation')) throw e; } }).not.toThrow();
    }
    expect(Object.keys(TOOLS).length).toBeGreaterThan(40);
  });
});

describe('mergeStl', () => {
  const stl = (n: number, fill: number) => { const b = new Uint8Array(84 + 50 * n); new DataView(b.buffer).setUint32(80, n, true); b.fill(fill, 84); return b.buffer; };
  it('concatenates binary triangles and fixes the count', () => {
    const m = new Uint8Array(mergeStl([stl(2, 1), stl(3, 2)]));
    expect(m.byteLength).toBe(84 + 250);
    expect(new DataView(m.buffer).getUint32(80, true)).toBe(5);
    expect(m[84]).toBe(1); expect(m[84 + 100]).toBe(2);
  });
});
