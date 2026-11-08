// Material library and the failure criteria used by the post-processor.
// User-facing units: E, G, strengths in MPa; density kg/m³; α in 10⁻⁶/K; k in W/(m·K); cp in J/(kg·K);
// σ (electrical conductivity) in S/m; permeability in m². The solvers convert to the mm–tonne–s–N system.

import { isoC, orthoC, type Voigt6 } from './elem';

export type MatKind = 'iso' | 'ortho';
export type MatCategory = 'Steel' | 'Aluminium' | 'Titanium & other metals' | 'Polymer' | 'Ceramic & glass' | 'Concrete & masonry' | 'Timber' | 'Soil & rock' | 'Composite' | 'Electronics' | 'Fluid';
export type Criterion = 'vonmises' | 'tresca' | 'principal' | 'mohr' | 'tsaiwu';

export interface Strengths { Xt: number; Xc: number; Yt: number; Yc: number; S: number }   // along / across the fibres

export interface Material {
  id: string; name: string; cat: MatCategory; kind: MatKind;
  // elastic
  E: number; nu: number;                                   // isotropic (or E1 / ν12 for orthotropic, used as defaults)
  E1?: number; E2?: number; E3?: number; nu12?: number; nu23?: number; nu13?: number; G12?: number; G23?: number; G13?: number;
  rho: number;
  yield: number; ultimate: number; ultimateC?: number;     // MPa; ultimateC = compressive strength of brittle materials
  brittle?: boolean;
  alpha: number | [number, number, number];                // 10⁻⁶ / K
  // thermal
  k: number | [number, number, number]; cp: number;
  // electromagnetic
  sigma?: number; epsr?: number; mur?: number; Br?: number;
  // transport / geotechnical
  perm?: number; phi?: number; coh?: number;               // permeability m², friction angle deg, cohesion MPa
  // composite failure
  str?: Strengths;
  // fatigue: S-N through (10³ cycles, f·Su) and (Nk cycles, Se)
  fat?: { Se: number; Nk: number; f: number };
  note?: string;
  custom?: boolean;
}

const iso = (id: string, name: string, cat: MatCategory, E: number, nu: number, rho: number, yld: number, ult: number, alpha: number, k: number, cp: number, extra: Partial<Material> = {}): Material =>
  ({ id, name, cat, kind: 'iso', E, nu, rho, yield: yld, ultimate: ult, alpha, k, cp, ...extra });

const steelFat = (su: number) => ({ Se: Math.min(0.5 * su, 700), Nk: 1e6, f: 0.9 });
const alFat = (se: number) => ({ Se: se, Nk: 5e8, f: 0.9 });

