// Data model shared by the CAE UI, the worker and the solvers: case definition, loads, regions, analyses and results.
// Everything here is plain data (structured-clone friendly).

import type { Material } from './materials';

// ---------------------------------------------------------------------------------------------
// Geometry / regions

export interface CaeBody {
  id: string; name: string;
  tris: Float32Array;                     // 9 floats per triangle (mm)
  mat: Material;
  fibre: 0 | 1 | 2;                       // fibre / grain axis for orthotropic materials
  role: 'solid' | 'fluid' | 'carve';      // fluid = the part is the flow passage (internal flow)
  power: number;                          // heat dissipation, W (electronics components)
  rjc: number;                            // junction-to-case thermal resistance, K/W
  potential: number | null;               // prescribed electric potential of a conductor body, V
  magnet: [number, number, number] | null; // magnetisation direction (unit vector); strength Br from the material
}

export type RegionKind = 'tris' | 'plane' | 'box' | 'body' | 'all' | 'edge' | 'point';
export interface Region {
  id: string; name: string; kind: RegionKind;
  tris?: number[]; bodyIndex?: number;     // kind 'tris': triangle indices of body `bodyIndex`; kind 'body': that body
  axis?: 0 | 1 | 2; side?: 0 | 1;          // kind 'plane': the min (0) or max (1) face of the part's bounding box along `axis`
  box?: [number, number, number, number, number, number];   // kind 'box': x0 y0 z0 x1 y1 z1
  segs?: number[];                         // kind 'edge': picked edge polylines as segments, 6 floats each (x0 y0 z0 x1 y1 z1), mm
  pts?: number[];                          // kind 'point': picked points, 3 floats each, mm
  color: string;
}

// ---------------------------------------------------------------------------------------------
// Loads and restraints

export type LoadType =
  | 'fixed' | 'frictionless' | 'spring' | 'force' | 'torque' | 'pressure' | 'gravity' | 'centrifugal'
  | 'temperature' | 'heatflux' | 'heatpower' | 'convection' | 'radiation'
  | 'voltage' | 'currentin' | 'coil';

export interface Load { id: string; type: LoadType; region: string; name: string; on: boolean; p: Record<string, number> }

export interface LoadField { k: string; label: string; unit: string; def: number; step?: number; min?: number; max?: number }
export interface LoadSpec { type: LoadType; label: string; group: 'Restraint' | 'Mechanical' | 'Thermal' | 'Electrical' | 'Magnetic'; region: 'face' | 'none' | 'face-or-body'; fields: LoadField[]; hint: string; color: string }

const f = (k: string, label: string, unit: string, def: number, extra: Partial<LoadField> = {}): LoadField => ({ k, label, unit, def, ...extra });

export const LOAD_SPECS: LoadSpec[] = [
  { type: 'fixed', label: 'Fixed support', group: 'Restraint', region: 'face', fields: [], hint: 'Zero displacement in X, Y and Z on the selected faces, edges or points.', color: '#4f8cff' },
  { type: 'frictionless', label: 'Frictionless support', group: 'Restraint', region: 'face', fields: [], hint: 'Blocks movement normal to the face, free to slide in the face (symmetry plane, roller).', color: '#35c4c4' },
  { type: 'spring', label: 'Elastic support', group: 'Restraint', region: 'face', fields: [f('k', 'Stiffness per area', 'N/mm³', 10, { step: 1, min: 0 })], hint: 'Winkler foundation: spring stiffness per unit area in all three directions.', color: '#6dd47e' },
  { type: 'force', label: 'Force', group: 'Mechanical', region: 'face', fields: [f('fx', 'Fx', 'N', 0), f('fy', 'Fy', 'N', 0), f('fz', 'Fz', 'N', -1000)], hint: 'Total force vector spread over the selected faces, along the selected edges (line load) or at the selected points (point load).', color: '#ff7a45' },
  { type: 'torque', label: 'Torque', group: 'Mechanical', region: 'face', fields: [f('m', 'Moment', 'N·mm', 10000), f('ax', 'Axis x', '', 0), f('ay', 'Axis y', '', 0), f('az', 'Axis z', '', 1)], hint: 'Tangential traction producing the moment about an axis through the origin of the selection.', color: '#ff9f40' },
  { type: 'pressure', label: 'Pressure', group: 'Mechanical', region: 'face', fields: [f('p', 'Pressure', 'MPa', 1, { step: 0.1 })], hint: 'Pressure acting normal to the faces (positive pushes into the part).', color: '#ff5d73' },
  { type: 'gravity', label: 'Gravity / G-force', group: 'Mechanical', region: 'none', fields: [f('gx', 'a x', 'g', 0), f('gy', 'a y', 'g', 0), f('gz', 'a z', 'g', -1)], hint: 'Inertia load from a uniform acceleration given in g. Standard gravity is (0, 0, −1) g.', color: '#d0a85c' },
  { type: 'centrifugal', label: 'Centrifugal load', group: 'Mechanical', region: 'none', fields: [f('rpm', 'Speed', 'rpm', 3000, { min: 0 }), f('cx', 'Axis point x', 'mm', 0), f('cy', 'Axis point y', 'mm', 0), f('cz', 'Axis point z', 'mm', 0), f('ax', 'Axis x', '', 0), f('ay', 'Axis y', '', 0), f('az', 'Axis z', '', 1)], hint: 'Rotation about an axis: body force ρ·ω²·r.', color: '#e0b04c' },
  { type: 'temperature', label: 'Temperature', group: 'Thermal', region: 'face-or-body', fields: [f('t', 'Temperature', '°C', 100)], hint: 'Fixed temperature on faces, edges, points or on a whole body.', color: '#ff4d4d' },
  { type: 'heatflux', label: 'Heat flux', group: 'Thermal', region: 'face', fields: [f('q', 'Flux into the part', 'W/m²', 5000)], hint: 'Heat flowing into the part through the faces.', color: '#ff8a3d' },
  { type: 'heatpower', label: 'Heat power', group: 'Thermal', region: 'face-or-body', fields: [f('w', 'Power', 'W', 10)], hint: 'Total heat generation, spread over the volume of the body, the selected faces, edges or points.', color: '#ffb02e' },
  { type: 'convection', label: 'Convection', group: 'Thermal', region: 'face', fields: [f('h', 'Film coefficient', 'W/m²K', 25, { min: 0 }), f('tinf', 'Fluid temperature', '°C', 22)], hint: 'Heat exchange with the surrounding fluid: q = h (T − T∞).', color: '#42c6ff' },
  { type: 'radiation', label: 'Radiation', group: 'Thermal', region: 'face', fields: [f('eps', 'Emissivity', '', 0.8, { step: 0.05, min: 0, max: 1 }), f('tinf', 'Surroundings', '°C', 22)], hint: 'Grey-body radiation to the surroundings, linearised and iterated.', color: '#ff6fb5' },
  { type: 'voltage', label: 'Voltage / potential', group: 'Electrical', region: 'face-or-body', fields: [f('v', 'Potential', 'V', 100)], hint: 'Fixed electric potential on faces, edges, points or on a whole conductor body (0 V = ground).', color: '#ffe14d' },
  { type: 'currentin', label: 'Current injection', group: 'Electrical', region: 'face', fields: [f('i', 'Current into the part', 'A', 1)], hint: 'Current entering through the faces, edges or points (DC conduction).', color: '#f5d33a' },
  { type: 'coil', label: 'Coil (current loop)', group: 'Magnetic', region: 'none', fields: [f('cx', 'Centre x', 'mm', 0), f('cy', 'Centre y', 'mm', 0), f('cz', 'Centre z', 'mm', 0), f('ax', 'Axis x', '', 0), f('ay', 'Axis y', '', 0), f('az', 'Axis z', '', 1), f('r', 'Radius', 'mm', 20, { min: 0.1 }), f('ni', 'Ampere-turns', 'A·turn', 500)], hint: 'Circular coil modelled by Biot–Savart; permeable bodies and magnets in the model respond to its field.', color: '#b57bff' },
];
export const loadSpec = (t: LoadType) => LOAD_SPECS.find((s) => s.type === t)!;
/** Load types that can also be applied to picked edges and points (node sets), not only to faces. */
export const NODE_LOADS: LoadType[] = ['fixed', 'force', 'temperature', 'heatpower', 'voltage', 'currentin'];
export const acceptsNodes = (t: LoadType) => NODE_LOADS.includes(t);

