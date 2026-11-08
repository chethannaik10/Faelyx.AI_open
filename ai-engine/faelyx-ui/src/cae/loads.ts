// Applies the user's loads and restraints to the solver models.

import { G_ACC, addForceOnFaces, addPressure, addTorqueOnFaces, newBC, nodeAreas, springFaces, type ElasticModel, type StructBC } from './fem';
import type { Load, LoadType } from './model';
import { faceCenter, type Prep, type V3 } from './prepare';
import { FACE_NORMAL, nNodes, nodeXYZ, type SurfFace } from './voxel';

export interface AppliedInfo { label: string; text: string }
export interface StructLoads {
  bc: StructBC;
  info: AppliedInfo[];
  force: V3;                       // total applied external force (N), excluding reactions
  hasSupport: boolean;
  supportNodes: number;
  mass: number;                    // tonne
  warnings: string[];
}

const norm3 = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function centroid(P: Prep, faces: SurfFace[]): V3 {
  const a = nodeAreas(P.g, faces);
  let sx = 0, sy = 0, sz = 0, w = 0;
  a.forEach((v, nd) => { const [x, y, z] = nodeXYZ(P.g, nd); sx += x * v; sy += y * v; sz += z * v; w += v; });
  return w ? [sx / w, sy / w, sz / w] : [0, 0, 0];
}

export const activeLoads = (P: Prep, types?: LoadType[]) => P.input.loads.filter((l) => l.on && (!types || types.includes(l.type)));

/** Builds the structural boundary conditions. `skip` lets an analysis ignore some load types (e.g. buckling uses force only). */
export function buildStructLoads(P: Prep, model: ElasticModel, o: { skip?: LoadType[]; selfweight?: boolean } = {}): StructLoads {
  const g = P.g, bc = newBC(g), info: AppliedInfo[] = [], warnings: string[] = [];
  const force: V3 = [0, 0, 0];
  let hasSupport = false;
  let gravityGiven = false;
  const nameOf = (l: Load) => l.name || l.type;
  for (const l of activeLoads(P)) {
    if (o.skip?.includes(l.type)) continue;
    const spec = l.type;
    if (P.isNodeRegion(l.region) && ['fixed', 'frictionless', 'spring', 'force', 'torque', 'pressure'].includes(spec)) {
      // picked edges / points: the surface nodes nearest to them
      const nodes = P.nodesOf(l.region), isPoint = P.input.regions.find((r) => r.id === l.region)?.kind === 'point';
      const what = isPoint ? (nodes.length === 1 ? 'point' : 'points') : 'edge';
      if (!nodes.length) { warnings.push(`"${nameOf(l)}": the picked ${isPoint ? 'point is' : 'edge is'} not on the mesh (re-pick it or refine the mesh).`); continue; }
      if (spec === 'fixed') {
        for (const nd of nodes) { bc.fixed[3 * nd] = 1; bc.fixed[3 * nd + 1] = 1; bc.fixed[3 * nd + 2] = 1; }
        hasSupport = true; info.push({ label: nameOf(l), text: `Fixed support on ${nodes.length} node${nodes.length === 1 ? '' : 's'} (${what})` });
      } else if (spec === 'force') {
        const F: V3 = [l.p.fx ?? 0, l.p.fy ?? 0, l.p.fz ?? 0];
        for (const nd of nodes) { bc.force[3 * nd] += F[0] / nodes.length; bc.force[3 * nd + 1] += F[1] / nodes.length; bc.force[3 * nd + 2] += F[2] / nodes.length; }
        force[0] += F[0]; force[1] += F[1]; force[2] += F[2];
        info.push({ label: nameOf(l), text: `${isPoint ? 'Point' : 'Line'} force (${F.map((v) => +v.toFixed(2)).join(', ')}) N shared by ${nodes.length} node${nodes.length === 1 ? '' : 's'}` });
      } else {
        warnings.push(`"${nameOf(l)}": ${spec} needs a surface; it cannot be applied to an edge or point.`); continue;
      }
      if (!warnings.some((w) => w.startsWith('Point and line'))) warnings.push('Point and line supports and loads concentrate the stress into a few nodes (a mathematical singularity): the stress right at them grows as the mesh is refined, so read the stress away from them, or use a surface patch for a reliable value.');
      continue;
    }
    const needsFaces = ['fixed', 'frictionless', 'spring', 'force', 'torque', 'pressure'].includes(spec);
    const faces = needsFaces ? P.faces(l.region) : [];
    if (needsFaces && !faces.length) { warnings.push(`"${nameOf(l)}": the selection contains no faces on the mesh (re-pick it or refine the mesh).`); continue; }
    const p = l.p;
    switch (spec) {
      case 'fixed': {
        for (const f of faces) for (const nd of faceNodesOf(P, f)) { bc.fixed[3 * nd] = 1; bc.fixed[3 * nd + 1] = 1; bc.fixed[3 * nd + 2] = 1; }
        hasSupport = true; info.push({ label: nameOf(l), text: `Fixed support on ${faces.length} faces` }); break;
      }
      case 'frictionless': {
        for (const f of faces) { const c = f.dir >> 1; for (const nd of faceNodesOf(P, f)) bc.fixed[3 * nd + c] = 1; }
        hasSupport = true; info.push({ label: nameOf(l), text: `Frictionless support on ${faces.length} faces` }); break;
      }
      case 'spring': {
        springFaces(g, bc.spring, faces, p.k ?? 10);
        hasSupport = true; info.push({ label: nameOf(l), text: `Elastic support ${(p.k ?? 10)} N/mm³ on ${faces.length} faces` }); break;
      }
      case 'force': {
        const F: V3 = [p.fx ?? 0, p.fy ?? 0, p.fz ?? 0];
        addForceOnFaces(g, bc.force, faces, F);
        force[0] += F[0]; force[1] += F[1]; force[2] += F[2];
        info.push({ label: nameOf(l), text: `Force (${F.map((v) => +v.toFixed(2)).join(', ')}) N, |F| = ${Math.hypot(...F).toFixed(2)} N` }); break;
      }
      case 'torque': {
        const ax = norm3([p.ax ?? 0, p.ay ?? 0, p.az ?? 1]);
        addTorqueOnFaces(g, bc.force, faces, p.m ?? 0, centroid(P, faces), ax);
        info.push({ label: nameOf(l), text: `Torque ${(p.m ?? 0).toFixed(0)} N·mm about (${ax.map((v) => +v.toFixed(2)).join(', ')})` }); break;
      }
      case 'pressure': {
        addPressure(g, bc.force, faces, p.p ?? 0);
        let area = faces.length * g.h * g.h;
        const net: V3 = [0, 0, 0];
        for (const f of faces) { const n = FACE_NORMAL[f.dir]; net[0] -= n[0] * (p.p ?? 0) * g.h * g.h; net[1] -= n[1] * (p.p ?? 0) * g.h * g.h; net[2] -= n[2] * (p.p ?? 0) * g.h * g.h; }
        force[0] += net[0]; force[1] += net[1]; force[2] += net[2];
        info.push({ label: nameOf(l), text: `Pressure ${(p.p ?? 0)} MPa on ${area.toFixed(0)} mm²` }); break;
      }
      case 'gravity': {
        gravityGiven = true;
        const a: V3 = [(p.gx ?? 0) * G_ACC, (p.gy ?? 0) * G_ACC, (p.gz ?? 0) * G_ACC];
        const before = Float64Array.from(bc.force);
        model.addAcceleration(bc.force, a);
        const d: V3 = [0, 0, 0];
        for (let n = 0; n < nNodes(g); n++) { d[0] += bc.force[3 * n] - before[3 * n]; d[1] += bc.force[3 * n + 1] - before[3 * n + 1]; d[2] += bc.force[3 * n + 2] - before[3 * n + 2]; }
        force[0] += d[0]; force[1] += d[1]; force[2] += d[2];
        info.push({ label: nameOf(l), text: `Acceleration (${[p.gx ?? 0, p.gy ?? 0, p.gz ?? 0].join(', ')}) g, inertial force ${Math.hypot(...d).toFixed(1)} N` }); break;
      }
      case 'centrifugal': {
        const w = ((p.rpm ?? 0) * 2 * Math.PI) / 60;
        model.addCentrifugal(bc.force, w, [p.cx ?? 0, p.cy ?? 0, p.cz ?? 0], norm3([p.ax ?? 0, p.ay ?? 0, p.az ?? 1]));
        info.push({ label: nameOf(l), text: `Rotation ${(p.rpm ?? 0)} rpm (ω = ${w.toFixed(1)} rad/s)` }); break;
      }
      default: break;
    }
  }
  if (o.selfweight && !gravityGiven) {
    const d0 = Float64Array.from(bc.force);
    model.addAcceleration(bc.force, [0, 0, -G_ACC]);
    let fz = 0; for (let n = 0; n < nNodes(g); n++) fz += bc.force[3 * n + 2] - d0[3 * n + 2];
    force[2] += fz;
    info.push({ label: 'Self-weight', text: `Gravity 1 g in −Z, weight ${Math.abs(fz).toFixed(1)} N` });
  }
  let supportNodes = 0;
  for (let n = 0; n < nNodes(g); n++) if (bc.fixed[3 * n] || bc.fixed[3 * n + 1] || bc.fixed[3 * n + 2]) supportNodes++;
  return { bc, info, force, hasSupport, supportNodes, mass: model.totalMass(), warnings };
}

