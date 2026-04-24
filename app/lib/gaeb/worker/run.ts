/**
 * Main-thread wrapper around the convert.worker.
 *
 * On browsers that expose `Worker` we spin up a dedicated worker, send the
 * bytes across, and await the serialized `{ doc, xml, targetFileName }`
 * reply — keeping the UI thread responsive even for multi-megabyte LVs.
 *
 * In environments without `Worker` (Node test runs, SSR in edge cases)
 * we fall back to a synchronous `convert()` call. Both paths return the
 * same `Promise<ConvertResult>`, so callers don't need to branch.
 */

import type { ConvertResult } from '..';
import { convert } from '..';
import type { ConvertRequest, ConvertResponse } from './convert.worker';

let nextId = 1;
let sharedWorker: Worker | null = null;
const pending = new Map<
  number,
  { resolve: (r: ConvertResult) => void; reject: (err: Error) => void }
>();

/**
 * Returns true when the current runtime can host a DedicatedWorker.
 * Exported so tests can assert the branch without spinning one up.
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof URL !== 'undefined';
}

export async function runConvert(
  bytes: Uint8Array,
  fileName: string,
): Promise<ConvertResult> {
  if (!isWorkerSupported()) {
    // Sync fallback — wrap in a Promise so the return type stays uniform.
    return convert(bytes, fileName);
  }

  const worker = getWorker();
  const id = nextId++;

  return new Promise<ConvertResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: ConvertRequest = { id, bytes, fileName };
    worker.postMessage(request);
  });
}

function getWorker(): Worker {
  if (sharedWorker) return sharedWorker;

  sharedWorker = new Worker(
    new URL('./convert.worker.ts', import.meta.url),
    { type: 'module' },
  );

  sharedWorker.addEventListener('message', (event: MessageEvent<ConvertResponse>) => {
    const { id } = event.data;
    const slot = pending.get(id);
    if (!slot) return;
    pending.delete(id);
    if (event.data.ok) {
      slot.resolve(event.data.result);
    } else {
      slot.reject(new Error(event.data.error));
    }
  });

  sharedWorker.addEventListener('error', (event: ErrorEvent) => {
    // Fail every in-flight request — the worker won't recover on its own.
    for (const slot of pending.values()) {
      slot.reject(new Error(event.message || 'Worker error'));
    }
    pending.clear();
  });

  return sharedWorker;
}