// ---------------------------------------------------------------------------------------------
// Analyses

export type AnalysisGroup = 'Structural & Mechanical' | 'Fluid Dynamics & Aerodynamics' | 'Civil & Infrastructure' | 'Electrical & Electronics' | 'Multiphysics';

export type AnalysisId =
  | 'static' | 'modal' | 'buckling' | 'fatigue' | 'dynamic' | 'impact' | 'convergence'
  | 'windtunnel' | 'internal' | 'highspeed'
  | 'seismic' | 'bridge' | 'retaining'
  | 'thermal' | 'joule' | 'electrostatic' | 'magnetostatic' | 'emc' | 'heatsink' | 'integrity'
  | 'fsi' | 'thermostress';

export interface ParamSpec {
  k: string; label: string; unit?: string; type: 'num' | 'select' | 'bool' | 'text'; def: number | string | boolean;
  min?: number; max?: number; step?: number; options?: { v: string; label: string }[]; hint?: string; show?: (p: Record<string, number | string | boolean>) => boolean;
}

export interface AnalysisSpec {
  id: AnalysisId; group: AnalysisGroup; label: string; short: string; blurb: string;
  loads: LoadType[];                      // load types that apply
  needs: string;                          // what the set-up needs (shown as a checklist hint)
  params: ParamSpec[];
  domain: 'solid' | 'air-box' | 'flow' | 'none';   // how the geometry is prepared
  sample?: string;                        // id of a suggested sample part
  limits: string[];                       // honest limitations shown with the results
}

const sel = (k: string, label: string, def: string, options: [string, string][], extra: Partial<ParamSpec> = {}): ParamSpec => ({ k, label, type: 'select', def, options: options.map(([v, l]) => ({ v, label: l })), ...extra });
const num = (k: string, label: string, unit: string, def: number, min?: number, max?: number, step?: number, extra: Partial<ParamSpec> = {}): ParamSpec => ({ k, label, unit, type: 'num', def, min, max, step, ...extra });
const bool = (k: string, label: string, def: boolean, extra: Partial<ParamSpec> = {}): ParamSpec => ({ k, label, type: 'bool', def, ...extra });

const CRIT = sel('criterion', 'Failure criterion', 'auto', [['auto', 'Automatic (by material)'], ['vonmises', 'Von Mises (distortion energy)'], ['tresca', 'Tresca (max shear)'], ['principal', 'Max principal stress'], ['mohr', 'Mohr–Coulomb (brittle / soil)'], ['tsaiwu', 'Tsai–Wu (composite)']]);
const FOS = num('fosTarget', 'Required safety factor', '', 1.5, 1, 20, 0.1);
const ELEM = sel('elem', 'Element formulation', 'hex', [['hex', 'Hexahedral (8-node, enhanced strain)'], ['tet', 'Tetrahedral (split voxels, 6 per cell)']]);
const DIR3 = (k: string, label: string, def: string) => sel(k, label, def, [['x', 'X'], ['y', 'Y'], ['z', 'Z']]);

