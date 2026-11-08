// Sampling of the free-form sketch curves (ellipse, parabola, hyperbola,
// conics, splines) into polylines for drawing and hit-testing. The solver
// mirrors these formulas in cad-server/sketch_curves.py.

// Samples a full ellipse (center/radii/rotation) into a closed loop of
// {x,y} points — used directly by the Ellipse tool, and by the Conic
// tool once it's fitted a bounded (ellipse-type) conic through 5 points.
// `startDeg`/`endDeg` (in the ellipse's own local pre-rotation parametric
// angle, degrees) are optional: omitted means the original full 0-360
// closed loop (every pre-existing call site/ellipse is unaffected), given
// means a Partial Ellipse / Elliptical Arc — an open sweep from start to
// end, wrapping through 360 the same way Arc's own start/end does.
export function sampleEllipse(cx: number, cy: number, rx: number, ry: number, rotRad: number, n = 56, startDeg?: number, endDeg?: number) {
  const pts: { x: number; y: number }[] = [];
  const a0 = startDeg ?? 0;
  const a1 = startDeg === undefined || endDeg === undefined ? 360 : (endDeg > startDeg ? endDeg : endDeg + 360);
  for (let i = 0; i <= n; i++) {
    const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    const x0 = rx * Math.cos(t), y0 = ry * Math.sin(t);
    pts.push({ x: cx + x0 * Math.cos(rotRad) - y0 * Math.sin(rotRad), y: cy + x0 * Math.sin(rotRad) + y0 * Math.cos(rotRad) });
  }
  return pts;
}

// Parabola by Focus — standard t²=4ps parametrization in the local frame
// (s along the vertex→focus axis, t perpendicular). `span` is the ± extent
// along t to draw — set once from the 3rd (extent) click at creation time,
// then a plain editable number afterwards (see the Inspector's Span field),
// same as Arc's radius/start/end.
export function sampleParabola(focus: { x: number; y: number }, vertex: { x: number; y: number }, span: number, n = 48) {
  const dx = focus.x - vertex.x, dy = focus.y - vertex.y;
  const p = Math.hypot(dx, dy);
  if (p < 1e-3) return [];
  const ux = dx / p, uy = dy / p, nx = -uy, ny = ux;
  const T = Math.max(5, span);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -T + (2 * T * i) / n;
    const s = (t * t) / (4 * p);
    pts.push({ x: vertex.x + ux * s + nx * t, y: vertex.y + uy * s + ny * t });
  }
  return pts;
}

// Hyperbola by Focus — the branch nearer the picked focus, via the
// standard x=a·cosh(t), y=b·sinh(t) parametrization in the center/focus
// axis frame (c = center→focus distance, a = center→vertex distance,
// b = √(c²−a²)).
export function sampleHyperbola(center: { x: number; y: number }, focus: { x: number; y: number }, vertex: { x: number; y: number }, n = 48) {
  const cx = focus.x - center.x, cy = focus.y - center.y;
  const c = Math.hypot(cx, cy);
  if (c < 1e-3) return [];
  const ux = cx / c, uy = cy / c, nx = -uy, ny = ux;
  const a = Math.min(c - 0.5, Math.max(0.5, Math.hypot(vertex.x - center.x, vertex.y - center.y)));
  const b = Math.sqrt(Math.max(0.01, c * c - a * a));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -1.4 + (2.8 * i) / n;
    const xs = a * Math.cosh(t), ys = b * Math.sinh(t);
    pts.push({ x: center.x + ux * xs + nx * ys, y: center.y + uy * xs + ny * ys });
  }
  return pts;
}

// Conic (general, through 5 points) — fits Ax²+Bxy+Cy²+Dx+Ey=1 by solving
// the 5×5 linear system those 5 clicks pin down, then classifies it via
// the usual discriminant B²−4AC. A bounded (ellipse-type, disc<0) fit is
// sampled exactly via its center/rotation/semi-axes; an unbounded
// parabola/hyperbola fit — or a degenerate one — falls back to a smooth
// Catmull-Rom curve through the 5 raw points instead, since rendering a
// true unbounded conic branch from 5 clicks needs more scaffolding than
// this phase-1 pass budgets for.
export function fitConic5(pts: { x: number; y: number }[]) {
  const M = pts.map((p) => [p.x * p.x, p.x * p.y, p.y * p.y, p.x, p.y]);
  const n = 5;
  const A = M.map((row) => [...row, 1]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    if (Math.abs(A[col][col]) < 1e-9) return null;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c2 = col; c2 <= n; c2++) A[r][c2] -= f * A[col][c2];
    }
  }
  const [a, b, c, d, e] = A.map((row, i) => row[n] / row[i]);
  return { A: a, B: b, C: c, D: d, E: e };
}

