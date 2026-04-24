/**
 * Detects the source format (GAEB 90 / GAEB 2000 / GAEB DA XML) and the
 * DA number (81-86) of an incoming GAEB file.
 *
 * The primary signal is the file extension (`.d83` → GAEB 90, DA 83 etc.).
 * For the generic `.gaeb` extension — or when files get renamed in transit —
 * we fall back to magic-byte sniffing on the first few hundred bytes.
 *
 * Observed real-world prefixes (see TestData/):
 *   GAEB XML:  `<?xml version="1.0" encoding="UTF-8"?>`  (optionally with
 *              a UTF-8 BOM; the `<GAEB>` root carries the DA in its
 *              xmlns, e.g. `.../DA83/3.3`).
 *   GAEB 2000: `#begin[GAEB]` key/value format; DA sits in `[DP]83[end]`
 *              or `[Datenart]83[end]`.
 *   GAEB 90:   Fixed-column record format. First record is `00` (Vorspann)
 *              or in some dialects `T0`. DA appears as a two-digit token
 *              inside the first record.
 */

import type { DANumber, Generation } from './types';

export interface DetectResult {
  generation: Generation;
  da: DANumber;
}

export class FormatDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatDetectionError';
  }
}

const EXT_RE = /\.([dpx])(8[1-6])$/i;
const GAEB_EXT_RE = /\.gaeb$/i;

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

const LETTER_TO_GENERATION: Record<string, Generation> = {
  d: 'gaeb90',
  p: 'gaeb2000',
  x: 'gaebXml',
};

export function detectFormat(
  fileName: string,
  firstBytes: Uint8Array,
): DetectResult {
  const extMatch = fileName.match(EXT_RE);
  if (extMatch) {
    const letter = extMatch[1].toLowerCase();
    const daDigits = extMatch[2];
    return {
      generation: LETTER_TO_GENERATION[letter],
      da: toDANumber(daDigits),
    };
  }

  if (GAEB_EXT_RE.test(fileName) || fileName.indexOf('.') === -1) {
    const generation = sniffGeneration(firstBytes);
    const da = sniffDA(generation, firstBytes);
    if (da === null) {
      throw new FormatDetectionError(
        `Detected ${generation} for '${fileName}' but could not infer DA number from content.`,
      );
    }
    return { generation, da };
  }

  throw new FormatDetectionError(
    `Unrecognized GAEB file extension in '${fileName}'. ` +
      `Expected one of .d8x / .p8x / .x8x / .gaeb.`,
  );
}

function sniffGeneration(bytes: Uint8Array): Generation {
  const head = asciiPrefix(bytes, 512);

  if (head.startsWith('<?xml') || head.includes('<GAEB')) {
    return 'gaebXml';
  }
  if (head.startsWith('#begin[')) {
    return 'gaeb2000';
  }
  if (looksLikeGaeb90Record(head)) {
    return 'gaeb90';
  }

  throw new FormatDetectionError(
    'Content does not match any known GAEB generation (expected <?xml, #begin[, or a GAEB 90 record header).',
  );
}

function sniffDA(generation: Generation, bytes: Uint8Array): DANumber | null {
  const head = asciiPrefix(bytes, 4096);

  if (generation === 'gaebXml') {
    // Post-3.1 dialect carries the DA in the namespace URL: .../DA83/3.3
    const nsMatch = head.match(/\/DA(8[1-6])\//);
    if (nsMatch) return toDANumber(nsMatch[1]);
    // GAEB DA XML 3.1 uses a date-based namespace (.../200407) and stores
    // the DA in the <Award><DP>NN</DP> element instead.
    const dpMatch = head.match(/<DP>\s*(8[1-6])\s*<\/DP>/);
    if (dpMatch) return toDANumber(dpMatch[1]);
    return null;
  }

  if (generation === 'gaeb2000') {
    const m = head.match(/\[(?:DP|Datenart)\](8[1-6])\[end\]/);
    if (m) return toDANumber(m[1]);
    return null;
  }

  // GAEB 90: the Vorspann record carries the DA number. The exact column
  // varies by dialect (00-records have it near byte 20, text-dialects may
  // omit it entirely in the first record), so scan the first few lines for
  // any standalone 81-86 token.
  const firstLines = head.split('\n', 10).join('\n');
  const m = firstLines.match(/(?:^|\s)(8[1-6])(?:\s|$)/m);
  if (m) return toDANumber(m[1]);
  return null;
}

function looksLikeGaeb90Record(head: string): boolean {
  if (head.length < 2) return false;
  // First record kind is either "00" (Vorspann) or "T0"/"T1"/... in some dialects.
  if (/^[0-9]{2}/.test(head)) return true;
  if (/^T[0-9]/.test(head)) return true;
  return false;
}

function asciiPrefix(bytes: Uint8Array, limit: number): string {
  const start = hasUtf8Bom(bytes) ? 3 : 0;
  const end = Math.min(bytes.length, start + limit);
  let out = '';
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    // Keep printable ASCII, newlines and tabs; skip everything non-ASCII so
    // that encoding ambiguity doesn't confuse the magic match.
    if (b === 0x0a || b === 0x0d || b === 0x09 || (b >= 0x20 && b < 0x7f)) {
      out += String.fromCharCode(b);
    } else {
      out += ' ';
    }
  }
  return out;
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === UTF8_BOM[0] &&
    bytes[1] === UTF8_BOM[1] &&
    bytes[2] === UTF8_BOM[2]
  );
}

function toDANumber(s: string): DANumber {
  const n = Number(s);
  if (n < 81 || n > 86) {
    throw new FormatDetectionError(`Invalid DA number '${s}' (expected 81-86).`);
  }
  return n as DANumber;
}
