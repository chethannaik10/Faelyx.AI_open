// Jobs the CAM workspace hands to the planning engine. Everything here is plain data in and out,
// so it runs unchanged inside a Web Worker (camWorker.ts) or inline on the main thread.

import { planMill, analyseMill, type MillRequest, type MillAnalysis } from './millPlan';
import { planPrint, analysePrint, type PrintRequest, type PrintAnalysis, type PrintProgram } from './printPlan';
import { planTurn, type TurnRequest } from './turnPlan';
import { planCut, type CutRequest } from './cutPlan';
import { postCnc, postPrint, type PostResult, type PostOptions } from './post';
import { type Program } from './toolpath';
import { meshStats, type Mesh } from './geometry';

export type CamJob =
  | { op: 'analyse'; family: 'mill'; req: MillRequest }
  | { op: 'analyse'; family: 'print'; req: PrintRequest }
  | { op: 'analyse'; family: 'turn'; req: TurnRequest }
  | { op: 'analyse'; family: 'cut'; req: CutRequest }
  | { op: 'plan'; family: 'mill'; req: MillRequest; post: PostOptions }
  | { op: 'plan'; family: 'print'; req: PrintRequest; post: PostOptions }
  | { op: 'plan'; family: 'turn'; req: TurnRequest; post: PostOptions }
  | { op: 'plan'; family: 'cut'; req: CutRequest; post: PostOptions };

export interface OtherAnalysis {
  size: [number, number, number]; volume: number;
  strategy: { id: string; title: string; detail: string; on: boolean }[]; warnings: string[];
}
export type AnyAnalysis = { family: 'mill'; a: MillAnalysis } | { family: 'print'; a: PrintAnalysis } | { family: 'turn' | 'cut'; a: OtherAnalysis };

export type CamResult =
  | { op: 'analyse'; analysis: AnyAnalysis; ms: number }
  | { op: 'plan'; family: 'mill' | 'turn' | 'cut'; program: Program; post: PostResult; analysis?: MillAnalysis; ms: number }
  | { op: 'plan'; family: 'print'; print: PrintProgram; post: PostResult; analysis: PrintAnalysis; ms: number };

function otherAnalysis(family: 'turn' | 'cut', mesh: Mesh): OtherAnalysis {
  const st = meshStats(mesh);
  const size = st.size;
  if (family === 'turn') {
    const d = Math.max(size[0], size[1]);
    return {
      size, volume: st.volume, warnings: [],
      strategy: [
        { id: 'face', title: 'Facing', detail: 'Cleans up the end face before the roughing passes.', on: true },
        { id: 'rough', title: 'Roughing (G71 style)', detail: `Axial passes at stepped diameters down to the finish profile, leaving a finish allowance. Largest diameter Ø${d.toFixed(1)} mm, length ${size[2].toFixed(1)} mm.`, on: true },
        { id: 'finish', title: 'Finish profile pass', detail: 'One contour pass at finishing feed and surface speed along the part profile.', on: true },
        { id: 'part', title: 'Part-off', detail: 'Blade cut-off at the end of the part.', on: true },
      ],
    };
  }
  return {
    size, volume: st.volume, warnings: size[2] > 30 ? [`The part is ${size[2].toFixed(0)} mm tall; laser and plasma cutting suit flat sheet parts.`] : [],
    strategy: [
      { id: 'kerf', title: 'Kerf compensation', detail: 'Outlines are offset by half the kerf so the finished edge lands on the drawn size.', on: true },
      { id: 'order', title: 'Holes first, outside last', detail: 'Inside contours are cut from smallest to largest, then the outer profile, so the part stays supported by the sheet.', on: true },
      { id: 'lead', title: 'Lead-ins in the scrap', detail: 'Pierce points sit outside the finished part, with an arc lead-in onto the contour.', on: true },
    ],
  };
}

export function runJob(job: CamJob): CamResult {
  const t0 = Date.now();
  if (job.op === 'analyse') {
    if (job.family === 'mill') return { op: 'analyse', analysis: { family: 'mill', a: analyseMill(job.req) }, ms: Date.now() - t0 };
    if (job.family === 'print') return { op: 'analyse', analysis: { family: 'print', a: analysePrint(job.req) }, ms: Date.now() - t0 };
    return { op: 'analyse', analysis: { family: job.family, a: otherAnalysis(job.family, job.req.mesh) }, ms: Date.now() - t0 };
  }
  if (job.family === 'mill') {
    const r = planMill(job.req);
    return { op: 'plan', family: 'mill', program: r.program, analysis: r.analysis, post: postCnc(r.program, job.post), ms: Date.now() - t0 };
  }
  if (job.family === 'turn') { const p = planTurn(job.req); return { op: 'plan', family: 'turn', program: p, post: postCnc(p, job.post), ms: Date.now() - t0 }; }
  if (job.family === 'cut') { const p = planCut(job.req); return { op: 'plan', family: 'cut', program: p, post: postCnc(p, job.post), ms: Date.now() - t0 }; }
  const p = planPrint(job.req);
  return { op: 'plan', family: 'print', print: p, post: postPrint(p, job.post), analysis: analysePrint(job.req), ms: Date.now() - t0 };
}