export function sampleConicFrom5Points(pts5: { x: number; y: number }[], n = 56) {
  const fit = fitConic5(pts5);
  if (fit) {
    const { A, B, C, D, E } = fit;
    const disc = B * B - 4 * A * C;
    const det = 2 * A * (2 * C) - B * B;
    if (disc < -1e-9 && Math.abs(det) > 1e-9) {
      const cx = (B * E - 2 * C * D) / det;
      const cy = (B * D - 2 * A * E) / det;
      const K = A * cx * cx + B * cx * cy + C * cy * cy + D * cx + E * cy - 1;
      const lambda1 = (A + C) / 2 + Math.sqrt(((A - C) / 2) ** 2 + (B / 2) ** 2);
      const lambda2 = (A + C) / 2 - Math.sqrt(((A - C) / 2) ** 2 + (B / 2) ** 2);
      const theta = 0.5 * Math.atan2(B, A - C);
      const rx = Math.sqrt(Math.abs(-K / lambda1)), ry = Math.sqrt(Math.abs(-K / lambda2));
      if (Number.isFinite(rx) && Number.isFinite(ry) && rx > 1e-3 && ry > 1e-3) return sampleEllipse(cx, cy, rx, ry, theta, n);
    }
  }
  return catmullRom(pts5, Math.ceil(n / 5));
}

// Spline / Connect Curves — a standard centripetal-adjacent Catmull-Rom
// spline through however many control points were clicked, clamping the
// virtual points before the first / after the last so the curve still
// passes cleanly through its own endpoints.
export function catmullRom(pts: { x: number; y: number }[], samplesPerSeg = 12) {
  if (pts.length < 2) return pts;
  const get = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Control-Vertex (CV) Spline — a clamped uniform cubic B-spline: unlike
// the interpolating Spline above (catmullRom, which passes through every
// clicked point), the curve is only *guided by* its control polygon,
// touching exactly the first and last control point (each tripled — the
// standard clamping trick for a cubic B-spline) and pulled toward, but not
// through, every point in between. This is the actual definition of a
// CV/B-spline vs. an interpolation spline.
export function sampleCvSpline(pts: { x: number; y: number }[], samplesPerSeg = 16) {
  if (pts.length < 2) return pts;
  const last = pts.length - 1;
  const p = [pts[0], pts[0], ...pts, pts[last], pts[last]];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < p.length - 3; i++) {
    const p0 = p[i], p1 = p[i + 1], p2 = p[i + 2], p3 = p[i + 3];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const b0 = ((1 - t) ** 3) / 6;
      const b1 = (3 * t ** 3 - 6 * t * t + 4) / 6;
      const b2 = (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6;
      const b3 = (t ** 3) / 6;
      out.push({ x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x, y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y });
    }
  }
  out.push(pts[last]);
  return out;
}

// General Conic via the classic CAD "shape parameter" (rho) construction:
// a rational quadratic Bezier through p0 (t=0) and p2 (t=1), with `papex`
// the point where the two endpoint tangents meet; rho in (0,1) alone
// decides the conic's type — below 0.5 is ellipse-like, exactly 0.5 is a
// true parabola (the rational weight below becomes 1, i.e. an ordinary
// quadratic Bezier), above 0.5 is hyperbola-like — matching how CATIA's
// own General Conic "Rho" tool behaves, distinct from the file's other
// Conic tool (which fits a conic through 5 points instead).
export function sampleConicRho(p0: { x: number; y: number }, papex: { x: number; y: number }, p2: { x: number; y: number }, rho: number, n = 56) {
  const r = Math.max(0.02, Math.min(0.98, rho));
  const w = r / (1 - r);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const b0 = (1 - t) * (1 - t), b1 = 2 * w * t * (1 - t), b2 = t * t;
    const denom = b0 + b1 + b2;
    pts.push({ x: (b0 * p0.x + b1 * papex.x + b2 * p2.x) / denom, y: (b0 * p0.y + b1 * papex.y + b2 * p2.y) / denom });
  }
  return pts;
}

export function polylineToPathD(pts: { x: number; y: number }[], closed = false) {
  if (pts.length === 0) return '';
  return `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ') + (closed ? ' Z' : '');
}
