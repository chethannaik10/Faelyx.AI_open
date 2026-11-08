// Lattice-Boltzmann flow solver (D3Q19, BGK collision with Smagorinsky large-eddy closure) on a regular grid.
// Solid voxels are no-slip walls (half-way bounce-back). Forces on the solid come from momentum exchange.
// Boundaries: x = 0 velocity inlet, x = nx-1 zero-gradient outlet, y/z faces slip or no-slip walls.
// All quantities in lattice units (Δx = Δt = 1, ρ∞ = 1, c_s² = 1/3).

const CX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
const CY = [0, 0, 0, 1, -1, 0, 0, 1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1];
const CZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1];
const W = [1 / 3, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const find = (x: number, y: number, z: number) => { for (let i = 0; i < 19; i++) if (CX[i] === x && CY[i] === y && CZ[i] === z) return i; return -1; };
const OPP = CX.map((_, i) => find(-CX[i], -CY[i], -CZ[i]));
const MIRY = CX.map((_, i) => find(CX[i], -CY[i], CZ[i]));
const MIRZ = CX.map((_, i) => find(CX[i], CY[i], -CZ[i]));

export type WallKind = 'slip' | 'wall';
export interface LbmOpts {
  nx: number; ny: number; nz: number;
  solid: Uint8Array;                    // 1 = solid
  uLb: number;                          // inlet speed (lattice), ≤ 0.12
  nuLb: number;                         // molecular viscosity (lattice)
  smag: number;                         // Smagorinsky constant (0 = laminar)
  wallY: WallKind; wallZlow: WallKind; wallZhigh: WallKind;
  closedOutlet?: boolean;
}

export class Lbm {
  readonly nx: number; readonly ny: number; readonly nz: number; readonly N: number;
  readonly solid: Uint8Array;
  private A: Float32Array; private B: Float32Array;
  readonly rho: Float32Array; readonly ux: Float32Array; readonly uy: Float32Array; readonly uz: Float32Array;
  readonly o: LbmOpts;
  private tau0: number;
  private off = new Int32Array(19);
  private interior: Int32Array; private edge: Int32Array;
  force: [number, number, number] = [0, 0, 0];
  stepCount = 0;
  private feqIn = new Float64Array(19);
  cxm = 0;

  constructor(o: LbmOpts) {
    this.o = o; this.nx = o.nx; this.ny = o.ny; this.nz = o.nz; this.N = o.nx * o.ny * o.nz; this.solid = o.solid;
    const N = this.N;
    this.A = new Float32Array(19 * N); this.B = new Float32Array(19 * N);
    this.rho = new Float32Array(N).fill(1); this.ux = new Float32Array(N); this.uy = new Float32Array(N); this.uz = new Float32Array(N);
    this.tau0 = 3 * o.nuLb + 0.5;
    for (let i = 0; i < 19; i++) this.off[i] = CX[i] + o.nx * (CY[i] + o.ny * CZ[i]);
    for (let i = 0; i < 19; i++) this.feqIn[i] = this.feq(i, 1, o.uLb, 0, 0);
    const inter: number[] = [], edge: number[] = [];
    for (let z = 0; z < o.nz; z++) for (let y = 0; y < o.ny; y++) for (let x = 0; x < o.nx; x++) {
      const id = x + o.nx * (y + o.ny * z);
      if (o.solid[id]) continue;
      if (x === 0 || y === 0 || z === 0 || x === o.nx - 1 || y === o.ny - 1 || z === o.nz - 1) edge.push(id); else inter.push(id);
    }
    this.interior = Int32Array.from(inter); this.edge = Int32Array.from(edge);
    // initial state: uniform flow in the fluid
    for (let id = 0; id < N; id++) {
      const u = o.solid[id] ? 0 : o.uLb;
      for (let i = 0; i < 19; i++) this.A[i * N + id] = this.feq(i, 1, u, 0, 0);
      this.ux[id] = u;
    }
  }

  private feq(i: number, rho: number, ux: number, uy: number, uz: number) {
    const cu = CX[i] * ux + CY[i] * uy + CZ[i] * uz;
    return W[i] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * (ux * ux + uy * uy + uz * uz));
  }

  /** value of population i arriving at cell (x,y,z) (generic path for cells on the domain boundary) */
  private pullEdge(i: number, id: number, x: number, y: number, z: number): number {
    const o = this.o, A = this.A, N = this.N;
    const sx = x - CX[i], sy = y - CY[i], sz = z - CZ[i];
    if (sx < 0) return this.feqIn[i];                                         // inlet
    if (sx >= o.nx) return A[i * N + id];                                      // cannot happen for the outlet (handled below)
    let ii = i, bounced = false;
    if (sy < 0 || sy >= o.ny) { if (o.wallY === 'wall') bounced = true; else ii = MIRY[ii]; }
    if (sz < 0) { if (o.wallZlow === 'wall') bounced = true; else ii = MIRZ[ii]; }
    else if (sz >= o.nz) { if (o.wallZhigh === 'wall') bounced = true; else ii = MIRZ[ii]; }
    if (bounced) return A[OPP[i] * N + id];
    if (ii !== i) return A[ii * N + id];
    // inside the domain in y and z; x may sit at the outlet where sx is valid anyway
    const sid = sx + o.nx * (sy + o.ny * sz);
    if (o.solid[sid]) return A[OPP[i] * N + id];
    if (x === o.nx - 1 && CX[i] < 0 && !o.closedOutlet) return A[i * N + id - 1];  // zero gradient at the outlet: copy from the interior neighbour
    return A[i * N + sid];
  }

  step() {
    const o = this.o, N = this.N, A = this.A, B = this.B, off = this.off, solid = this.solid, nx = o.nx, ny = o.ny;
    const rho = this.rho, ux = this.ux, uy = this.uy, uz = this.uz;
    const tau0 = this.tau0, smag2 = o.smag * o.smag, f = new Float64Array(19);
    let fx = 0, fy = 0, fz = 0;
    const collide = (id: number) => {
      let r = 0, mx = 0, my = 0, mz = 0;
      for (let i = 0; i < 19; i++) { const v = f[i]; r += v; mx += v * CX[i]; my += v * CY[i]; mz += v * CZ[i]; }
      const ir = 1 / r, u = mx * ir, v = my * ir, w = mz * ir;
      const u2 = u * u + v * v + w * w;
      let tau = tau0;
      if (smag2 > 0) {
        // second moments of f
        let pxx = 0, pyy = 0, pzz = 0, pxy = 0, pxz = 0, pyz = 0;
        for (let i = 1; i < 19; i++) { const fi = f[i], cx = CX[i], cy = CY[i], cz = CZ[i]; pxx += fi * cx * cx; pyy += fi * cy * cy; pzz += fi * cz * cz; pxy += fi * cx * cy; pxz += fi * cx * cz; pyz += fi * cy * cz; }
        const nxx = pxx - r * u * u - r / 3, nyy = pyy - r * v * v - r / 3, nzz = pzz - r * w * w - r / 3, nxy = pxy - r * u * v, nxz = pxz - r * u * w, nyz = pyz - r * v * w;
        const Q = nxx * nxx + nyy * nyy + nzz * nzz + 2 * (nxy * nxy + nxz * nxz + nyz * nyz);
        tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + 18 * smag2 * Math.SQRT2 * Math.sqrt(Q) * ir));
      }
      const om = 1 / tau;
      for (let i = 0; i < 19; i++) {
        const cu = CX[i] * u + CY[i] * v + CZ[i] * w;
        const fe = W[i] * r * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * u2);
        B[i * N + id] = f[i] - om * (f[i] - fe);
      }
      rho[id] = r; ux[id] = u; uy[id] = v; uz[id] = w;
    };
    const ilist = this.interior;
    for (let q = 0; q < ilist.length; q++) {
      const id = ilist[q];
      for (let i = 0; i < 19; i++) {
        const sid = id - off[i];
        if (solid[sid]) { const v = A[OPP[i] * N + id]; f[i] = v; fx -= 2 * CX[i] * v; fy -= 2 * CY[i] * v; fz -= 2 * CZ[i] * v; }
        else f[i] = A[i * N + sid];
      }
      collide(id);
    }
    const elist = this.edge;
    for (let q = 0; q < elist.length; q++) {
      const id = elist[q];
      const x = id % nx, y = ((id / nx) | 0) % ny, z = (id / (nx * ny)) | 0;
      for (let i = 0; i < 19; i++) {
        const v = this.pullEdge(i, id, x, y, z);
        f[i] = v;
        const sx = x - CX[i], sy = y - CY[i], sz = z - CZ[i];
        if (sx >= 0 && sx < nx && sy >= 0 && sy < ny && sz >= 0 && sz < o.nz && solid[sx + nx * (sy + ny * sz)]) { fx -= 2 * CX[i] * v; fy -= 2 * CY[i] * v; fz -= 2 * CZ[i] * v; }
      }
      collide(id);
    }
    this.A = B; this.B = A;
    this.force = [fx, fy, fz];
    this.stepCount++;
  }

  /** speed magnitude at each cell (lattice) */
  speed(): Float32Array { const s = new Float32Array(this.N); for (let i = 0; i < this.N; i++) s[i] = this.solid[i] ? 0 : Math.hypot(this.ux[i], this.uy[i], this.uz[i]); return s; }
  maxSpeed(): number { let m = 0; for (let i = 0; i < this.N; i++) { if (this.solid[i]) continue; const s = Math.hypot(this.ux[i], this.uy[i], this.uz[i]); if (s > m) m = s; } return m; }
  stable(): boolean { const s = this.maxSpeed(); return Number.isFinite(s) && s < 0.5; }
}

export const LBM_C = { CX, CY, CZ, W, OPP };

/** Frontal area (cells) of the solid projected along the flow direction x */
export function frontalCells(solid: Uint8Array, nx: number, ny: number, nz: number): number {
  let n = 0;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) { for (let x = 0; x < nx; x++) if (solid[x + nx * (y + ny * z)]) { n++; break; } }
  return n;
}
