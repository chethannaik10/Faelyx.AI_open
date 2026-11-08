// CAM & CNC workspace — the data side: machine database, controller / post
// profiles, process catalogue, material tables (cutting and printing), the tool
// library and the stock / fixture definitions. No three.js and no DOM in here,
// so the planners can be unit-tested in plain Node.
//
// Machine figures are typical catalogue values, entered by hand and rounded.
// They are a starting point: every machine can be duplicated into an editable
// custom profile, and the UI says so.

export type MachineKind = 'subtractive' | 'additive';

export type ProcessId = 'mill3' | 'mill5i' | 'mill5s' | 'turn' | 'laser' | 'plasma' | 'fdm' | 'sla' | 'sls' | 'dmls';
export interface ProcessDef { id: ProcessId; kind: MachineKind; label: string; short: string; hint: string }
export const PROCESSES: ProcessDef[] = [
  { id: 'mill3', kind: 'subtractive', label: '3-axis milling', short: '3-axis', hint: 'Roughing, finishing and drilling from the top (X Y Z).' },
  { id: 'mill5i', kind: 'subtractive', label: '5-axis indexing (3+2)', short: '3+2', hint: 'Locks the table at tilted angles and machines each face as a 3-axis setup.' },
  { id: 'mill5s', kind: 'subtractive', label: '5-axis simultaneous', short: '5-axis', hint: 'Ball-nose finishing with the tool axis tilted along the surface normal (needs TCP).' },
  { id: 'turn', kind: 'subtractive', label: 'Lathe turning', short: 'Turning', hint: 'Rough and finish a body of revolution; X is diameter, Z is the spindle axis.' },
  { id: 'laser', kind: 'subtractive', label: 'Laser cutting', short: 'Laser', hint: '2D profile cutting of sheet with kerf compensation and lead-ins.' },
  { id: 'plasma', kind: 'subtractive', label: 'Plasma cutting', short: 'Plasma', hint: '2D profile cutting with pierce delay, torch height and lead-ins.' },
  { id: 'fdm', kind: 'additive', label: 'FDM / FFF', short: 'FDM', hint: 'Filament extrusion: perimeters, infill, supports, retraction.' },
  { id: 'sla', kind: 'additive', label: 'SLA / DLP resin', short: 'SLA/DLP', hint: 'Photopolymer layers: exposure times, lift, thin supports.' },
  { id: 'sls', kind: 'additive', label: 'SLS powder', short: 'SLS', hint: 'Polymer powder sintered layer by layer; no supports needed.' },
  { id: 'dmls', kind: 'additive', label: 'Metal DMLS / SLM', short: 'DMLS', hint: 'Laser melting of metal powder with scan strategy and supports.' },
];
export const processById = (id: ProcessId) => PROCESSES.find((p) => p.id === id)!;

// ---------------------------------------------------------------------------
// Controllers / post processors

export type ControllerId = 'fanuc' | 'haas' | 'mazak' | 'siemens' | 'heidenhain' | 'linuxcnc' | 'marlin' | 'klipper' | 'bambu' | 'scanvector';
export interface ControllerDef {
  id: ControllerId; name: string; family: 'cnc' | 'printer' | 'laser'; ext: string;
  lineNumbers: boolean; description: string;
  /** Can the post emit a native 5-axis TCP command? */
  tcp?: string;
}
export const CONTROLLERS: ControllerDef[] = [
  { id: 'fanuc', name: 'Fanuc 0i / 30i / 31i', family: 'cnc', ext: 'nc', lineNumbers: true, description: 'ISO G-code, O-number program, G81/G83 canned cycles, G43.4 TCP on 5-axis.', tcp: 'G43.4' },
  { id: 'haas', name: 'Haas NGC', family: 'cnc', ext: 'nc', lineNumbers: false, description: 'Fanuc-style dialect with G187 smoothing, G43 H, M8 coolant and G53 home moves; TCP via G234.', tcp: 'G234' },
  { id: 'mazak', name: 'Mazak SmoothG / ISO', family: 'cnc', ext: 'eia', lineNumbers: true, description: 'EIA/ISO program with G28 homing, G49 cancel and G43.4 TCP.', tcp: 'G43.4' },
  { id: 'siemens', name: 'Siemens Sinumerik 840D sl', family: 'cnc', ext: 'mpf', lineNumbers: true, description: 'Sinumerik MPF: CYCLE81 / CYCLE83 drilling, TRAORI for 5-axis TCP, G17 G90 G71 header.', tcp: 'TRAORI' },
  { id: 'heidenhain', name: 'Heidenhain TNC 640 (conversational)', family: 'cnc', ext: 'h', lineNumbers: true, description: 'Klartext: BEGIN PGM, BLK FORM, L blocks, CYCL DEF 200/203 drilling and M128 TCP.', tcp: 'M128' },
  { id: 'linuxcnc', name: 'Tormach PathPilot / LinuxCNC', family: 'cnc', ext: 'ngc', lineNumbers: false, description: 'RS-274 G-code with O-words, G43 H and G83 peck drilling.' },
  { id: 'marlin', name: 'Marlin 2.x', family: 'printer', ext: 'gcode', lineNumbers: false, description: 'M104/M140 temperatures, M83 relative extrusion, G92 E0, M106 fan, firmware retraction off.' },
  { id: 'klipper', name: 'Klipper', family: 'printer', ext: 'gcode', lineNumbers: false, description: 'START_PRINT / END_PRINT macros, SET_VELOCITY_LIMIT, pressure advance; uploads to Moonraker.' },
  { id: 'bambu', name: 'Bambu Lab firmware', family: 'printer', ext: 'gcode', lineNumbers: false, description: 'Marlin-compatible G-code with Bambu-style header. Bambu Studio itself expects a .gcode.3mf; a plain 3MF of the part is also exported.' },
  { id: 'scanvector', name: 'Neutral scan-vector G-code', family: 'laser', ext: 'gcode', lineNumbers: false, description: 'Generic layer / laser vector G-code for SLA, SLS and DMLS. Not a vendor job file: import it into the vendor software.' },
];
export const controllerById = (id: ControllerId) => CONTROLLERS.find((c) => c.id === id)!;

