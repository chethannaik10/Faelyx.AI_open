// Sample models: a ready-to-run set-up (bodies, regions, loads, parameters) for each kind of analysis.

import { materialById, MATERIALS, type Material } from './materials';
import type { AnalysisId, CaeBody, Load, MeshSettings, Region } from './model';
import { loadSpec } from './model';
import { boxMesh, sphereMesh, wingMesh } from './shapes';
import type { Mesh } from '../cam/geometry';

export interface Setup {
  bodies: CaeBody[]; regions: Region[]; loads: Load[];
  mesh: MeshSettings; analysis: AnalysisId;
  params: Partial<Record<AnalysisId, Record<string, number | string | boolean>>>;
}
export interface SampleInfo { id: string; name: string; blurb: string; analysis: AnalysisId; build: () => Setup }

let counter = 1;
const uid = (p: string) => `${p}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const mat = (id: string): Material => ({ ...(materialById(id) ?? MATERIALS[0]) });

export function makeBody(name: string, m: Mesh, material: string, o: Partial<CaeBody> = {}): CaeBody {
  return { id: uid('b'), name, tris: m.tris, mat: mat(material), fibre: 0, role: 'solid', power: 0, rjc: 0, potential: null, magnet: null, ...o };
}
const palette = ['#4f8cff', '#ff7a45', '#6dd47e', '#ffb02e', '#b57bff', '#35c4c4', '#ff5d73', '#d0a85c'];
let colorIx = 0;
export function makeRegion(name: string, r: Partial<Region>): Region {
  return { id: uid('r'), name, kind: 'box', color: palette[colorIx++ % palette.length], ...r };
}
export function makeLoad(type: Load['type'], region: string, p: Record<string, number> = {}, name = ''): Load {
  const spec = loadSpec(type);
  const q: Record<string, number> = {};
  for (const f of spec.fields) q[f.k] = p[f.k] ?? f.def;
  return { id: uid('l'), type, region, name: name || spec.label, on: true, p: q };
}

const med = (): MeshSettings => ({ preset: 'medium', cells: 48, size: 2 });
const custom = (size: number): MeshSettings => ({ preset: 'custom', cells: 48, size });

function bracket(): Setup {
  const base = makeBody('Base plate', boxMesh(0, 0, 0, 120, 60, 12), 'a36'), wall = makeBody('Upright', boxMesh(0, 0, 12, 12, 60, 92), 'a36');
  const bottom = makeRegion('Bolted face', { kind: 'plane', axis: 2, side: 0 }), top = makeRegion('Load face', { kind: 'plane', axis: 2, side: 1 });
  return { bodies: [base, wall], regions: [bottom, top], loads: [makeLoad('fixed', bottom.id, {}, 'Fixed base'), makeLoad('force', top.id, { fx: 1500, fy: 0, fz: 0 }, 'Side load')], mesh: custom(2), analysis: 'static', params: { modal: { operating: '' }, fatigue: { R: 0, cycle: 'ratio' }, impact: { v: 2 } } };
}

function column(): Setup {
  const col = makeBody('Column', boxMesh(0, 0, 0, 40, 40, 600), 'a36');
  const bottom = makeRegion('Foot', { kind: 'plane', axis: 2, side: 0 }), top = makeRegion('Top', { kind: 'plane', axis: 2, side: 1 });
  return { bodies: [col], regions: [bottom, top], loads: [makeLoad('fixed', bottom.id), makeLoad('force', top.id, { fx: 0, fy: 0, fz: -100000 }, 'Axial load')], mesh: { preset: 'custom', cells: 48, size: 5 }, analysis: 'buckling', params: {} };
}

function frame(): Setup {
  const cols: CaeBody[] = [];
  [[0, 0], [4000, 0], [0, 4000], [4000, 4000]].forEach(([x, y], i) => cols.push(makeBody(`Column ${i + 1}`, boxMesh(x, y, 0, x + 300, y + 300, 3000), 's355')));
  const slab = makeBody('Roof slab', boxMesh(-150, -150, 3000, 4450, 4450, 3300), 'c30');
  const foot = makeRegion('Foundations', { kind: 'plane', axis: 2, side: 0 });
  return { bodies: [...cols, slab], regions: [foot], loads: [makeLoad('fixed', foot.id, {}, 'Fixed foundations')], mesh: custom(110), analysis: 'seismic', params: { seismic: { dir: 'x', pga: 0.3, soil: 'C', R: 1.5, nModes: 18 }, modal: {} } };
}

function bridge(): Setup {
  const outer = makeBody('Box girder', boxMesh(0, 0, 0, 12000, 3000, 900), 'c40');
  const inner = makeBody('Void', boxMesh(-10, 400, 250, 12010, 2600, 650), 'c40', { role: 'carve' });
  const left = makeRegion('Fixed bearing', { kind: 'box', box: [0, 0, 0, 400, 3000, 0] }), right = makeRegion('Sliding bearing', { kind: 'box', box: [11600, 0, 0, 12000, 3000, 0] });
  const lane = makeRegion('Traffic lane', { kind: 'box', box: [0, 500, 900, 12000, 2500, 900] });
  return { bodies: [outer, inner], regions: [left, right, lane], loads: [makeLoad('fixed', left.id, {}, 'Fixed bearing'), makeLoad('frictionless', right.id, {}, 'Sliding bearing')], mesh: custom(120), analysis: 'bridge', params: { bridge: { span: 'x', P: 150, speed: 80, wind: 30, winddir: 'y' } } };
}

function retaining(): Setup {
  const found = makeBody('Foundation soil', boxMesh(-2000, 0, -2400, 6500, 1500, 0), 'gravel');
  const base = makeBody('Wall base', boxMesh(0, 0, 0, 2500, 1500, 400), 'c30');
  const stem = makeBody('Wall stem', boxMesh(400, 0, 400, 800, 1500, 3400), 'c30');
  const fill1 = makeBody('Backfill', boxMesh(800, 0, 400, 6500, 1500, 3400), 'sand');
  const fill2 = makeBody('Backfill (below)', boxMesh(2500, 0, 0, 6500, 1500, 400), 'sand');
  return { bodies: [found, base, stem, fill1, fill2], regions: [], loads: [], mesh: custom(160), analysis: 'retaining', params: { retaining: { phi: 35, gammaS: 19, q: 10, delta: 20, mu: 0.5, qa: 250 } } };
}

function pcb(): Setup {
  const board = makeBody('PCB (FR-4 with copper planes)', boxMesh(0, 0, 0, 100, 80, 1.6), 'fr4', { mat: { ...mat('fr4'), id: 'fr4cu', name: 'FR-4 + copper planes (effective in-plane k)', k: [25, 25, 0.8], note: 'Effective conductivity of a multilayer board: about 25 W/mK in the plane, 0.8 W/mK through the thickness.' } });
  const cpu = makeBody('Processor', boxMesh(25, 25, 1.6, 45, 45, 3.6), 'mold', { power: 5, rjc: 1.5 });
  const sink = makeBody('Heat sink (fan-cooled)', boxMesh(15, 15, 3.6, 55, 55, 23), 'al6061');
  const reg = makeBody('Regulator', boxMesh(70, 15, 1.6, 82, 25, 3.2), 'mold', { power: 0.8, rjc: 8 });
  const rBoard = makeRegion('Board', { kind: 'body', bodyIndex: 0 }), rCpu = makeRegion('Processor', { kind: 'body', bodyIndex: 1 });
  const rSink = makeRegion('Heat sink', { kind: 'body', bodyIndex: 2 }), rReg = makeRegion('Regulator', { kind: 'body', bodyIndex: 3 });
  return { bodies: [board, cpu, sink, reg], regions: [rBoard, rCpu, rSink, rReg], loads: [
    makeLoad('convection', rBoard.id, { h: 12, tinf: 25 }, 'Natural convection (board)'), makeLoad('convection', rCpu.id, { h: 12, tinf: 25 }, 'Natural convection (processor)'),
    makeLoad('convection', rReg.id, { h: 12, tinf: 25 }, 'Natural convection (regulator)'), makeLoad('convection', rSink.id, { h: 60, tinf: 25 }, 'Forced air over the heat sink'),
  ], mesh: custom(1.25), analysis: 'thermal', params: { thermal: { mode: 'steady', tlimit: 85, Tamb: 25 } } };
}

function busbar(): Setup {
  const bar = makeBody('Copper bar', boxMesh(0, 0, 0, 200, 20, 6), 'cu');
  const slot = makeBody('Slot', boxMesh(90, 8, -1, 110, 21, 7), 'cu', { role: 'carve' });
  const a = makeRegion('Terminal +', { kind: 'plane', axis: 0, side: 0 }), b = makeRegion('Terminal −', { kind: 'plane', axis: 0, side: 1 }), all = makeRegion('All surfaces', { kind: 'all' });
  return { bodies: [bar, slot], regions: [a, b, all], loads: [makeLoad('voltage', a.id, { v: 0.012 }, '+12 mV'), makeLoad('voltage', b.id, { v: 0 }, 'Ground'), makeLoad('convection', all.id, { h: 10, tinf: 22 }, 'Air')], mesh: custom(1), analysis: 'joule', params: { joule: { coupled: true, tlimit: 105 } } };
}

function capacitor(): Setup {
  const p1 = makeBody('Plate +', boxMesh(0, 0, 0, 40, 40, 2), 'al6061', { potential: 100 });
  const p2 = makeBody('Plate −', boxMesh(0, 0, 6, 40, 40, 8), 'al6061', { potential: 0 });
  return { bodies: [p1, p2], regions: [], loads: [], mesh: custom(1), analysis: 'electrostatic', params: { electrostatic: { margin: 0.8, Ebreak: 3 } } };
}

function magnet(): Setup {
  const m = makeBody('Magnet N42', boxMesh(0, 0, 0, 20, 20, 10), 'magnet', { magnet: [0, 0, 1] });
  const plate = makeBody('Steel plate', boxMesh(-15, -15, 15, 35, 35, 20), 'a36');
  return { bodies: [m, plate], regions: [], loads: [], mesh: custom(1), analysis: 'magnetostatic', params: { magnetostatic: { margin: 1.2 } } };
}

function enclosure(): Setup {
  const box = makeBody('Enclosure', boxMesh(0, 0, 0, 100, 80, 50), 'al6061');
  const cavity = makeBody('Cavity', boxMesh(3, 3, 3, 97, 77, 47), 'al6061', { role: 'carve' });
  const slot = makeBody('Aperture', boxMesh(30, 76, 22, 70, 81, 28), 'al6061', { role: 'carve' });
  return { bodies: [box, cavity, slot], regions: [], loads: [], mesh: custom(1), analysis: 'emc', params: { emc: { mode: 'shield', f: 1000, sx: 50, sy: 40, sz: 25, sdir: 'z', px: 50, py: 110, pz: 25, margin: 0.6, cells: 500 } } };
}

function duct(): Setup {
  const passage = makeBody('Air passage', boxMesh(0, 0, 0, 300, 50, 50), 'air', { role: 'fluid' });
  const heater = makeBody('Heated block', boxMesh(120, 5, -10, 160, 45, 0), 'al6061', { power: 6 });
  return { bodies: [passage, heater], regions: [], loads: [], mesh: med(), analysis: 'internal', params: { internal: { axis: 'x', U: 3, fluid: 'air', quality: 'fast', heat: true, Tin: 20 } } };
}

function wing(): Setup {
  const w = makeBody('Wing', wingMesh(140, 0.21, 140), 'al6061');
  const root = makeRegion('Wing root', { kind: 'plane', axis: 1, side: 0 });
  return { bodies: [w], regions: [root], loads: [makeLoad('fixed', root.id, {}, 'Fixed root')], mesh: med(), analysis: 'windtunnel', params: { windtunnel: { U: 30, aoa: 6, quality: 'standard', fluid: 'air', Aref: 19600, Lref: 140 }, highspeed: { mach: 2.5, alt: 10000, aoa: 4 }, fsi: { U: 60, aoa: 8, quality: 'fast', Aref: 19600, Lref: 140 } } };
}

function sphere(): Setup {
  const s = makeBody('Sphere Ø100', sphereMesh(0, 0, 0, 50, 40), 'al6061');
  return { bodies: [s], regions: [], loads: [], mesh: med(), analysis: 'windtunnel', params: { windtunnel: { U: 20, aoa: 0, quality: 'fast', fluid: 'air', turb: 'les' }, highspeed: { mach: 3, alt: 15000, aoa: 0 } } };
}

function shock(): Setup {
  const blk = makeBody('Steel block', boxMesh(0, 0, 0, 80, 80, 20), 'ss304');
  const hot = makeRegion('Hot face', { kind: 'plane', axis: 2, side: 1 }), cold = makeRegion('Cooled face', { kind: 'plane', axis: 2, side: 0 });
  const sx = makeRegion('Symmetry X', { kind: 'plane', axis: 0, side: 0 }), sy = makeRegion('Symmetry Y', { kind: 'plane', axis: 1, side: 0 });
  return { bodies: [blk], regions: [hot, cold, sx, sy], loads: [makeLoad('temperature', hot.id, { t: 300 }, 'Hot surface'), makeLoad('convection', cold.id, { h: 20, tinf: 20 }, 'Cooled face'), makeLoad('frictionless', sx.id), makeLoad('frictionless', sy.id), makeLoad('frictionless', cold.id)], mesh: custom(2), analysis: 'thermostress', params: { thermostress: { mode: 'shock', T0: 20, tend: 5 } } };
}

export const SAMPLES: SampleInfo[] = [
  { id: 'bracket', name: 'L-bracket', blurb: 'Steel bracket bolted at the base with a side load on the upright.', analysis: 'static', build: bracket },
  { id: 'column', name: 'Slender column', blurb: 'Fixed–free steel column under axial load: Euler buckling check.', analysis: 'buckling', build: column },
  { id: 'frame', name: 'Portal frame', blurb: 'Steel columns carrying a concrete roof slab: earthquake response.', analysis: 'seismic', build: frame },
  { id: 'bridge', name: 'Box-girder bridge', blurb: '12 m concrete box girder with bearings and a traffic lane.', analysis: 'bridge', build: bridge },
  { id: 'retaining', name: 'Retaining wall', blurb: 'Cantilever wall holding a sand backfill on gravel.', analysis: 'retaining', build: retaining },
  { id: 'pcb', name: 'PCB with processor', blurb: 'FR-4 board, processor with heat sink and a regulator.', analysis: 'thermal', build: pcb },
  { id: 'busbar', name: 'Copper busbar', blurb: 'Bar with a slot: current crowding and Joule heating.', analysis: 'joule', build: busbar },
  { id: 'capacitor', name: 'Parallel-plate capacitor', blurb: 'Two charged plates: field, capacitance, stored energy.', analysis: 'electrostatic', build: capacitor },
  { id: 'magnet', name: 'Magnet and steel plate', blurb: 'Neodymium magnet attracting a steel plate.', analysis: 'magnetostatic', build: magnet },
  { id: 'enclosure', name: 'Shielded enclosure', blurb: 'Aluminium box with a slot aperture: shielding effectiveness.', analysis: 'emc', build: enclosure },
  { id: 'duct', name: 'Air duct with heater', blurb: 'Rectangular duct with a heated block: pressure drop and cooling.', analysis: 'internal', build: duct },
  { id: 'wing', name: 'Wing section', blurb: 'Rectangular NACA 0021 wing: lift, drag, supersonic and FSI studies.', analysis: 'windtunnel', build: wing },
  { id: 'sphere', name: 'Sphere (benchmark)', blurb: 'Sphere for checking the flow solver against known drag.', analysis: 'windtunnel', build: sphere },
  { id: 'pipe', name: 'Thermal-shock block', blurb: 'Steel block whose top face is suddenly heated.', analysis: 'thermostress', build: shock },
];
export const sampleById = (id: string) => SAMPLES.find((s) => s.id === id);

