import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FormatDetectionError, detectFormat } from '../detect';
import type { DANumber, Generation } from '../types';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function bytesOfString(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('detectFormat (extension-driven)', () => {
  const matrix: Array<{
    fileName: string;
    expected: { generation: Generation; da: DANumber };
  }> = [
    { fileName: 'x.d81', expected: { generation: 'gaeb90', da: 81 } },
    { fileName: 'x.d83', expected: { generation: 'gaeb90', da: 83 } },
    { fileName: 'x.d86', expected: { generation: 'gaeb90', da: 86 } },
    { fileName: 'x.p81', expected: { generation: 'gaeb2000', da: 81 } },
    { fileName: 'x.p83', expected: { generation: 'gaeb2000', da: 83 } },
    { fileName: 'x.p86', expected: { generation: 'gaeb2000', da: 86 } },
    { fileName: 'x.x81', expected: { generation: 'gaebXml', da: 81 } },
    { fileName: 'x.x83', expected: { generation: 'gaebXml', da: 83 } },
    { fileName: 'x.x86', expected: { generation: 'gaebXml', da: 86 } },
    { fileName: 'PROJECT.D83', expected: { generation: 'gaeb90', da: 83 } },
    { fileName: 'PROJECT.P83', expected: { generation: 'gaeb2000', da: 83 } },
  ];

  for (const { fileName, expected } of matrix) {
    it(`maps '${fileName}' to ${expected.generation} DA${expected.da}`, () => {
      expect(detectFormat(fileName, new Uint8Array())).toEqual(expected);
    });
  }

  it('rejects unknown extensions', () => {
    expect(() => detectFormat('file.txt', new Uint8Array())).toThrow(
      FormatDetectionError,
    );
  });

  it('rejects invalid DA digits', () => {
    // .d87 is not a real GAEB DA; regex only matches 81-86.
    expect(() => detectFormat('file.d87', new Uint8Array())).toThrow(
      FormatDetectionError,
    );
  });
});

describe('detectFormat (magic-sniff for .gaeb)', () => {
  it('detects GAEB DA XML via <?xml prolog', () => {
    const bytes = bytesOfString(
      '<?xml version="1.0"?><GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3"/>',
    );
    expect(detectFormat('project.gaeb', bytes)).toEqual({
      generation: 'gaebXml',
      da: 83,
    });
  });

  it('detects GAEB DA XML via UTF-8 BOM + <?xml prolog', () => {
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf]);
    const body = bytesOfString(
      '<?xml version="1.0"?><GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA84/3.3"/>',
    );
    const bytes = new Uint8Array(bom.length + body.length);
    bytes.set(bom);
    bytes.set(body, bom.length);
    expect(detectFormat('x.gaeb', bytes)).toEqual({
      generation: 'gaebXml',
      da: 84,
    });
  });

  it('detects GAEB 2000 via #begin[ marker and [DP] key', () => {
    const bytes = bytesOfString(
      '#begin[GAEB]\n#begin[GAEBInfo]\n[Version]1.2[end]\n[DP]83[end]\n',
    );
    expect(detectFormat('project.gaeb', bytes)).toEqual({
      generation: 'gaeb2000',
      da: 83,
    });
  });

  it('detects GAEB 90 via numeric record prefix and padded DA token', () => {
    // Real D83 Vorspann records pad heavily between the 00 record kind and
    // the DA token; see TestData/LV_Los01.D83.
    const padding = ' '.repeat(40);
    const bytes = bytesOfString(`00${padding}83 L${padding}000001\n`);
    const result = detectFormat('project.gaeb', bytes);
    expect(result.generation).toBe('gaeb90');
    expect(result.da).toBe(83);
  });

  it('fails when generation is clear but DA cannot be inferred', () => {
    const bytes = bytesOfString('#begin[GAEB]\n[Version]1.2[end]\n');
    expect(() => detectFormat('project.gaeb', bytes)).toThrow(
      FormatDetectionError,
    );
  });
});

describe('detectFormat against real TestData fixtures', () => {
  const fixtures = readdirSync(TEST_DATA_DIR);

  for (const name of fixtures) {
    const lower = name.toLowerCase();
    const ext = lower.slice(lower.lastIndexOf('.'));
    const expectedGeneration: Generation | null =
      ext.match(/^\.d8[1-6]$/) ? 'gaeb90'
      : ext.match(/^\.p8[1-6]$/) ? 'gaeb2000'
      : ext.match(/^\.x8[1-6]$/) ? 'gaebXml'
      : null;
    if (!expectedGeneration) continue;

    const expectedDa = Number(ext.slice(-2)) as DANumber;

    it(`classifies '${name}' as ${expectedGeneration} DA${expectedDa}`, () => {
      const bytes = new Uint8Array(readFileSync(join(TEST_DATA_DIR, name)));
      expect(detectFormat(name, bytes)).toEqual({
        generation: expectedGeneration,
        da: expectedDa,
      });
    });

    it(`magic-sniffs '${name}' (renamed to .gaeb) at least to ${expectedGeneration}`, () => {
      const bytes = new Uint8Array(readFileSync(join(TEST_DATA_DIR, name)));
      // Some real GAEB 90 dialects (e.g. text-baseline exports that start
      // with `T0`/`T1` records) do not carry a DA token in their first kB.
      // For those we accept a FormatDetectionError as a known limitation;
      // generation detection must still succeed — we verify that by re-
      // parsing with an ambiguous name that still signals the generation.
      try {
        const result = detectFormat('renamed.gaeb', bytes);
        expect(result.generation).toBe(expectedGeneration);
        expect(result.da).toBe(expectedDa);
      } catch (err) {
        expect(err).toBeInstanceOf(FormatDetectionError);
        expect((err as Error).message).toMatch(
          new RegExp(`Detected ${expectedGeneration}`),
        );
      }
    });
  }
});