// ---------------------------------------------------------------------------
// Machines

export interface MachineDef {
  id: string; brand: string; model: string; kind: MachineKind;
  processes: ProcessId[];
  controllers: ControllerId[];
  /** Travel / build volume, mm: X Y Z (or bed X Y and height). */
  envelope: [number, number, number];
  axes: string;
  /** CNC */
  maxRpm?: number; powerKw?: number; rapid?: number; tools?: number; taper?: string; maxFeed?: number;
  /** Lathe */ chuckMm?: number; maxTurnDia?: number; maxTurnLen?: number;
  /** Laser / plasma */ laserW?: number;
  /** Printer */
  nozzles?: number[]; maxNozzleC?: number; maxBedC?: number; chamberC?: number; enclosed?: boolean; maxSpeed?: number; maxFlow?: number; filament?: number;
  /** Additive laser machines */ spotMm?: number; layerRange?: [number, number];
  vendorLocked?: boolean; sendProtocols?: SendProtocol[];
  notes?: string;
}
export type SendProtocol = 'moonraker' | 'octoprint' | 'duet' | 'http';

const cnc = (m: Partial<MachineDef> & Pick<MachineDef, 'id' | 'brand' | 'model' | 'processes' | 'controllers' | 'envelope' | 'axes'>): MachineDef =>
  ({ kind: 'subtractive', rapid: 24000, tools: 20, taper: 'CAT40', ...m });
const printer = (m: Partial<MachineDef> & Pick<MachineDef, 'id' | 'brand' | 'model' | 'processes' | 'controllers' | 'envelope'>): MachineDef =>
  ({ kind: 'additive', axes: 'XYZ + E', nozzles: [0.4], filament: 1.75, ...m });

