"""Sandbox helpers injected into every LLM-generated script.
All functions return a build123d Part. Units: mm. Z is up.

Add new gear types here, one function per type, then advertise them in
ai-server/prompts.py. The LLM picks from the menu — no routing logic.
"""
import math


def _spur_tooth_pts(teeth, module, pressure_angle=20):
    z = int(teeth)
    m = float(module)
    alpha = math.radians(float(pressure_angle))
    if z < 6:
        raise ValueError(f"gear needs >= 6 teeth, got {z}")
    r_p = m * z / 2.0
    r_a = r_p + m
    r_f = r_p - 1.25 * m
    r_b = r_p * math.cos(alpha)
    if r_f <= 0:
        raise ValueError(f"root radius {r_f:.2f}mm is non-positive")
    def inv(a):
        return math.tan(a) - a
    theta_p = math.pi / (2.0 * z)
    theta_b = theta_p + inv(alpha)
    theta_tip = theta_p + inv(alpha) - inv(math.acos(min(1.0, r_b / r_a)))
    if theta_tip <= 0:
        raise ValueError("tooth profile inverted at tip")
    steps = 10
    r_vals = [r_b + (r_a - r_b) * k / steps for k in range(steps + 1)]
    theta_at = []
    for r in r_vals:
        if r <= r_b + 1e-9:
            theta_at.append(theta_b)
        else:
            ar = math.acos(min(1.0, r_b / r))
            theta_at.append(theta_p + inv(alpha) - inv(ar))
    def polar(r, a):
        return (r * math.cos(a), r * math.sin(a))
    pts = [(r_f * math.cos(-theta_b), r_f * math.sin(-theta_b))]
    pts.append((r_b * math.cos(-theta_b), r_b * math.sin(-theta_b)))
    for k in range(1, steps + 1):
        pts.append(polar(r_vals[k], -theta_at[k]))
    for k in range(1, 5):
        a = -theta_tip + 2 * theta_tip * k / 4
        pts.append(polar(r_a, a))
    for k in range(steps - 1, -1, -1):
        pts.append(polar(r_vals[k], theta_at[k]))
    pts.append((r_f * math.cos(theta_b), r_f * math.sin(theta_b)))
    return pts, r_p, r_a, r_f, r_b, theta_b


def _spur_full_pts(teeth, module, pressure_angle=20):
    z = int(teeth)
    one_tooth, r_p, r_a, r_f, r_b, theta_b = _spur_tooth_pts(teeth, module, pressure_angle)
    root_sweep = 2 * math.pi / z - 2 * theta_b
    one_full = list(one_tooth)
    for k in range(1, 6):
        a = theta_b + root_sweep * k / 6
        one_full.append((r_f * math.cos(a), r_f * math.sin(a)))
    all_pts = []
    for i in range(z):
        rot = 2 * math.pi * i / z
        cos_r, sin_r = math.cos(rot), math.sin(rot)
        for (x, y) in one_full:
            all_pts.append((x * cos_r - y * sin_r, x * sin_r + y * cos_r))
    return all_pts, r_p, r_a, r_f


def spur_gear(teeth, module, thickness, bore=0, pressure_angle=20):
    """Standard involute spur gear, centered at origin, z from 0 to thickness."""
    from build123d import (BuildPart, BuildSketch, BuildLine, Polyline, make_face,
                           extrude, Cylinder, Locations, Mode)
    t = float(thickness)
    b = float(bore) if bore else 0.0
    all_pts, r_p, r_a, r_f = _spur_full_pts(teeth, module, pressure_angle)
    with BuildPart() as bp:
        with BuildSketch():
            with BuildLine():
                Polyline(all_pts, close=True)
            make_face()
        extrude(amount=t)
        if b > 0:
            with Locations((0, 0, t / 2)):
                Cylinder(b / 2.0, t + 2, mode=Mode.SUBTRACT)
    return bp.part


def helical_gear(teeth, module, thickness, helix_angle, hand="right",
                 bore=0, pressure_angle=20):
    """Helical gear. `module` is NORMAL module. Twist applied along Z."""
    from build123d import (BuildPart, BuildSketch, BuildLine, Polyline, make_face,
                           loft, Cylinder, Locations, Mode, Plane)
    t = float(thickness)
    b = float(bore) if bore else 0.0
    beta = math.radians(float(helix_angle))
    if abs(beta) < 1e-6 or abs(beta) > math.radians(45):
        raise ValueError("helix_angle must be between 0.1 and 45 degrees")
    m_n = float(module)
    m_t = m_n / math.cos(beta)
    all_pts, r_p, r_a, r_f = _spur_full_pts(teeth, m_t, pressure_angle)
    total_twist = math.tan(beta) / (m_t * int(teeth) / 2) * t
    if hand == "left":
        total_twist = -total_twist
    # Guard against self-intersection (half a tooth pitch is the limit)
    max_twist = math.pi / int(teeth) * 0.9
    if abs(total_twist) > max_twist:
        raise ValueError(
            f"helix too steep for {teeth} teeth at {thickness}mm thickness "
            f"(total twist {math.degrees(abs(total_twist)):.1f}deg > "
            f"{math.degrees(max_twist):.1f}deg safe limit)"
        )
    sections = 20
    with BuildPart() as bp:
        for i in range(sections + 1):
            frac = i / sections
            z_pos = t * frac
            rot = total_twist * frac
            cos_r, sin_r = math.cos(rot), math.sin(rot)
            rotated = [(x * cos_r - y * sin_r, x * sin_r + y * cos_r) for (x, y) in all_pts]
            with BuildSketch(Plane.XY.offset(z_pos)):
                with BuildLine():
                    Polyline(rotated, close=True)
                make_face()
        loft()
        if b > 0:
            with Locations((0, 0, t / 2)):
                Cylinder(b / 2.0, t + 2, mode=Mode.SUBTRACT)
    return bp.part