export const ANALYSES: AnalysisSpec[] = [
  { id: 'static', group: 'Structural & Mechanical', label: 'Static stress & deformation', short: 'Static', blurb: 'Linear static analysis: displacement, strain, stress, yield criteria and the factor-of-safety map.', loads: ['fixed', 'frictionless', 'spring', 'force', 'torque', 'pressure', 'gravity', 'centrifugal'], needs: 'At least one support and one load.', domain: 'solid', sample: 'bracket',
    params: [CRIT, FOS, ELEM, bool('selfweight', 'Include self-weight', false), bool('refine', 'Refine the hot-spot (sub-model)', false, { hint: 'Re-solves a box around the highest stress at half the element size, driven by the coarse-model displacements.' })],
    limits: ['Linear elastic, small displacements.', 'Voxel (staircase) mesh: peak stresses at sharp corners and fillets depend on the mesh. Use the convergence study.'] },
  { id: 'modal', group: 'Structural & Mechanical', label: 'Modal / frequency analysis', short: 'Modal', blurb: 'Natural frequencies and mode shapes, with resonance detection against operating frequencies.', loads: ['fixed', 'frictionless', 'spring'], needs: 'Supports (leave free for free-free modes).', domain: 'solid', sample: 'bracket',
    params: [num('nModes', 'Number of modes', '', 8, 1, 20, 1), ELEM, { k: 'operating', label: 'Operating frequencies (Hz, comma list)', type: 'text', def: '' }, num('band', 'Resonance band', '± %', 15, 1, 50, 1)],
    limits: ['Rigid-body modes of unsupported parts are listed as ≈ 0 Hz and skipped.'] },
  { id: 'buckling', group: 'Structural & Mechanical', label: 'Linear buckling', short: 'Buckling', blurb: 'Critical load factors and buckled shapes for the applied loads.', loads: ['fixed', 'frictionless', 'spring', 'force', 'pressure', 'gravity'], needs: 'Supports and compressive loads.', domain: 'solid', sample: 'column',
    params: [num('nModes', 'Number of modes', '', 3, 1, 8, 1), ELEM, FOS],
    limits: ['Eigenvalue (bifurcation) buckling of the perfect structure; imperfection sensitivity is not included.'] },
  { id: 'fatigue', group: 'Structural & Mechanical', label: 'Fatigue life', short: 'Fatigue', blurb: 'Stress-life (S-N) fatigue with Marin factors, mean-stress correction, damage and fatigue safety factor.', loads: ['fixed', 'frictionless', 'spring', 'force', 'torque', 'pressure', 'gravity', 'centrifugal'], needs: 'Supports and the load at its peak value.', domain: 'solid', sample: 'bracket',
    params: [ELEM, sel('cycle', 'Loading', 'ratio', [['ratio', 'Load ratio R = Fmin/Fmax'], ['full', 'Fully reversed (R = −1)'], ['zero', 'Zero-based (R = 0)']]),
      num('R', 'Load ratio R', '', 0, -1, 0.95, 0.05, { show: (p) => p.cycle === 'ratio' }),
      sel('theory', 'Mean-stress correction', 'goodman', [['goodman', 'Goodman'], ['gerber', 'Gerber'], ['soderberg', 'Soderberg'], ['swt', 'Smith–Watson–Topper']]),
      sel('finish', 'Surface finish', 'machined', [['polished', 'Polished'], ['ground', 'Ground'], ['machined', 'Machined / cold drawn'], ['hot', 'Hot rolled'], ['forged', 'As forged']]),
      num('kf', 'Fatigue notch factor Kf', '', 1, 1, 5, 0.1), num('reliab', 'Reliability', '%', 99, 50, 99.99, 0.5), num('temp', 'Operating temperature', '°C', 20, -50, 600, 5),
      num('life', 'Required life', 'cycles', 1e6, 1e3, 1e10, undefined), FOS],
    limits: ['Stress-life method, uniaxial equivalent (von Mises) stress. Valid for high-cycle fatigue below yield.', 'Size factor uses the section equivalent diameter estimated from the part.'] },
  { id: 'dynamic', group: 'Structural & Mechanical', label: 'Dynamic response (modal superposition)', short: 'Dynamic', blurb: 'Harmonic sweep or transient response of the loaded structure by modal superposition.', loads: ['fixed', 'frictionless', 'spring', 'force', 'pressure', 'gravity'], needs: 'Supports and a load pattern (its direction and distribution are used; its amplitude is scaled in time).', domain: 'solid', sample: 'bracket',
    params: [ELEM, sel('kind', 'Excitation', 'harmonic', [['harmonic', 'Harmonic sweep'], ['pulse', 'Half-sine pulse'], ['step', 'Suddenly applied step']]),
      num('nModes', 'Modes used', '', 10, 2, 20, 1), num('zeta', 'Damping ratio ζ', '', 0.02, 0.001, 0.5, 0.005),
      num('f1', 'Sweep from', 'Hz', 10, 0.1, 1e5, undefined, { show: (p) => p.kind === 'harmonic' }), num('f2', 'to', 'Hz', 2000, 0.1, 1e5, undefined, { show: (p) => p.kind === 'harmonic' }),
      num('dur', 'Pulse duration', 'ms', 5, 0.01, 1e4, undefined, { show: (p) => p.kind === 'pulse' || p.kind === 'step' }),
      num('amp', 'Load amplitude factor', '×', 1, 0.01, 1000, 0.1), FOS],
    limits: ['Linear, proportional (modal) damping. Truncated modal basis: high-frequency content beyond the last mode is missing.'] },
  { id: 'impact', group: 'Structural & Mechanical', label: 'Impact / crash (explicit dynamics)', short: 'Impact', blurb: 'The part strikes a rigid wall at a given speed; explicit time integration with contact.', loads: [], needs: 'Impact speed and direction. The part flies free: restraints are ignored.', domain: 'solid', sample: 'bracket',
    params: [num('v', 'Impact speed', 'm/s', 5, 0.01, 500, 0.5), sel('dir', 'Direction of travel', '-z', [['+x', '+X'], ['-x', '−X'], ['+y', '+Y'], ['-y', '−Y'], ['+z', '+Z'], ['-z', '−Z']]),
      num('tmax', 'Duration', 'ms', 0, 0, 1000, undefined, { hint: '0 = automatic (several wave transits)' }), num('zeta', 'Numerical damping', '', 0.002, 0, 0.1, 0.001),
      num('mu', 'Wall friction', '', 0, 0, 1, 0.05), FOS],
    limits: ['Elastic material only: stresses above yield are flagged but plastic flow, fracture and element erosion are not modelled.', 'Rigid frictionless wall by penalty contact.'] },
  { id: 'convergence', group: 'Structural & Mechanical', label: 'Mesh convergence study', short: 'Convergence', blurb: 'Solves the static model on three to four meshes and extrapolates the peak stress and displacement.', loads: ['fixed', 'frictionless', 'spring', 'force', 'torque', 'pressure', 'gravity', 'centrifugal'], needs: 'The same set-up as the static analysis.', domain: 'solid', sample: 'bracket',
    params: [ELEM, num('levels', 'Mesh levels', '', 3, 2, 4, 1), num('ratio', 'Refinement ratio', '×', 1.4, 1.2, 2, 0.1), num('tolPct', 'Accept when change <', '%', 5, 0.5, 20, 0.5)],
    limits: ['Stress at geometric singularities (sharp re-entrant corners, point loads) never converges; use the displacement and the strain energy for those cases.'] },

  { id: 'windtunnel', group: 'Fluid Dynamics & Aerodynamics', label: 'Virtual wind tunnel (external flow)', short: 'Wind tunnel', blurb: 'Incompressible external flow around the part (lattice-Boltzmann LES): drag, lift, streamlines, pressure and wake.', loads: [], needs: 'Flow speed and angle of attack. No loads are needed.', domain: 'flow', sample: 'wing',
    params: [num('U', 'Inlet velocity', 'm/s', 30, 0.1, 340, 1), num('aoa', 'Angle of attack', '°', 4, -45, 45, 1), num('beta', 'Yaw angle', '°', 0, -45, 45, 1),
      sel('fluid', 'Fluid', 'air', [['air', 'Air, 20 °C, 1 atm'], ['water', 'Water, 20 °C'], ['custom', 'Custom']]),
      num('rho', 'Density', 'kg/m³', 1.204, 0.01, 2000, undefined, { show: (p) => p.fluid === 'custom' }), num('mu', 'Dynamic viscosity', 'Pa·s', 1.81e-5, 1e-7, 10, undefined, { show: (p) => p.fluid === 'custom' }),
      num('sound', 'Speed of sound', 'm/s', 343, 100, 5000, undefined, { show: (p) => p.fluid === 'custom' }),
      sel('turb', 'Turbulence', 'les', [['auto', 'Automatic (by Reynolds number)'], ['laminar', 'Laminar'], ['les', 'Turbulent (Smagorinsky LES)']]),
      sel('ground', 'Ground plane', 'off', [['off', 'No ground (free air)'], ['slip', 'Ground, slip'], ['wall', 'Ground, no-slip']]),
      sel('quality', 'Resolution', 'standard', [['fast', 'Fast (80 k cells, about 1 min)'], ['standard', 'Standard (200 k cells, about 3 min)'], ['fine', 'Fine (400 k cells, about 10 min)']]),
      num('Lref', 'Reference length', 'mm', 0, 0, 1e6, undefined, { hint: '0 = automatic (length of the part along the flow)' }), num('Aref', 'Reference area', 'mm²', 0, 0, 1e9, undefined, { hint: '0 = automatic (frontal area)' }),
      num('Tbody', 'Body surface temperature (heat transfer)', '°C', 0, -50, 1500, 1, { hint: '0 = no heat transfer' }), num('Tinf', 'Free-stream temperature', '°C', 20, -50, 1500, 1)],
    limits: ['Voxel (staircase) walls and wall functions are not used: skin friction and separation are indicative.', 'Weakly compressible lattice scheme: valid to about Mach 0.3, with a Prandtl–Glauert correction to the lift up to Mach 0.8.', 'Blockage-corrected coefficients. Benchmark: drag of a sphere is over-predicted by 15 – 40 % at the standard resolution; use for comparing designs and verify absolute values against a reference case.'] },
  { id: 'internal', group: 'Fluid Dynamics & Aerodynamics', label: 'Internal flow & conjugate heat transfer', short: 'Internal flow', blurb: 'Flow through a duct, pipe, manifold or heat exchanger, pressure drop and (optionally) conjugate heat transfer with heated solids.', loads: [], needs: 'The flow passage as a "Fluid" body (and optional solid bodies with heat power).', domain: 'flow', sample: 'duct',
    params: [DIR3('axis', 'Flow direction', 'x'), num('U', 'Inlet velocity', 'm/s', 2, 0.001, 200, 0.1), sel('fluid', 'Fluid', 'water', [['air', 'Air, 20 °C'], ['water', 'Water, 20 °C'], ['oil', 'Engine oil, 40 °C']]),
      sel('turb', 'Turbulence', 'auto', [['auto', 'Automatic (by Reynolds number)'], ['laminar', 'Laminar'], ['les', 'Turbulent (Smagorinsky LES)']]),
      sel('quality', 'Resolution', 'standard', [['fast', 'Fast (80 k cells)'], ['standard', 'Standard (200 k cells)'], ['fine', 'Fine (400 k cells)']]),
      bool('heat', 'Conjugate heat transfer', false), num('Tin', 'Inlet fluid temperature', '°C', 20, -50, 1000, 1, { show: (p) => !!p.heat })],
    limits: ['The passage is resolved on a voxel grid: pressure loss is indicative within about ±25 % for coarse passages.', 'Heat-transfer solution is steady, one-way coupled to the converged flow.'] },
  { id: 'highspeed', group: 'Fluid Dynamics & Aerodynamics', label: 'Supersonic & hypersonic flow (shock-expansion panels)', short: 'Supersonic', blurb: 'Panel estimate of surface pressure, wave drag and lift for supersonic and hypersonic flow: tangent-wedge compression, Prandtl–Meyer expansion and modified Newtonian theory, with the standard atmosphere by altitude.', loads: [], needs: 'Mach number, altitude and angle of attack.', domain: 'none', sample: 'wing',
    params: [num('mach', 'Mach number', '', 2.5, 1.2, 25, 0.1), num('alt', 'Altitude', 'm', 10000, 0, 80000, 500), num('aoa', 'Angle of attack', '°', 3, -45, 45, 1), num('beta', 'Yaw angle', '°', 0, -45, 45, 1), bool('shadow', 'Shadow hidden surfaces', true), bool('friction', 'Add flat-plate skin friction', true)],
    limits: ['Valid for Mach ≥ 1.2: below Mach 0.8 use the virtual wind tunnel; the transonic range (0.8 – 1.2) is not resolved by any of the solvers and is refused.', 'Local-inclination panel methods: shock–shock and shock–boundary-layer interaction, real-gas effects above about Mach 8 and base-flow separation are not modelled. Treat as a design-stage estimate (typically ±15 – 25 % on drag).'] },

  { id: 'seismic', group: 'Civil & Infrastructure', label: 'Seismic response (spectrum / ground motion)', short: 'Seismic', blurb: 'Response-spectrum analysis (CQC) or time-history analysis under a synthetic ground motion.', loads: ['fixed', 'spring', 'gravity'], needs: 'Foundation supports.', domain: 'solid', sample: 'frame',
    params: [ELEM, sel('method', 'Method', 'spectrum', [['spectrum', 'Response spectrum (CQC)'], ['history', 'Time history (synthetic ground motion)']]),
      DIR3('dir', 'Ground-motion direction', 'x'), num('pga', 'Peak ground acceleration', 'g', 0.3, 0.01, 2, 0.05),
      sel('soil', 'Site class', 'C', [['A', 'A — rock'], ['B', 'B — soft rock'], ['C', 'C — dense soil'], ['D', 'D — stiff soil'], ['E', 'E — soft soil']]),
      num('R', 'Response modification (R)', '', 1, 1, 8, 0.5), num('zeta', 'Damping ratio ζ', '', 0.05, 0.005, 0.2, 0.005), num('nModes', 'Modes used', '', 12, 3, 20, 1),
      num('dur', 'Duration', 's', 20, 5, 60, 1, { show: (p) => p.method === 'history' }), num('seed', 'Random seed', '', 1, 1, 9999, 1, { show: (p) => p.method === 'history' }), FOS],
    limits: ['Linear elastic response. Inelastic behaviour is approximated only by the response modification factor R.', 'Design spectrum shape follows the generic EC8 / ASCE 7 form, scaled to your PGA; check your national code for design values.'] },
  { id: 'bridge', group: 'Civil & Infrastructure', label: 'Bridge: deflection, traffic & wind', short: 'Bridge', blurb: 'Static deflection under dead, live and wind load; dynamic amplification from a vehicle crossing at speed.', loads: ['fixed', 'frictionless', 'spring', 'force', 'pressure', 'gravity'], needs: 'Bearings (supports) and, for the traffic study, a "Traffic lane" top-face region.', domain: 'solid', sample: 'bridge',
    params: [ELEM, DIR3('span', 'Span direction', 'x'), num('deadf', 'Dead load factor', '×', 1, 0, 3, 0.05), num('P', 'Vehicle axle load', 'kN', 100, 0, 5000, 10), num('speed', 'Vehicle speed', 'km/h', 80, 1, 400, 5),
      num('wind', 'Wind speed', 'm/s', 30, 0, 90, 1), num('Cd', 'Wind drag coefficient', '', 1.3, 0.2, 3, 0.05), sel('winddir', 'Wind direction', 'y', [['x', 'X'], ['y', 'Y']]), num('zeta', 'Damping ratio ζ', '', 0.02, 0.002, 0.2, 0.002),
      num('limit', 'Deflection limit L /', '', 800, 100, 2000, 50), FOS],
    limits: ['One moving axle on a linear structure (modal superposition); vehicle–bridge interaction and road roughness are not modelled.', 'Wind: quasi-static pressure q = ½ρU²Cd on the windward projected area. No aeroelastic flutter / vortex shedding.'] },
  { id: 'retaining', group: 'Civil & Infrastructure', label: 'Retaining wall & soil–structure interaction', short: 'Retaining wall', blurb: 'Rankine / Coulomb earth pressure with sliding, overturning and bearing checks, and a 3-D elastic soil–structure model with a Mohr–Coulomb proximity index.', loads: ['fixed', 'pressure', 'gravity'], needs: 'A wall body and one or more soil bodies (materials from the Soil & rock group).', domain: 'solid', sample: 'retaining',
    params: [ELEM, num('H', 'Retained height', 'mm', 0, 0, 1e6, undefined, { hint: '0 = automatic from the wall' }), num('phi', 'Backfill friction angle', '°', 32, 15, 45, 1), num('gammaS', 'Backfill unit weight', 'kN/m³', 19, 10, 24, 0.5), num('q', 'Surcharge', 'kPa', 10, 0, 500, 1),
      num('delta', 'Wall friction δ', '°', 20, 0, 40, 1), num('beta', 'Backfill slope', '°', 0, 0, 30, 1), num('gw', 'Water table above base', 'mm', 0, 0, 1e6, undefined), num('mu', 'Base friction coefficient', '', 0.5, 0.1, 1, 0.05), num('qa', 'Allowable bearing pressure', 'kPa', 200, 20, 2000, 10), FOS],
    limits: ['Plane-strain classical checks assume a vertical wall and a homogeneous cohesionless backfill.', 'The 3-D soil model is linear elastic: it shows load paths and the proximity to Mohr–Coulomb failure, not post-failure behaviour.'] },

  { id: 'thermal', group: 'Electrical & Electronics', label: 'Thermal management (steady & transient)', short: 'Thermal', blurb: 'Heat conduction with convection and radiation: PCB heat distribution, heat sinks and junction temperatures.', loads: ['temperature', 'heatflux', 'heatpower', 'convection', 'radiation'], needs: 'A heat source and a way to lose heat (convection or fixed temperature).', domain: 'solid', sample: 'pcb',
    params: [sel('mode', 'Analysis', 'steady', [['steady', 'Steady state'], ['transient', 'Transient']]), num('T0', 'Initial temperature', '°C', 22, -100, 1500, 1, { show: (p) => p.mode === 'transient' }),
      num('tend', 'End time', 's', 300, 0.01, 1e6, undefined, { show: (p) => p.mode === 'transient' }), num('tlimit', 'Temperature limit', '°C', 85, -50, 1500, 1), num('Tamb', 'Ambient (junction reference)', '°C', 22, -50, 100, 1)],
    limits: ['Conduction in a voxel model; convection coefficients are inputs, not computed (use the internal-flow / wind-tunnel analysis to estimate them).', 'Thin copper traces thinner than the element size are smeared.'] },
  { id: 'joule', group: 'Electrical & Electronics', label: 'DC conduction & Joule heating', short: 'Joule heating', blurb: 'Current density, resistance and the temperature rise caused by resistive heating.', loads: ['voltage', 'currentin', 'convection', 'temperature'], needs: 'Two voltage terminals (or one voltage and one current terminal).', domain: 'solid', sample: 'busbar',
    params: [bool('coupled', 'Thermal coupling (Joule heat → temperature)', true), num('tlimit', 'Temperature limit', '°C', 105, 20, 1500, 1), bool('tempdep', 'Temperature-dependent resistivity (copper/aluminium)', true)],
    limits: ['DC / low frequency. Skin and proximity effects are not included.'] },
  { id: 'electrostatic', group: 'Electrical & Electronics', label: 'Electrostatic field', short: 'Electrostatics', blurb: 'Potential, electric field, field-strength hot spots, capacitance and stored energy around conductors.', loads: ['voltage'], needs: 'Conductor bodies with a prescribed potential (body or faces).', domain: 'air-box', sample: 'capacitor',
    params: [num('margin', 'Air margin around the part', '×size', 0.6, 0.1, 3, 0.1), num('Ebreak', 'Breakdown field of the medium', 'kV/mm', 3, 0.1, 100, 0.1)],
    limits: ['The outer boundary is held at 0 V (grounded box); a margin of at least half the model size is recommended.', 'Corona and discharge are not simulated; the field strength is compared with the breakdown value.'] },
  { id: 'magnetostatic', group: 'Electrical & Electronics', label: 'Magnetostatic field', short: 'Magnetostatics', blurb: 'Flux density from coils and permanent magnets with linear permeable materials (reduced scalar potential).', loads: ['coil'], needs: 'At least one coil, or a body marked as a magnet.', domain: 'air-box', sample: 'magnet',
    params: [num('margin', 'Air margin around the part', '×size', 1, 0.2, 4, 0.1), bool('sat', 'Flag saturation (B > 1.6 T in iron)', true)],
    limits: ['Linear permeability: saturation is flagged but not modelled.', 'Currents are idealised thin loops; eddy currents and time variation are not included.'] },
  { id: 'emc', group: 'Electrical & Electronics', label: 'Electromagnetic fields: EMC shielding & RF', short: 'EMC / RF', blurb: 'Time-domain (FDTD) full-wave simulation: shielding effectiveness of enclosures, apertures, cavity resonances and RF field patterns.', loads: [], needs: 'A conductive enclosure (metal body) and a source position.', domain: 'air-box', sample: 'enclosure',
    params: [sel('mode', 'Study', 'shield', [['shield', 'Shielding effectiveness'], ['resonance', 'Cavity resonances']]), num('f', 'Centre frequency', 'MHz', 1000, 1, 1e5, undefined, { show: (p) => p.mode === 'shield' }), num('fmax', 'Highest frequency of interest', 'MHz', 3000, 10, 1e5, undefined, { show: (p) => p.mode === 'resonance' }),
      num('sx', 'Source x', 'mm', 0, undefined, undefined, 1), num('sy', 'Source y', 'mm', 0, undefined, undefined, 1), num('sz', 'Source z', 'mm', 0, undefined, undefined, 1), sel('sdir', 'Source polarisation', 'z', [['x', 'X'], ['y', 'Y'], ['z', 'Z']]),
      num('px', 'Probe x', 'mm', 0, undefined, undefined, 1), num('py', 'Probe y', 'mm', 0, undefined, undefined, 1), num('pz', 'Probe z', 'mm', 0, undefined, undefined, 1),
      num('margin', 'Air margin', '×size', 0.5, 0.2, 2, 0.1, { show: (p) => p.mode === 'shield' }), num('cells', 'Maximum cells', 'k', 600, 100, 2000, 50)],
    limits: ['Cell size is limited: apertures and walls thinner than a cell are not resolved. Results above the frequency where the cell exceeds λ/10 are unreliable and flagged.', 'Metals are perfect conductors (PEC); lossy materials are treated as dielectrics unless their conductivity is high.'] },
  { id: 'heatsink', group: 'Electrical & Electronics', label: 'Heat-sink optimisation', short: 'Heat sink', blurb: 'Parametric search of fin count, thickness and height for the lowest thermal resistance within the envelope.', loads: [], needs: 'Power, ambient temperature and the available envelope.', domain: 'none',
    params: [num('P', 'Dissipated power', 'W', 40, 0.1, 5000, 1), num('Tamb', 'Ambient', '°C', 25, -40, 100, 1), num('Tmax', 'Maximum base temperature', '°C', 80, 30, 200, 1), num('W', 'Base width', 'mm', 80, 10, 500, 1), num('L', 'Base length (flow direction)', 'mm', 100, 10, 500, 1), num('tb', 'Base thickness', 'mm', 4, 1, 30, 0.5), num('Hmax', 'Maximum fin height', 'mm', 40, 5, 150, 1),
      sel('mat', 'Material', 'al6061', [['al6061', 'Aluminium 6061'], ['cu', 'Copper'], ['al7075', 'Aluminium 7075']]), sel('cool', 'Cooling', 'natural', [['natural', 'Natural convection'], ['forced', 'Forced convection']]), num('U', 'Air velocity', 'm/s', 2, 0.1, 30, 0.1, { show: (p) => p.cool === 'forced' }),
      num('tmin', 'Minimum fin thickness', 'mm', 0.8, 0.3, 5, 0.1), num('gmin', 'Minimum fin gap', 'mm', 2, 0.5, 20, 0.1), num('rth', 'Interface + spreading resistance', 'K/W', 0.1, 0, 5, 0.01)],
    limits: ['Handbook correlations (Elenbaas / Teertstra) with fin efficiency, ±20 % typically. Validate the chosen design with the 3-D thermal analysis.'] },
  { id: 'integrity', group: 'Electrical & Electronics', label: 'Signal integrity & high-frequency calculator', short: 'Signal integrity', blurb: 'Trace impedance, delay, reflection, crosstalk, skin depth and rise-time bandwidth for PCB interconnects.', loads: [], needs: 'Trace geometry and the substrate.', domain: 'none',
    params: [sel('topo', 'Trace type', 'microstrip', [['microstrip', 'Microstrip'], ['stripline', 'Stripline'], ['diffpair', 'Edge-coupled microstrip pair']]), num('w', 'Trace width', 'mm', 0.2, 0.02, 20, 0.01), num('t', 'Copper thickness', 'µm', 35, 5, 140, 1), num('hh', 'Dielectric height', 'mm', 0.2, 0.02, 5, 0.01),
      num('er', 'Dielectric constant εr', '', 4.3, 1, 20, 0.1), num('tand', 'Loss tangent', '', 0.02, 0, 0.2, 0.001), num('len', 'Trace length', 'mm', 100, 1, 2000, 1), num('trise', 'Signal rise time', 'ns', 1, 0.01, 100, 0.1), num('s', 'Spacing to neighbour', 'mm', 0.2, 0.02, 10, 0.01), num('Zs', 'Source impedance', 'Ω', 20, 1, 200, 1), num('Zl', 'Load impedance', 'Ω', 1e6, 1, 1e9, undefined), num('V', 'Swing', 'V', 3.3, 0.1, 100, 0.1)],
    limits: ['Closed-form formulas (IPC-2141 / Hammerstad–Jensen / Kirschning–Jansen style), typically ±5 – 10 %. For sign-off use a field solver.'] },

  { id: 'fsi', group: 'Multiphysics', label: 'Fluid–structure interaction (one-way)', short: 'FSI', blurb: 'Wind or flow pressure from the CFD solution is applied to the structure: deformation and stress under aerodynamic load.', loads: ['fixed', 'frictionless', 'spring', 'gravity'], needs: 'Supports, plus the wind-tunnel conditions.', domain: 'flow', sample: 'wing',
    params: [ELEM, num('U', 'Wind speed', 'm/s', 40, 0.1, 340, 1), num('aoa', 'Angle of attack', '°', 6, -45, 45, 1), num('beta', 'Yaw angle', '°', 0, -45, 45, 1), sel('quality', 'CFD resolution', 'fast', [['fast', 'Fast (80 k cells)'], ['standard', 'Standard (200 k cells)'], ['fine', 'Fine (400 k cells)']]), num('rho', 'Fluid density', 'kg/m³', 1.204, 0.01, 2000, undefined), num('mu', 'Fluid viscosity', 'Pa·s', 1.81e-5, 1e-7, 10, undefined), CRIT, FOS],
    limits: ['One-way coupling: the structure deforms under the flow pressure but the flow is not recomputed on the deformed shape. Valid when deflections are small relative to the body size.', 'Viscous shear on the surface is not transferred.'] },
  { id: 'thermostress', group: 'Multiphysics', label: 'Thermal–stress coupling & thermal shock', short: 'Thermal stress', blurb: 'Temperature field → thermal expansion → stress, steady or as a transient thermal shock with the stress history.', loads: ['fixed', 'frictionless', 'spring', 'temperature', 'heatflux', 'heatpower', 'convection', 'force', 'pressure', 'gravity'], needs: 'Supports and thermal boundary conditions.', domain: 'solid', sample: 'pipe',
    params: [ELEM, sel('mode', 'Thermal state', 'steady', [['steady', 'Steady state'], ['shock', 'Thermal shock (transient)']]), num('T0', 'Initial / stress-free temperature', '°C', 20, -100, 1500, 1), num('tend', 'Shock duration', 's', 60, 0.01, 1e6, undefined, { show: (p) => p.mode === 'shock' }), CRIT, FOS],
    limits: ['One-way coupling (temperature to stress); temperature-independent material properties.'] },
];
export const analysisSpec = (id: AnalysisId) => ANALYSES.find((a) => a.id === id)!;
export const GROUPS: AnalysisGroup[] = ['Structural & Mechanical', 'Fluid Dynamics & Aerodynamics', 'Civil & Infrastructure', 'Electrical & Electronics', 'Multiphysics'];

