/**
 * GAEB 90 parser (.d81 – .d86).
 *
 * GAEB 90 is a fixed-column record format. Each line starts with a
 * two-character record kind, followed by record-specific fields, and ends
 * with a 6-digit line counter trailer that we strip up-front. Real data
 * (TestData/LV_Los01.D83, LV_Los02.D83) confirms the following record
 * vocabulary for a standard LV:
 *
 *   00 Vorspann      DA number, producer, OZ mask
 *   01 Titel         project name + creation date (DD.MM.YY)
 *   02 Projektlang   long project description
 *   03 AG            contracting authority
 *   08 Währung       currency code (EUR / DM) + label
 *   11 Gliederung    hierarchical category header (opens a group)
 *   12 Gliederung-FT title continuation — appended to the last category
 *   20 Vorbemerkung  block-leading text for the current category
 *   21 Position      item header with OZ, art flags, qty (impl. decimals), QU
 *   25 Kurztext      short title of the current item
 *   26 Langtext      long-text paragraph for the current item
 *   27 Unterpos.     sub-item long text
 *   31 Ende Glied.   closes a category level (no payload we rely on)
 *   99 Dateiende     end of file
 *
 * The hierarchy is reconstructed from the OZ field (9 columns on rows 11
 * and 21): whitespace-separated segments give the full position path, with
 * each segment one level deep. This matches every multi-level layout we
 * see in real files without needing to fully decode the OZ mask from
 * record 00.
 */

import type {
  BoqCtgy,
  BoqItem,
  BoqNode,
  ConversionWarning,
  DANumber,
  GaebDocument,
  ItemType,
  ProjectInfo,
} from '../types';
import { parseLongTextLine } from './gaeb90-longtext';

const OZ_WIDTH = 9;
const ART_WIDTH = 3;
const UNKNOWN_RECORDS_LIMIT = 20;

export class Gaeb90ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Gaeb90ParseError';
  }
}

