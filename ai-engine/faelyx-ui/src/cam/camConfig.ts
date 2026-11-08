// The user's CAM setup as one plain object, plus the rules that keep it consistent when the
// machine, process or material changes (the "automatic loading" the panels promise).

import {
  BRANDS, MACHINES, PRINT_MATERIALS, STOCK_MATERIALS, DEFAULT_MILL, DEFAULT_PRINT, DEFAULT_STOCK, controllerById, machineById,
  type ControllerId, type MachineDef, type MachineKind, type MillSettings, type PrintSettings, type ProcessId, type StockMaterial, type PrintMaterial, type StockSetup,
} from './camData';
import type { UpAxis } from './millPlan';

export interface Cfg {
  kind: MachineKind;
  machineId: string;              // an id from MACHINES, or 'custom'
  custom: MachineDef;
  controller: ControllerId;
  process: ProcessId;
  stockMat: string; printMat: string;
  stock: StockSetup; mill: MillSettings; print: PrintSettings;
  up: UpAxis;
  part: string;                   // 'auto' | 'project' | 'upload' | sample id
  tools: { rough?: string; finish?: string; ball?: string };
  allSides: boolean;
  sheetThickness: number;         // 0 = from the part
  lineNumbers: boolean;
  programName: string;
}

export const CUSTOM_ID = 'custom';

export const customTemplate = (kind: MachineKind): MachineDef => kind === 'subtractive'
  ? { id: CUSTOM_ID, brand: 'Custom', model: 'My CNC mill', kind, processes: ['mill3'], controllers: ['fanuc'], envelope: [600, 400, 400], axes: 'XYZ', maxRpm: 10000, powerKw: 7, rapid: 20000, tools: 20, taper: 'BT40' }
  : { id: CUSTOM_ID, brand: 'Custom', model: 'My FDM printer', kind, processes: ['fdm'], controllers: ['marlin'], envelope: [220, 220, 250], axes: 'XYZ + E', nozzles: [0.4], maxNozzleC: 260, maxBedC: 100, filament: 1.75, maxSpeed: 200, maxFlow: 15, sendProtocols: ['moonraker', 'octoprint', 'duet', 'http'] };

export function defaultCfg(): Cfg {
  const m = machineById('haas-vf2')!;
  return {
    kind: 'subtractive', machineId: m.id, custom: customTemplate('subtractive'), controller: m.controllers[0], process: 'mill3',
    stockMat: 'al6061', printMat: 'pla', stock: { ...DEFAULT_STOCK }, mill: { ...DEFAULT_MILL }, print: { ...DEFAULT_PRINT },
    up: '+Z', part: 'auto', tools: {}, allSides: false, sheetThickness: 0, lineNumbers: false, programName: 'FAELYX_PART',
  };
}

export const machineOf = (c: Cfg): MachineDef => (c.machineId === CUSTOM_ID ? c.custom : machineById(c.machineId) ?? MACHINES[0]);

export function printMaterialsFor(process: ProcessId): PrintMaterial[] { return PRINT_MATERIALS.filter((m) => m.process === process); }
export function stockMaterialsFor(process: ProcessId): StockMaterial[] {
  if (process === 'laser') return STOCK_MATERIALS.filter((m) => m.laserOk);
  if (process === 'plasma') return STOCK_MATERIALS.filter((m) => m.plasmaOk);
  return STOCK_MATERIALS.filter((m) => m.group !== 'Sheet');
}

/** Copy the material's recommended slicing / exposure / scan values into the print settings. */
export function printWithMaterial(s: PrintSettings, m: PrintMaterial, machine: MachineDef): PrintSettings {
  const o = { ...s };
  if (m.process === 'fdm') {
    o.nozzleC = Math.min(m.nozzleC ?? o.nozzleC, machine.maxNozzleC ?? 999); o.bedC = Math.min(m.bedC ?? o.bedC, machine.maxBedC ?? 999);
    o.fan = m.fan ?? o.fan; o.speed = Math.min(m.speed ?? o.speed, machine.maxSpeed ?? 999); o.retract = m.retract ?? o.retract;
    o.firstLayerSpeed = Math.min(25, o.speed);
  } else {
    o.layer = m.layer ?? m.powderLayer ?? o.layer; o.firstLayer = o.layer;
    o.exposure = m.exposure ?? o.exposure; o.bottomExposure = m.bottomExposure ?? o.bottomExposure; o.bottomLayers2 = m.bottomLayers ?? o.bottomLayers2; o.lift = m.lift ?? o.lift;
    o.power = m.power ?? o.power; o.scan = m.scan ?? o.scan; o.hatch = m.hatch ?? o.hatch;
  }
  return o;
}

/** Everything that follows from choosing a machine: controller, process, material, nozzle. */
export function withMachine(c: Cfg, machine: MachineDef): Cfg {
  const next: Cfg = { ...c, machineId: machine.id, kind: machine.kind };
  if (!machine.controllers.includes(next.controller)) next.controller = machine.controllers[0];
  if (!machine.processes.includes(next.process)) next.process = machine.processes[0];
  return freshLayer(c, withProcess(next, next.process, machine));
}

