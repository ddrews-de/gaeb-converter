/**
 * Public façade of the GAEB2GAEB converter library.
 *
 * Real implementations land in subsequent steps of the plan
 * (see docs/IMPLEMENTATION_PLAN.md). The stubs below fix the public surface
 * so that UI wiring and tests can be implemented against it incrementally.
 */

import type { GaebDocument } from './types';
import { detectFormat as detectFormatImpl } from './detect';

export * from './types';
export { FormatDetectionError } from './detect';
export type { DetectResult } from './detect';

export interface ConvertResult {
  doc: GaebDocument;
  xml: string;
  targetFileName: string;
}

export const detectFormat = detectFormatImpl;

export function parse(_bytes: Uint8Array, _fileName: string): GaebDocument {
  throw new Error('parse not implemented yet');
}

export function serialize(_doc: GaebDocument): string {
  throw new Error('serialize not implemented yet');
}

export function convert(
  _bytes: Uint8Array,
  _fileName: string,
): ConvertResult {
  throw new Error('convert not implemented yet');
}
