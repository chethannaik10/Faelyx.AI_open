import { describe, expect, it } from 'vitest';
import {
  biTangentLine, biTangentSampled, bisectingLine, intersectTargets, triTangentGeneral,
  sampleArc, sampleSegment, samplesInsideRect, samplesTouchRect, samplesTouchStroke,
} from '../../src/sketchGeometry2d';

describe('Bi-Tangent Line', () => {
  it('picks the external tangent on the clicked side', () => {
    const bt = biTangentLine({ x: 0, y: 0, r: 10 }, { x: 100, y: 0, r: 10 }, { x: 0, y: -12 }, { x: 100, y: -12 })!;
    expect(bt.t1.y).toBeCloseTo(-10); expect(bt.t2.y).toBeCloseTo(-10);
  });
  it('picks the internal (crossing) tangent when clicked on opposite sides', () => {
    const { t1, t2 } = biTangentLine({ x: 0, y: 0, r: 10 }, { x: 100, y: 0, r: 10 }, { x: 0, y: -12 }, { x: 100, y: 12 })!;
    const nx = -(t2.y - t1.y), ny = t2.x - t1.x, l = Math.hypot(nx, ny);
    expect(Math.abs((0 - t1.x) * nx + (0 - t1.y) * ny) / l).toBeCloseTo(10);
    expect(Math.abs((100 - t1.x) * nx + (0 - t1.y) * ny) / l).toBeCloseTo(10);
  });
  it('works on sampled curves (ellipse-like)', () => {
    const ell = (cx: number) => Array.from({ length: 721 }, (_, i) => { const a = (i / 720) * 2 * Math.PI; return { x: cx + 20 * Math.cos(a), y: 10 * Math.sin(a) }; });
    const res = biTangentSampled(ell(0), ell(100), { x: 0, y: -11 }, { x: 100, y: -11 })!;
    expect(res.t1.y).toBeCloseTo(-10, 1); expect(res.t2.y).toBeCloseTo(-10, 1);
  });
});

describe('Bisecting Line', () => {
  it('bisects the clicked angle', () => {
    const bs = bisectingLine({ x: -50, y: 0 }, { x: 50, y: 0 }, { x: 0, y: -50 }, { x: 0, y: 50 }, { x: 30, y: 0 }, { x: 0, y: -30 })!;
    expect(bs.dir.x).toBeCloseTo(Math.SQRT1_2); expect(bs.dir.y).toBeCloseTo(-Math.SQRT1_2);
  });
  it('gives the midway line for parallel lines', () => {
    const bs = bisectingLine({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 20 }, { x: 10, y: 20 }, { x: 1, y: 0 }, { x: 1, y: 20 })!;
    expect(bs.p.y).toBeCloseTo(10);
  });
});

describe('Intersection Point', () => {
  it('finds line/circle and circle/circle crossings', () => {
    expect(intersectTargets({ kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { kind: 'circle', cx: 5, cy: 0, r: 3 })).toHaveLength(2);
    const cc = intersectTargets({ kind: 'circle', cx: 0, cy: 0, r: 5 }, { kind: 'circle', cx: 8, cy: 0, r: 5 });
    expect(cc).toHaveLength(2); expect(cc[0].x).toBeCloseTo(4);
  });
  it('finds crossings with a sampled curve', () => {
    const pts = sampleArc(0, 0, 10, 0, 360, 360);
    expect(intersectTargets({ kind: 'poly', pts }, { kind: 'line', a: { x: -20, y: 0 }, b: { x: 20, y: 0 } })).toHaveLength(2);
  });
});

describe('Tri-Tangent Circle', () => {
  it('handles two lines and a circle', () => {
    const tt = triTangentGeneral(
      [{ kind: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, { kind: 'line', a: { x: 0, y: 0 }, b: { x: 0, y: 100 } }, { kind: 'circle', cx: 40, cy: 40, r: 5 }],
      [{ x: 15, y: 0 }, { x: 0, y: 15 }, { x: 36, y: 36 }],
    )!;
    expect(tt.x).toBeCloseTo(tt.r, 3); expect(tt.y).toBeCloseTo(tt.r, 3);
    expect(Math.hypot(tt.x - 40, tt.y - 40)).toBeCloseTo(5 + tt.r, 3);
  });
});

describe('Select traps', () => {
  const seg = sampleSegment({ x: -10, y: 5 }, { x: 20, y: 5 });
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  it('tells crossing from fully inside', () => {
    expect(samplesTouchRect(seg, box)).toBe(true);
    expect(samplesInsideRect(seg, box)).toBe(false);
  });
  it('paint stroke catches a crossed segment', () => {
    expect(samplesTouchStroke(sampleSegment({ x: 0, y: 0 }, { x: 10, y: 0 }), [{ x: 5, y: -5 }, { x: 5, y: 5 }], 1)).toBe(true);
  });
});
