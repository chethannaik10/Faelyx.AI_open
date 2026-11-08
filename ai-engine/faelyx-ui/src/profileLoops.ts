// profileLoops.ts
//
// The translation step between "a sketch, as the user clicked it out" and
// "a boundary build123d can extrude" (cad_server.py's /build_part), plus
// the small helpers every consumer of those boundaries needs (the 3D
// preview outline, Mirror Feature). Pure functions over plain data, so it
// can be unit-tested without the SketchWorkspace component.

type P = { id: string; x: number; y: number };
type L = { id: string; p1: string; p2: string; style?: string };
type C = { id: string; center: string; r: number };
type A = { id: string; center: string; r: number; start: number; end: number; p1?: string; p2?: string };

export type PathSegment =
  | { kind: 'line'; end: [number, number] }
  | { kind: 'arc'; mid: [number, number]; end: [number, number] };

// What a Pad or Pocket feature actually extrudes: a sketch's closed
// boundaries resolved to plain numbers. A sketch with an outer rectangle
// plus two small circles produces 3 loops; the backend decides which is
// the outer boundary and which are holes by area, so this only describes
// *shape*, never nesting. A boundary made only of straight lines stays a
// `polygon`; one that includes arcs (a Profile with tangent arcs, a slot,
// a filleted corner) is a `path` of line and arc segments.
export type ProfileLoop =
  | { kind: 'polygon'; points: [number, number][] }
  | { kind: 'circle'; center: [number, number]; r: number }
  | { kind: 'path'; start: [number, number]; segments: PathSegment[] };

const sweepOf = (arc: A) => (((arc.end - arc.start) % 360) + 360) % 360 || 360;

type XY = { x: number; y: number };
// A traversable edge of the sketch's planar arrangement, in profile space
// (x, -y). Lines are straight; an arc edge runs from `a` to `b` along its
// sweep (`ccw` in profile space) around `c` with radius `r`.
type GEdge = { a: number; b: number; arc?: { c: XY; r: number; mid: XY } };

const EPS = 1e-6;

