import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGaeb90 } from '../parsers/gaeb90';
import { decode } from '../encoding';
import { parse as facadeParse } from '../index';
import type { BoqCtgy, BoqItem, BoqNode, GaebDocument } from '../types';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function readFixtureAsText(name: string): string {
  const bytes = new Uint8Array(readFileSync(join(TEST_DATA_DIR, name)));
  return decode(bytes, 'windows-1252').text;
}

function flatItems(nodes: BoqNode[]): BoqItem[] {
  const out: BoqItem[] = [];
  const walk = (list: BoqNode[]) => {
    for (const n of list) {
      if (n.kind === 'item') out.push(n);
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function flatCategories(nodes: BoqNode[]): BoqCtgy[] {
  const out: BoqCtgy[] = [];
  const walk = (list: BoqNode[]) => {
    for (const n of list) {
      if (n.kind === 'ctgy') {
        out.push(n);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/**
 * Build a synthetic D83 line with the standard 6-digit trailer that the
 * parser strips. Keeps tests close to the real wire format.
 */
function line(body: string, counter: number): string {
  return `${body.padEnd(74, ' ')}${String(counter).padStart(6, '0')}`;
}

function synthD83(): string {
  const L: string[] = [];
  let c = 0;
  const next = () => (++c);
  L.push(line('00        83L               Demo Prod                         11PPPPI0090', next()));
  L.push(line('01Demo Projekt                            01.04.26', next()));
  L.push(line('02Demo Projekt - Mini LV', next()));
  L.push(line('03Demo Auftraggeber', next()));
  L.push(line('08EUR   Euro', next()));
  L.push(line('11 1       N    Rohbau', next()));
  L.push(line('21 1  10   NNN         00000005000m²', next()));
  L.push(line('25Bodenplatte', next()));
  L.push(line('26   Beton C25/30, 20 cm stark', next()));
  L.push(line('26   bewehrt nach Statik', next()));
  L.push(line('21 1  20   NNNB        00000012500m³', next()));
  L.push(line('25Wände', next()));
  L.push(line('11 2       N    Ausbau', next()));
  L.push(line('21 2  10   LNN         00000001000psch', next()));
  L.push(line('25Pauschaler Fertigausbau', next()));
  L.push(line('99', next()));
  return L.join('\n');
}

describe('parseGaeb90 (synthetic)', () => {
  it('reads header metadata from the Vorspann records', () => {
    const doc = parseGaeb90(synthD83());
    expect(doc.generation).toBe('gaeb90');
    expect(doc.da).toBe(83);
    expect(doc.prjInfo.name).toBe('Demo Projekt');
    expect(doc.prjInfo.creationDate).toBe('01.04.26');
    expect(doc.prjInfo.label).toBe('Demo Projekt - Mini LV');
    expect(doc.prjInfo.clientRef).toBe('Demo Auftraggeber');
    expect(doc.prjInfo.currency).toBe('EUR');
    expect(doc.award.oZMask).toBe('11PPPPI0090');
  });

  it('builds a two-level hierarchy from 11-records', () => {
    const doc = parseGaeb90(synthD83());
    const cats = flatCategories(doc.award.boq);
    expect(cats.map(c => c.label)).toEqual(['Rohbau', 'Ausbau']);
    expect(doc.award.boq).toHaveLength(2);
    expect((doc.award.boq[0] as BoqCtgy).children).toHaveLength(2);
  });

  it('parses item quantity (implied 3 decimals) and unit', () => {
    const doc = parseGaeb90(synthD83());
    const items = flatItems(doc.award.boq);
    expect(items).toHaveLength(3);
    expect(items[0].shortText).toBe('Bodenplatte');
    expect(items[0].qty).toBe(5);
    expect(items[0].qu).toBe('m²');
    expect(items[1].qty).toBe(12.5);
    expect(items[1].qu).toBe('m³');
  });

  it('collects 26-records as long-text paragraphs under the current item', () => {
    const doc = parseGaeb90(synthD83());
    const items = flatItems(doc.award.boq);
    expect(items[0].longText).toBeDefined();
    expect(items[0].longText).toHaveLength(2);
    expect(items[0].longText![0].runs[0].text).toBe('Beton C25/30, 20 cm stark');
    expect(items[0].longText![1].runs[0].text).toBe('bewehrt nach Statik');
  });

  it('derives itemType from art flags and isBedarfsposition from the Bedarf-Kz column', () => {
    const doc = parseGaeb90(synthD83());
    const items = flatItems(doc.award.boq);
    expect(items[0].itemType).toBe('normal');
    expect(items[0].isBedarfsposition).toBeUndefined();
    // item 2: art flags NNN, Bedarf-Kz column = 'B'
    expect(items[1].itemType).toBe('normal');
    expect(items[1].isBedarfsposition).toBe(true);
    // item 3: LNN → lumpSum
    expect(items[2].itemType).toBe('lumpSum');
  });

  it('defaults DA to 83 and emits a warning when Vorspann is missing', () => {
    const minimal = [
      line('11 1       N    Nur eine Kategorie', 1),
      line('99', 2),
    ].join('\n');
    const doc = parseGaeb90(minimal);
    expect(doc.da).toBe(83);
    expect(doc.warnings.some(w => w.code === 'DA_DEFAULTED')).toBe(true);
  });

  it('respects an explicit DA hint', () => {
    const minimal = [line('11 1       N    X', 1), line('99', 2)].join('\n');
    const doc = parseGaeb90(minimal, 86);
    expect(doc.da).toBe(86);
  });

  it('appends 12-records as title continuation for the last category', () => {
    const src = [
      line('11 1       N    Bereich', 1),
      line('12Vorbereitende Leistungen', 2),
      line('12und Baustelleneinrichtung', 3),
      line('99', 4),
    ].join('\n');
    const doc = parseGaeb90(src);
    const cats = flatCategories(doc.award.boq);
    expect(cats[0].label).toBe(
      'Bereich Vorbereitende Leistungen und Baustelleneinrichtung',
    );
  });

  it('records a warning for unknown record kinds', () => {
    const src = [
      line('00        83L               X                               M', 1),
      line('XX some unknown payload', 2),
      line('99', 3),
    ].join('\n');
    const doc = parseGaeb90(src);
    expect(doc.warnings.some(w => w.code === 'UNKNOWN_RECORD' && w.line === 2)).toBe(
      true,
    );
  });
});

describe('parseGaeb90 against real TestData', () => {
  it('parses LV_Los01.D83 with correct DA, categories and items', () => {
    const doc = parseGaeb90(readFixtureAsText('LV_Los01.D83'));
    expect(doc.da).toBe(83);
    expect(doc.prjInfo.name).toContain('Los 1');
    expect(doc.prjInfo.creationDate).toBe('31.03.26');
    expect(doc.prjInfo.currency).toBe('EUR');
    expect(doc.award.oZMask).toBe('11PPPPI0090');

    const cats = flatCategories(doc.award.boq);
    const items = flatItems(doc.award.boq);
    expect(cats.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(item.shortText.length).toBeGreaterThan(0);
      expect(item.itemType).toBe('normal');
    }
  });

  it('parses LV_Los02.D83 with nested hierarchy (Bereich > Abschnitt > Pos.)', () => {
    const doc = parseGaeb90(readFixtureAsText('LV_Los02.D83'));
    expect(doc.da).toBe(83);
    expect(doc.prjInfo.name).toContain('Los 2');

    // Los 02 has hierarchical OZ like "1 1 10": ensure some categories have
    // child categories (nested hierarchy).
    const topLevel = doc.award.boq.filter(n => n.kind === 'ctgy') as BoqCtgy[];
    expect(topLevel.length).toBeGreaterThan(0);
    const nested = topLevel.some(c =>
      c.children.some(child => child.kind === 'ctgy'),
    );
    expect(nested).toBe(true);

    const items = flatItems(doc.award.boq);
    expect(items.length).toBeGreaterThan(20);
    // Spot-check the first well-known item from the fixture.
    const anlauf = items.find(i => i.shortText.includes('Anlaufberatung'));
    expect(anlauf?.qty).toBe(1);
    expect(anlauf?.qu).toBe('St');
  });

  it('auto-detects CP437 and recovers German umlauts end-to-end via facade.parse', () => {
    const bytes = new Uint8Array(
      readFileSync(join(TEST_DATA_DIR, 'LV_Los01.D83')),
    );
    const doc: GaebDocument = facadeParse(bytes, 'LV_Los01.D83');
    expect(doc.generation).toBe('gaeb90');
    // This DOS-era fixture is genuinely CP437-encoded (unused bytes 0x81 / 0x94
    // map to ü / ö only in CP437). The auto-detector should pick CP437, not
    // Windows-1252, so that umlauts come through correctly.
    expect(doc.sourceEncoding).toBe('cp437');

    const hasUmlaut = /ü|ö|ä|Ü|Ö|Ä|ß/;
    const items = flatItems(doc.award.boq);
    const withUmlaut = items.find(
      i =>
        hasUmlaut.test(i.shortText) ||
        i.longText?.some(b => b.runs.some(r => hasUmlaut.test(r.text))),
    );
    expect(withUmlaut).toBeDefined();
  });
});
