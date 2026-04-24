import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGaebXml } from '../parsers/gaebXml';
import { toViewModel } from '../legacy/toViewModel';
import type { GaebDocument } from '../types';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function miniDoc(): GaebDocument {
  return {
    da: 83,
    generation: 'gaebXml',
    sourceEncoding: 'utf-8',
    prjInfo: {
      name: 'Demo',
      label: 'Mini LV',
      creationDate: '2026-04-24',
      currency: 'EUR',
    },
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
              itemType: 'normal',
              longText: [
                {
                  kind: 'paragraph',
                  runs: [
                    { text: 'Beton C25/30', bold: true },
                    { text: ', 20 cm stark' },
                  ],
                },
                { kind: 'paragraph', runs: [{ text: 'bewehrt nach Statik' }] },
              ],
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
    warnings: [],
  };
}

describe('toViewModel (synthetic)', () => {
  it('flattens a category with items into the legacy shape', () => {
    const vm = toViewModel(miniDoc(), 'demo.x83');
    expect(vm.fileName).toBe('demo.x83');
    expect(vm.totalPositions).toBe(3);
    expect(vm.positions).toHaveLength(3);

    const [ctgy, item1, item2] = vm.positions;

    expect(ctgy.type).toBe('title');
    expect(ctgy.level).toBe(0);
    expect(ctgy.title).toBe('Rohbau');
    expect(ctgy.positionNumber).toBe('1');
    expect(ctgy.children).toEqual(['1.10', '1.20']);

    expect(item1.type).toBe('position');
    expect(item1.level).toBe(1);
    expect(item1.positionNumber).toBe('1.10');
    expect(item1.title).toBe('Bodenplatte');
    expect(item1.unit).toBe('m²');
    expect(item1.quantity).toBe(5);
    expect(item1.parent).toBe('1');
    expect(item1.description).toBe('Beton C25/30, 20 cm stark\nbewehrt nach Statik');

    expect(item2.positionNumber).toBe('1.20');
    expect(item2.title).toBe('Wände');
    expect(item2.parent).toBe('1');
  });

  it('builds the legacy header from PrjInfo and DA', () => {
    const vm = toViewModel(miniDoc(), 'demo.x83');
    expect(vm.header.project).toBe('Demo');
    expect(vm.header.description).toBe('Mini LV');
    expect(vm.header.format).toBe('X83');
    expect(vm.header.date).toBe('2026-04-24');
  });

  it('derives the format tag from generation + DA', () => {
    const doc = miniDoc();
    doc.generation = 'gaeb90';
    expect(toViewModel(doc, 'x').header.format).toBe('D83');
    doc.generation = 'gaeb2000';
    expect(toViewModel(doc, 'x').header.format).toBe('P83');
  });

  it('emits no description when the item has no long text', () => {
    const vm = toViewModel(miniDoc(), 'demo.x83');
    expect(vm.positions[2].description).toBeUndefined();
  });

  it('returns an empty positions list for a document without BoQ', () => {
    const doc: GaebDocument = {
      da: 83,
      generation: 'gaebXml',
      prjInfo: {},
      award: { boq: [] },
      warnings: [],
    };
    const vm = toViewModel(doc, 'empty.x83');
    expect(vm.positions).toEqual([]);
    expect(vm.totalPositions).toBe(0);
  });
});

describe('toViewModel against real TestData fixtures', () => {
  it('converts LV_Los01.X83 end-to-end with plausible output', () => {
    const xml = readFileSync(join(TEST_DATA_DIR, 'LV_Los01.X83'), 'utf8');
    const doc = parseGaebXml(xml);
    const vm = toViewModel(doc, 'LV_Los01.X83');

    expect(vm.header.project).toBeTruthy();
    expect(vm.header.format).toBe('X83');
    expect(vm.totalPositions).toBeGreaterThan(0);

    const titles = vm.positions.filter(p => p.type === 'title');
    const items = vm.positions.filter(p => p.type === 'position');
    expect(titles.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);

    // All items should point at a title as their parent somewhere.
    const titleIds = new Set(titles.map(t => t.id));
    for (const item of items) {
      expect(typeof item.title).toBe('string');
      expect(item.title.length).toBeGreaterThan(0);
      if (item.parent) {
        expect(titleIds.has(item.parent)).toBe(true);
      }
    }
  });
});