export function faceNodesOf(P: Prep, f: SurfFace): number[] {
  const g = P.g, nxy = g.nx * g.ny;
  const k = Math.floor(f.vox / nxy), r = f.vox - k * nxy, j = Math.floor(r / g.nx), i = r - j * g.nx;
  const sy = g.nx + 1, sz = (g.nx + 1) * (g.ny + 1), b = i + j * sy + k * sz;
  switch (f.dir) {
    case 0: return [b, b + sz, b + sz + sy, b + sy];
    case 1: return [b + 1, b + 1 + sy, b + 1 + sy + sz, b + 1 + sz];
    case 2: return [b, b + 1, b + 1 + sz, b + sz];
    case 3: return [b + sy, b + sy + sz, b + sy + 1 + sz, b + sy + 1];
    case 4: return [b, b + sy, b + sy + 1, b + 1];
    default: return [b + sz, b + sz + 1, b + sz + 1 + sy, b + sz + sy];
  }
}

/** Throws a user-readable error if the structural model cannot be solved. */
export function requireSupports(sl: StructLoads, what: string) {
  if (!sl.hasSupport) throw new Error(`${what} needs at least one support (fixed, frictionless or elastic) to stop rigid-body motion.`);
  if (sl.supportNodes === 0 && sl.bc.spring.every((v) => v === 0)) throw new Error('The supports contain no mesh nodes: select faces that exist on the part.');
}

export function pressureOnFacesFromField(P: Prep, f: Float64Array, faces: SurfFace[], pOf: (c: V3, f: SurfFace) => number) {
  const g = P.g, a = (g.h * g.h) / 4;
  for (const fc of faces) {
    const c = faceCenter(g, fc), p = pOf(c, fc), n = FACE_NORMAL[fc.dir];
    for (const nd of faceNodesOf(P, fc)) { f[3 * nd] -= p * a * n[0]; f[3 * nd + 1] -= p * a * n[1]; f[3 * nd + 2] -= p * a * n[2]; }
  }
}