export const MATERIALS: Material[] = [
  iso('a36', 'Structural steel A36', 'Steel', 200000, 0.26, 7850, 250, 400, 11.7, 51.9, 486, { sigma: 6.99e6, mur: 100, fat: steelFat(400) }),
  iso('s355', 'Structural steel S355', 'Steel', 210000, 0.30, 7850, 355, 470, 12, 50, 480, { sigma: 6.99e6, mur: 100, fat: steelFat(470) }),
  iso('c1045', 'Carbon steel 1045 (CD)', 'Steel', 205000, 0.29, 7850, 530, 625, 11.9, 49.8, 486, { sigma: 5.8e6, mur: 100, fat: steelFat(625) }),
  iso('4140', 'Alloy steel 4140 (Q&T)', 'Steel', 205000, 0.29, 7850, 655, 1020, 12.3, 42.6, 473, { sigma: 4.6e6, mur: 100, fat: steelFat(1020) }),
  iso('ss304', 'Stainless steel 304', 'Steel', 193000, 0.29, 8000, 215, 505, 17.3, 16.2, 500, { sigma: 1.39e6, mur: 1, fat: steelFat(505) }),
  iso('ss316', 'Stainless steel 316L', 'Steel', 193000, 0.30, 8000, 170, 485, 16, 16.3, 500, { sigma: 1.33e6, mur: 1, fat: steelFat(485) }),
  iso('fe-si', 'Silicon (electrical) steel', 'Steel', 200000, 0.29, 7650, 350, 480, 12, 28, 480, { sigma: 2.0e6, mur: 4000, fat: steelFat(480) }),
  iso('al6061', 'Aluminium 6061-T6', 'Aluminium', 68900, 0.33, 2700, 276, 310, 23.6, 167, 896, { sigma: 2.5e7, mur: 1, fat: alFat(96) }),
  iso('al7075', 'Aluminium 7075-T6', 'Aluminium', 71700, 0.33, 2810, 503, 572, 23.4, 130, 960, { sigma: 1.9e7, mur: 1, fat: alFat(159) }),
  iso('al2024', 'Aluminium 2024-T3', 'Aluminium', 73100, 0.33, 2780, 345, 483, 23.2, 121, 875, { sigma: 1.7e7, mur: 1, fat: alFat(138) }),
  iso('ti64', 'Titanium Ti-6Al-4V', 'Titanium & other metals', 113800, 0.342, 4430, 880, 950, 8.6, 6.7, 526, { sigma: 5.8e5, mur: 1, fat: { Se: 510, Nk: 1e7, f: 0.9 } }),
  iso('cu', 'Copper C110 (H02)', 'Titanium & other metals', 117000, 0.34, 8960, 250, 295, 17, 391, 385, { sigma: 5.8e7, mur: 1, fat: { Se: 95, Nk: 1e8, f: 0.9 } }),
  iso('brass', 'Brass C360', 'Titanium & other metals', 97000, 0.34, 8500, 310, 385, 20.5, 115, 380, { sigma: 1.5e7, mur: 1, fat: { Se: 140, Nk: 1e8, f: 0.9 } }),
  iso('mg', 'Magnesium AZ31B', 'Titanium & other metals', 45000, 0.35, 1770, 200, 260, 26, 96, 1000, { sigma: 1.9e7, mur: 1, fat: { Se: 105, Nk: 1e8, f: 0.9 } }),
  iso('castiron', 'Grey cast iron ASTM 40', 'Titanium & other metals', 110000, 0.26, 7200, 293, 293, 11, 46, 490, { brittle: true, ultimateC: 1000, sigma: 1.0e7, mur: 200, fat: { Se: 117, Nk: 1e7, f: 0.9 } }),
  iso('abs', 'ABS', 'Polymer', 2300, 0.35, 1040, 40, 40, 90, 0.17, 1400, { epsr: 3, fat: { Se: 12, Nk: 1e7, f: 0.9 } }),
  iso('pla', 'PLA', 'Polymer', 3500, 0.36, 1240, 55, 55, 68, 0.13, 1800, { epsr: 3, fat: { Se: 15, Nk: 1e7, f: 0.9 } }),
  iso('nylon', 'Nylon 6 (dry)', 'Polymer', 2700, 0.39, 1140, 70, 80, 80, 0.25, 1700, { epsr: 3.6, fat: { Se: 20, Nk: 1e7, f: 0.9 } }),
  iso('pc', 'Polycarbonate', 'Polymer', 2400, 0.37, 1200, 62, 65, 65, 0.2, 1200, { epsr: 3, fat: { Se: 14, Nk: 1e7, f: 0.9 } }),
  iso('peek', 'PEEK', 'Polymer', 3600, 0.38, 1300, 100, 100, 47, 0.25, 1340, { epsr: 3.3, fat: { Se: 30, Nk: 1e7, f: 0.9 } }),
  iso('hdpe', 'HDPE', 'Polymer', 1000, 0.42, 950, 25, 30, 120, 0.45, 2300, { epsr: 2.3 }),
  iso('ptfe', 'PTFE', 'Polymer', 500, 0.46, 2200, 12, 25, 120, 0.25, 1000, { epsr: 2.1 }),
  iso('alumina', 'Alumina 99.5 %', 'Ceramic & glass', 370000, 0.22, 3900, 300, 300, 8, 30, 880, { brittle: true, ultimateC: 2600, epsr: 9.8, sigma: 1e-12 }),
  iso('glass', 'Soda-lime glass', 'Ceramic & glass', 70000, 0.22, 2500, 50, 50, 9, 1, 840, { brittle: true, ultimateC: 1000, epsr: 5, sigma: 1e-12 }),
  iso('si', 'Silicon (single crystal)', 'Electronics', 130000, 0.28, 2329, 120, 120, 2.6, 148, 700, { brittle: true, ultimateC: 3000, epsr: 11.7, sigma: 1e-3 }),
  iso('aln', 'Aluminium nitride', 'Electronics', 330000, 0.24, 3260, 300, 300, 4.5, 170, 740, { brittle: true, ultimateC: 2000, epsr: 8.8, sigma: 1e-12 }),
  iso('solder', 'Solder SAC305', 'Electronics', 51000, 0.36, 7400, 35, 50, 21.7, 58, 230, { sigma: 7.0e6 }),
  iso('mold', 'Epoxy mould compound', 'Electronics', 20000, 0.3, 1900, 90, 120, 12, 0.7, 900, { brittle: true, epsr: 4, sigma: 1e-12 }),
  iso('c30', 'Concrete C30/37', 'Concrete & masonry', 33000, 0.2, 2400, 3, 3, 10, 1.7, 880, { brittle: true, ultimateC: 30, phi: 37, coh: 4, note: 'Tension 3 MPa, compression 30 MPa (characteristic cylinder strength).' }),
  iso('c40', 'Concrete C40/50', 'Concrete & masonry', 35000, 0.2, 2450, 3.5, 3.5, 10, 1.8, 880, { brittle: true, ultimateC: 40, phi: 37, coh: 5 }),
  iso('brick', 'Brick masonry', 'Concrete & masonry', 8000, 0.2, 1900, 0.5, 0.5, 6, 0.7, 840, { brittle: true, ultimateC: 10 }),
  iso('sand', 'Dense sand (soil)', 'Soil & rock', 50, 0.3, 1900, 0.2, 0.2, 0, 1.5, 800, { brittle: true, ultimateC: 0.5, phi: 35, coh: 0, perm: 1e-11 }),
  iso('clay', 'Stiff clay (soil)', 'Soil & rock', 20, 0.35, 1800, 0.1, 0.1, 0, 1.2, 1000, { brittle: true, ultimateC: 0.2, phi: 24, coh: 0.025, perm: 1e-16 }),
  iso('gravel', 'Gravel / compacted fill', 'Soil & rock', 100, 0.3, 2000, 0.3, 0.3, 0, 1.8, 800, { brittle: true, ultimateC: 0.8, phi: 38, coh: 0, perm: 1e-9 }),
  iso('rock', 'Sound rock (granite)', 'Soil & rock', 50000, 0.25, 2650, 10, 10, 8, 2.8, 790, { brittle: true, ultimateC: 150, phi: 50, coh: 20 }),
  {
    id: 'pine', name: 'Pine (grain along X)', cat: 'Timber', kind: 'ortho', E: 11000, nu: 0.3, E1: 11000, E2: 700, E3: 500, nu12: 0.35, nu23: 0.4, nu13: 0.35, G12: 700, G23: 40, G13: 600,
    rho: 520, yield: 40, ultimate: 80, alpha: [4, 35, 35], k: [0.35, 0.14, 0.14], cp: 1700, str: { Xt: 80, Xc: 40, Yt: 3, Yc: 6, S: 8 },
  },
  {
    id: 'cfrp-ud', name: 'CFRP unidirectional (T300 / epoxy)', cat: 'Composite', kind: 'ortho', E: 135000, nu: 0.3, E1: 135000, E2: 10000, E3: 10000, nu12: 0.3, nu23: 0.45, nu13: 0.3, G12: 5000, G23: 3450, G13: 5000,
    rho: 1600, yield: 1500, ultimate: 1500, alpha: [-0.3, 28, 28], k: [5, 0.5, 0.5], cp: 1000, str: { Xt: 1500, Xc: 1200, Yt: 50, Yc: 250, S: 70 }, sigma: 5e4,
    fat: { Se: 600, Nk: 1e7, f: 0.9 },
  },
  {
    id: 'gfrp-ud', name: 'GFRP unidirectional (E-glass / epoxy)', cat: 'Composite', kind: 'ortho', E: 45000, nu: 0.3, E1: 45000, E2: 12000, E3: 12000, nu12: 0.3, nu23: 0.4, nu13: 0.3, G12: 5500, G23: 4300, G13: 5500,
    rho: 2000, yield: 1020, ultimate: 1020, alpha: [6, 24, 24], k: [1.2, 0.6, 0.6], cp: 1000, str: { Xt: 1020, Xc: 620, Yt: 40, Yc: 140, S: 70 }, epsr: 4.5,
    fat: { Se: 350, Nk: 1e7, f: 0.9 },
  },
  iso('fr4', 'FR-4 (PCB laminate)', 'Electronics', 22000, 0.14, 1850, 250, 300, 14, 0.8, 1100, { brittle: true, ultimateC: 400, epsr: 4.4, sigma: 1e-12, note: 'Through-thickness conductivity is about 0.3 W/mK; 0.8 is the in-plane value used here.' }),
  iso('pcbcu', 'PCB copper (1 oz plane)', 'Electronics', 117000, 0.34, 8960, 250, 295, 17, 391, 385, { sigma: 5.8e7, mur: 1 }),
  iso('air', 'Air (20 °C)', 'Fluid', 0.001, 0.3, 1.2, 0, 0, 0, 0.026, 1005, { epsr: 1, mur: 1, sigma: 0 }),
  iso('water', 'Water (20 °C)', 'Fluid', 0.001, 0.3, 998, 0, 0, 0, 0.6, 4182, { epsr: 80, mur: 1, sigma: 5e-2 }),
  iso('magnet', 'Neodymium magnet N42', 'Electronics', 160000, 0.24, 7500, 80, 80, 5, 9, 440, { brittle: true, ultimateC: 800, mur: 1.05, Br: 1.3, sigma: 6.7e5 }),
];

