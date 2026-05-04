import { describe, expect, it } from 'vitest';
import {
  DEFAULT_XSD_DIR,
  resolveXsdDir,
  schemaForDa,
  validateGaebXml33WithXsd,
} from '../validate-xsd';

describe('schemaForDa', () => {
  it('maps DA 81–86 to the Leistungsverzeichnis bundle', () => {
    expect(schemaForDa(81)).toBe(
      '2021-05_Leistungsverzeichnis/GAEB_DA_XML_81_3.3_2021-05.xsd',
    );
    expect(schemaForDa(83)).toBe(
      '2021-05_Leistungsverzeichnis/GAEB_DA_XML_83_3.3_2021-05.xsd',
    );
    expect(schemaForDa(86)).toBe(
      '2021-05_Leistungsverzeichnis/GAEB_DA_XML_86_3.3_2021-05.xsd',
    );
  });
});

describe('resolveXsdDir', () => {
  const originalEnv = process.env.GAEB_XSD_DIR;

  it('prefers an explicit value over the env var and the default', () => {
    process.env.GAEB_XSD_DIR = '/from-env';
    try {
      expect(resolveXsdDir('/explicit')).toBe('/explicit');
    } finally {
      process.env.GAEB_XSD_DIR = originalEnv;
    }
  });

  it('falls back to GAEB_XSD_DIR when no value is given', () => {
    process.env.GAEB_XSD_DIR = '/from-env';
    try {
      expect(resolveXsdDir()).toBe('/from-env');
    } finally {
      process.env.GAEB_XSD_DIR = originalEnv;
    }
  });

  it('uses ./schemas as the final default', () => {
    delete process.env.GAEB_XSD_DIR;
    try {
      expect(resolveXsdDir()).toBe(DEFAULT_XSD_DIR);
      expect(DEFAULT_XSD_DIR).toBe('./schemas');
    } finally {
      process.env.GAEB_XSD_DIR = originalEnv;
    }
  });
});

const xsdDir = process.env.GAEB_XSD_DIR;

describe('validateGaebXml33WithXsd (no libxmljs2 installed)', () => {
  it('returns a dependency-missing error when libxmljs2 is not available', async () => {
    const result = await validateGaebXml33WithXsd('<doc/>', {
      xsdDir: '/tmp/does-not-exist',
      da: 83,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].message).toMatch(/libxmljs2.*is not installed/);
  });
});

// Strict tests run only when libxmljs2 is installed AND the GAEB schemas
// are reachable via GAEB_XSD_DIR. CI without those skips the whole block.
describe.skipIf(!xsdDir)('validateGaebXml33WithXsd (with XSDs)', () => {
  it('auto-resolves the DA 83 schema from the LV bundle', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <GAEBInfo><Version>3.3</Version><Date>2026-04-24</Date><ProgSystem>gaeb-converter</ProgSystem></GAEBInfo>
  <PrjInfo><NamePrj>Demo</NamePrj></PrjInfo>
  <Award><DP>83</DP><BoQ><BoQBody/></BoQ></Award>
</GAEB>`;
    const result = await validateGaebXml33WithXsd(xml, { da: 83 });
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
    const result = await validateGaebXml33WithXsd(xml, { da: 83 });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
