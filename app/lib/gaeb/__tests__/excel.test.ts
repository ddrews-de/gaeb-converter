import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  POSITION_LIST_COLUMNS,
  buildPositionListCsv,
  docToRows,
} from '../excel';
import { parseGaebXml } from '../parsers/gaebXml';
import type { GaebDocument } from '../types';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function miniDoc(): GaebDocument {
  return {
    da: 83,
    generation: 'gaebXml',
    prjInfo: { name: 'Demo', currency: 'EUR' },
    award: {
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
              unitPrice: 145.5,
              totalPrice: 727.5,
              priceComponents: { labor: 45, material: 80, equipment: 18.5, other: 2 },
              itemType: 'normal',
              longText: [
                { kind: 'paragraph', runs: [{ text: 'Beton C25/30' }] },
                { kind: 'paragraph', runs: [{ text: 'bewehrt nach Statik' }] },
              ],
            },
            {
              kind: 'ctgy',
              rNoPart: '2',
              label: 'Unter-Kategorie',
              children: [
                {
                  kind: 'item',
                  rNoPart: '30',
                  rNoFull: '1.2.30',
                  shortText: 'Bedarfsposition',
                  qty: 1,
                  qu: 'St',
                  itemType: 'lumpSum',
                  isBedarfsposition: true,
                },
              ],
            },
          ],
        },
      ],
    },
    warnings: [],
  };
}

describe('docToRows', () => {
  it('flattens the BoQ tree into one row per item', () => {
    const rows = docToRows(miniDoc());
    expect(rows).toHaveLength(2);
    expect(rows[0]['Pos. Nr.']).toBe('1.10');
    expect(rows[0].Kategorie).toBe('Rohbau');
    expect(rows[1]['Pos. Nr.']).toBe('1.2.30');
    expect(rows[1].Kategorie).toBe('Rohbau > Unter-Kategorie');
  });

  it('fills price-component columns from priceComponents', () => {
    const [first] = docToRows(miniDoc());
    expect(first['Lohn-Anteil']).toBe('45');
    expect(first['Stoff-Anteil']).toBe('80');
    expect(first['Geräte-Anteil']).toBe('18,5');
    expect(first['Sonstige-Anteil']).toBe('2');
    expect(first.EP).toBe('145,5');
    expect(first.GP).toBe('727,5');
    expect(first.Einheit).toBe('m²');
  });

  it('leaves price-component cells empty when no components are set', () => {
    const [, second] = docToRows(miniDoc());
    expect(second['Lohn-Anteil']).toBe('');
    expect(second['Stoff-Anteil']).toBe('');
    expect(second['Geräte-Anteil']).toBe('');
    expect(second['Sonstige-Anteil']).toBe('');
    expect(second.Bedarf).toBe('ja');
    expect(second['Pos.-Typ']).toBe('lumpSum');
  });

  it('omits long text by default and includes it when requested', () => {
    const defaultRows = docToRows(miniDoc());
    expect(defaultRows[0].Langtext).toBe('');

    const withLong = docToRows(miniDoc(), { includeLongText: true });
    expect(withLong[0].Langtext).toBe(
      'Beton C25/30\nbewehrt nach Statik',
    );
  });
});

describe('buildPositionListCsv', () => {
  it('emits a header row that matches POSITION_LIST_COLUMNS exactly', () => {
    const csv = buildPositionListCsv({ fileName: 'x', doc: miniDoc() });
    const headerLine = csv.split('\n')[0];
    // The Pos.-Typ column header contains a period that is not "special" in
    // CSV, so no quoting expected for any of these names.
    expect(headerLine.split(',')).toEqual(POSITION_LIST_COLUMNS);
  });

  it('emits a header row and one row per item', () => {
    const csv = buildPositionListCsv({ fileName: 'x', doc: miniDoc() });
    const lines = csv.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 items
    expect(lines[1]).toContain('1.10');
    expect(lines[2]).toContain('1.2.30');
  });

  it('quotes cells that contain commas, quotes or line breaks', () => {
    const doc = miniDoc();
    // Mutate the first item's short text to force quoting.
    const root = doc.award.boq[0];
    if (root.kind !== 'ctgy') throw new Error('unexpected fixture');
    const first = root.children[0];
    if (first.kind !== 'item') throw new Error('unexpected fixture');
    first.shortText = 'Beton, "C25/30"';
    const csv = buildPositionListCsv({ fileName: 'x', doc });
    expect(csv).toContain('"Beton, ""C25/30"""');
  });
});

describe('against real TestData', () => {
  it('produces non-empty rows for LV_Los01.X83', () => {
    const xml = readFileSync(join(TEST_DATA_DIR, 'LV_Los01.X83'), 'utf8');
    const doc = parseGaebXml(xml);
    const rows = docToRows(doc);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row['Pos. Nr.']).toBe('string');
      expect(row['Pos. Nr.'].length).toBeGreaterThan(0);
    }
  });
});