export const materialById = (id: string, list: Material[] = MATERIALS) => list.find((m) => m.id === id);

export const CATEGORIES: MatCategory[] = ['Steel', 'Aluminium', 'Titanium & other metals', 'Polymer', 'Ceramic & glass', 'Concrete & masonry', 'Timber', 'Soil & rock', 'Composite', 'Electronics', 'Fluid'];

const arr3 = (v: number | [number, number, number]): [number, number, number] => (typeof v === 'number' ? [v, v, v] : v);
export const alpha3 = (m: Material): [number, number, number] => arr3(m.alpha);
export const k3 = (m: Material): [number, number, number] => arr3(m.k);

// ---------------------------------------------------------------------------------------------
// Orientation of orthotropic materials: local 1 = fibre / grain direction is mapped to a global axis.

export type Axis = 0 | 1 | 2;
const perm = (a1: Axis): [Axis, Axis, Axis] => [a1, ((a1 + 1) % 3) as Axis, ((a1 + 2) % 3) as Axis];

/** Constitutive matrix in global axes (Voigt xx yy zz xy yz zx) */
export function constitutive(m: Material, fibre: Axis = 0): Voigt6 {
  if (m.kind === 'iso') return isoC(m.E, m.nu);
  const E1 = m.E1 ?? m.E, E2 = m.E2 ?? E1, E3 = m.E3 ?? E2, nu12 = m.nu12 ?? m.nu, nu23 = m.nu23 ?? m.nu, nu13 = m.nu13 ?? m.nu;
  const G12 = m.G12 ?? E1 / (2 * (1 + nu12)), G23 = m.G23 ?? E2 / (2 * (1 + nu23)), G13 = m.G13 ?? G12;
  // build in the local frame (1,2,3) then permute: global[perm[i]] = local[i]
  const [p1, p2, p3] = perm(fibre);
  const Eg: number[] = [0, 0, 0]; Eg[p1] = E1; Eg[p2] = E2; Eg[p3] = E3;
  // Poisson ratios ν_ij (strain in j under stress in i) in the local frame
  const nuL = [[0, nu12, nu13], [nu12 * E2 / E1, 0, nu23], [nu13 * E3 / E1, nu23 * E3 / E2, 0]];
  const loc = [p1, p2, p3];
  const nuG = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) nuG[loc[i]][loc[j]] = nuL[i][j];
  const Gg = { xy: 0, yz: 0, zx: 0 };
  const shear = (a: number, b: number, g: number) => {
    const key = [a, b].sort().join('');
    if (key === '01') Gg.xy = g; else if (key === '12') Gg.yz = g; else Gg.zx = g;
  };
  shear(p1, p2, G12); shear(p2, p3, G23); shear(p1, p3, G13);
  // orthoC takes (E1,E2,E3,nu12,nu23,nu31,G12,G23,G31) in the global x,y,z frame
  return orthoC(Eg[0], Eg[1], Eg[2], nuG[0][1], nuG[1][2], nuG[2][0], Gg.xy, Gg.yz, Gg.zx);
}