export function defaultParams(id: AnalysisId): Record<string, number | string | boolean> {
  const o: Record<string, number | string | boolean> = {};
  for (const p of analysisSpec(id).params) o[p.k] = p.def;
  return o;
}

// ---------------------------------------------------------------------------------------------
// Mesh settings

export interface MeshSettings {
  preset: 'coarse' | 'medium' | 'fine' | 'custom';
  cells: number;        // cells along the longest dimension
  size: number;         // element edge (mm), used when preset === 'custom'
}
export const MESH_PRESETS: Record<string, number> = { coarse: 28, medium: 48, fine: 80 };

// ---------------------------------------------------------------------------------------------
// The case sent to the solver

export interface CaseInput {
  analysis: AnalysisId;
  params: Record<string, number | string | boolean>;
  bodies: CaeBody[];
  regions: Region[];
  loads: Load[];
  mesh: MeshSettings;
  units?: string;
}

// ---------------------------------------------------------------------------------------------
// Results

export interface VolGrid { nx: number; ny: number; nz: number; h: number; ox: number; oy: number; oz: number }

export interface FieldDef {
  id: string; label: string; unit: string;
  loc: 'node' | 'cell';                       // node: (nx+1)(ny+1)(nz+1); cell: nx·ny·nz
  data: Float32Array;
  min: number; max: number;
  domain: 'solid' | 'fluid';                  // where the field exists (fluid fields are drawn on slices / streamlines)
  diverging?: boolean;                        // symmetric colour map around zero
  lowIsBad?: boolean;                         // safety factors: red = low
  log?: boolean;
}