// Traces the sketch into the closed boundaries a Pad/Pocket extrudes.
//
// Built as a planar arrangement rather than by walking points with exactly
// two neighbours, so real sketches work: lines that end in the middle of
// another line (a T-junction) or cross it are split there, points drawn
// on top of each other are merged, dangling edges are ignored, and a shape
// subdivided by internal lines extrudes as its outer boundary. Each
// connected shape contributes its outer boundary; separate shapes (holes,
// islands, side-by-side parts) come back as separate loops, and the
// backend decides what is a hole by containment. Circles are always their
// own loops. Construction/infinite lines are reference-only.
//
// Y is negated going out: the canvas is an SVG (Y down) but build123d's
// sketch plane is Y-up.
export function traceLoops(pts: P[], lns: L[], circs: C[], arcs: A[] = []): { loops: ProfileLoop[]; error?: string } {
  const byId = new Map(pts.map((p) => [p.id, p]));
  const loops: ProfileLoop[] = [];
  const out = (x: number, y: number): [number, number] => [x, -y];

  for (const c of circs) {
    const center = byId.get(c.center);
    if (center) loops.push({ kind: 'circle', center: out(center.x, center.y), r: c.r });
  }

  // --- nodes (profile space), merged by position ---
  const nodes: XY[] = [];
  const nodeAt = (x: number, y: number) => {
    for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - x, nodes[i].y - y) < 1e-6) return i;
    nodes.push({ x, y });
    return nodes.length - 1;
  };
  const nodeOf = (id: string) => { const p = byId.get(id)!; return nodeAt(p.x, -p.y); };

  // --- straight segments, then split at every touch/crossing ---
  const segs: [number, number][] = [];
  for (const l of lns) {
    if (l.style || !byId.has(l.p1) || !byId.has(l.p2)) continue;
    const a = nodeOf(l.p1), b = nodeOf(l.p2);
    if (a !== b) segs.push([a, b]);
  }
  const arcEdges: GEdge[] = [];
  for (const arc of arcs) {
    if (!arc.p1 || !arc.p2 || arc.p1 === arc.p2 || !byId.has(arc.p1) || !byId.has(arc.p2) || !byId.has(arc.center)) continue;
    const c = byId.get(arc.center)!;
    const ang = ((arc.start + sweepOf(arc) / 2) * Math.PI) / 180;
    // SVG sweeps increasing-angle (clockwise on screen); in profile space
    // (y negated) that runs clockwise too, from p1 to p2.
    const a = nodeOf(arc.p1), b = nodeOf(arc.p2);
    if (a !== b) arcEdges.push({ a, b, arc: { c: { x: c.x, y: -c.y }, r: arc.r, mid: { x: c.x + arc.r * Math.cos(ang), y: -(c.y + arc.r * Math.sin(ang)) } } });
  }
  const cuts: number[][] = segs.map(() => []);
  const param = (s: [number, number], p: XY) => {
    const A = nodes[s[0]], B = nodes[s[1]];
    const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
    return ((p.x - A.x) * dx + (p.y - A.y) * dy) / l2;
  };
  const onInterior = (s: [number, number], n: number) => {
    if (n === s[0] || n === s[1]) return false;
    const A = nodes[s[0]], B = nodes[s[1]], P = nodes[n];
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    const t = param(s, P);
    return t > EPS && t < 1 - EPS && Math.abs((dx * (P.y - A.y) - dy * (P.x - A.x)) / L) < 1e-6;
  };
  for (let i = 0; i < segs.length; i++) {
    // Any node (an endpoint of any line or arc) lying on this segment.
    const endpointNodes = new Set<number>([...segs.flat(), ...arcEdges.flatMap((e) => [e.a, e.b])]);
    for (const n of endpointNodes) if (onInterior(segs[i], n)) cuts[i].push(n);
    for (let j = i + 1; j < segs.length; j++) {
      const A = nodes[segs[i][0]], B = nodes[segs[i][1]], C2 = nodes[segs[j][0]], D = nodes[segs[j][1]];
      const r = { x: B.x - A.x, y: B.y - A.y }, q = { x: D.x - C2.x, y: D.y - C2.y };
      const den = r.x * q.y - r.y * q.x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((C2.x - A.x) * q.y - (C2.y - A.y) * q.x) / den;
      const u = ((C2.x - A.x) * r.y - (C2.y - A.y) * r.x) / den;
      if (t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS) {
        const n = nodeAt(A.x + r.x * t, A.y + r.y * t);
        cuts[i].push(n); cuts[j].push(n);
      }
    }
  }
  const edges: GEdge[] = [...arcEdges];
  segs.forEach((s, i) => {
    const chain = [s[0], ...[...new Set(cuts[i])].sort((m, n) => param(s, nodes[m]) - param(s, nodes[n])), s[1]];
    for (let k = 1; k < chain.length; k++) if (chain[k] !== chain[k - 1]) edges.push({ a: chain[k - 1], b: chain[k] });
  });
  // Drop duplicate straight edges (a line drawn twice).
  const seen = new Set<string>();
  const uniq = edges.filter((e) => {
    if (e.arc) return true;
    const key = e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  // --- prune dangling edges (open ends can't bound anything) ---
  const live = uniq.map(() => true);
  for (let changed = true; changed;) {
    changed = false;
    const deg = new Map<number, number>();
    uniq.forEach((e, i) => { if (live[i]) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); } });
    uniq.forEach((e, i) => { if (live[i] && ((deg.get(e.a) ?? 0) < 2 || (deg.get(e.b) ?? 0) < 2)) { live[i] = false; changed = true; } });
  }
  const E = uniq.filter((_, i) => live[i]);

  // --- half-edges, ordered around each node by leaving direction ---
  type Half = { from: number; to: number; edge: number; dir: number };
  const halves: Half[] = [];
  const leaving = (e: GEdge, from: number) => {
    const to = from === e.a ? e.b : e.a;
    if (!e.arc) return Math.atan2(nodes[to].y - nodes[from].y, nodes[to].x - nodes[from].x);
    // An arc leaves along its tangent, turned toward the arc's midpoint.
    const P = nodes[from], c = e.arc.c;
    const t1 = { x: -(P.y - c.y), y: P.x - c.x };
    const toMid = { x: e.arc.mid.x - P.x, y: e.arc.mid.y - P.y };
    const s = t1.x * toMid.x + t1.y * toMid.y >= 0 ? 1 : -1;
    return Math.atan2(t1.y * s, t1.x * s);
  };
  E.forEach((e, i) => {
    halves.push({ from: e.a, to: e.b, edge: i, dir: leaving(e, e.a) });
    halves.push({ from: e.b, to: e.a, edge: i, dir: leaving(e, e.b) });
  });
  const around = new Map<number, number[]>();
  halves.forEach((h, i) => (around.get(h.from) ?? around.set(h.from, []).get(h.from)!).push(i));
  for (const list of around.values()) list.sort((m, n) => halves[m].dir - halves[n].dir);
  const twin = (i: number) => (i % 2 === 0 ? i + 1 : i - 1);

  // --- connected components (union-find over nodes) ---
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  E.forEach((e) => { parent[find(e.a)] = find(e.b); });

  // --- trace every face: arrive at v, leave by the next edge clockwise ---
  const used = new Set<number>();
  const faces: { comp: number; hs: number[]; area: number }[] = [];
  const sample = (h: Half): XY[] => {
    const e = E[h.edge];
    if (!e.arc) return [nodes[h.to]];
    return [e.arc.mid, nodes[h.to]];
  };
  for (let start = 0; start < halves.length; start++) {
    if (used.has(start)) continue;
    const hs: number[] = [];
    let h = start;
    while (!used.has(h)) {
      used.add(h); hs.push(h);
      const list = around.get(halves[h].to)!;
      const back = twin(h);
      const k = list.indexOf(back);
      h = list[(k - 1 + list.length) % list.length];
    }
    const poly = [nodes[halves[hs[0]].from], ...hs.flatMap((i) => sample(halves[i]))];
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p.x * q.y - q.x * p.y; }
    faces.push({ comp: find(halves[hs[0]].from), hs, area: area / 2 });
  }

  // The outer boundary of each shape is its largest face.
  const outer = new Map<number, { hs: number[]; area: number }>();
  for (const f of faces) {
    const cur = outer.get(f.comp);
    if (!cur || Math.abs(f.area) > Math.abs(cur.area) + 1e-9) outer.set(f.comp, f);
  }

  for (const f of outer.values()) {
    // A boundary that touches itself (two shapes meeting at one point) is
    // split into simple loops there.
    const pieces: number[][] = [];
    const stack: number[] = [];
    const posOf = new Map<number, number>();
    for (const hi of f.hs) {
      const from = halves[hi].from;
      if (posOf.has(from)) {
        const at = posOf.get(from)!;
        const loop = stack.splice(at);
        for (const x of loop) posOf.delete(halves[x].from);
        pieces.push(loop);
      }
      posOf.set(from, stack.length);
      stack.push(hi);
    }
    if (stack.length) pieces.push(stack);
    for (const hs of pieces) {
      if (hs.length < 2) continue;
      const start = nodes[halves[hs[0]].from];
      if (hs.every((i) => !E[halves[i].edge].arc)) {
        if (hs.length >= 3) loops.push({ kind: 'polygon', points: hs.map((i) => [nodes[halves[i].from].x, nodes[halves[i].from].y] as [number, number]) });
        continue;
      }
      loops.push({
        kind: 'path',
        start: [start.x, start.y],
        segments: hs.map((i): PathSegment => {
          const e = E[halves[i].edge], to = nodes[halves[i].to];
          return e.arc ? { kind: 'arc', mid: [e.arc.mid.x, e.arc.mid.y], end: [to.x, to.y] } : { kind: 'line', end: [to.x, to.y] };
        }),
      });
    }
  }

  if (loops.length === 0) {
    return { loops, error: 'No closed profile found — sketch a closed loop (a rectangle, a circle, or a closed profile of lines and arcs) before extruding.' };
  }
  return { loops };
}