export const alphaGlobal = (m: Material, fibre: Axis = 0): [number, number, number] => {
  const a = alpha3(m); const [p1, p2, p3] = perm(fibre); const o: [number, number, number] = [0, 0, 0]; o[p1] = a[0]; o[p2] = a[1]; o[p3] = a[2]; return o;
};
export const kGlobal = (m: Material, fibre: Axis = 0): [number, number, number] => {
  const a = k3(m); const [p1, p2, p3] = perm(fibre); const o: [number, number, number] = [0, 0, 0]; o[p1] = a[0]; o[p2] = a[1]; o[p3] = a[2]; return o;
};

// ---------------------------------------------------------------------------------------------
// Composite builders

export interface ConstituentSpec { Ef: number; nuf: number; Gf: number; rhof: number; Em: number; num: number; rhom: number; Vf: number }

/** Unidirectional ply from fibre and matrix properties (rule of mixtures, Halpin–Tsai for the transverse terms). */
export function unidirectional(name: string, c: ConstituentSpec): Material {
  const { Ef, Em, nuf, num, Vf } = c;
  const Gm = Em / (2 * (1 + num));
  const E1 = Ef * Vf + Em * (1 - Vf);
  const nu12 = nuf * Vf + num * (1 - Vf);
  const ht = (Pf: number, Pm: number, xi: number) => { const eta = (Pf / Pm - 1) / (Pf / Pm + xi); return Pm * (1 + xi * eta * Vf) / (1 - eta * Vf); };
  const E2 = ht(Ef, Em, 2), G12 = ht(c.Gf, Gm, 1);
  const nu23 = 0.45 * (1 - Vf) + nuf * Vf * 0.5;
  const G23 = E2 / (2 * (1 + nu23));
  const rho = c.rhof * Vf + c.rhom * (1 - Vf);
  return {
    id: `ud-${Date.now() % 100000}`, name, cat: 'Composite', kind: 'ortho', E: E1, nu: nu12, E1, E2, E3: E2, nu12, nu23, nu13: nu12, G12, G23, G13: G12, rho,
    yield: 0.012 * E1, ultimate: 0.012 * E1, alpha: [-0.3, 30, 30], k: [3, 0.4, 0.4], cp: 1000,
    str: { Xt: 0.011 * E1, Xc: 0.009 * E1, Yt: 0.005 * E2, Yc: 0.025 * E2, S: 0.014 * G12 },
    custom: true,
  };
}

