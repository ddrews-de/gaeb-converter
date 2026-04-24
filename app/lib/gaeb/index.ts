/**
 * Public façade of the GAEB2GAEB converter library.
 *
 * Real implementations land in subsequent steps of the plan
 * (see docs/IMPLEMENTATION_PLAN.md). The stubs below fix the public surface
 * so that UI wiring and tests can be implemented against it incrementally.
 */

import type { GaebDocument } from './types';
import { detectFormat as detectFormatImpl } from './detect';
import { decode } from './encoding';
import { parseGaebXml } from './parsers/gaebXml';

export * from './types';
export { FormatDetectionError } from './detect';
export type { DetectResult } from './detect';
export { GaebXmlParseError } from './parsers/gaebXml';

export interface ConvertResult {
  doc: GaebDocument;
  xml: string;
  targetFileName: string;
}

export const detectFormat = detectFormatImpl;

export function parse(bytes: Uint8Array, fileName: string): GaebDocument {
  const detected = detectFormatImpl(fileName, bytes);
  const { text, encoding } = decode(
    bytes,
    detected.generation === 'gaebXml' ? 'utf-8' : 'auto',
  );

  if (detected.generation === 'gaebXml') {
    const doc = parseGaebXml(text, detected.da);
    doc.sourceEncoding = encoding;
    return doc;
  }

  throw new Error(
    `Parser for ${detected.generation} not implemented yet (plan step ${detected.generation === 'gaeb90' ? 6 : 7}).`,
  );
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
