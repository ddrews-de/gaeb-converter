/**
 * Public façade of the GAEB2GAEB converter library.
 *
 * `parse` routes a GAEB file of any supported generation into the shared
 * `GaebDocument` model; `serialize` emits GAEB DA XML 3.3; `convert`
 * combines them and computes the matching `.x8x` target file name.
 */

import type { GaebDocument } from './types';
import { detectFormat as detectFormatImpl } from './detect';
import { decode } from './encoding';
import { parseGaebXml } from './parsers/gaebXml';
import { parseGaeb90 } from './parsers/gaeb90';
import { parseGaeb2000 } from './parsers/gaeb2000';
import { serializeGaebXml33 } from './serializer/gaebXml33';

export * from './types';
export { FormatDetectionError } from './detect';
export type { DetectResult } from './detect';
export { GaebXmlParseError } from './parsers/gaebXml';
export { Gaeb90ParseError } from './parsers/gaeb90';
export { Gaeb2000ParseError } from './parsers/gaeb2000';
export { validateGaebXml33 } from './validate';
export type { ValidationIssue, ValidationResult } from './validate';
export { validateGaebXml33WithXsd } from './validate-xsd';
export type { XsdValidationOptions } from './validate-xsd';
export { buildAuditLog, auditLogFileName } from './audit';
export type { AuditLogOptions } from './audit';
export {
  buildPositionListWorkbook,
  buildPositionListCsv,
  docToRows,
  POSITION_LIST_COLUMNS,
} from './excel';
export type {
  PositionListRow,
  DocToRowsOptions,
  BookEntry,
} from './excel';

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

export function serialize(doc: GaebDocument): string {
  return serializeGaebXml33(doc);
}

export function convert(
  bytes: Uint8Array,
  fileName: string,
): ConvertResult {
  const doc = parse(bytes, fileName);
  const xml = serialize(doc);
  const targetFileName = toXmlFileName(fileName, doc.da);
  return { doc, xml, targetFileName };
}

function toXmlFileName(fileName: string, da: GaebDocument['da']): string {
  // Preserve the base name; rewrite the extension to .x8N where N matches
  // the detected DA number. Examples:
  //   "Los 1.d83"  -> "Los 1.x83"
  //   "Los 1.P83"  -> "Los 1.X83"
  //   "Los 1.x83"  -> "Los 1.x83"  (round-trip, lower-case extension kept)
  //   "project.gaeb" -> "project.x<da>"
  const match = fileName.match(/^(.*)\.([dpxDPX])(8[1-6])$/);
  if (match) {
    const letter = match[2];
    const xLetter = letter === letter.toUpperCase() ? 'X' : 'x';
    return `${match[1]}.${xLetter}${da}`;
  }
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${base}.x${da}`;
}
