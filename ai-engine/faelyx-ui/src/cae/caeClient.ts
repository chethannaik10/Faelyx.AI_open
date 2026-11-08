// Runs a CAE analysis in a Web Worker (terminated to cancel); falls back to running inline when workers are unavailable.

import { runAnalysis } from './analysis';
import type { CaseInput, Result } from './model';

let current: { worker: Worker; reject: (e: Error) => void } | null = null;
let workerBroken = false;
let nextId = 1;

export function cancelCae() {
  if (!current) return;
  const c = current; current = null;
  c.worker.terminate();
  c.reject(new Error('cancelled'));
}

export const isRunning = () => current !== null;

export async function runCae(input: CaseInput, onProgress: (p: number, label: string) => void): Promise<Result> {
  cancelCae();
  let w: Worker | null = null;
  if (!workerBroken) {
    try { w = new Worker(new URL('./caeWorker.ts', import.meta.url), { type: 'module' }); } catch { workerBroken = true; }
  }
  if (w) {
    const worker = w;
    try {
      return await new Promise<Result>((resolve, reject) => {
        const id = nextId++;
        current = { worker, reject };
        worker.onmessage = (e: MessageEvent<{ id: number; ok?: boolean; result?: Result; error?: string; stack?: string; progress?: number; label?: string }>) => {
          const d = e.data;
          if (d.id !== id) return;
          if (d.progress !== undefined) { onProgress(d.progress, d.label ?? ''); return; }
          current = null; worker.terminate();
          if (d.ok && d.result) resolve(d.result); else { if (d.stack) console.error(d.stack); reject(new Error(d.error ?? 'The analysis failed')); }
        };
        worker.onerror = (ev) => { current = null; worker.terminate(); workerBroken = true; reject(new Error(`worker: ${ev.message || 'failed to start'}`)); };
        worker.postMessage({ id, input });
      });
    } catch (err) {
      if (!workerBroken || (err as Error).message === 'cancelled') throw err;
    }
  }
  onProgress(0, 'Running in the page (no worker available)');
  await new Promise((r) => setTimeout(r, 30));
  return runAnalysis(input, { progress: onProgress });
}
