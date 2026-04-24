/**
 * Web Worker that runs the full convert() pipeline off the main thread.
 *
 * Message protocol (the run.ts wrapper on the main thread is the other
 * side of the contract):
 *
 *   Incoming  { id: number; bytes: Uint8Array; fileName: string }
 *   Outgoing  { id: number; ok: true;  result: ConvertResult }
 *         or  { id: number; ok: false; error: string }
 *
 * `ConvertResult` carries the `doc` (which contains `sourceEncoding` and
 * any `warnings`), the serialized XML string and the target file name.
 * None of that transfers with object identity — the browser structured-
 * clones the payload on postMessage, so we stay immutable by design.
 */

/// <reference lib="webworker" />

import { convert } from '..';

export type ConvertRequest = {
  id: number;
  bytes: Uint8Array;
  fileName: string;
};

export type ConvertResponse =
  | { id: number; ok: true; result: ReturnType<typeof convert> }
  | { id: number; ok: false; error: string };

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', (event: MessageEvent<ConvertRequest>) => {
  const { id, bytes, fileName } = event.data;
  try {
    const result = convert(bytes, fileName);
    const response: ConvertResponse = { id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const response: ConvertResponse = { id, ok: false, error };
    self.postMessage(response);
  }
});
