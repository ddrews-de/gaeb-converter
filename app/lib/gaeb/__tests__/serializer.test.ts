import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeGaebXml33 } from '../serializer/gaebXml33';
import { parseGaebXml } from '../parsers/gaebXml';
import { parseGaeb2000 } from '../parsers/gaeb2000';
import { parseGaeb90 } from '../parsers/gaeb90';
import { decode } from '../encoding';
import { convert, parse as facadeParse, serialize as facadeSerialize } from '../index';
import type {
  BoqCtgy,
  BoqItem,
  BoqNode,
  GaebDocument,
  LongTextBlock,
} from '../types';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function readFixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(TEST_DATA_DIR, name)));
}

function readFixtureText(name: string): string {
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

function miniDoc(): GaebDocument {
  const long: LongTextBlock[] = [
    {
      kind: 'paragraph',
      runs: [
        { text: 'Beton C25/30', bold: true },
        { text: ', 20 cm stark' },
      ],
    },
    { kind: 'paragraph', runs: [{ text: 'bewehrt nach Statik' }] },
  ];
  return {
    da: 83,
    generation: 'gaebXml',
    prjInfo: {
      name: 'Demo',
      label: 'Mini LV',
      currency: 'EUR',
      creationDate: '2026-04-24',
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
              longText: long,
              qty: 5,
              qu: 'm²',
              itemType: 'normal',
            },
            {
              kind: 'item',
              rNoPart: '20',
              rNoFull: '1.20',
              shortText: 'Lump-sum pos',
              qty: 1,
              qu: 'psch',
              itemType: 'lumpSum',
            },
          ],
        },
      ],
    },
    warnings: [],
  };
}