def internal_gear(teeth, module, thickness, rim_wall=None, pressure_angle=20):
    """Internal (annular) gear: teeth point INWARD from an outer ring.
    Trapezoidal approximation for flanks — geometrically valid, not true involute."""
    from build123d import (BuildPart, BuildSketch, BuildLine, Polyline, make_face,
                           Circle, extrude, Cylinder, Locations, Mode)
    z = int(teeth)
    t = float(thickness)
    m = float(module)
    if z < 10:
        raise ValueError("internal gear needs >= 10 teeth")
    r_p = m * z / 2.0
    r_ti = r_p - m
    r_ro = r_p + 1.25 * m
    if rim_wall is None:
        rim_wall = 2.0 * m
    r_outer = r_ro + float(rim_wall)
    half_root = math.pi / (2 * z) * 0.95
    half_tip = half_root * 0.55
    overlap = 0.5 * m
    with BuildPart() as bp:
        with BuildSketch():
            Circle(r_outer)
        extrude(amount=t)
        with Locations((0, 0, t / 2)):
            Cylinder(r_ro, t + 2, mode=Mode.SUBTRACT)
        for i in range(z):
            c = 2 * math.pi * i / z
            p1 = ((r_ro + overlap) * math.cos(c - half_root), (r_ro + overlap) * math.sin(c - half_root))
            p2 = ((r_ro + overlap) * math.cos(c + half_root), (r_ro + overlap) * math.sin(c + half_root))
            p3 = (r_ti * math.cos(c + half_tip), r_ti * math.sin(c + half_tip))
            p4 = (r_ti * math.cos(c - half_tip), r_ti * math.sin(c - half_tip))
            with BuildSketch():
                with BuildLine():
                    Polyline([p1, p2, p3, p4, p1])
                make_face()
            extrude(amount=t, mode=Mode.ADD)
    return bp.part


def bevel_gear(teeth, module, thickness, bore=0, pressure_angle=20, cone_scale=0.45):
    """Simplified straight bevel gear: tapered spur profile (loft).
    Visually recognizable, 3D-printable. Not true involute-on-cone."""
    from build123d import (BuildPart, BuildSketch, BuildLine, Polyline, make_face,
                           loft, Cylinder, Locations, Mode, Plane)
    t = float(thickness)
    b = float(bore) if bore else 0.0
    if cone_scale <= 0.1 or cone_scale >= 0.95:
        raise ValueError("cone_scale must be between 0.1 and 0.95")
    all_pts, r_p, r_a, r_f = _spur_full_pts(teeth, module, pressure_angle)
    scaled = [(x * cone_scale, y * cone_scale) for (x, y) in all_pts]
    with BuildPart() as bp:
        with BuildSketch(Plane.XY.offset(0)):
            with BuildLine():
                Polyline(all_pts, close=True)
            make_face()
        with BuildSketch(Plane.XY.offset(t)):
            with BuildLine():
                Polyline(scaled, close=True)
            make_face()
        loft()
        if b > 0:
            with Locations((0, 0, t / 2)):
                Cylinder(b / 2.0, t + 2, mode=Mode.SUBTRACT)
    return bp.part


def rack(teeth, module, height=None, width=None, pressure_angle=20):
    """Linear rack gear. Length = teeth * pi * module. Built in XZ, extruded along Y."""
    from build123d import (BuildPart, BuildSketch, BuildLine, Polyline, make_face,
                           extrude, Plane)
    m = float(module)
    n = int(teeth)
    pitch = math.pi * m
    L = n * pitch
    if height is None:
        height = 2.25 * m + 2.0 * m
    H = float(height)
    if width is None:
        width = 2.0 * m
    W = float(width)
    alpha = math.radians(float(pressure_angle))
    top_y = H
    root_y = H - (m + 1.25 * m)
    tooth_tip = pitch / 2 - 2 * m * math.tan(alpha)
    tooth_root = pitch / 2 + 2 * 1.25 * m * math.tan(alpha)
    if tooth_tip <= 0:
        raise ValueError("tooth tip width <= 0; reduce module or pressure angle")
    if tooth_root > pitch:
        raise ValueError("tooth root width > pitch; reduce module or increase pressure angle")
    pts = [(0, 0), (L, 0), (L, root_y)]
    for i in range(n - 1, -1, -1):
        c = pitch * (i + 0.5)
        pts.append((c + tooth_root / 2, root_y))
        pts.append((c + tooth_tip / 2, top_y))
        pts.append((c - tooth_tip / 2, top_y))
        pts.append((c - tooth_root / 2, root_y))
    pts.append((0, root_y))
    with BuildPart() as bp:
        with BuildSketch(Plane.XZ):
            with BuildLine():
                Polyline(pts, close=True)
            make_face()
        extrude(amount=W)
    return bp.part
