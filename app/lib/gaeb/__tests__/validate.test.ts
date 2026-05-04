import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateGaebXml33 } from '../validate';
import { serializeGaebXml33 } from '../serializer/gaebXml33';
import { parseGaebXml } from '../parsers/gaebXml';

const TEST_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'TestData');

function readFixture(name: string): string {
  return readFileSync(join(TEST_DATA_DIR, name), 'utf8');
}

describe('validateGaebXml33 — happy paths', () => {
  it('accepts output of our own serializer', () => {
    const parsed = parseGaebXml(readFixture('LV_Los01.X83'));
    const xml = serializeGaebXml33(parsed);
    const result = validateGaebXml33(xml);
    expect(result.valid).toBe(true);
    // Our serializer emits minimal metadata; warnings may be present but no errors.
    expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
  });

  it('accepts a real 3.3 fixture as-is', () => {
    const result = validateGaebXml33(readFixture('LV_Los01.X83'));
    expect(result.valid).toBe(true);
  });

  it('accepts a 3.1 fixture (namespace DA-XML/200407 + <DP>)', () => {
    const xml = readFixture('3726 260218 LV Photovoltaikanlage GAEB XML 3.1.x83');
    const result = validateGaebXml33(xml);
    expect(result.valid).toBe(true);
  });
});

describe('validateGaebXml33 — error detection', () => {
  it('rejects malformed XML', () => {
    const result = validateGaebXml33('<not-xml');
    expect(result.valid).toBe(false);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].message).toMatch(/not well-formed/);
  });

  it('rejects a non-GAEB root element', () => {
    const result = validateGaebXml33('<?xml version="1.0"?><Other/>');
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(i =>
        i.severity === 'error' && i.message.includes('expected <GAEB>'),
      ),
    ).toBe(true);
  });

  it('flags a missing GAEB_DA_XML namespace as an error', () => {
    const result = validateGaebXml33(
      '<?xml version="1.0"?><GAEB xmlns="http://example.com/other"><Award><DP>83</DP><BoQ><BoQBody/></BoQ></Award></GAEB>',
    );
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(i =>
        i.severity === 'error' && i.message.includes('GAEB_DA_XML'),
      ),
    ).toBe(true);
  });

  it('flags a missing DA number when neither namespace nor <DP> carries one', () => {
    const result = validateGaebXml33(`<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/200407">
  <Award><BoQ><BoQBody/></BoQ></Award>
</GAEB>`);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(i =>
        i.severity === 'error' && i.message.includes('DA number'),
      ),
    ).toBe(true);
  });

  it('flags missing ID attributes on <BoQ>, <BoQCtgy> and <Item>', () => {
    const result = validateGaebXml33(`<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award><DP>83</DP><BoQ><BoQBody>
    <BoQCtgy RNoPart="1">
      <LblTx><p><span>Outer</span></p></LblTx>
      <BoQBody>
        <Itemlist>
          <Item RNoPart="10"><Qty>1</Qty><QU>St</QU></Item>
        </Itemlist>
      </BoQBody>
    </BoQCtgy>
  </BoQBody></BoQ></Award>
</GAEB>`);
    expect(result.valid).toBe(false);
    const errors = result.issues.filter(i => i.severity === 'error');
    expect(errors.some(e => e.message.includes('<BoQ>') && e.message.includes('ID'))).toBe(true);
    expect(errors.some(e => e.message.includes('<BoQCtgy>') && e.message.includes('ID'))).toBe(true);
    expect(errors.some(e => e.message.includes('<Item>') && e.message.includes('ID'))).toBe(true);
  });

  it('flags <OutlineText> appearing before <DetailTxt> inside <CompleteText>', () => {
    const result = validateGaebXml33(`<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award><DP>83</DP><BoQ ID="B1"><BoQBody>
    <Itemlist>
      <Item ID="I1" RNoPart="1">
        <Qty>1</Qty><QU>St</QU>
        <Description>
          <CompleteText>
            <OutlineText/>
            <DetailTxt/>
          </CompleteText>
        </Description>
      </Item>
    </Itemlist>
  </BoQBody></BoQ></Award>
</GAEB>`);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        i =>
          i.severity === 'error' &&
          i.message.includes('<OutlineText>') &&
          i.message.includes('after'),
      ),
    ).toBe(true);
  });

  it('flags <LblBoQ> appearing before <Name> in <BoQInfo>', () => {
    const result = validateGaebXml33(`<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award><DP>83</DP><BoQ ID="B1">
    <BoQInfo><LblBoQ>oops</LblBoQ></BoQInfo>
    <BoQBody/>
  </BoQ></Award>
</GAEB>`);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        i => i.severity === 'error' && i.message.includes('<Name>'),
      ),
    ).toBe(true);
  });

  it('flags an Item without <Qty> or <QU> as an error', () => {
    const result = validateGaebXml33(`<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award><BoQ><BoQBody>
    <Itemlist>
      <Item RNoPart="1"><Description/></Item>
    </Itemlist>
  </BoQBody></BoQ></Award>
</GAEB>`);
    expect(result.valid).toBe(false);
    const errors = result.issues.filter(i => i.severity === 'error');
    expect(errors.some(e => e.message.includes('<Qty>'))).toBe(true);
    expect(errors.some(e => e.message.includes('<QU>'))).toBe(true);
  });
});

describe('validateGaebXml33 — warnings do not fail validation', () => {
  it('accepts a GAEB with an empty BoQBody with a warning', () => {
    const result = validateGaebXml33(`<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <GAEBInfo><Version>3.3</Version></GAEBInfo>
  <PrjInfo><NamePrj>x</NamePrj></PrjInfo>
  <Award><DP>83</DP><BoQ ID="B1"><BoQBody/></BoQ></Award>
</GAEB>`);
    expect(result.valid).toBe(true);
    expect(
      result.issues.some(i =>
        i.severity === 'warning' && i.message.includes('no <BoQCtgy> or <Item>'),
      ),
    ).toBe(true);
  });

  it('flags missing PrjInfo as warning but stays valid', () => {
    const result = validateGaebXml33(`<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <GAEBInfo><Version>3.3</Version></GAEBInfo>
  <Award><DP>83</DP><BoQ ID="B1"><BoQBody>
    <Itemlist>
      <Item ID="I1" RNoPart="1">
        <Qty>1</Qty><QU>St</QU>
        <Description/>
      </Item>
    </Itemlist>
  </BoQBody></BoQ></Award>
</GAEB>`);
    expect(result.valid).toBe(true);
    expect(
      result.issues.some(i =>
        i.severity === 'warning' && i.message.includes('<PrjInfo>'),
      ),
    ).toBe(true);
  });
});

describe('validateGaebXml33 — path reporting', () => {
  it('includes meaningful paths in issue messages', () => {
    const result = validateGaebXml33(`<?xml version="1.0"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <Award><DP>83</DP><BoQ><BoQBody>
    <BoQCtgy RNoPart="5">
      <LblTx><p><span>Outer</span></p></LblTx>
      <BoQBody>
        <Itemlist>
          <Item RNoPart="10">
            <Qty>1</Qty>
            <Description/>
          </Item>
        </Itemlist>
      </BoQBody>
    </BoQCtgy>
  </BoQBody></BoQ></Award>
</GAEB>`);
    const missingQu = result.issues.find(
      i => i.severity === 'error' && i.message.includes('<QU>'),
    );
    expect(missingQu).toBeDefined();
    expect(missingQu!.path).toContain('BoQCtgy[5]');
    expect(missingQu!.path).toContain('Item[10]');
  });
});
