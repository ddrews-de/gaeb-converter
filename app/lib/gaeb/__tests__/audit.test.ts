import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditLogFileName, buildAuditLog } from '../audit';
import { parseGaebXml } from '../parsers/gaebXml';
import type { GaebDocument } from '../types';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function miniDoc(): GaebDocument {
  return {
    da: 83,
    generation: 'gaeb90',
    sourceEncoding: 'cp437',
    prjInfo: {
      name: 'Demo',
      label: 'Mini LV',
      currency: 'EUR',
      creationDate: '24.04.26',
      clientRef: 'Acme AG',
    },
    award: {
      oZMask: '11PPPPI0090',
      boq: [
        {
          kind: 'ctgy',
          rNoPart: '1',
          label: 'Rohbau',
          children: [
            {
              kind: 'item',
              rNoPart: '10',
              rNoFull: '1.10',
              shortText: 'Bodenplatte',
              qty: 5,
              qu: 'm²',
              itemType: 'normal',
            },
            {
              kind: 'item',
              rNoPart: '20',
              rNoFull: '1.20',
              shortText: 'Wände',
              qty: 12.5,
              qu: 'm³',
              itemType: 'normal',
            },
          ],
        },
      ],
    },
    warnings: [
      { severity: 'info', code: 'T_PREAMBLE_SKIPPED', message: 'Skipped 5 lines.' },
      { severity: 'warn', code: 'CATEGORY_ART_FLAGS_UNUSED', message: 'Category 2 has flags.', line: 42 },
    ],
  };
}

describe('auditLogFileName', () => {
  it('replaces the extension with .audit.txt', () => {
    expect(auditLogFileName('LV_Los01.X83')).toBe('LV_Los01.audit.txt');
    expect(auditLogFileName('project.x83')).toBe('project.audit.txt');
    expect(auditLogFileName('no-extension')).toBe('no-extension.audit.txt');
  });
});

describe('buildAuditLog (synthetic)', () => {
  it('renders a complete report with metadata, BoQ tree and warnings', () => {
    const log = buildAuditLog(miniDoc(), {
      sourceFileName: 'demo.d83',
      targetFileName: 'demo.x83',
      generatedAt: new Date('2026-04-24T12:00:00Z'),
    });

    // Header
    expect(log).toContain('GAEB Converter — Conversion Report');
    expect(log).toContain('Generated:        2026-04-24T12:00:00.000Z');
    expect(log).toContain('Source file:      demo.d83');
    expect(log).toContain('Target file:      demo.x83');
    expect(log).toContain('Source format:    GAEB 90 (DA 83)');
    expect(log).toContain('Target format:    GAEB DA XML 3.3 (DA 83)');
    expect(log).toContain('Source encoding:  cp437');
    expect(log).toContain('Project name:     Demo');
    expect(log).toContain('Project label:    Mini LV');
    expect(log).toContain('Client:           Acme AG');
    expect(log).toContain('Currency:         EUR');
    expect(log).toContain('Creation date:    24.04.26');
    expect(log).toContain('OZ mask:          11PPPPI0090');

    // Totals
    expect(log).toContain('Totals: 1 top-level category, 2 items');

    // BoQ tree
    expect(log).toContain('[1] Rohbau  (2 items)');
    expect(log).toContain('[1.10] Bodenplatte  (5 m²)');
    expect(log).toContain('[1.20] Wände  (12.5 m³)');

    // Warnings
    expect(log).toContain('WARNING (1):');
    expect(log).toContain('[CATEGORY_ART_FLAGS_UNUSED] @line 42  Category 2 has flags.');
    expect(log).toContain('INFO (1):');
    expect(log).toContain('[T_PREAMBLE_SKIPPED]  Skipped 5 lines.');
  });

  it('handles an empty BoQ gracefully', () => {
    const doc: GaebDocument = {
      da: 83,
      generation: 'gaebXml',
      prjInfo: {},
      award: { boq: [] },
      warnings: [],
    };
    const log = buildAuditLog(doc, {
      sourceFileName: 'empty.x83',
      targetFileName: 'empty.x83',
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(log).toContain('Totals: empty bill of quantities');
    expect(log).toContain('(no categories or items)');
    expect(log).toContain('(none)');
  });

  it('groups warnings by severity in error→warn→info order', () => {
    const doc: GaebDocument = {
      ...miniDoc(),
      warnings: [
        { severity: 'info', code: 'A', message: 'info-1' },
        { severity: 'error', code: 'B', message: 'err-1' },
        { severity: 'warn', code: 'C', message: 'warn-1' },
        { severity: 'error', code: 'D', message: 'err-2' },
      ],
    };
    const log = buildAuditLog(doc, {
      sourceFileName: 's',
      targetFileName: 't',
      generatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const errorIdx = log.indexOf('ERROR (2):');
    const warnIdx = log.indexOf('WARNING (1):');
    const infoIdx = log.indexOf('INFO (1):');
    expect(errorIdx).toBeGreaterThan(0);
    expect(warnIdx).toBeGreaterThan(errorIdx);
    expect(infoIdx).toBeGreaterThan(warnIdx);
  });

  it('accepts a custom generatedAt for deterministic output', () => {
    const t = new Date('2020-05-15T09:30:00Z');
    const log = buildAuditLog(miniDoc(), {
      sourceFileName: 'a',
      targetFileName: 'b',
      generatedAt: t,
    });
    expect(log).toContain('Generated:        2020-05-15T09:30:00.000Z');
  });
});

describe('buildAuditLog against real TestData', () => {
  it('renders a plausible log for LV_Los01.X83', () => {
    const xml = readFileSync(join(TEST_DATA_DIR, 'LV_Los01.X83'), 'utf8');
    const doc = parseGaebXml(xml);
    const log = buildAuditLog(doc, {
      sourceFileName: 'LV_Los01.X83',
      targetFileName: 'LV_Los01.X83',
      generatedAt: new Date('2026-04-24T00:00:00Z'),
    });
    expect(log).toContain('Source format:    GAEB DA XML (DA 83)');
    expect(log).toMatch(/Totals: \d+ top-level categor(y|ies), \d+ items/);
  });
});
