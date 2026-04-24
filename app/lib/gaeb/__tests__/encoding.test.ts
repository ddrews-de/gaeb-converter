import { describe, expect, it } from 'vitest';
import { chooseEncoding, decode, type EncodingChoice } from '../encoding';

function bytesOf(...hex: number[]): Uint8Array {
  return Uint8Array.from(hex);
}

function encodeWindows1252(s: string): Uint8Array {
  // Round-trip via TextDecoder is not enough — TextEncoder only emits UTF-8.
  // We map characters explicitly for the small set we test.
  const map: Record<string, number> = {
    'ä': 0xe4,
    'ö': 0xf6,
    'ü': 0xfc,
    'Ä': 0xc4,
    'Ö': 0xd6,
    'Ü': 0xdc,
    'ß': 0xdf,
    '€': 0x80,
  };
  const out: number[] = [];
  for (const ch of s) {
    out.push(map[ch] ?? ch.charCodeAt(0));
  }
  return Uint8Array.from(out);
}

describe('chooseEncoding', () => {
  it('returns utf-8 when the file starts with a UTF-8 BOM', () => {
    const bytes = bytesOf(0xef, 0xbb, 0xbf, 0x68, 0x69);
    expect(chooseEncoding('anything.d83', bytes)).toBe('utf-8');
  });

  it('returns utf-8 when the content starts with an XML prolog', () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0"?>');
    expect(chooseEncoding('weird-name.txt', bytes)).toBe('utf-8');
  });

  it('returns utf-8 for .x8x extensions regardless of content', () => {
    expect(chooseEncoding('project.x83', new Uint8Array())).toBe('utf-8');
    expect(chooseEncoding('PROJECT.X86', new Uint8Array())).toBe('utf-8');
  });

  it('defaults to windows-1252 for legacy GAEB extensions', () => {
    expect(chooseEncoding('project.d83', new Uint8Array())).toBe('windows-1252');
    expect(chooseEncoding('project.p84', new Uint8Array())).toBe('windows-1252');
    expect(chooseEncoding('project.gaeb', new Uint8Array())).toBe('windows-1252');
  });
});

describe('decode', () => {
  it('decodes Windows-1252 umlauts correctly', () => {
    const bytes = encodeWindows1252('Ärger über Größe');
    const result = decode(bytes, 'windows-1252');
    expect(result.text).toBe('Ärger über Größe');
    expect(result.encoding).toBe('windows-1252');
  });

  it('decodes UTF-8 and strips a leading BOM', () => {
    const bytes = bytesOf(0xef, 0xbb, 0xbf, 0x68, 0x69);
    const result = decode(bytes, 'utf-8');
    expect(result.text).toBe('hi');
    expect(result.encoding).toBe('utf-8');
  });

  it('normalizes CRLF and lone CR to LF', () => {
    const bytes = new TextEncoder().encode('a\r\nb\rc\nd');
    const result = decode(bytes, 'utf-8');
    expect(result.text).toBe('a\nb\nc\nd');
  });

  it("decodes CP437 box-drawing characters", () => {
    // CP437 0xC4 = '─', 0xB3 = '│'
    const bytes = bytesOf(0xc4, 0xb3);
    const result = decode(bytes, 'cp437');
    expect(result.text).toBe('─│');
    expect(result.encoding).toBe('cp437');
  });

  it('auto: re-decodes as UTF-8 when Windows-1252 produces double-encoding markers', () => {
    // "Größe" encoded as UTF-8 then interpreted as Windows-1252 yields "GrÃ¶ÃŸe".
    // If we feed the actual UTF-8 bytes through auto, the first try (win1252)
    // produces those double-encode markers, so we should fall back to utf-8.
    const bytes = new TextEncoder().encode('Größe');
    const result = decode(bytes, 'auto');
    expect(result.text).toBe('Größe');
    expect(result.encoding).toBe('utf-8');
  });

  it('auto: keeps Windows-1252 when the content actually is Windows-1252', () => {
    const bytes = encodeWindows1252('Größe');
    const result = decode(bytes, 'auto');
    expect(result.text).toBe('Größe');
    expect(result.encoding).toBe('windows-1252');
  });
});

describe('decode types', () => {
  it('accepts every documented EncodingChoice', () => {
    const choices: EncodingChoice[] = ['utf-8', 'windows-1252', 'cp437', 'auto'];
    for (const c of choices) {
      const result = decode(new Uint8Array(), c);
      expect(typeof result.encoding).toBe('string');
    }
  });
});
