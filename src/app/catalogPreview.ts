import { api } from './api';

// Leave browser connections available for navigation, context, and document refreshes.
let active = 0;
const waiting: (() => void)[] = [];
async function acquire(signal: AbortSignal) {
  signal.throwIfAborted();
  if (active < 2) { active++; return; }
  await new Promise<void>((accept, reject) => {
    const start = () => { signal.removeEventListener('abort', cancel); accept(); };
    const cancel = () => { waiting.splice(waiting.indexOf(start), 1); reject(signal.reason); };
    waiting.push(start);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
export async function catalogPreview<T>(path: string, signal: AbortSignal): Promise<T> {
  await acquire(signal);
  try { return await api<T>(path, { signal }); }
  finally { const next = waiting.shift(); if (next) next(); else active--; }
}
