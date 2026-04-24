/**
 * Reads GAEB files as bytes and decodes them with the right text encoding.
 *
 * GAEB 90 (.d8x) and GAEB 2000 (.p8x) files are virtually never UTF-8 — they
 * are produced by Windows-based AVA software and arrive in Windows-1252 (most
 * common today) or, occasionally, IBM-CP437/CP850 (older DOS-era exports).
 * GAEB DA XML (.x8x) is UTF-8.
 *
 * Decoding the wrong way silently destroys umlauts, so the file *must* be read
 * as ArrayBuffer and decoded explicitly — never via `FileReader.readAsText`.
 */

export type EncodingChoice = 'utf-8' | 'windows-1252' | 'cp437' | 'auto';

export interface DecodedFile {
  text: string;
  encoding: Exclude<EncodingChoice, 'auto'>;
  bytes: Uint8Array;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const XML_PROLOG = '<?xml';
const XML_EXT_RE = /\.x8[1-6]$/i;

const DOUBLE_ENCODED_UTF8_RE = /Ã[-¿]/;

export function chooseEncoding(
  fileName: string,
  bytes: Uint8Array,
): Exclude<EncodingChoice, 'auto'> {
  if (hasUtf8Bom(bytes)) return 'utf-8';
  if (startsWithXmlProlog(bytes)) return 'utf-8';
  if (XML_EXT_RE.test(fileName)) return 'utf-8';
  return 'windows-1252';
}

export function decode(
  bytes: Uint8Array,
  encoding: EncodingChoice = 'auto',
): DecodedFile {
  const target =
    encoding === 'auto' ? chooseEncoding('', bytes) : encoding;

  let text = decodeWith(bytes, target);

  if (encoding === 'auto' && target === 'windows-1252') {
    if (looksDoubleEncoded(text)) {
      const utf8Text = decodeWith(bytes, 'utf-8');
      if (!utf8Text.includes('�')) {
        return { text: normalizeNewlines(utf8Text), encoding: 'utf-8', bytes };
      }
    }
    // Many GAEB 90 files produced by DOS-era tools are CP437, not Windows-1252.
    // Heuristics to detect this from the byte stream:
    //   1. Any byte in 0x80–0x9F range (Windows-1252 mostly has punctuation
    //      or unassigned there; CP437 has umlauts and line-drawing glyphs),
    //   2. OR CP437 decoding yields more German umlauts than Win1252 did.
    if (looksLikeCp437(bytes) || hasMoreGermanChars(bytes, text)) {
      return {
        text: normalizeNewlines(decodeWith(bytes, 'cp437')),
        encoding: 'cp437',
        bytes,
      };
    }
  }

  if (target === 'utf-8' && hasUtf8Bom(bytes)) {
    text = stripUtf8Bom(text);
  }

  return { text: normalizeNewlines(text), encoding: target, bytes };
}

const UMLAUT_RE = /[äöüÄÖÜß]/g;

function looksLikeCp437(bytes: Uint8Array): boolean {
  // Bytes 0x80–0x8F are reserved / unassigned in Windows-1252 (with just two
  // exceptions: 0x80 = €, 0x8A = Š, 0x8C = Œ etc. — but most are unassigned
  // and decode to the Latin-1 control range U+0080–U+008F). If we see even a
  // single 0x81 / 0x83 / 0x85 / 0x88 / 0x8D / 0x8F byte, the file is almost
  // certainly CP437 rather than Windows-1252.
  for (let i = 0; i < Math.min(bytes.length, 16384); i++) {
    const b = bytes[i];
    if (b === 0x81 || b === 0x83 || b === 0x85 || b === 0x88 || b === 0x8d || b === 0x8f) {
      return true;
    }
  }
  return false;
}

function hasMoreGermanChars(bytes: Uint8Array, win1252Text: string): boolean {
  const winCount = (win1252Text.match(UMLAUT_RE) ?? []).length;
  if (winCount > 10) return false;
  const cp437Text = decodeWith(bytes, 'cp437');
  const cpCount = (cp437Text.match(UMLAUT_RE) ?? []).length;
  return cpCount > winCount * 3 && cpCount > 3;
}

export async function readGaebFile(file: File): Promise<DecodedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const target = chooseEncoding(file.name, bytes);
  return decode(bytes, target);
}

function decodeWith(
  bytes: Uint8Array,
  encoding: Exclude<EncodingChoice, 'auto'>,
): string {
  if (encoding === 'cp437') return decodeCp437(bytes);
  return new TextDecoder(encoding, { fatal: false }).decode(bytes);
}

// Bytes 0x80–0xFF in IBM Code Page 437 in order.
// Source: Unicode CP437 mapping. WHATWG TextDecoder does not implement ibm437,
// so we provide the lookup ourselves.
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ' +
  'áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐' +
  '└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
  'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

function decodeCp437(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
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

function startsWithXmlProlog(bytes: Uint8Array): boolean {
  const offset = hasUtf8Bom(bytes) ? 3 : 0;
  if (bytes.length < offset + XML_PROLOG.length) return false;
  for (let i = 0; i < XML_PROLOG.length; i++) {
    if (bytes[offset + i] !== XML_PROLOG.charCodeAt(i)) return false;
  }
  return true;
}

function looksDoubleEncoded(text: string): boolean {
  return DOUBLE_ENCODED_UTF8_RE.test(text);
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}
