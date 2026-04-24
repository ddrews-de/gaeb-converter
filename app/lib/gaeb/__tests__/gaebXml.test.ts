import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GaebXmlParseError, parseGaebXml } from '../parsers/gaebXml';
import { parse as facadeParse } from '../index';
import type { BoqCtgy, BoqItem, BoqNode, GaebDocument } from '../types';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function readFixture(name: string): string {
  return readFileSync(join(TEST_DATA_DIR, name), 'utf8');
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

describe('parseGaebXml (synthetic)', () => {
  it('parses a minimal DA XML 3.3 document into the domain model', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <GAEBInfo><Date>2026-04-24</Date></GAEBInfo>
  <PrjInfo><NamePrj>Demo</NamePrj><LblPrj>Mini LV</LblPrj><Cur>EUR</Cur></PrjInfo>
  <Award>
    <BoQ>
      <BoQBody>
        <BoQCtgy RNoPart="1">
          <LblTx><p><span>Rohbau</span></p></LblTx>
          <BoQBody>
            <Itemlist>
              <Item RNoPart="10">
                <Qty>5.000</Qty>
                <QU>m²</QU>
                <Description>
                  <CompleteText>
                    <OutlineText><TextOutlTxt><p><span>Bodenplatte</span></p></TextOutlTxt></OutlineText>
                    <DetailTxt>
                      <Text>
                        <p><span style="font-weight:bold;">Beton C25/30</span><span>, 20 cm stark</span></p>
                        <p><span>bewehrt nach Statik</span></p>
                      </Text>
                    </DetailTxt>
                  </CompleteText>
                </Description>
              </Item>
            </Itemlist>
          </BoQBody>
        </BoQCtgy>
      </BoQBody>
    </BoQ>
  </Award>
</GAEB>`;

    const doc = parseGaebXml(xml);
    expect(doc.generation).toBe('gaebXml');
    expect(doc.da).toBe(83);
    expect(doc.prjInfo.name).toBe('Demo');
    expect(doc.prjInfo.label).toBe('Mini LV');
    expect(doc.prjInfo.currency).toBe('EUR');
    expect(doc.prjInfo.creationDate).toBe('2026-04-24');

    const cats = flatCategories(doc.award.boq);
    expect(cats).toHaveLength(1);
    expect(cats[0].label).toBe('Rohbau');

    const items = flatItems(doc.award.boq);
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.rNoPart).toBe('10');
    expect(item.qty).toBe(5);
    expect(item.qu).toBe('m²');
    expect(item.shortText).toBe('Bodenplatte');
    expect(item.longText).toBeDefined();
    expect(item.longText).toHaveLength(2);
    expect(item.longText![0].runs[0]).toEqual({ text: 'Beton C25/30', bold: true });
    expect(item.longText![0].runs[1]).toEqual({ text: ', 20 cm stark' });
  });

  it('falls back to <Award><DP> for DA XML 3.1', () => {
    const xml = `<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/200407">
  <PrjInfo><NamePrj>X</NamePrj></PrjInfo>
  <Award><DP>84</DP><BoQ><BoQBody/></BoQ></Award>
</GAEB>`;
    const doc = parseGaebXml(xml);
    expect(doc.da).toBe(84);
  });

  it('reports a warning when an Award has no BoQ', () => {
    const xml = `<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award/>
</GAEB>`;
    const doc = parseGaebXml(xml);
    expect(doc.award.boq).toEqual([]);
    expect(doc.warnings.some(w => w.code === 'MISSING_BOQ')).toBe(true);
  });

  it('rejects malformed XML', () => {
    expect(() => parseGaebXml('<not-xml')).toThrow(GaebXmlParseError);
  });

  it('detects LumpSumItem marker', () => {
    const xml = `<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award><BoQ><BoQBody>
    <Itemlist>
      <Item RNoPart="1"><LumpSumItem>Yes</LumpSumItem><Qty>1</Qty><QU>psch</QU></Item>
    </Itemlist>
  </BoQBody></BoQ></Award>
</GAEB>`;
    const items = flatItems(parseGaebXml(xml).award.boq);
    expect(items[0].itemType).toBe('lumpSum');
  });
});

describe('parseGaebXml against real TestData fixtures', () => {
  const fixtures = readdirSync(TEST_DATA_DIR).filter(n => /\.x8[1-6]$/i.test(n));

  for (const name of fixtures) {
    it(`parses '${name}' without crashing and emits a GaebDocument`, () => {
      const doc = parseGaebXml(readFixture(name));
      expect(doc.generation).toBe('gaebXml');
      expect(doc.da).toBeGreaterThanOrEqual(81);
      expect(doc.da).toBeLessThanOrEqual(86);
      expect(doc.award.boq.length).toBeGreaterThan(0);
      const items = flatItems(doc.award.boq);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(typeof item.rNoPart).toBe('string');
        expect(item.itemType).toMatch(/normal|lumpSum|hourly|alternative|optional/);
      }
    });
  }

  it('parses LV_Los01.X83 with plausible structure', () => {
    const doc = parseGaebXml(readFixture('LV_Los01.X83'));
    expect(doc.da).toBe(83);
    expect(doc.prjInfo.name).toBeTruthy();
    expect(flatCategories(doc.award.boq).length).toBeGreaterThan(0);
  });

  it('handles all three GAEB XML versions of the Photovoltaik LV', () => {
    const v31 = parseGaebXml(readFixture('3726 260218 LV Photovoltaikanlage GAEB XML 3.1.x83'));
    const v32 = parseGaebXml(readFixture('3726 260218 LV Photovoltaikanlage GAEB XML 3.2.x83'));
    const v33 = parseGaebXml(readFixture('3726 260218 LV Photovoltaikanlage GAEB XML 3.3.x83'));
    for (const d of [v31, v32, v33]) {
      expect(d.da).toBe(83);
      expect(d.prjInfo.name).toBeTruthy();
      expect(flatItems(d.award.boq).length).toBeGreaterThan(0);
    }
    // Item counts should be broadly comparable across versions — same LV.
    const counts = [v31, v32, v33].map(d => flatItems(d.award.boq).length);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(max - min).toBeLessThanOrEqual(Math.ceil(min * 0.1));
  });
});

describe('façade parse() routes XML files to the XML parser', () => {
  it('parses an .x83 byte buffer end-to-end via parse()', () => {
    const bytes = new Uint8Array(
      readFileSync(join(TEST_DATA_DIR, 'LV_Los01.X83')),
    );
    const doc: GaebDocument = facadeParse(bytes, 'LV_Los01.X83');
    expect(doc.generation).toBe('gaebXml');
    expect(doc.sourceEncoding).toBe('utf-8');
    expect(doc.da).toBe(83);
  });

  it('throws a clear "not implemented" error for GAEB 90 / 2000 until those steps land', () => {
    const bytes = new Uint8Array(
      readFileSync(join(TEST_DATA_DIR, 'LV_Los01.D83')),
    );
    expect(() => facadeParse(bytes, 'LV_Los01.D83')).toThrow(
      /Parser for gaeb90 not implemented yet/,
    );
  });
});