// Circle through three points (for sampling an arc segment).
function circleThrough(a: [number, number], b: [number, number], c: [number, number]) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const s = (p: [number, number]) => p[0] * p[0] + p[1] * p[1];
  const x = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d;
  const y = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d;
  return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
}

// A closed outline of any loop as plain points (circles and arcs sampled),
// for drawing it — e.g. the live sketch outline in the 3D view.
export function loopOutline(loop: ProfileLoop, arcSteps = 24): [number, number][] {
  if (loop.kind === 'circle') {
    return Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return [loop.center[0] + Math.cos(a) * loop.r, loop.center[1] + Math.sin(a) * loop.r] as [number, number];
    });
  }
  if (loop.kind === 'polygon') return [...loop.points, loop.points[0]];
  const ptsOut: [number, number][] = [loop.start];
  let cur = loop.start;
  for (const seg of loop.segments) {
    if (seg.kind === 'arc') {
      const c = circleThrough(cur, seg.mid, seg.end);
      if (c) {
        const ang = (p: [number, number]) => Math.atan2(p[1] - c.y, p[0] - c.x);
        const a0 = ang(cur), am = ang(seg.mid), a1 = ang(seg.end);
        const norm = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        // Sweep in whichever direction passes through the midpoint.
        const ccw = norm(am - a0) < norm(a1 - a0);
        const sweep = ccw ? norm(a1 - a0) : -norm(a0 - a1);
        for (let i = 1; i <= arcSteps; i++) {
          const t = a0 + (sweep * i) / arcSteps;
          ptsOut.push([c.x + c.r * Math.cos(t), c.y + c.r * Math.sin(t)]);
        }
      } else ptsOut.push(seg.end);
    } else ptsOut.push(seg.end);
    cur = seg.end;
  }
  return ptsOut;
}