/** Homogenised laminate: classical laminate theory for in-plane stiffness, through-thickness values from the ply.
 *  `normal` is the global axis perpendicular to the plies; ply angles are measured from the in-plane axis `a1`. */
export function laminate(name: string, ply: Material, angles: number[], normal: Axis = 2): Material {
  const E1 = ply.E1 ?? ply.E, E2 = ply.E2 ?? E1, nu12 = ply.nu12 ?? ply.nu, G12 = ply.G12 ?? E1 / (2 * (1 + nu12));
  const nu21 = nu12 * E2 / E1, d = 1 - nu12 * nu21;
  const Q11 = E1 / d, Q22 = E2 / d, Q12 = nu12 * E2 / d, Q66 = G12;
  let A11 = 0, A22 = 0, A12 = 0, A66 = 0, A16 = 0, A26 = 0;
  for (const deg of angles) {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const c2 = c * c, s2 = s * s, c4 = c2 * c2, s4 = s2 * s2;
    A11 += Q11 * c4 + 2 * (Q12 + 2 * Q66) * s2 * c2 + Q22 * s4;
    A22 += Q11 * s4 + 2 * (Q12 + 2 * Q66) * s2 * c2 + Q22 * c4;
    A12 += (Q11 + Q22 - 4 * Q66) * s2 * c2 + Q12 * (s4 + c4);
    A66 += (Q11 + Q22 - 2 * Q12 - 2 * Q66) * s2 * c2 + Q66 * (s4 + c4);
    A16 += (Q11 - Q12 - 2 * Q66) * c2 * c * s + (Q12 - Q22 + 2 * Q66) * c * s2 * s;
    A26 += (Q11 - Q12 - 2 * Q66) * c * s2 * s + (Q12 - Q22 + 2 * Q66) * c2 * c * s;
  }
  void A16; void A26;
  const n = angles.length;
  A11 /= n; A22 /= n; A12 /= n; A66 /= n;
  const Ex = (A11 * A22 - A12 * A12) / A22, Ey = (A11 * A22 - A12 * A12) / A11, nuxy = A12 / A22, Gxy = A66;
  const E3 = ply.E3 ?? E2;
  // plane axes in the order (in-plane 1, in-plane 2, normal) mapped to local 1,2,3 of the new orthotropic material
  const m: Material = {
    id: `lam-${Date.now() % 100000}`, name, cat: 'Composite', kind: 'ortho', E: Ex, nu: nuxy, E1: Ex, E2: Ey, E3, nu12: nuxy, nu23: ply.nu23 ?? 0.3, nu13: ply.nu23 ?? 0.3, G12: Gxy, G23: ply.G23 ?? Gxy * 0.7, G13: ply.G23 ?? Gxy * 0.7,
    rho: ply.rho, yield: ply.str ? Math.min(ply.str.Xt, ply.str.Xc) * 0.4 : ply.yield * 0.4, ultimate: ply.str ? ply.str.Xt * 0.4 : ply.ultimate * 0.4,
    alpha: [3, 3, 40], k: [3, 3, 0.5], cp: ply.cp, custom: true,
    str: ply.str ? { Xt: ply.str.Xt * 0.4, Xc: ply.str.Xc * 0.4, Yt: ply.str.Xt * 0.4, Yc: ply.str.Xc * 0.4, S: ply.str.S * 1.5 } : undefined,
    note: `Homogenised laminate [${angles.join('/')}] (in-plane classical laminate theory). The normal axis is the global ${'XYZ'[normal]} axis; strength values are first-ply-failure estimates.`,
  };
  return m;
}

