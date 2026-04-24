/**
 * Strict XSD-based GAEB DA XML 3.3 validation (Option A).
 *
 * Complements the schemaless `validateGaebXml33()` with a real XSD check
 * via the libxml2 C-library (exposed through the `libxmljs2` npm package).
 * Neither the library nor the GAEB DA XML 3.3 schemas are bundled with
 * this project — the Bundesverband does not grant redistribution rights
 * for the XSDs. To use this function in production:
 *
 *   1. npm install libxmljs2
 *   2. Place the licensed XSD set in a directory of your choice,
 *      with a master file named `GAEB_DA_XML_3.3.xsd`.
 *   3. Call validateGaebXml33WithXsd(xml, { xsdDir: '/path/to/schemas' }).
 *
 * If libxmljs2 is not installed, the function still resolves — but with
 * a ValidationResult that carries a single actionable error telling the
 * caller exactly how to enable the feature. This lets the schemaless
 * validator continue to ship without pulling in a native build step.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ValidationIssue, ValidationResult } from './validate';

export interface XsdValidationOptions {
  /** Directory containing GAEB_DA_XML_3.3.xsd and any imported XSDs. */
  xsdDir: string;
  /** Master XSD filename; defaults to GAEB_DA_XML_3.3.xsd. */
  masterFileName?: string;
}

/**
 * Minimal structural view of the libxmljs2 API we rely on. Hand-rolled
 * rather than depending on @types/libxmljs2 so this file compiles even
 * when the optional package is not installed.
 */
interface LibXmlJs2 {
  parseXml(
    src: string,
    options?: { baseUrl?: string; nonet?: boolean },
  ): LibXmlDoc;
}

interface LibXmlDoc {
  validate(xsdDoc: LibXmlDoc): boolean;
  validationErrors: Array<{
    line?: number;
    column?: number;
    message?: string;
  }>;
}

async function loadLibXmlJs2(): Promise<LibXmlJs2 | null> {
  try {
    // `libxmljs2` is an optional peer dependency — not in package.json, so
    // TypeScript can't resolve its types at build time. The dynamic import
    // stays intentional; silence the module-resolution error here.
    // @ts-expect-error optional peer dependency
    const mod = (await import('libxmljs2')) as unknown;
    const candidate =
      (mod as { default?: LibXmlJs2 }).default ?? (mod as LibXmlJs2);
    if (typeof candidate.parseXml === 'function') return candidate;
    return null;
  } catch {
    return null;
  }
}

/**
 * Validates `xml` against a local copy of the GAEB DA XML 3.3 XSDs using
 * libxmljs2. Returns the same `ValidationResult` shape the schemaless
 * validator does, so downstream UI can render either source uniformly.
 */
export async function validateGaebXml33WithXsd(
  xml: string,
  options: XsdValidationOptions,
): Promise<ValidationResult> {
  const libxml = await loadLibXmlJs2();
  if (!libxml) {
    return {
      valid: false,
      issues: [missingDependencyIssue()],
    };
  }

  const { xsdDir, masterFileName = 'GAEB_DA_XML_3.3.xsd' } = options;
  const masterPath = join(xsdDir, masterFileName);

  let xsdSrc: string;
  try {
    xsdSrc = await fs.readFile(masterPath, 'utf-8');
  } catch (err) {
    return {
      valid: false,
      issues: [
        {
          severity: 'error',
          path: '/',
          message: `Cannot read master XSD '${masterPath}': ${errMessage(err)}`,
        },
      ],
    };
  }

  let xsdDoc: LibXmlDoc;
  try {
    xsdDoc = libxml.parseXml(xsdSrc, {
      baseUrl: xsdDir.endsWith('/') ? xsdDir : `${xsdDir}/`,
      nonet: true,
    });
  } catch (err) {
    return {
      valid: false,
      issues: [
        {
          severity: 'error',
          path: '/',
          message: `XSD failed to parse: ${errMessage(err)}`,
        },
      ],
    };
  }

  const stripped = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  let doc: LibXmlDoc;
  try {
    doc = libxml.parseXml(stripped, { nonet: true });
  } catch (err) {
    return {
      valid: false,
      issues: [
        {
          severity: 'error',
          path: '/',
          message: `Input XML failed to parse: ${errMessage(err)}`,
        },
      ],
    };
  }

  if (doc.validate(xsdDoc)) {
    return { valid: true, issues: [] };
  }

  const issues: ValidationIssue[] = doc.validationErrors.map(e => ({
    severity: 'error',
    path: e.line !== undefined ? `line ${e.line}` : '/',
    message: (e.message ?? 'XSD validation error').trim(),
  }));

  return { valid: false, issues };
}

function missingDependencyIssue(): ValidationIssue {
  return {
    severity: 'error',
    path: '/',
    message:
      'Optional dependency `libxmljs2` is not installed. ' +
      'Run `npm install libxmljs2` and rerun; make sure the GAEB DA XML 3.3 ' +
      'XSDs are reachable under the configured xsdDir.',
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
