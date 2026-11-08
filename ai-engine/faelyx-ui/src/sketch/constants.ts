// Hit-testing and inference tolerances for the sketch canvas (sketch units ≈ mm).

// The three sketch planes' colours — the plane picker here and the primary
// planes drawn in the 3D Design viewport both read these.
export const PLANE_COLORS = { Top: '#3f6fc9', Front: '#6a4bc2', Right: '#8a4fa8' } as const;

export const HIT_TOL = 3.5; // in sketch units (viewBox is 400x300, roughly mm)
// How close (in degrees, off 0°/90°/180°/270°) a line being drawn has to be
// before it's inferred as Horizontal/Vertical — see snapLineToHV below.
// CATIA's own Sketcher uses a similarly small, roughly constant angular
// tolerance (independent of zoom/length) for this same "does this look
// straight" inference, which is what makes it trivial to hit even freehand.
export const HV_SNAP_DEG = 3;
// How close (in sketch units) two points' shared X or Y has to be before a
// new point in progress is inferred to be aligned with one of them — see
// findAlignmentGuide. A bit looser than HIT_TOL (which is for landing
// exactly on top of a point) since this is about "roughly level/plumb with
// something else on the sketch", not a precise coincidence.
export const ALIGN_TOL = HIT_TOL * 1.4;
// How close a new point has to land to an existing line's own span before
// it's snapped onto that line (see findNearestPointOnLine) — deliberately
// more generous than HIT_TOL so grabbing an edge feels as easy as grabbing
// one of its endpoints, matching how forgiving CATIA's own edge-snap is.
export const LINE_SNAP_TOL = HIT_TOL * 1.6;
// How close a new point has to land to an existing line's true geometric
// midpoint before it's offered as its own distinct snap (see
// findLineMidpoint) — checked ahead of the generic "anywhere on the line"
// snap (LINE_SNAP_TOL) below since the midpoint is a specific, meaningful
// point worth calling out on its own, the same way an endpoint is, rather
// than just wherever along the span the cursor happens to land.
export const MIDPOINT_SNAP_TOL = LINE_SNAP_TOL;

// How close (in sketch units at the default zoom; the lookup scales it with the zoom so it feels the same on screen) the cursor has to be to a
// circle, arc, ellipse, spline or other curve, or to a crossing of two entities, before it snaps onto it. See sketch/snapCurves.ts.
export const CURVE_SNAP_TOL = LINE_SNAP_TOL * 1.3;

// Centre snap (0, 0): how close, in screen pixels, the cursor / a dragged point has to be to the plane's origin before it locks onto it, and how far
// out (as a multiple of that) the H / V crosshair guides start to show. The default is overridden by Sketcher options > "Centre snap distance".
export const ORIGIN_SNAP_PX = 10;
export const ORIGIN_GUIDE_FACTOR = 3.2;
