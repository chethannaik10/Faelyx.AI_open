import { describe, expect, it } from 'vitest';
import { loopOutline, mirrorLoop, positionLoop, traceLoops } from '../../src/profileLoops';

const P = (id: string, x: number, y: number) => ({ id, x, y });
const L = (id: string, p1: string, p2: string) => ({ id, p1, p2 });
// Signed area of a traced loop (arcs via their outline samples).
const area = (loop: Parameters<typeof loopOutline>[0]) => {
  const pts = loopOutline(loop, 32);
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
};
const rect = (pre: string, x: number, y: number, w: number, h: number) => ({
  pts: [P(`${pre}a`, x, y), P(`${pre}b`, x + w, y), P(`${pre}c`, x + w, y + h), P(`${pre}d`, x, y + h)],
  lns: [L(`${pre}1`, `${pre}a`, `${pre}b`), L(`${pre}2`, `${pre}b`, `${pre}c`), L(`${pre}3`, `${pre}c`, `${pre}d`), L(`${pre}4`, `${pre}d`, `${pre}a`)],
});

describe('traceLoops', () => {
  it('traces a rectangle as a polygon (Y flipped to the math plane)', () => {
    const pts = [P('a', 0, 0), P('b', 40, 0), P('c', 40, 20), P('d', 0, 20)];
    const lns = [{ id: '1', p1: 'a', p2: 'b' }, { id: '2', p1: 'b', p2: 'c' }, { id: '3', p1: 'c', p2: 'd' }, { id: '4', p1: 'd', p2: 'a' }];
    const { loops, error } = traceLoops(pts, lns, []);
    expect(error).toBeUndefined();
    expect(loops).toHaveLength(1);
    expect(loops[0].kind).toBe('polygon');
    expect(Math.abs(area(loops[0]))).toBeCloseTo(800);
  });

  it('ignores construction and infinite lines', () => {
    const pts = [P('a', 0, 0), P('b', 40, 0), P('c', 40, 20)];
    const lns = [{ id: '1', p1: 'a', p2: 'b' }, { id: '2', p1: 'b', p2: 'c' }, { id: '3', p1: 'c', p2: 'a', style: 'construction' }];
    expect(traceLoops(pts, lns, []).loops).toHaveLength(0);
  });

  it('traces lines joined by an arc as a path with an arc segment', () => {
    // U shape closed by a half-circle arc over the top (center (20,20), r 20,
    // sweeping 180→360 i.e. from d (0,20) up and over to c (40,20) in SVG).
    const pts = [P('a', 0, 40), P('b', 40, 40), P('c', 40, 20), P('d', 0, 20), P('m', 20, 20)];
    const lns = [{ id: '1', p1: 'a', p2: 'b' }, { id: '2', p1: 'b', p2: 'c' }, { id: '3', p1: 'd', p2: 'a' }];
    const arcs = [{ id: 'arc', center: 'm', r: 20, start: 180, end: 360, p1: 'd', p2: 'c' }];
    const { loops } = traceLoops(pts, lns, [], arcs);
    expect(loops).toHaveLength(1);
    const loop = loops[0];
    expect(loop.kind).toBe('path');
    if (loop.kind !== 'path') return;
    const arcSeg = loop.segments.find((s) => s.kind === 'arc');
    // top of the arc (SVG y = 0), Y flipped
    const mid = arcSeg && arcSeg.kind === 'arc' ? arcSeg.mid : [NaN, NaN];
    expect(mid[0]).toBeCloseTo(20); expect(mid[1]).toBeCloseTo(0);
  });

  it('extrudes the outer boundary of a rectangle split by a T-junction', () => {
    // A line from the middle of the top edge down to the middle of the
    // bottom edge: its ends only touch the edges (no shared points).
    const r = rect('r', 0, 0, 40, 20);
    const { loops } = traceLoops([...r.pts, P('t1', 20, 0), P('t2', 20, 20)], [...r.lns, L('stem', 't1', 't2')], []);
    expect(loops).toHaveLength(1);
    expect(Math.abs(area(loops[0]))).toBeCloseTo(800);
  });

  it('extrudes the union outline of two overlapping rectangles', () => {
    const a = rect('a', 0, 0, 40, 20), b = rect('b', 20, 10, 40, 20);
    const { loops } = traceLoops([...a.pts, ...b.pts], [...a.lns, ...b.lns], []);
    expect(loops).toHaveLength(1);
    expect(Math.abs(area(loops[0]))).toBeCloseTo(800 + 800 - 200);
  });

  it('ignores a dangling line hanging off a closed shape', () => {
    const r = rect('r', 0, 0, 40, 20);
    const { loops } = traceLoops([...r.pts, P('x', 80, 80)], [...r.lns, L('tail', 'rc', 'x')], []);
    expect(loops).toHaveLength(1);
    expect(Math.abs(area(loops[0]))).toBeCloseTo(800);
  });

  it('keeps separate and nested shapes as separate loops', () => {
    const outer = rect('o', 0, 0, 100, 100), inner = rect('i', 30, 30, 20, 20), side = rect('s', 200, 0, 10, 10);
    const { loops } = traceLoops([...outer.pts, ...inner.pts, ...side.pts], [...outer.lns, ...inner.lns, ...side.lns], []);
    expect(loops.map((l) => Math.round(Math.abs(area(l)))).sort((m, n) => m - n)).toEqual([100, 400, 10000]);
  });

  it('splits two squares that only touch at a corner into two loops', () => {
    const a = rect('a', 0, 0, 10, 10), b = rect('b', 10, 10, 10, 10);
    const pts = [...a.pts, ...b.pts.filter((p) => p.id !== 'ba')];
    const lns = [...a.lns, ...b.lns.map((l) => ({ ...l, p1: l.p1 === 'ba' ? 'ac' : l.p1, p2: l.p2 === 'ba' ? 'ac' : l.p2 }))];
    const { loops } = traceLoops(pts, lns, []);
    expect(loops).toHaveLength(2);
  });

  it('reports a clear error with nothing closed', () => {
    expect(traceLoops([P('a', 0, 0), P('b', 1, 0)], [{ id: '1', p1: 'a', p2: 'b' }], []).error).toMatch(/No closed profile/);
  });
});

describe('loop helpers', () => {
  const path = { kind: 'path' as const, start: [0, 0] as [number, number], segments: [
    { kind: 'line' as const, end: [10, 0] as [number, number] },
    { kind: 'arc' as const, mid: [15, 5] as [number, number], end: [10, 10] as [number, number] },
    { kind: 'line' as const, end: [0, 0] as [number, number] },
  ] };
  it('samples an arc segment through its midpoint', () => {
    const pts = loopOutline(path, 8);
    expect(pts.some(([x, y]) => Math.abs(x - 15) < 1e-9 && Math.abs(y - 5) < 1e-9)).toBe(true);
  });
  it('mirrors and positions paths', () => {
    const m = mirrorLoop(path, 'Y');
    const mm = m.kind === 'path' && m.segments[1].kind === 'arc' ? m.segments[1].mid : [NaN, NaN];
    expect(mm[0]).toBeCloseTo(-15); expect(mm[1]).toBeCloseTo(5);
    const p = positionLoop(path, 100, 0, 90);
    expect(p.kind === 'path' ? p.segments[0].end[0] : NaN).toBeCloseTo(100);
    expect(p.kind === 'path' ? p.segments[0].end[1] : NaN).toBeCloseTo(10);
  });
});
