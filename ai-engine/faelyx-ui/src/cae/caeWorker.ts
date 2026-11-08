// Web Worker host for the CAE solvers: keeps the interface responsive during long runs and reports progress.
import { runAnalysis, transferables } from './analysis';
import type { CaseInput } from './model';

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void };
ctx.onmessage = (e: MessageEvent<{ id: number; input: CaseInput }>) => {
  const { id, input } = e.data;
  let last = 0;
  try {
    const result = runAnalysis(input, { progress: (p, label) => { const now = Date.now(); if (now - last > 80 || p >= 1) { last = now; ctx.postMessage({ id, progress: p, label }); } } });
    ctx.postMessage({ id, ok: true, result }, transferables(result) as Transferable[]);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  }
};
