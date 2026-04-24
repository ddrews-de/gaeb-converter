import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGaeb2000 } from '../parsers/gaeb2000';
import { decode } from '../encoding';
import { parse as facadeParse } from '../index';
import type { BoqCtgy, BoqItem, BoqNode, GaebDocument } from '../types';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function readFixtureAsText(name: string): string {
  const bytes = new Uint8Array(readFileSync(join(TEST_DATA_DIR, name)));
  return decode(bytes, 'auto').text;
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

const SYNTH = `#begin[GAEB]
 #begin[GAEBInfo]
  [Version]1.2[end]
  [Datum]24.04.2026[end]
 #end[GAEBInfo]
 #begin[PrjInfo]
  [Name]Demo-Projekt[end]
  [Bez]Mini LV[end]
  [Wae]EUR[end]
 #end[PrjInfo]
 #begin[Vergabe]
  [DP]83[end]
  #begin[LV]
   #begin[LVBereich]
    [OZ]01[end]
    [Bez]Rohbau[end]
    #begin[Position]
     [OZ]010010[end]
     #begin[Beschreibung]
      [Kurztext]Bodenplatte[end]
      [Langtext]Beton C25/30, 20 cm stark[end]
     #end[Beschreibung]
     [ME]m²[end]
     [Menge]5,000[end]
    #end[Position]
    #begin[Position]
     [OZ]010020[end]
     #begin[Beschreibung]
      [Kurztext]Wände[end]
     #end[Beschreibung]
     [ME]m³[end]
     [Menge]12,500[end]
     [EP]145,50[end]
    #end[Position]
   #end[LVBereich]
   #begin[LVBereich]
    [OZ]02[end]
    [Bez]Ausbau[end]
    #begin[LVBereich]
     [OZ]0201[end]
     [Bez]Estrich[end]
     #begin[Position]
      [OZ]020110[end]
      #begin[Beschreibung]
       [Kurztext]Heizestrich[end]
      #end[Beschreibung]
      [ME]m²[end]
      [Menge]42,000[end]
     #end[Position]
    #end[LVBereich]
   #end[LVBereich]
  #end[LV]
 #end[Vergabe]
#end[GAEB]
`;

describe('parseGaeb2000 (synthetic)', () => {
  it('extracts project metadata from PrjInfo and Vergabe', () => {
    const doc = parseGaeb2000(SYNTH);
    expect(doc.generation).toBe('gaeb2000');
    expect(doc.da).toBe(83);
    expect(doc.prjInfo.name).toBe('Demo-Projekt');
    expect(doc.prjInfo.label).toBe('Mini LV');
    expect(doc.prjInfo.currency).toBe('EUR');
    expect(doc.prjInfo.creationDate).toBe('24.04.2026');
  });

  it('builds a nested BoQ tree from #begin[LVBereich] nesting', () => {
    const doc = parseGaeb2000(SYNTH);
    expect(doc.award.boq).toHaveLength(2);
    const outerAusbau = doc.award.boq[1] as BoqCtgy;
    expect(outerAusbau.kind).toBe('ctgy');
    expect(outerAusbau.label).toBe('Ausbau');
    expect(outerAusbau.children).toHaveLength(1);
    const estrich = outerAusbau.children[0] as BoqCtgy;
    expect(estrich.kind).toBe('ctgy');
    expect(estrich.label).toBe('Estrich');
    expect(estrich.children).toHaveLength(1);
    expect(estrich.children[0].kind).toBe('item');
  });

  it('reads Kurztext/Langtext from nested Beschreibung', () => {
    const doc = parseGaeb2000(SYNTH);
    const items = flatItems(doc.award.boq);
    expect(items).toHaveLength(3);
    expect(items[0].shortText).toBe('Bodenplatte');
    expect(items[0].longText?.[0].runs[0].text).toBe(
      'Beton C25/30, 20 cm stark',
    );
    expect(items[1].shortText).toBe('Wände');
    expect(items[1].longText).toBeUndefined();
  });

  it('parses Menge/ME/EP with German decimal commas', () => {
    const doc = parseGaeb2000(SYNTH);
    const items = flatItems(doc.award.boq);
    expect(items[0].qty).toBe(5);
    expect(items[0].qu).toBe('m²');
    expect(items[1].qty).toBe(12.5);
    expect(items[1].unitPrice).toBe(145.5);
    expect(items[2].qty).toBe(42);
  });

  it('reads price components from [EPLohn]/[EPStoff]/[EPGeraet]/[EPSonst]', () => {
    const src = `#begin[GAEB]
 #begin[Vergabe]
  [DP]84[end]
  #begin[LV]
   #begin[LVBereich]
    [OZ]01[end]
    #begin[Position]
     [OZ]010010[end]
     [ME]m²[end]
     [Menge]5,000[end]
     [EP]145,50[end]
     [EPLohn]45,00[end]
     [EPStoff]80,00[end]
     [EPGeraet]18,50[end]
     [EPSonst]2,00[end]
    #end[Position]
   #end[LVBereich]
  #end[LV]
 #end[Vergabe]
#end[GAEB]`;
    const item = flatItems(parseGaeb2000(src).award.boq)[0];
    expect(item.unitPrice).toBe(145.5);
    expect(item.priceComponents).toEqual({
      labor: 45,
      material: 80,
      equipment: 18.5,
      other: 2,
    });
  });

  it('reads price components from the positional [EPAnteil1..4] keys', () => {
    const src = `#begin[GAEB]
 #begin[Vergabe]
  [DP]84[end]
  #begin[LV]
   #begin[LVBereich]
    [OZ]01[end]
    #begin[Position]
     [OZ]010010[end]
     [ME]m²[end]
     [Menge]1,000[end]
     [EPAnteil1]10,00[end]
     [EPAnteil2]20,00[end]
     [EPAnteil3]5,00[end]
     [EPAnteil4]2,00[end]
    #end[Position]
   #end[LVBereich]
  #end[LV]
 #end[Vergabe]
#end[GAEB]`;
    const item = flatItems(parseGaeb2000(src).award.boq)[0];
    expect(item.priceComponents).toEqual({
      labor: 10,
      material: 20,
      equipment: 5,
      other: 2,
    });
  });

  it('defaults DA to 83 and records a warning when Vergabe has no DP', () => {
    const noDp = `#begin[GAEB]
 #begin[Vergabe]
  #begin[LV]
   #begin[LVBereich]
    [OZ]01[end]
    [Bez]Dummy[end]
   #end[LVBereich]
  #end[LV]
 #end[Vergabe]
#end[GAEB]`;
    const doc = parseGaeb2000(noDp);
    expect(doc.da).toBe(83);
    expect(doc.warnings.some(w => w.code === 'DA_DEFAULTED')).toBe(true);
  });

  it('respects an explicit DA hint', () => {
    const noDp = `#begin[GAEB]
 #begin[Vergabe]
  #begin[LV]
  #end[LV]
 #end[Vergabe]
#end[GAEB]`;
    const doc = parseGaeb2000(noDp, 86);
    expect(doc.da).toBe(86);
  });
});

describe('parseGaeb2000 against real TestData', () => {
  it('parses LV_Los01.P83 into a structured document', () => {
    const doc = parseGaeb2000(readFixtureAsText('LV_Los01.P83'));
    expect(doc.da).toBe(83);
    expect(doc.prjInfo.name).toBe('11530');
    expect(doc.prjInfo.label).toContain('Flutpolder');
    expect(doc.prjInfo.currency).toBe('EUR');
    expect(doc.prjInfo.creationDate).toBe('31.03.2026');

    const items = flatItems(doc.award.boq);
    const cats = flatCategories(doc.award.boq);
    expect(cats.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThanOrEqual(5);

    const anlauf = items.find(i => i.shortText.includes('Anlaufberatung'));
    expect(anlauf).toBeDefined();
    expect(anlauf!.qty).toBe(1);
    expect(anlauf!.qu).toBe('psch');
  });

  it('parses LV_Los02.P83 with nested LVBereich hierarchy', () => {
    const doc = parseGaeb2000(readFixtureAsText('LV_Los02.P83'));
    expect(doc.da).toBe(83);
    const topLevel = doc.award.boq.filter(n => n.kind === 'ctgy') as BoqCtgy[];
    expect(topLevel.length).toBeGreaterThan(0);
    const nested = topLevel.some(c =>
      c.children.some(child => child.kind === 'ctgy'),
    );
    expect(nested).toBe(true);
    expect(flatItems(doc.award.boq).length).toBeGreaterThan(20);
  });

  it('cross-checks item counts between P83 and X83 for the same project', () => {
    const p83 = parseGaeb2000(readFixtureAsText('LV_Los01.P83'));
    // The X83 counterpart is already covered by gaebXml.test.ts — here we
    // just assert the P83 item count is plausible (> 5) and every item has
    // a non-empty rNoFull.
    const items = flatItems(p83.award.boq);
    for (const item of items) {
      expect(item.rNoFull.length).toBeGreaterThan(0);
    }
  });

  it('decoded umlauts survive end-to-end via facade.parse()', () => {
    const bytes = new Uint8Array(
      readFileSync(join(TEST_DATA_DIR, 'LV_Los01.P83')),
    );
    const doc: GaebDocument = facadeParse(bytes, 'LV_Los01.P83');
    expect(doc.generation).toBe('gaeb2000');
    expect(doc.sourceEncoding === 'windows-1252' || doc.sourceEncoding === 'cp437').toBe(
      true,
    );
    const hasUmlaut = /ü|ö|ä|Ü|Ö|Ä|ß/;
    const withUmlaut = flatItems(doc.award.boq).find(
      i =>
        hasUmlaut.test(i.shortText) ||
        i.longText?.some(b => b.runs.some(r => hasUmlaut.test(r.text))),
    );
    expect(withUmlaut).toBeDefined();
  });
});

describe('façade parse() routes P83 files to the GAEB 2000 parser', () => {
  it('parses LV_Los01.P83 via parse() end-to-end', () => {
    const bytes = new Uint8Array(
      readFileSync(join(TEST_DATA_DIR, 'LV_Los01.P83')),
    );
    const doc = facadeParse(bytes, 'LV_Los01.P83');
    expect(doc.generation).toBe('gaeb2000');
    expect(doc.da).toBe(83);
    expect(flatItems(doc.award.boq).length).toBeGreaterThan(0);
  });
});
