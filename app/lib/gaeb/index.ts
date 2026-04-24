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
import { parseGaeb90 } from './parsers/gaeb90';
import { parseGaeb2000 } from './parsers/gaeb2000';

export * from './types';
export { FormatDetectionError } from './detect';
export type { DetectResult } from './detect';
export { GaebXmlParseError } from './parsers/gaebXml';
export { Gaeb90ParseError } from './parsers/gaeb90';
export { Gaeb2000ParseError } from './parsers/gaeb2000';

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

  if (detected.generation === 'gaeb90') {
    const doc = parseGaeb90(text, detected.da);
    doc.sourceEncoding = encoding;
    return doc;
  }

  if (detected.generation === 'gaeb2000') {
    const doc = parseGaeb2000(text, detected.da);
    doc.sourceEncoding = encoding;
    return doc;
  }

  throw new Error(`Parser for ${detected.generation} not implemented yet.`);
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