export function parseGaeb90(text: string, daHint?: DANumber): GaebDocument {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const warnings: ConversionWarning[] = [];

  const prjInfo: ProjectInfo = {};
  let da: DANumber | null = null;
  let oZMask = '';

  const categories = new Map<string, BoqCtgy>();
  const rootChildren: BoqNode[] = [];
  let currentCategory: BoqCtgy | null = null;
  let currentItem: BoqItem | null = null;
  let unknownRecordCount = 0;

  // Some exporters prefix the actual LV with a free-form T0/T1/T9 text block
  // (frei formatierte Baubeschreibung). That content has no counterpart in
  // the structured domain model — we skip it until the first numeric record
  // (00 / 01 / 11 / 21 / …) appears and record a single info warning so the
  // user knows text context was dropped.
  let inPreamble = true;
  let preambleLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;

    const line = stripTrailer(raw);
    if (line.length < 2) continue;
    const kind = line.slice(0, 2);

    if (inPreamble) {
      if (/^\d\d$/.test(kind)) {
        inPreamble = false;
        if (preambleLineCount > 0) {
          warnings.push({
            severity: 'info',
            code: 'T_PREAMBLE_SKIPPED',
            message: `Skipped ${preambleLineCount} lines of T0/T1/T9 preamble text before the first structured record.`,
          });
        }
      } else if (/^T[0-9]$/.test(kind)) {
        preambleLineCount++;
        continue;
      } else {
        // Any other unexpected leading record kind — stop preamble detection
        // immediately and let the normal switch handle (and warn about) it.
        inPreamble = false;
      }
    }

    switch (kind) {
      case '00': {
        const body = line.slice(2);
        const daMatch = body.match(/\b(8[1-6])\s*[LNKOAV]\b/);
        if (daMatch) da = Number(daMatch[1]) as DANumber;
        const maskMatch = body.match(/(\S+)\s*$/);
        if (maskMatch) oZMask = maskMatch[1];
        break;
      }

      case '01': {
        const body = line.slice(2).trimEnd();
        const dateMatch = body.match(/(\d{2}\.\d{2}\.\d{2,4})\s*$/);
        if (dateMatch) {
          prjInfo.creationDate = dateMatch[1];
          prjInfo.name = body.slice(0, body.length - dateMatch[0].length).trim();
        } else {
          prjInfo.name = body.trim();
        }
        break;
      }

      case '02':
        prjInfo.label = line.slice(2).trim() || prjInfo.label;
        break;

      case '03':
        prjInfo.clientRef = line.slice(2).trim() || prjInfo.clientRef;
        break;

      case '08': {
        const body = line.slice(2).trim();
        if (/^EUR/i.test(body)) prjInfo.currency = 'EUR';
        else if (/^DM/i.test(body)) prjInfo.currency = 'DM';
        break;
      }

      case '11': {
        currentItem = null;
        const body = line.slice(2);
        const ozField = body.slice(0, OZ_WIDTH);
        const rest = body.slice(OZ_WIDTH);
        const ozParts = splitOz(ozField);
        if (ozParts.length === 0) {
          warnings.push({
            severity: 'warn',
            code: 'CATEGORY_WITHOUT_OZ',
            message: 'Record 11 has an empty OZ field — skipping.',
            line: i + 1,
          });
          break;
        }
        const art = rest.slice(0, ART_WIDTH);
        const label = rest.slice(ART_WIDTH).trim();

        const path = ozParts.join('.');
        const parentPath = ozParts.slice(0, -1).join('.');
        const ctgy: BoqCtgy = {
          kind: 'ctgy',
          rNoPart: ozParts[ozParts.length - 1],
          label,
          children: [],
        };
        categories.set(path, ctgy);
        const parent = parentPath ? categories.get(parentPath) : null;
        if (parent) parent.children.push(ctgy);
        else rootChildren.push(ctgy);
        currentCategory = ctgy;
        // Art flags on categories currently unused; record unusual values.
        if (art && art.trim() && art.trim() !== 'N') {
          warnings.push({
            severity: 'info',
            code: 'CATEGORY_ART_FLAGS_UNUSED',
            message: `Category ${path} has art flags '${art.trim()}' — not mapped.`,
            line: i + 1,
          });
        }
        break;
      }

      case '12': {
        const ext = line.slice(2).trim();
        if (!ext) break;
        if (currentCategory) {
          currentCategory.label = currentCategory.label
            ? `${currentCategory.label} ${ext}`
            : ext;
        }
        break;
      }

      case '20': {
        // Leading text for the next block of positions. We leave the
        // currentItem intact if the text appears mid-item; otherwise mark
        // that subsequent 26-records are category-level.
        currentItem = null;
        const t = line.slice(2).trim();
        if (t) {
          warnings.push({
            severity: 'info',
            code: 'LEADING_TEXT_DROPPED',
            message: `Leading text (20): ${truncate(t, 80)}`,
            line: i + 1,
          });
        }
        break;
      }

      case '21': {
        const body = line.slice(2);
        const ozField = body.slice(0, OZ_WIDTH);
        const ozParts = splitOz(ozField);
        const art = body.slice(OZ_WIDTH, OZ_WIDTH + ART_WIDTH);
        const bedarfKz = body.charAt(OZ_WIDTH + ART_WIDTH);
        const rest = body.slice(OZ_WIDTH + ART_WIDTH + 1);

        const { qty, qu } = parseQuantityAndUnit(rest);

        const rNoPart = ozParts[ozParts.length - 1] ?? '';
        const rNoFull = ozParts.join('.');
        const parentPath = ozParts.slice(0, -1).join('.');
        const item: BoqItem = {
          kind: 'item',
          rNoPart,
          rNoFull,
          shortText: '',
          qty,
          qu,
          itemType: artFlagsToItemType(art),
          isBedarfsposition: /^[Bb]$/.test(bedarfKz.trim()) ? true : undefined,
        };
        const parent = parentPath ? categories.get(parentPath) : null;
        if (parent) parent.children.push(item);
        else rootChildren.push(item);
        currentItem = item;
        break;
      }

      case '25': {
        if (currentItem) {
          currentItem.shortText = line.slice(2).trim();
        }
        break;
      }

      case '26':
      case '27': {
        if (!currentItem) break;
        const paragraph = cleanLongTextLine(line.slice(2));
        if (!paragraph) break;
        const runs = parseLongTextLine(paragraph);
        if (runs.length === 0) break;
        if (!currentItem.longText) currentItem.longText = [];
        currentItem.longText.push({ kind: 'paragraph', runs });
        break;
      }

      case '31':
        // Category close; hierarchy is already OZ-driven so no-op.
        break;

      case '99':
        return finalize();

      default: {
        unknownRecordCount++;
        if (unknownRecordCount <= UNKNOWN_RECORDS_LIMIT) {
          warnings.push({
            severity: 'info',
            code: 'UNKNOWN_RECORD',
            message: `Unknown record kind '${kind}'`,
            line: i + 1,
          });
        } else if (unknownRecordCount === UNKNOWN_RECORDS_LIMIT + 1) {
          warnings.push({
            severity: 'warn',
            code: 'UNKNOWN_RECORDS_TRUNCATED',
            message:
              `More than ${UNKNOWN_RECORDS_LIMIT} unknown records; further occurrences suppressed.`,
          });
        }
        break;
      }
    }
  }

  return finalize();

  function finalize(): GaebDocument {
    const finalDa: DANumber = da ?? daHint ?? (83 as DANumber);
    if (da === null && daHint === undefined) {
      warnings.push({
        severity: 'warn',
        code: 'DA_DEFAULTED',
        message:
          'No DA number found in Vorspann (record 00) and no hint from caller — defaulting to 83.',
      });
    }
    return {
      da: finalDa,
      generation: 'gaeb90',
      prjInfo,
      award: { oZMask: oZMask || undefined, boq: rootChildren },
      warnings,
    };
  }
}

