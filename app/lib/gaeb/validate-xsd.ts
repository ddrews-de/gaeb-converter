/**
 * Strict XSD-based GAEB DA XML 3.3 validation.
 *
 * Complements the schemaless `validateGaebXml33()` with a real XSD check
 * via the libxml2 C-library (exposed through the `libxmljs2` npm package).
 * Neither the library nor the GAEB DA XML 3.3 schemas are bundled — the
 * GAEB Bundesverband does not grant redistribution rights for the XSDs.
 *
 *   1. npm install libxmljs2
 *   2. Download the schema bundles from
 *      https://www.gaeb.de/de/service/downloads/gaeb-datenaustausch/
 *      and extract them into ./schemas/ (or any directory of your choice).
 *      The Zip names become subfolders (e.g. 2021-05_Leistungsverzeichnis/).
 *      See ./schemas/README.md for the expected layout.
 *   3. Call validateGaebXml33WithXsd(xml, { da: 83 }) — the right XSD is
 *      resolved automatically based on the DA number. Override the lookup
 *      via masterFileName / xsdDir if needed.
 *
 * If libxmljs2 is not installed, the function still resolves — but with a
 * ValidationResult that carries a single actionable error pointing the
 * caller at the install steps. This lets the schemaless validator keep
 * shipping without forcing a native build.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { DANumber } from './types';
import type { ValidationIssue, ValidationResult } from './validate';

export const DEFAULT_XSD_DIR = './schemas';

export interface XsdValidationOptions {
  /** Root directory containing the GAEB schema subfolders. Defaults to
   *  $GAEB_XSD_DIR or ./schemas. */
  xsdDir?: string;
  /** DA number; lets the validator pick the right schema bundle and file
   *  automatically. Required unless `masterFileName` is given. */
  da?: DANumber;
  /** Explicit path (relative to xsdDir) of the master XSD to load. Wins
   *  over `da`-based resolution when present. */
  masterFileName?: string;
}

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
    // TypeScript can't resolve its types at build time.
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
 * Maps a DA number to the matching XSD path inside the schema root.
 * Mirrors the Zip-folder layout published on gaeb.de — see schemas/README.md.
 *
 * Returns null when no mapping is known; callers can fall back to a manual
 * `masterFileName` in that case.
 */
export function schemaForDa(da: DANumber): string | null {
  // For LV-domain DA numbers (81–86) the Leistungsverzeichnis bundle applies.
  if (da >= 81 && da <= 86) {
    return `2021-05_Leistungsverzeichnis/GAEB_DA_XML_${da}_3.3_2021-05.xsd`;
  }
  return null;
}

export function resolveXsdDir(explicit?: string): string {
  return explicit ?? process.env.GAEB_XSD_DIR ?? DEFAULT_XSD_DIR;
}

/**
 * Validates `xml` against the GAEB DA XML 3.3 XSDs using libxmljs2.
 * Returns the same `ValidationResult` shape as the schemaless validator.
 */
export async function validateGaebXml33WithXsd(
  xml: string,
  options: XsdValidationOptions = {},
): Promise<ValidationResult> {
  const libxml = await loadLibXmlJs2();
  if (!libxml) {
    return { valid: false, issues: [missingDependencyIssue()] };
  }

  const xsdDir = resolveXsdDir(options.xsdDir);

  let masterFileName = options.masterFileName ?? null;
  if (!masterFileName && options.da !== undefined) {
    masterFileName = schemaForDa(options.da);
  }
  if (!masterFileName) {
    return {
      valid: false,
      issues: [
        {
          severity: 'error',
          path: '/',
          message:
            'No XSD selected: pass either `da` (auto-resolved) or ' +
            '`masterFileName` (explicit path relative to xsdDir).',
        },
      ],
    };
  }

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
          message:
            `Cannot read XSD '${masterPath}': ${errMessage(err)}. ` +
            `Download the schemas from https://www.gaeb.de/de/service/downloads/gaeb-datenaustausch/ ` +
            `and unpack them into '${xsdDir}' (see schemas/README.md).`,
        },
      ],
    };
  }

  // libxml resolves relative <xs:include> / <xs:import> against this base.
  const baseDir = join(xsdDir, ...masterFileName.split('/').slice(0, -1));
  const baseUrl = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;

  let xsdDoc: LibXmlDoc;
  try {
    xsdDoc = libxml.parseXml(xsdSrc, { baseUrl, nonet: true });
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
      'Run `npm install libxmljs2` and place the GAEB DA XML 3.3 XSDs ' +
      'under the configured xsdDir (see schemas/README.md for layout).',
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