export const MACHINES: MachineDef[] = [
  // — Haas
  cnc({ id: 'haas-minimill', brand: 'Haas', model: 'Mini Mill', processes: ['mill3'], controllers: ['haas', 'fanuc'], envelope: [406, 305, 254], axes: 'XYZ', maxRpm: 6000, powerKw: 5.6, tools: 10, taper: 'BT30', rapid: 25400 }),
  cnc({ id: 'haas-vf2', brand: 'Haas', model: 'VF-2', processes: ['mill3'], controllers: ['haas', 'fanuc'], envelope: [762, 406, 508], axes: 'XYZ', maxRpm: 8100, powerKw: 22.4, tools: 20, rapid: 25400 }),
  cnc({ id: 'haas-vf2ss', brand: 'Haas', model: 'VF-2SS (super-speed)', processes: ['mill3'], controllers: ['haas', 'fanuc'], envelope: [762, 406, 508], axes: 'XYZ', maxRpm: 12000, powerKw: 22.4, tools: 20, rapid: 35600 }),
  cnc({ id: 'haas-umc500', brand: 'Haas', model: 'UMC-500 (5-axis)', processes: ['mill3', 'mill5i', 'mill5s'], controllers: ['haas'], envelope: [508, 406, 406], axes: 'XYZ + A/C trunnion', maxRpm: 8100, powerKw: 22.4, tools: 40, rapid: 25400, notes: 'Tilt-rotary table, ±120° A, 360° C. DWO / TCP via G234.' }),
  cnc({ id: 'haas-st10', brand: 'Haas', model: 'ST-10 (lathe)', processes: ['turn'], controllers: ['haas', 'fanuc'], envelope: [250, 0, 400], axes: 'X Z (+C)', maxRpm: 6000, powerKw: 11.2, tools: 12, taper: 'VDI30', chuckMm: 165, maxTurnDia: 250, maxTurnLen: 400, rapid: 24000 }),
  // — DMG Mori
  cnc({ id: 'dmg-cmx600v', brand: 'DMG Mori', model: 'CMX 600 V', processes: ['mill3'], controllers: ['siemens', 'heidenhain'], envelope: [600, 560, 510], axes: 'XYZ', maxRpm: 12000, powerKw: 13, tools: 30, taper: 'SK40', rapid: 30000 }),
  cnc({ id: 'dmg-dmu50', brand: 'DMG Mori', model: 'DMU 50 (5-axis)', processes: ['mill3', 'mill5i', 'mill5s'], controllers: ['heidenhain', 'siemens'], envelope: [500, 450, 400], axes: 'XYZ + A/C swivel table', maxRpm: 14000, powerKw: 13, tools: 30, taper: 'SK40', rapid: 30000, notes: 'Swivelling rotary table ±120° B-axis style; TCP via M128 / TRAORI.' }),
  cnc({ id: 'dmg-nlx2500', brand: 'DMG Mori', model: 'NLX 2500 (lathe)', processes: ['turn'], controllers: ['fanuc', 'siemens'], envelope: [366, 0, 700], axes: 'X Z (+C, Y)', maxRpm: 4000, powerKw: 18.5, tools: 12, taper: 'VDI40', chuckMm: 210, maxTurnDia: 366, maxTurnLen: 700, rapid: 30000 }),
  // — Mazak
  cnc({ id: 'mazak-vcn530c', brand: 'Mazak', model: 'VCN-530C', processes: ['mill3'], controllers: ['mazak'], envelope: [1050, 530, 510], axes: 'XYZ', maxRpm: 12000, powerKw: 18.5, tools: 30, taper: 'CAT40', rapid: 36000 }),
  cnc({ id: 'mazak-variaxis', brand: 'Mazak', model: 'Variaxis i-300 (5-axis)', processes: ['mill3', 'mill5i', 'mill5s'], controllers: ['mazak'], envelope: [550, 600, 510], axes: 'XYZ + B/C trunnion', maxRpm: 12000, powerKw: 22, tools: 30, taper: 'CAT40', rapid: 42000 }),
  cnc({ id: 'mazak-qt200', brand: 'Mazak', model: 'Quick Turn 200 (lathe)', processes: ['turn'], controllers: ['mazak', 'fanuc'], envelope: [280, 0, 500], axes: 'X Z', maxRpm: 5000, powerKw: 15, tools: 12, taper: 'VDI40', chuckMm: 210, maxTurnDia: 280, maxTurnLen: 500, rapid: 30000 }),
  // — Tormach
  cnc({ id: 'tormach-770m', brand: 'Tormach', model: 'PCNC 770M', processes: ['mill3'], controllers: ['linuxcnc'], envelope: [356, 159, 254], axes: 'XYZ', maxRpm: 10000, powerKw: 1.5, tools: 12, taper: 'TTS', rapid: 5000, notes: 'Small-footprint mill; keep power-limited cuts light.' }),
  cnc({ id: 'tormach-1100m', brand: 'Tormach', model: 'PCNC 1100M', processes: ['mill3', 'mill5i'], controllers: ['linuxcnc'], envelope: [457, 241, 413], axes: 'XYZ (+A with 4th-axis option)', maxRpm: 5400, powerKw: 2.2, tools: 18, taper: 'TTS', rapid: 5000 }),
  cnc({ id: 'tormach-1100-plasma', brand: 'Tormach', model: 'XSL / 1100 gantry (plasma / laser table)', processes: ['plasma', 'laser'], controllers: ['linuxcnc'], envelope: [1200, 1200, 100], axes: 'XYZ', laserW: 1500, rapid: 12000, powerKw: 0, maxRpm: 0, notes: 'Generic profile for a 1.2 × 1.2 m sheet table.' }),
  // — Fanuc
  cnc({ id: 'fanuc-d21mib5', brand: 'Fanuc', model: 'ROBODRILL α-D21MiB5', processes: ['mill3', 'mill5i'], controllers: ['fanuc'], envelope: [700, 400, 330], axes: 'XYZ (+A/C 4th/5th axis option)', maxRpm: 24000, powerKw: 11, tools: 21, taper: 'BT30', rapid: 54000 }),
  cnc({ id: 'fanuc-d14mia5', brand: 'Fanuc', model: 'ROBODRILL α-D14MiA5', processes: ['mill3'], controllers: ['fanuc'], envelope: [500, 400, 330], axes: 'XYZ', maxRpm: 24000, powerKw: 5.4, tools: 14, taper: 'BT30', rapid: 54000 }),
  // — 3D printers
  printer({ id: 'bambu-x1c', brand: 'Bambu Lab', model: 'X1 Carbon', processes: ['fdm'], controllers: ['bambu', 'marlin'], envelope: [256, 256, 256], nozzles: [0.2, 0.4, 0.6, 0.8], maxNozzleC: 300, maxBedC: 110, enclosed: true, maxSpeed: 500, maxFlow: 32, sendProtocols: ['http'], vendorLocked: true, notes: 'Bambu Studio expects .gcode.3mf. Plain G-code is Marlin-compatible reference output.' }),
  printer({ id: 'bambu-p1s', brand: 'Bambu Lab', model: 'P1S', processes: ['fdm'], controllers: ['bambu', 'marlin'], envelope: [256, 256, 256], nozzles: [0.2, 0.4, 0.6, 0.8], maxNozzleC: 300, maxBedC: 100, enclosed: true, maxSpeed: 500, maxFlow: 32, vendorLocked: true }),
  printer({ id: 'bambu-a1mini', brand: 'Bambu Lab', model: 'A1 mini', processes: ['fdm'], controllers: ['bambu', 'marlin'], envelope: [180, 180, 180], nozzles: [0.2, 0.4, 0.6, 0.8], maxNozzleC: 300, maxBedC: 80, maxSpeed: 500, maxFlow: 28, vendorLocked: true }),
  printer({ id: 'um-s5', brand: 'Ultimaker', model: 'S5', processes: ['fdm'], controllers: ['marlin'], envelope: [330, 240, 300], nozzles: [0.25, 0.4, 0.8], maxNozzleC: 280, maxBedC: 140, enclosed: false, maxSpeed: 300, maxFlow: 16, filament: 2.85, sendProtocols: ['http'], notes: 'Uses 2.85 mm filament. Ultimaker firmware takes UFP/G-code through Cura Connect; plain G-code is generic.' }),
  printer({ id: 'um-s7', brand: 'Ultimaker', model: 'S7', processes: ['fdm'], controllers: ['marlin'], envelope: [330, 240, 300], nozzles: [0.25, 0.4, 0.8], maxNozzleC: 280, maxBedC: 140, maxSpeed: 300, maxFlow: 16, filament: 2.85 }),
  printer({ id: 'mf-x7', brand: 'Markforged', model: 'X7 (continuous fibre)', processes: ['fdm'], controllers: ['marlin'], envelope: [330, 270, 200], nozzles: [0.4], maxNozzleC: 275, maxBedC: 100, enclosed: true, maxSpeed: 150, maxFlow: 12, vendorLocked: true, notes: 'Markforged prints only through Eiger. Output is generic reference G-code without the fibre path.' }),
  printer({ id: 'mf-mk2', brand: 'Markforged', model: 'Mark Two', processes: ['fdm'], controllers: ['marlin'], envelope: [320, 132, 154], nozzles: [0.4], maxNozzleC: 275, maxBedC: 100, enclosed: true, maxSpeed: 150, maxFlow: 12, vendorLocked: true }),
  printer({ id: 'strat-f370', brand: 'Stratasys', model: 'F370 (FDM)', processes: ['fdm'], controllers: ['marlin'], envelope: [355, 254, 355], nozzles: [0.4], maxNozzleC: 420, maxBedC: 100, chamberC: 80, enclosed: true, maxSpeed: 150, maxFlow: 14, filament: 1.75, vendorLocked: true, notes: 'Runs vendor CMB jobs from GrabCAD Print; plain G-code is generic reference output.' }),
  printer({ id: 'form3', brand: 'Formlabs', model: 'Form 3+ (SLA)', processes: ['sla'], controllers: ['scanvector'], envelope: [145, 145, 185], layerRange: [0.025, 0.1], spotMm: 0.085, laserW: 0.25, vendorLocked: true, axes: 'Z + galvo laser', notes: '405 nm laser, 85 µm spot. PreForm is required to run a job.' }),
  printer({ id: 'eos-p396', brand: 'EOS', model: 'EOS P 396 (SLS)', processes: ['sls'], controllers: ['scanvector'], envelope: [340, 340, 600], layerRange: [0.06, 0.15], spotMm: 0.35, laserW: 70, vendorLocked: true, axes: 'Z + galvo laser', notes: 'CO₂ laser, polymer powder (PA 2200). Jobs run through EOSPRINT.' }),
  printer({ id: 'eos-m290', brand: 'EOS', model: 'EOS M 290 (DMLS)', processes: ['dmls'], controllers: ['scanvector'], envelope: [250, 250, 325], layerRange: [0.02, 0.09], spotMm: 0.1, laserW: 400, vendorLocked: true, axes: 'Z + galvo laser', notes: '400 W fibre laser, inert-gas chamber. Jobs run through EOSPRINT.' }),
  printer({ id: 'eos-m400', brand: 'EOS', model: 'EOS M 400 (DMLS)', processes: ['dmls'], controllers: ['scanvector'], envelope: [400, 400, 400], layerRange: [0.03, 0.09], spotMm: 0.1, laserW: 1000, vendorLocked: true, axes: 'Z + galvo laser' }),
];