// ---------------------------------------------------------------------------------------------
// Failure criteria

export interface StressInvariants { vm: number; tresca: number; s1: number; s2: number; s3: number; hydro: number }

/** Principal stresses of a symmetric tensor (s1 ≥ s2 ≥ s3) — closed-form (Smith / Kopp) */
export function principals(sxx: number, syy: number, szz: number, sxy: number, syz: number, szx: number): [number, number, number] {
  const p1 = sxy * sxy + syz * syz + szx * szx;
  const q = (sxx + syy + szz) / 3;
  if (p1 < 1e-30 * (1 + Math.abs(q) * Math.abs(q))) { const a = [sxx, syy, szz].sort((x, y) => y - x); return [a[0], a[1], a[2]]; }
  const p2 = (sxx - q) ** 2 + (syy - q) ** 2 + (szz - q) ** 2 + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  const b11 = (sxx - q) / p, b22 = (syy - q) / p, b33 = (szz - q) / p, b12 = sxy / p, b23 = syz / p, b13 = szx / p;
  const detB = b11 * (b22 * b33 - b23 * b23) - b12 * (b12 * b33 - b23 * b13) + b13 * (b12 * b23 - b22 * b13);
  const r = Math.max(-1, Math.min(1, detB / 2));
  const phi = Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi), e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3), e2 = 3 * q - e1 - e3;
  return [e1, e2, e3];
}

export function invariants(s: ArrayLike<number>, o = 0): StressInvariants {
  const sxx = s[o], syy = s[o + 1], szz = s[o + 2], sxy = s[o + 3], syz = s[o + 4], szx = s[o + 5];
  const vm = Math.sqrt(Math.max(0, 0.5 * ((sxx - syy) ** 2 + (syy - szz) ** 2 + (szz - sxx) ** 2) + 3 * (sxy * sxy + syz * syz + szx * szx)));
  const [s1, s2, s3] = principals(sxx, syy, szz, sxy, syz, szx);
  return { vm, tresca: s1 - s3, s1, s2, s3, hydro: (sxx + syy + szz) / 3 };
}

