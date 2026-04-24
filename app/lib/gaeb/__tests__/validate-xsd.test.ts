import { describe, expect, it } from 'vitest';
import { validateGaebXml33WithXsd } from '../validate-xsd';

const xsdDir = process.env.GAEB_XSD_DIR;

describe('validateGaebXml33WithXsd (no libxmljs2 installed)', () => {
  // These tests run without the optional dependency and without XSDs. They
  // verify the graceful-degradation path: function still resolves, returns
  // an actionable error rather than throwing.
  it('returns a dependency-missing error when libxmljs2 is not available', async () => {
    const result = await validateGaebXml33WithXsd('<doc/>', {
      xsdDir: '/tmp/does-not-exist',
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].message).toMatch(/libxmljs2.*is not installed/);
  });
});

// Only runs when the consumer has provided both libxmljs2 (installed) and
// a directory containing the GAEB DA XML 3.3 XSDs via the GAEB_XSD_DIR env
// var. In CI without those, the whole block is skipped.
describe.skipIf(!xsdDir)('validateGaebXml33WithXsd (with XSDs)', () => {
  it('returns valid for a minimal conforming 3.3 document', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <GAEBInfo><Version>3.3</Version><Date>2026-04-24</Date><ProgSystem>gaeb-converter</ProgSystem></GAEBInfo>
  <PrjInfo><NamePrj>Demo</NamePrj></PrjInfo>
  <Award><DP>83</DP><BoQ><BoQBody/></BoQ></Award>
</GAEB>`;
    const result = await validateGaebXml33WithXsd(xml, {
      xsdDir: xsdDir as string,
    });
    expect(result.valid).toBe(true);
  });

  it('reports an error when an Item is missing <Qty>', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <GAEBInfo><Version>3.3</Version></GAEBInfo>
  <Award><DP>83</DP><BoQ><BoQBody>
    <Itemlist>
      <Item RNoPart="1"><QU>St</QU></Item>
    </Itemlist>
  </BoQBody></BoQ></Award>
</GAEB>`;
    const result = await validateGaebXml33WithXsd(xml, {
      xsdDir: xsdDir as string,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