export const BRANDS = (kind: MachineKind) => [...new Set(MACHINES.filter((m) => m.kind === kind).map((m) => m.brand))];
export const machineById = (id: string) => MACHINES.find((m) => m.id === id);

// ---------------------------------------------------------------------------
// Subtractive materials (stock) and cutting data

export type MatGroup = 'Aluminium' | 'Steel' | 'Stainless' | 'Titanium & superalloy' | 'Copper alloys' | 'Plastics' | 'Wood & composite' | 'Sheet';
export interface StockMaterial {
  id: string; name: string; group: MatGroup; density: number; hb: number;
  /** Carbide / HSS cutting speed, m/min (starting values for dry-to-flood rough cuts). */
  vcCarbide: number; vcHss: number;
  /** Feed per tooth as a fraction of cutter diameter (before clamping). */
  fzRatio: number;
  /** Kienzle: specific cutting force at 1 mm chip, N/mm² and exponent. */
  kc11: number; mc: number;
  /** Roughing engagement as a multiple of cutter diameter (HEM-style: deep axial, light radial). */
  apRough: number; aeRough: number;
  coolant: 'flood' | 'mist' | 'air' | 'dry';
  /** Laser / plasma sheet data (cutting feed mm/min for 3 mm and the thickness exponent). */
  cutFeed3?: number; laserOk?: boolean; plasmaOk?: boolean;
}
export const STOCK_MATERIALS: StockMaterial[] = [
  { id: 'al6061', name: 'Aluminium 6061-T6', group: 'Aluminium', density: 2.70, hb: 95, vcCarbide: 300, vcHss: 90, fzRatio: 0.018, kc11: 700, mc: 0.25, apRough: 1.5, aeRough: 0.22, coolant: 'flood', cutFeed3: 3500, laserOk: true, plasmaOk: true },
  { id: 'al7075', name: 'Aluminium 7075-T6', group: 'Aluminium', density: 2.81, hb: 150, vcCarbide: 260, vcHss: 75, fzRatio: 0.016, kc11: 850, mc: 0.25, apRough: 1.4, aeRough: 0.2, coolant: 'flood', cutFeed3: 3000, laserOk: true, plasmaOk: true },
  { id: 'steel1018', name: 'Mild steel 1018', group: 'Steel', density: 7.87, hb: 126, vcCarbide: 140, vcHss: 30, fzRatio: 0.010, kc11: 1800, mc: 0.25, apRough: 1.0, aeRough: 0.14, coolant: 'flood', cutFeed3: 2600, laserOk: true, plasmaOk: true },
  { id: 'steel4140', name: 'Alloy steel 4140 (pre-hard)', group: 'Steel', density: 7.85, hb: 285, vcCarbide: 100, vcHss: 20, fzRatio: 0.008, kc11: 2100, mc: 0.25, apRough: 0.9, aeRough: 0.12, coolant: 'flood' },
  { id: 'ss304', name: 'Stainless steel 304', group: 'Stainless', density: 8.00, hb: 170, vcCarbide: 90, vcHss: 18, fzRatio: 0.007, kc11: 2300, mc: 0.21, apRough: 0.8, aeRough: 0.1, coolant: 'flood', cutFeed3: 1900, laserOk: true, plasmaOk: true },
  { id: 'ss316', name: 'Stainless steel 316', group: 'Stainless', density: 8.00, hb: 180, vcCarbide: 80, vcHss: 16, fzRatio: 0.0065, kc11: 2400, mc: 0.21, apRough: 0.8, aeRough: 0.1, coolant: 'flood', cutFeed3: 1800, laserOk: true, plasmaOk: true },
  { id: 'ti64', name: 'Titanium Ti-6Al-4V', group: 'Titanium & superalloy', density: 4.43, hb: 334, vcCarbide: 55, vcHss: 10, fzRatio: 0.0055, kc11: 1500, mc: 0.23, apRough: 0.7, aeRough: 0.08, coolant: 'flood' },
  { id: 'inconel718', name: 'Inconel 718', group: 'Titanium & superalloy', density: 8.19, hb: 330, vcCarbide: 30, vcHss: 6, fzRatio: 0.005, kc11: 2800, mc: 0.22, apRough: 0.5, aeRough: 0.06, coolant: 'flood' },
  { id: 'brass360', name: 'Brass C360 (free-cutting)', group: 'Copper alloys', density: 8.50, hb: 80, vcCarbide: 220, vcHss: 80, fzRatio: 0.014, kc11: 700, mc: 0.25, apRough: 1.4, aeRough: 0.25, coolant: 'mist' },
  { id: 'copper', name: 'Copper C110', group: 'Copper alloys', density: 8.96, hb: 55, vcCarbide: 170, vcHss: 50, fzRatio: 0.012, kc11: 1100, mc: 0.22, apRough: 1.0, aeRough: 0.18, coolant: 'flood' },
  { id: 'delrin', name: 'Acetal / POM (Delrin)', group: 'Plastics', density: 1.41, hb: 10, vcCarbide: 300, vcHss: 150, fzRatio: 0.02, kc11: 300, mc: 0.2, apRough: 1.5, aeRough: 0.4, coolant: 'air' },
  { id: 'peek', name: 'PEEK', group: 'Plastics', density: 1.32, hb: 25, vcCarbide: 200, vcHss: 90, fzRatio: 0.014, kc11: 380, mc: 0.2, apRough: 1.2, aeRough: 0.3, coolant: 'air' },
  { id: 'acrylic', name: 'Acrylic (PMMA)', group: 'Plastics', density: 1.18, hb: 20, vcCarbide: 280, vcHss: 130, fzRatio: 0.018, kc11: 250, mc: 0.2, apRough: 1.2, aeRough: 0.35, coolant: 'air', laserOk: true, cutFeed3: 1800 },
  { id: 'mdf', name: 'MDF / plywood', group: 'Wood & composite', density: 0.75, hb: 5, vcCarbide: 900, vcHss: 400, fzRatio: 0.03, kc11: 60, mc: 0.2, apRough: 2.0, aeRough: 0.5, coolant: 'dry', laserOk: true, cutFeed3: 2200 },
  { id: 'sheet-steel', name: 'Sheet — mild steel (laser / plasma)', group: 'Sheet', density: 7.85, hb: 120, vcCarbide: 0, vcHss: 0, fzRatio: 0, kc11: 0, mc: 0, apRough: 0, aeRough: 0, coolant: 'dry', cutFeed3: 2600, laserOk: true, plasmaOk: true },
  { id: 'sheet-alu', name: 'Sheet — aluminium 5052', group: 'Sheet', density: 2.68, hb: 60, vcCarbide: 0, vcHss: 0, fzRatio: 0, kc11: 0, mc: 0, apRough: 0, aeRough: 0, coolant: 'dry', cutFeed3: 3200, laserOk: true, plasmaOk: true },
  { id: 'sheet-ss', name: 'Sheet — stainless 304', group: 'Sheet', density: 8.0, hb: 170, vcCarbide: 0, vcHss: 0, fzRatio: 0, kc11: 0, mc: 0, apRough: 0, aeRough: 0, coolant: 'dry', cutFeed3: 1900, laserOk: true, plasmaOk: true },
];
export const stockMaterialById = (id: string) => STOCK_MATERIALS.find((m) => m.id === id) ?? STOCK_MATERIALS[0];