/** Failure index (≥ 1 means failure) for the chosen criterion; FOS = 1 / index (for the quadratic Tsai–Wu: strength ratio). */
export function failureIndex(m: Material, criterion: Criterion, s: ArrayLike<number>, o = 0, fibre: Axis = 0): number {
  const inv = invariants(s, o);
  const Sy = Math.max(1e-9, m.yield), Su = Math.max(1e-9, m.ultimate), Suc = Math.max(1e-9, m.ultimateC ?? m.ultimate);
  switch (criterion) {
    case 'vonmises': return inv.vm / Sy;
    case 'tresca': return inv.tresca / Sy;
    case 'principal': return Math.max(inv.s1 / Su, -inv.s3 / Suc);
    case 'mohr': {
      if (m.phi != null) {
        // Mohr–Coulomb proximity for soil and rock: mobilised shear ÷ available shear strength (compression negative)
        const ph = (m.phi * Math.PI) / 180, c = m.coh ?? 0;
        const tau = (inv.s1 - inv.s3) / 2, cap = c * Math.cos(ph) - ((inv.s1 + inv.s3) / 2) * Math.sin(ph);
        if (cap <= 1e-7) return tau > 1e-7 ? 5 : 0;
        return Math.min(5, tau / cap);
      }
      // Coulomb–Mohr for brittle materials
      const a = inv.s1 / Su - inv.s3 / Suc;
      return Math.max(a, inv.s1 / Su, -inv.s3 / Suc);
    }
    case 'tsaiwu': {
      if (!m.str) return inv.vm / Sy;
      // local components: 1 = fibre axis
      const [p1, p2, p3] = perm(fibre);
      const g = [s[o], s[o + 1], s[o + 2]];
      const sh = { xy: s[o + 3], yz: s[o + 4], zx: s[o + 5] };
      const shr = (a: number, b: number) => { const key = [a, b].sort().join(''); return key === '01' ? sh.xy : key === '12' ? sh.yz : sh.zx; };
      const s1 = g[p1], s2 = g[p2], s3 = g[p3], t12 = shr(p1, p2), t23 = shr(p2, p3), t13 = shr(p1, p3);
      const { Xt, Xc, Yt, Yc, S } = m.str;
      const F1 = 1 / Xt - 1 / Xc, F11 = 1 / (Xt * Xc), F2 = 1 / Yt - 1 / Yc, F22 = 1 / (Yt * Yc), F66 = 1 / (S * S);
      const F12 = -0.5 * Math.sqrt(F11 * F22), F23 = -0.5 * F22;
      const lin = F1 * s1 + F2 * (s2 + s3);
      const quad = F11 * s1 * s1 + F22 * (s2 * s2 + s3 * s3) + F66 * (t12 * t12 + t13 * t13) + 2 * (F22 - F23) * t23 * t23 + 2 * F12 * s1 * (s2 + s3) + 2 * F23 * s2 * s3;
      if (quad <= 1e-30) return Math.max(0, lin);
      const R = (-lin + Math.sqrt(lin * lin + 4 * quad)) / (2 * quad);   // strength ratio
      return 1 / Math.max(R, 1e-9);
    }
  }
}

/** Default criterion for a material */
export function defaultCriterion(m: Material): Criterion {
  if (m.kind === 'ortho' && m.str) return 'tsaiwu';
  if (m.brittle) return 'mohr';
  return 'vonmises';
}

/** Stress-life: allowable stress amplitude (MPa, fully reversed) at N cycles from the S-N line (Basquin through the two anchor points) */
export function snAllowable(m: Material, N: number): number {
  const f = m.fat ?? { Se: 0.35 * m.ultimate, Nk: 1e6, f: 0.9 };
  const S1 = f.f * m.ultimate, N1 = 1e3, S2 = f.Se, N2 = f.Nk;
  if (N <= N1) return S1;
  if (N >= N2) return S2;
  const b = Math.log(S2 / S1) / Math.log(N2 / N1);
  return S1 * Math.pow(N / N1, b);
}

/** Cycles to failure at a fully-reversed amplitude Sa (Infinity below the endurance level) */
export function snLife(m: Material, Sa: number): number {
  const f = m.fat ?? { Se: 0.35 * m.ultimate, Nk: 1e6, f: 0.9 };
  const S1 = f.f * m.ultimate, N1 = 1e3, S2 = f.Se, N2 = f.Nk;
  if (Sa <= S2) return Infinity;
  if (Sa >= S1) return N1 * Math.pow(Sa / S1, 1 / (Math.log(S2 / S1) / Math.log(N2 / N1)));
  const b = Math.log(S2 / S1) / Math.log(N2 / N1);
  return N1 * Math.pow(Sa / S1, 1 / b);
}
