// Neutral toolpath IR shared by the planners, the post-processors and the simulator.
// Planners emit moves in the setup's local frame; posts translate them per controller.

import type { MachineDef, ProcessId, Tool, StockSetup, ControllerId } from './camData';

export type Cmd =
  | { k: 'setup'; name: string; a: number; c: number; wcs: string; index: boolean }
  | { k: 'op'; name: string; tool: number; rpm: number; coolant: boolean; spindle: boolean; note?: string; css?: number; maxRpm?: number }
  | { k: 'rapid'; x?: number; y?: number; z?: number; a?: number; b?: number; c?: number }
  | { k: 'feed'; x?: number; y?: number; z?: number; a?: number; b?: number; c?: number; f: number }
  | { k: 'drill'; x: number; y: number; z: number; r: number; q?: number; f: number; dwell?: number }
  | { k: 'comment'; text: string }
  | { k: 'on'; on: boolean; pierce?: number }              // laser / plasma torch
  | { k: 'tcp'; on: boolean };                             // 5-axis tool-centre-point mode

export interface OpSummary {
  id: number; name: string; strategy: string; toolNo: number; toolName: string;
  rpm: number; feed: number; ap: number; ae: number; mrr: number; powerKw: number;
  length: number; time: number; startCmd: number; endCmd: number; setup: number; notes: string[];
}

export interface ToolUse { n: number; tool: Tool; rpm: number; minutes: number; ops: number }

export interface Box3 { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; label: string }

/** Heightmap data for the stock-removal simulation of one 3-axis setup (local frame). */
export interface SimSetup {
  name: string; a: number; c: number;
  cell: number; nx: number; ny: number; x0: number; y0: number;
  /** Starting stock surface, -Infinity outside the stock. */
  stock: Float32Array;
  /** Finished part surface (target) */
  target: Float32Array;
  fixtures: Box3[];
  stockBox: { x0: number; y0: number; x1: number; y1: number; zTop: number; zBottom: number; round: boolean };
  partBox: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };
  /** First / last cmd index of this setup in Program.cmds */
  startCmd: number; endCmd: number;
}

export interface TurnSim { stockR: number; stockLen: number; chuckZ: number; chuckR: number; profile: [number, number][] }

export interface Program {
  kind: 'mill' | 'turn' | 'cut';
  process: ProcessId; controller: ControllerId; machine: MachineDef;
  name: string; unit: 'mm';
  cmds: Cmd[]; ops: OpSummary[]; tools: ToolUse[];
  stock: StockSetup & { box: [number, number, number]; };
  sims: SimSetup[];
  turn?: TurnSim;
  cut?: { thickness: number; sheet: [number, number]; kerf: number; loops: { pts: [number, number][]; inside: boolean }[] };
  warnings: string[];
  totalTime: number;      // minutes
  rapidLength: number; feedLength: number;
  partVolume: number; removedVolume: number;
}

export interface MoveStat { length: number; time: number }
export const dist3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