// ---------------------------------------------------------------------------
// Additive materials

export interface PrintMaterial {
  id: string; name: string; process: ProcessId | 'fdm'; family: string; density: number;
  /** FDM */
  nozzleC?: number; bedC?: number; chamberC?: number; fan?: number; speed?: number; retract?: number; enclosure?: boolean; abrasive?: boolean; maxVolFlow?: number;
  /** Resin */
  exposure?: number; bottomExposure?: number; bottomLayers?: number; lift?: number; layer?: number;
  /** Powder / laser */
  power?: number; scan?: number; hatch?: number; preheatC?: number; spot?: number; powderLayer?: number;
  notes?: string;
}
export const PRINT_MATERIALS: PrintMaterial[] = [
  { id: 'pla', name: 'PLA', process: 'fdm', family: 'Filament', density: 1.24, nozzleC: 210, bedC: 60, fan: 100, speed: 60, retract: 0.8, maxVolFlow: 15 },
  { id: 'petg', name: 'PETG', process: 'fdm', family: 'Filament', density: 1.27, nozzleC: 235, bedC: 75, fan: 50, speed: 50, retract: 1.0, maxVolFlow: 11 },
  { id: 'abs', name: 'ABS', process: 'fdm', family: 'Filament', density: 1.04, nozzleC: 245, bedC: 100, fan: 20, speed: 50, retract: 0.8, enclosure: true, maxVolFlow: 12 },
  { id: 'asa', name: 'ASA', process: 'fdm', family: 'Filament', density: 1.07, nozzleC: 250, bedC: 100, fan: 20, speed: 50, retract: 0.8, enclosure: true, maxVolFlow: 12 },
  { id: 'tpu', name: 'TPU 95A', process: 'fdm', family: 'Filament', density: 1.21, nozzleC: 225, bedC: 50, fan: 60, speed: 25, retract: 0.5, maxVolFlow: 5 },
  { id: 'pa-cf', name: 'Nylon PA12-CF', process: 'fdm', family: 'Filament', density: 1.15, nozzleC: 270, bedC: 80, fan: 20, speed: 40, retract: 1.0, enclosure: true, abrasive: true, maxVolFlow: 10 },
  { id: 'pc', name: 'Polycarbonate', process: 'fdm', family: 'Filament', density: 1.20, nozzleC: 275, bedC: 110, fan: 10, speed: 40, retract: 1.0, enclosure: true, maxVolFlow: 10 },
  { id: 'peek-f', name: 'PEEK (high-temp)', process: 'fdm', family: 'Filament', density: 1.30, nozzleC: 400, bedC: 140, chamberC: 120, fan: 0, speed: 25, retract: 1.0, enclosure: true, abrasive: false, maxVolFlow: 8, notes: 'Needs an all-metal 400 °C hotend and a heated chamber.' },
  { id: 'resin-std', name: 'Standard resin', process: 'sla', family: 'Photopolymer', density: 1.12, layer: 0.05, exposure: 2.5, bottomExposure: 25, bottomLayers: 6, lift: 6 },
  { id: 'resin-tough', name: 'Tough resin', process: 'sla', family: 'Photopolymer', density: 1.14, layer: 0.05, exposure: 3.2, bottomExposure: 28, bottomLayers: 6, lift: 6 },
  { id: 'resin-castable', name: 'Castable wax resin', process: 'sla', family: 'Photopolymer', density: 1.05, layer: 0.025, exposure: 2.2, bottomExposure: 30, bottomLayers: 8, lift: 5 },
  { id: 'pa12', name: 'Nylon PA12 powder', process: 'sls', family: 'Polymer powder', density: 0.95, power: 28, scan: 5000, hatch: 0.3, preheatC: 170, spot: 0.35, powderLayer: 0.1 },
  { id: 'pa11', name: 'Nylon PA11 powder', process: 'sls', family: 'Polymer powder', density: 0.95, power: 26, scan: 4800, hatch: 0.3, preheatC: 185, spot: 0.35, powderLayer: 0.1 },
  { id: 'alsi10mg', name: 'AlSi10Mg powder', process: 'dmls', family: 'Metal powder', density: 2.67, power: 370, scan: 1300, hatch: 0.19, preheatC: 80, spot: 0.1, powderLayer: 0.03 },
  { id: '316l', name: 'Stainless steel 316L powder', process: 'dmls', family: 'Metal powder', density: 7.99, power: 200, scan: 1000, hatch: 0.10, preheatC: 80, spot: 0.1, powderLayer: 0.02 },
  { id: 'ti64p', name: 'Ti-6Al-4V powder', process: 'dmls', family: 'Metal powder', density: 4.43, power: 280, scan: 1200, hatch: 0.12, preheatC: 200, spot: 0.1, powderLayer: 0.03 },
  { id: 'in718p', name: 'Inconel 718 powder', process: 'dmls', family: 'Metal powder', density: 8.19, power: 285, scan: 960, hatch: 0.11, preheatC: 80, spot: 0.1, powderLayer: 0.04 },
];
export const printMaterialById = (id: string) => PRINT_MATERIALS.find((m) => m.id === id) ?? PRINT_MATERIALS[0];