// Mirror Feature: reflects a loop across the sketch plane's X or Y axis.
export function mirrorLoop(loop: ProfileLoop, axis: 'X' | 'Y'): ProfileLoop {
  const m = ([x, y]: [number, number]): [number, number] => (axis === 'X' ? [x, -y] : [-x, y]);
  if (loop.kind === 'circle') return { kind: 'circle', center: m(loop.center), r: loop.r };
  if (loop.kind === 'polygon') return { kind: 'polygon', points: loop.points.map(m) };
  return {
    kind: 'path',
    start: m(loop.start),
    segments: loop.segments.map((s) => (s.kind === 'arc' ? { kind: 'arc', mid: m(s.mid), end: m(s.end) } : { kind: 'line', end: m(s.end) })),
  };
}

// Moves a loop from sketch-local coordinates onto the plane when the
// sketch has a Sketch Positioning (absolute axis) origin/rotation.
export function positionLoop(loop: ProfileLoop, originX: number, originY: number, angleDeg: number): ProfileLoop {
  if (!originX && !originY && !angleDeg) return loop;
  const a = (angleDeg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const t = ([x, y]: [number, number]): [number, number] => [originX + x * cos - y * sin, originY + x * sin + y * cos];
  if (loop.kind === 'circle') return { kind: 'circle', center: t(loop.center), r: loop.r };
  if (loop.kind === 'polygon') return { kind: 'polygon', points: loop.points.map(t) };
  return {
    kind: 'path',
    start: t(loop.start),
    segments: loop.segments.map((s) => (s.kind === 'arc' ? { kind: 'arc', mid: t(s.mid), end: t(s.end) } : { kind: 'line', end: t(s.end) })),
  };
}
