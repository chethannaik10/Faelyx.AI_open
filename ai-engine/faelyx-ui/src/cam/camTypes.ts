import type { Program } from './toolpath';
import type { PrintProgram, PrintAnalysis } from './printPlan';
import type { MillAnalysis } from './millPlan';
import type { PostResult } from './post';
import type { SimEvent, SimReport } from './sim';

export type Res =
  | { kind: 'mill'; program: Program; post: PostResult; analysis: MillAnalysis; ms: number }
  | { kind: 'turn' | 'cut'; program: Program; post: PostResult; ms: number }
  | { kind: 'print'; print: PrintProgram; post: PostResult; analysis: PrintAnalysis; ms: number };

export interface SimData { events: SimEvent[]; reports: SimReport[] }

export const resWarnings = (r: Res): string[] => (r.kind === 'print' ? r.print.warnings : r.program.warnings);