// ---------------------------------------------------------------------------
// Tool library

export type ToolKind = 'flat' | 'ball' | 'drill' | 'bull';
export interface Tool {
  id: string; kind: ToolKind; name: string;
  /** Cutting diameter, mm. */
  d: number; flutes: number; fluteLen: number;
  /** Total stick-out from the holder face, mm, and holder diameter for collision checks. */
  stickout: number; holderD: number;
  material: 'carbide' | 'HSS'; coating: string;
  /** Corner radius for bull-nose, mm. */
  cr?: number;
  /** Drill point angle. */
  point?: number;
}
const mk = (kind: ToolKind, d: number): Tool => {
  const flat = kind !== 'drill';
  const fluteLen = kind === 'drill' ? Math.max(8, d * 6) : Math.max(5, d * 2.5);
  return {
    id: `${kind}-${d}`, kind,
    name: kind === 'flat' ? `Ø${d} flat end mill` : kind === 'ball' ? `Ø${d} ball nose` : kind === 'bull' ? `Ø${d} bull-nose` : `Ø${d} drill`,
    d, flutes: kind === 'drill' ? 2 : d <= 3 ? 2 : d <= 12 ? (kind === 'flat' ? 3 : 2) : 4,
    fluteLen, stickout: fluteLen + (d <= 6 ? 14 : 22), holderD: Math.max(d + 8, 22), material: 'carbide', coating: flat ? 'TiAlN' : 'TiN', cr: kind === 'bull' ? Math.min(1, d / 4) : undefined, point: kind === 'drill' ? 135 : undefined,
  };
};
export const TOOL_LIBRARY: Tool[] = [
  ...[2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((d) => mk('flat', d)),
  ...[2, 3, 4, 6, 8, 10, 12].map((d) => mk('ball', d)),
  ...[3, 3.3, 4, 4.2, 5, 5.5, 6, 6.8, 8, 8.5, 10, 10.2, 12].map((d) => mk('drill', d)),
];
export const toolById = (id: string) => TOOL_LIBRARY.find((t) => t.id === id);
export const NOZZLES = [0.2, 0.25, 0.4, 0.6, 0.8, 1.0];

// ---------------------------------------------------------------------------
// Stock and fixtures

export type StockShape = 'block' | 'cylinder';
export type WorkHold = 'vise' | 'clamps' | 'plate' | 'chuck';
export const WORK_HOLDS: { id: WorkHold; label: string; hint: string }[] = [
  { id: 'vise', label: 'Machine vise', hint: 'Two jaws along Y, gripping the lower part of the stock.' },
  { id: 'clamps', label: 'Toe clamps', hint: 'Four clamp blocks on the corners of the stock.' },
  { id: 'plate', label: 'Fixture plate / vacuum', hint: 'Stock sits on the plate with no side obstructions.' },
  { id: 'chuck', label: '3-jaw chuck (lathe)', hint: 'Jaws grip the left end of the bar.' },
];
export const WCS_LIST = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'] as const;
export type WcsId = typeof WCS_LIST[number];
export type OriginMode = 'top-corner' | 'top-center';

export interface StockSetup {
  shape: StockShape; auto: boolean;
  /** Final block size when auto = false (mm), measured over the part's footprint. */
  size: [number, number, number];
  /** Margin added around the part when auto = true. */
  margin: number; topAllow: number;
  wcs: WcsId; origin: OriginMode;
  hold: WorkHold;
  /** Depth of stock below the part held by the vise / chuck. */
  holdDepth: number; jawHeight: number; jawLength: number; jawThick: number;
}
export const DEFAULT_STOCK: StockSetup = {
  shape: 'block', auto: true, size: [100, 80, 30], margin: 4, topAllow: 2, wcs: 'G54', origin: 'top-corner',
  hold: 'vise', holdDepth: 12, jawHeight: 10, jawLength: 120, jawThick: 25,
};

// ---------------------------------------------------------------------------
// Printing / machining options kept in one settings bag

export interface PrintSettings {
  nozzle: number; layer: number; firstLayer: number; lineWidthK: number; perimeters: number; topLayers: number; bottomLayers: number;
  infill: number; infillAngle: number; speed: number; firstLayerSpeed: number; travel: number; retract: number; retractSpeed: number;
  nozzleC: number; bedC: number; fan: number; support: 'none' | 'auto'; overhang: number; adhesion: 'skirt' | 'brim' | 'none'; brimMm: number;
  /** Laser / resin processes. */
  exposure: number; bottomExposure: number; bottomLayers2: number; lift: number; power: number; scan: number; hatch: number;
  pattern: 'lines' | 'grid'; flow: number; zhop: number; supportDensity: number; accel: number;
}
export const DEFAULT_PRINT: PrintSettings = {
  nozzle: 0.4, layer: 0.2, firstLayer: 0.28, lineWidthK: 1.1, perimeters: 2, topLayers: 4, bottomLayers: 3, infill: 20, infillAngle: 45,
  speed: 60, firstLayerSpeed: 25, travel: 150, retract: 0.8, retractSpeed: 35, nozzleC: 210, bedC: 60, fan: 100, support: 'auto', overhang: 50, adhesion: 'brim', brimMm: 4,
  exposure: 2.5, bottomExposure: 25, bottomLayers2: 6, lift: 6, power: 200, scan: 1000, hatch: 0.1,
  pattern: 'lines', flow: 1.0, zhop: 0.3, supportDensity: 15, accel: 3000,
};

export interface MillSettings {
  /** Roughing allowance left on walls / floors. */
  allowRadial: number; allowAxial: number;
  /** User overrides; undefined = engine decides. */
  apRough?: number; aeRough?: number; aeFinish?: number; cusp: number;
  drill: boolean; finish: boolean; rough: boolean; clearance: number;
  /** Resolution of the machining model, mm. 0 = automatic. */
  cell: number;
}
export const DEFAULT_MILL: MillSettings = { allowRadial: 0.3, allowAxial: 0.2, cusp: 0.01, drill: true, finish: true, rough: true, clearance: 5, cell: 0 };

export const SEND_PROTOCOLS: { id: SendProtocol; label: string; hint: string; port: number }[] = [
  { id: 'moonraker', label: 'Klipper · Moonraker', hint: 'POST /server/files/upload on port 7125', port: 7125 },
  { id: 'octoprint', label: 'OctoPrint', hint: 'POST /api/files/local with an application key', port: 80 },
  { id: 'duet', label: 'Duet / RepRapFirmware', hint: 'POST /rr_upload on the Duet web server', port: 80 },
  { id: 'http', label: 'Generic HTTP POST', hint: 'POST the raw program to a URL you give', port: 80 },
];