export interface Frame { label: string; t: number; disp?: Float32Array; fields?: Record<string, Float32Array> }
export interface Series { name: string; x: number[]; y: number[]; color?: string }
export interface Curve { id: string; title: string; xlabel: string; ylabel: string; series: Series[]; logx?: boolean; logy?: boolean; marks?: { x: number; label: string }[] }
export interface KeyValue { label: string; value: string; status?: 'ok' | 'warn' | 'fail' | 'info' }
export interface Check { name: string; value: string; limit: string; ok: boolean; note?: string }
export interface Hotspot { x: number; y: number; z: number; value: number; label: string; fieldId: string }
export interface TableData { id: string; title: string; cols: string[]; rows: (string | number)[][] }
export interface Stream { pts: Float32Array; speed: Float32Array }   // polyline vertices (xyz mm) and value per vertex

export interface Result {
  analysis: AnalysisId; title: string;
  grid: VolGrid | null;
  mask: Uint8Array | null;                     // solid cells (1 = body material)
  matIndex?: Uint8Array;                       // per cell material index + 1 (for per-body views)
  bodies: string[];
  fields: FieldDef[];
  defaultField: string;
  disp: Float32Array | null;                   // node displacement ×1 (mm), 3 per node
  dispScale: number;                           // suggested visual scale
  modes: { label: string; freq: number; disp: Float32Array }[];
  frames: Frame[];
  curves: Curve[];
  tables: TableData[];
  kv: KeyValue[];
  checks: Check[];
  hotspots: Hotspot[];
  streams: Stream[];
  tri?: { pos: Float32Array; val: Float32Array; label: string; unit: string; min: number; max: number; diverging?: boolean } | null;   // coloured triangle mesh: 9 floats per triangle, one value per triangle
  verdict: { pass: boolean | null; text: string };
  notes: string[];
  mesh: { type: string; elements: number; nodes: number; dof: number; h: number; bodyVolume: number; minDim: number; quality: string; time: number; extra?: string };
  solver: { name: string; iterations?: number; residual?: number; time: number; log: string[] };
  assumptions: string[];
  inputs: KeyValue[];
}

export function emptyResult(analysis: AnalysisId, title: string): Result {
  return {
    analysis, title, grid: null, mask: null, bodies: [], fields: [], defaultField: '', disp: null, dispScale: 1, modes: [], frames: [], curves: [], tables: [], kv: [], checks: [], hotspots: [], streams: [],
    tri: null, verdict: { pass: null, text: '' }, notes: [], mesh: { type: '', elements: 0, nodes: 0, dof: 0, h: 0, bodyVolume: 0, minDim: 0, quality: '', time: 0 }, solver: { name: '', time: 0, log: [] }, assumptions: [], inputs: [],
  };
}

export function makeField(id: string, label: string, unit: string, loc: 'node' | 'cell', data: Float32Array, o: Partial<FieldDef> = {}): FieldDef {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < data.length; i++) { const v = data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!Number.isFinite(mn)) { mn = 0; mx = 0; }
  return { id, label, unit, loc, data, min: mn, max: mx, domain: 'solid', ...o };
}

export interface Progress { (p: number, label: string): void }
export class Cancelled extends Error { constructor() { super('cancelled'); } }