describe('serializeGaebXml33 (synthetic)', () => {
  it('emits a well-formed XML 3.3 document with the correct namespace', () => {
    const xml = serializeGaebXml33(miniDoc());
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">');
    expect(xml).toContain('<Version>3.3</Version>');
    expect(xml).toContain('<NamePrj>Demo</NamePrj>');
    expect(xml).toContain('<DP>83</DP>');
    expect(xml).toContain('<LblPrj>Mini LV</LblPrj>');
  });

  it('emits <VersDate> between <Version> and <Date> in <GAEBInfo>', () => {
    // The 3.3 XSD requires <VersDate> right after <Version>; without it,
    // <Date> is rejected as an unexpected element. The schema-version date
    // for the 3.3 schema family is 2021-05.
    const xml = serializeGaebXml33(miniDoc());
    const versionAt = xml.indexOf('<Version>3.3</Version>');
    const versDateAt = xml.indexOf('<VersDate>2021-05</VersDate>');
    const dateAt = xml.indexOf('<Date>');
    expect(versionAt).toBeGreaterThan(0);
    expect(versDateAt).toBeGreaterThan(versionAt);
    expect(dateAt).toBeGreaterThan(versDateAt);
  });

  it('places <Cur> inside <AwardInfo>, not directly under <Award>', () => {
    // The 3.3 XSD allows AwardInfo / OWN / Requester / CnstSite / AddText /
    // BoQ / WgChange under <Award> — <Cur> is not in that list.
    const xml = serializeGaebXml33(miniDoc());
    expect(xml).toContain('<AwardInfo>');
    expect(xml).toContain('<Cur>EUR</Cur>');
    // No <Cur> as a direct child of <Award>.
    expect(xml).not.toMatch(/<Award>\s*<DP>83<\/DP>\s*<Cur>/);
  });

  it('round-trips: parse(serialize(doc)) yields an equivalent GaebDocument', () => {
    const before = miniDoc();
    const xml = serializeGaebXml33(before);
    const after = parseGaebXml(xml);

    expect(after.da).toBe(before.da);
    expect(after.prjInfo.name).toBe(before.prjInfo.name);
    expect(after.prjInfo.label).toBe(before.prjInfo.label);
    expect(after.prjInfo.currency).toBe(before.prjInfo.currency);

    const beforeCats = flatCategories(before.award.boq);
    const afterCats = flatCategories(after.award.boq);
    expect(afterCats.map(c => c.label)).toEqual(beforeCats.map(c => c.label));

    const beforeItems = flatItems(before.award.boq);
    const afterItems = flatItems(after.award.boq);
    expect(afterItems).toHaveLength(beforeItems.length);
    for (let i = 0; i < beforeItems.length; i++) {
      expect(afterItems[i].shortText).toBe(beforeItems[i].shortText);
      expect(afterItems[i].rNoPart).toBe(beforeItems[i].rNoPart);
      expect(afterItems[i].qty).toBe(beforeItems[i].qty);
      expect(afterItems[i].qu).toBe(beforeItems[i].qu);
      expect(afterItems[i].itemType).toBe(beforeItems[i].itemType);
    }
    // Longtext structure preserved (paragraph count and bold run).
    expect(afterItems[0].longText).toHaveLength(2);
    expect(afterItems[0].longText![0].runs.some(r => r.bold)).toBe(true);
  });

  it('escapes reserved XML characters in text fields', () => {
    const doc = miniDoc();
    doc.prjInfo.label = 'Project "Flut" & <friends>';
    const xml = serializeGaebXml33(doc);
    expect(xml).toContain(
      '<LblPrj>Project &quot;Flut&quot; &amp; &lt;friends&gt;</LblPrj>',
    );
    expect(() => parseGaebXml(xml)).not.toThrow();
  });

  it('omits <LumpSumItem> for normal items and emits it for lumpSum items', () => {
    const xml = serializeGaebXml33(miniDoc());
    // Exactly one LumpSumItem marker for item 20, none for item 10.
    expect(xml.match(/<LumpSumItem>Yes<\/LumpSumItem>/g) ?? []).toHaveLength(1);
  });

  it('emits <UPComp Label="…"> elements for priceComponents and round-trips them', () => {
    const doc = miniDoc();
    const item = doc.award.boq[0].kind === 'ctgy'
      ? (doc.award.boq[0].children[0] as BoqItem)
      : null;
    if (!item) throw new Error('unexpected test setup');
    item.unitPrice = 145.5;
    item.priceComponents = {
      labor: 45,
      material: 80,
      equipment: 18.5,
      other: 2,
    };

    const xml = serializeGaebXml33(doc);
    expect(xml).toContain('<UPComp Label="Lohn">45.000</UPComp>');
    expect(xml).toContain('<UPComp Label="Stoff">80.000</UPComp>');
    expect(xml).toContain('<UPComp Label="Gerät">18.5</UPComp>');
    expect(xml).toContain('<UPComp Label="Sonstiges">2.000</UPComp>');

    const parsed = parseGaebXml(xml);
    const flattened = flatItems(parsed.award.boq);
    expect(flattened[0].priceComponents).toEqual({
      labor: 45,
      material: 80,
      equipment: 18.5,
      other: 2,
    });
  });

  it('omits the <UPComp> block when only some components are set', () => {
    const doc = miniDoc();
    const item = (doc.award.boq[0] as { children: BoqItem[] }).children[0];
    item.priceComponents = { labor: 30, material: 70 };
    const xml = serializeGaebXml33(doc);
    expect(xml).toContain('<UPComp Label="Lohn">30.000</UPComp>');
    expect(xml).toContain('<UPComp Label="Stoff">70.000</UPComp>');
    expect(xml).not.toContain('Gerät');
    expect(xml).not.toContain('Sonstiges');

    const parsed = parseGaebXml(xml);
    const first = flatItems(parsed.award.boq)[0];
    expect(first.priceComponents).toEqual({ labor: 30, material: 70 });
  });

  it('parses positional <UPComp> children when no Label attribute is present', () => {
    const xml = `<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award><BoQ><BoQBody><Itemlist>
    <Item RNoPart="1">
      <Qty>1</Qty><QU>St</QU>
      <UPComp>10.00</UPComp>
      <UPComp>20.00</UPComp>
      <UPComp>5.00</UPComp>
      <UPComp>2.00</UPComp>
    </Item>
  </Itemlist></BoQBody></BoQ></Award>
</GAEB>`;
    const parsed = parseGaebXml(xml);
    const first = flatItems(parsed.award.boq)[0];
    expect(first.priceComponents).toEqual({
      labor: 10,
      material: 20,
      equipment: 5,
      other: 2,
    });
  });

  it('preserves nested BoQCtgy hierarchy when serialized', () => {
    const doc: GaebDocument = {
      ...miniDoc(),
      award: {
        boq: [
          {
            kind: 'ctgy',
            rNoPart: '1',
            label: 'Outer',
            children: [
              {
                kind: 'ctgy',
                rNoPart: '1',
                label: 'Inner',
                children: [
                  {
                    kind: 'item',
                    rNoPart: '10',
                    rNoFull: '1.1.10',
                    shortText: 'Nested item',
                    itemType: 'normal',
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const xml = serializeGaebXml33(doc);
    const parsed = parseGaebXml(xml);
    const cats = flatCategories(parsed.award.boq);
    expect(cats.map(c => c.label)).toEqual(['Outer', 'Inner']);
    const items = flatItems(parsed.award.boq);
    expect(items).toHaveLength(1);
    expect(items[0].shortText).toBe('Nested item');
  });
});

describe('round-trip through real fixtures', () => {
  it('re-parses an X83 fixture after it has been re-serialized', () => {
    const source = readFixtureText('LV_Los01.X83');
    const doc = parseGaebXml(source);
    const xml = serializeGaebXml33(doc);
    const reparsed = parseGaebXml(xml);

    expect(reparsed.da).toBe(doc.da);
    expect(reparsed.prjInfo.name).toBe(doc.prjInfo.name);
    expect(flatItems(reparsed.award.boq).length).toBe(
      flatItems(doc.award.boq).length,
    );
  });

  it('converts a .P83 into valid XML 3.3 with the same item count', () => {
    const bytes = readFixtureBytes('LV_Los01.P83');
    const { doc, xml, targetFileName } = convert(bytes, 'LV_Los01.P83');
    expect(targetFileName).toBe('LV_Los01.X83');
    expect(xml).toContain('<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">');

    const reparsed = parseGaebXml(xml);
    expect(reparsed.da).toBe(83);
    // Every item from the P83 must appear in the output XML.
    expect(flatItems(reparsed.award.boq).length).toBe(
      flatItems(doc.award.boq).length,
    );
    // The P83 reference X83 in TestData has a comparable item count.
    const ref = parseGaebXml(readFixtureText('LV_Los01.X83'));
    const refCount = flatItems(ref.award.boq).length;
    const outCount = flatItems(reparsed.award.boq).length;
    expect(Math.abs(outCount - refCount)).toBeLessThanOrEqual(
      Math.ceil(refCount * 0.1),
    );
  });

  it('converts a .D83 (CP437) into valid XML 3.3 with umlauts preserved', () => {
    const bytes = readFixtureBytes('LV_Los01.D83');
    const { xml, targetFileName } = convert(bytes, 'LV_Los01.D83');
    expect(targetFileName).toBe('LV_Los01.X83');
    // Umlauts from the CP437 source should survive into UTF-8 XML.
    expect(xml).toMatch(/[üöäÜÖÄß]/);
    const reparsed = parseGaebXml(xml);
    expect(reparsed.da).toBe(83);
    expect(flatItems(reparsed.award.boq).length).toBeGreaterThan(0);
  });
});

describe('convert() target-file-name mapping', () => {
  it('rewrites .d83 / .p83 / .x83 to the matching .x<DA> extension', () => {
    // Build a minimal P83 and D83 doc + bytes by serializing a synthetic
    // document and re-parsing through convert is overkill; use the real
    // fixtures instead — they exercise the mapping end-to-end.
    const p83 = convert(readFixtureBytes('LV_Los01.P83'), 'LV_Los01.P83');
    const d83 = convert(readFixtureBytes('LV_Los01.D83'), 'LV_Los01.D83');
    const x83 = convert(readFixtureBytes('LV_Los01.X83'), 'LV_Los01.X83');
    expect(p83.targetFileName).toBe('LV_Los01.X83');
    expect(d83.targetFileName).toBe('LV_Los01.X83');
    expect(x83.targetFileName).toBe('LV_Los01.X83');
  });

  it('is exposed via the façade serialize() export', () => {
    const xml = facadeSerialize(miniDoc());
    expect(xml).toContain('<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">');
    // And the façade's parse() accepts the output bytes again.
    const bytes = new TextEncoder().encode(xml);
    const reparsed = facadeParse(bytes, 'roundtrip.x83');
    expect(reparsed.da).toBe(83);
  });
});

describe('encoding sanity (sanity check against encoding layer)', () => {
  it('keeps decoded text stable for a fixture not touched by the serializer', () => {
    // Guard against regressions in the decoder — the XML pipeline needs
    // UTF-8 strings to produce round-trippable XML.
    const bytes = readFixtureBytes('LV_Los01.X83');
    const { text } = decode(bytes, 'auto');
    expect(text.startsWith('<?xml') || text.startsWith('<!--')).toBe(true);
  });

  it('parseGaeb2000 + serializeGaebXml33 preserves the Flutpolder project label', () => {
    const p83Text = decode(readFixtureBytes('LV_Los01.P83'), 'auto').text;
    const doc = parseGaeb2000(p83Text);
    const xml = serializeGaebXml33(doc);
    expect(xml).toContain('<LblPrj>');
    expect(xml).toMatch(/Flutpolder/);
  });

  it('parseGaeb90 + serializeGaebXml33 preserves umlauts from a CP437 source', () => {
    const d83Text = decode(readFixtureBytes('LV_Los01.D83'), 'auto').text;
    const doc = parseGaeb90(d83Text);
    const xml = serializeGaebXml33(doc);
    expect(xml).toMatch(/[üöäÜÖÄß]/);
  });
});
