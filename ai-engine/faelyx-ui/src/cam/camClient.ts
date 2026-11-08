// Runs CAM jobs in a Web Worker (one per channel: "analyse" and "plan") when the browser allows it,
// otherwise inline after a paint. A new job on a channel cancels the previous one.

import { type CamJob, type CamResult, runJob } from './camJobs';

interface Slot { worker: Worker; id: number; resolve: (r: CamResult) => void; reject: (e: Error) => void }
const slots = new Map<string, Slot>();
let workerBroken = false;
let nextId = 1;

function spawn(): Worker | null {
  if (workerBroken) return null;
  try { return new Worker(new URL('./camWorker.ts', import.meta.url), { type: 'module' }); } catch { workerBroken = true; return null; }
}

/** Cancel the job running on a channel (its worker is terminated). */
export function cancelChannel(channel: string) {
  const s = slots.get(channel);
  if (!s) return;
  slots.delete(channel);
  s.worker.terminate();
  s.reject(new Error('cancelled'));
}

export async function runCam(job: CamJob, channel: string): Promise<CamResult> {
  cancelChannel(channel);
  const w = spawn();
  if (w) {
    try {
      return await new Promise<CamResult>((resolve, reject) => {
        const id = nextId++;
        slots.set(channel, { worker: w, id, resolve, reject });
        w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: CamResult; error?: string }>) => {
          if (e.data.id !== id) return;
          if (slots.get(channel)?.id === id) slots.delete(channel);
          w.terminate();
          if (e.data.ok && e.data.result) resolve(e.data.result); else reject(new Error(e.data.error ?? 'Planning failed'));
        };
        w.onerror = (ev) => {
          if (slots.get(channel)?.id === id) slots.delete(channel);
          w.terminate();
          workerBroken = true;
          reject(new Error(`worker: ${ev.message || 'failed to start'}`));
        };
        w.postMessage({ id, job });
      });
    } catch (err) {
      if (!workerBroken || (err as Error).message === 'cancelled') throw err;
    }
  }
  await new Promise((r) => setTimeout(r, 30));
  return runJob(job);
}