// ---------- helpers ----------

function stripTrailer(raw: string): string {
  // Strip trailing whitespace first, then drop the 6-digit GAEB line counter
  // if present. We only drop it when it is preceded by at least one
  // whitespace so we don't accidentally eat an OZ digit.
  const trimmed = raw.replace(/\s+$/, '');
  if (trimmed.length > 8 && /\s\d{6}$/.test(trimmed)) {
    return trimmed.slice(0, -6).replace(/\s+$/, '');
  }
  // Some exporters pad without whitespace before the trailer; fall back to
  // "any 6-digit tail" only if the rest of the line is plausible (>= 3).
  if (trimmed.length > 8 && /\d{6}$/.test(trimmed)) {
    return trimmed.slice(0, -6).replace(/\s+$/, '');
  }
  return trimmed;
}

function splitOz(ozField: string): string[] {
  const trimmed = ozField.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

function parseQuantityAndUnit(rest: string): { qty?: number; qu?: string } {
  // Expected trailing shape: "<spaces><digits><unit>" where <digits> has 3
  // implied decimal places. Real files use 11-digit qty fields but we stay
  // agnostic about the exact width — grab whatever digit run appears right
  // before the unit token.
  const match = rest.match(/(\d+)\s*([^\s\d][^\s]*)\s*$/);
  if (!match) return {};
  const qty = Number(match[1]) / 1000;
  const qu = match[2];
  return {
    qty: Number.isFinite(qty) ? qty : undefined,
    qu: qu || undefined,
  };
}

function artFlagsToItemType(art: string): ItemType {
  // 3-position flag field. We map the most common conventions:
  //   pos 1: N normal, L lumpSum, Z hourly wage, E Eventualposition
  //   pos 2: N normal, A alternative / variant
  //   pos 3: N normal, O optional
  const a = art.padEnd(3).toUpperCase();
  if (a[0] === 'L') return 'lumpSum';
  if (a[0] === 'Z') return 'hourly';
  if (a[1] === 'A') return 'alternative';
  if (a[2] === 'O') return 'optional';
  return 'normal';
}

function cleanLongTextLine(raw: string): string {
  // 26-lines are visually indented by 3 leading spaces. Preserve the real
  // content and strip only that indent, not legitimate whitespace inside.
  return raw.replace(/^ {0,3}/, '').trimEnd();
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