/** Moving to FDM from resin / powder (or from milling) must not keep a 0.03 mm powder layer. */
function freshLayer(prev: Cfg, next: Cfg): Cfg {
  if (next.kind !== 'additive' || next.process !== 'fdm') return next;
  if (prev.kind === 'additive' && prev.process === 'fdm') return next;
  const noz = next.print.nozzle;
  return { ...next, print: { ...next.print, layer: Math.min(DEFAULT_PRINT.layer, 0.5 * noz + 0.05), firstLayer: Math.min(DEFAULT_PRINT.firstLayer, 0.5 * noz + 0.05) } };
}

export function withProcess(c: Cfg, process: ProcessId, machine = machineOf(c)): Cfg {
  return freshLayer(c, applyProcess(c, process, machine));
}

function applyProcess(c: Cfg, process: ProcessId, machine: MachineDef): Cfg {
  const next: Cfg = { ...c, process };
  if (machine.kind === 'subtractive') {
    const list = stockMaterialsFor(process);
    if (!list.some((m) => m.id === next.stockMat)) next.stockMat = list[0].id;
    if (process === 'turn') next.stock = { ...next.stock, shape: 'cylinder', hold: 'chuck', auto: true };
    else if (next.stock.hold === 'chuck') next.stock = { ...next.stock, shape: 'block', hold: 'vise' };
    if (process === 'mill5i') next.allSides = true;
    if (process !== 'mill5i') next.allSides = false;
    if (next.part !== 'auto' && next.part !== 'project' && next.part !== 'upload') next.part = 'auto';
  } else {
    const list = printMaterialsFor(process);
    if (!list.some((m) => m.id === next.printMat)) next.printMat = list[0].id;
    const mat = list.find((m) => m.id === next.printMat) ?? list[0];
    let p = printWithMaterial(next.print, mat, machine);
    if (process === 'fdm') {
      const noz = machine.nozzles ?? [0.4];
      p = { ...p, nozzle: noz.includes(p.nozzle) ? p.nozzle : noz.includes(0.4) ? 0.4 : noz[0], layer: Math.min(p.layer, 0.5 * (noz.includes(p.nozzle) ? p.nozzle : noz[0]) + 0.05) };
    } else if (machine.layerRange) p = { ...p, layer: Math.min(machine.layerRange[1], Math.max(machine.layerRange[0], p.layer)) };
    next.print = p;
  }
  const ctrl = controllerById(next.controller);
  next.lineNumbers = ctrl.lineNumbers;
  return next;
}

export function withController(c: Cfg, id: ControllerId): Cfg { return { ...c, controller: id, lineNumbers: controllerById(id).lineNumbers }; }

export function withKind(c: Cfg, kind: MachineKind): Cfg {
  const brand = BRANDS(kind)[0];
  const m = MACHINES.find((x) => x.kind === kind && x.brand === brand)!;
  return withMachine({ ...c, kind }, m);
}

export const UP_AXES: { id: UpAxis; label: string }[] = [
  { id: '+Z', label: '+Z up (as modelled)' }, { id: '-Z', label: '−Z up (flip over)' }, { id: '+X', label: '+X up' }, { id: '-X', label: '−X up' }, { id: '+Y', label: '+Y up' }, { id: '-Y', label: '−Y up' },
];

export function withCustom(c: Cfg, p: Partial<MachineDef>): Cfg {
  const custom: MachineDef = { ...c.custom, ...p, id: CUSTOM_ID };
  let n: Cfg = { ...c, custom };
  if (c.machineId !== CUSTOM_ID) return n;
  if (!custom.controllers.includes(n.controller)) n = withController(n, custom.controllers[0]);
  if (!custom.processes.includes(n.process)) n = withProcess(n, custom.processes[0], custom);
  return n;
}

export function defaultSample(p: ProcessId): string {
  if (p === 'turn') return 'shaft';
  if (p === 'laser' || p === 'plasma') return 'plate';
  if (p === 'mill5i') return 'manifold';
  if (p === 'fdm' || p === 'sla' || p === 'sls' || p === 'dmls') return 'overhang';
  return 'bracket';
}

/** Which model is in use: the project's, an uploaded STL, or a sample part. */
export function resolvePart(c: Cfg, hasProject: boolean): string {
  if (c.part === 'auto') return hasProject ? 'project' : defaultSample(c.process);
  if (c.part === 'project' && !hasProject) return defaultSample(c.process);
  return c.part;
}

/** (A, C) rotations that bring the chosen "up" axis to +Z — the same table the planners use. */
export const UP_ROT: Record<UpAxis, [number, number]> = { '+Z': [0, 0], '-Z': [180, 0], '+X': [90, 90], '-X': [90, -90], '+Y': [90, 0], '-Y': [90, 180] };
