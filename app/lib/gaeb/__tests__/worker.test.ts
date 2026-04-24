import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isWorkerSupported, runConvert } from '../worker/run';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

describe('runConvert (worker wrapper)', () => {
  it('reports the runtime correctly in Node test environment', () => {
    // Vitest runs in Node, which has no Worker global.
    expect(isWorkerSupported()).toBe(false);
  });

  it('uses the synchronous convert() fallback when Worker is unavailable', async () => {
    const bytes = new Uint8Array(
      readFileSync(join(TEST_DATA_DIR, 'LV_Los01.X83')),
    );
    const result = await runConvert(bytes, 'LV_Los01.X83');
    expect(result.doc.generation).toBe('gaebXml');
    expect(result.doc.da).toBe(83);
    expect(result.xml).toContain(
      '<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">',
    );
    expect(result.targetFileName).toBe('LV_Los01.X83');
  });

  it('works on P83 and D83 inputs through the same wrapper', async () => {
    const p83 = await runConvert(
      new Uint8Array(readFileSync(join(TEST_DATA_DIR, 'LV_Los01.P83'))),
      'LV_Los01.P83',
    );
    const d83 = await runConvert(
      new Uint8Array(readFileSync(join(TEST_DATA_DIR, 'LV_Los01.D83'))),
      'LV_Los01.D83',
    );
    expect(p83.doc.generation).toBe('gaeb2000');
    expect(d83.doc.generation).toBe('gaeb90');
    expect(p83.targetFileName).toBe('LV_Los01.X83');
    expect(d83.targetFileName).toBe('LV_Los01.X83');
  });

  it('propagates parser errors from the sync path as rejected promises', async () => {
    const bytes = new TextEncoder().encode('this is not a GAEB file');
    await expect(runConvert(bytes, 'garbage.gaeb')).rejects.toThrow();
  });
});
