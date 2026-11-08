// Web Worker host for the CAM planning engine (keeps the UI responsive during long plans).
import { runJob, type CamJob } from './camJobs';

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void };
ctx.onmessage = (e: MessageEvent<{ id: number; job: CamJob }>) => {
  const { id, job } = e.data;
  try { ctx.postMessage({ id, ok: true, result: runJob(job) }); }
  catch (err) { ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) }); }
};
