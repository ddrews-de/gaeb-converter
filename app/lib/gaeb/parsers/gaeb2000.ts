/**
 * GAEB 2000 parser (.p81 – .p86).
 *
 * Real fixtures (TestData/LV_Los01.P83, LV_Los02.P83) use the key/value
 * syntax introduced with GAEB 2000 V1.2, which looks like this:
 *
 *   #begin[GAEB]
 *    #begin[PrjInfo]
 *     [Name]11530[end]
 *     [Bez]Neubau Flutpolder[end]
 *    #end[PrjInfo]
 *    #begin[Vergabe]
 *     [DP]83[end]
 *     #begin[LV]
 *      #begin[LVBereich]
 *       [OZ]01[end]
 *       [Bez]Vorbereitende Leistungen[end]
 *       #begin[Position]
 *        [OZ]010010[end]
 *        #begin[Beschreibung]
 *         [Kurztext]Anlaufberatung[end]
 *         [Langtext]Teilnahme des Projektleiters…[end]
 *        #end[Beschreibung]
 *        [ME]psch[end]
 *        [Menge]1,000[end]
 *       #end[Position]
 *      #end[LVBereich]
 *     #end[LV]
 *    #end[Vergabe]
 *   #end[GAEB]
 *
 * The BoQ structure is therefore already a tree — nested `#begin[LVBereich]`
 * elements are Kategorien, `#begin[Position]` elements are Items. Hierarchy
 * in the final GaebDocument mirrors the file's nesting; we do not need to
 * decode the OZ mask to rebuild it.
 *
 * Note: the older "K/G/T/P/Z/E" record-style dialect is NOT what real
 * production files look like. This parser targets the V1.2+ key/value
 * layout observed across the TestData corpus.
 */

import type {
  BoqCtgy,
  BoqItem,
  BoqNode,
  ConversionWarning,
  DANumber,
  GaebDocument,
  LongTextBlock,
  ProjectInfo,
} from '../types';

export class Gaeb2000ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Gaeb2000ParseError';
  }
}

const BEGIN_RE = /^#begin\[([^\]]+)\]\s*$/;
const END_RE = /^#end\[([^\]]+)\]\s*$/;
const KV_RE = /^\[([^\]]+)\](.*)\[end\]\s*$/;

export function parseGaeb2000(text: string, daHint?: DANumber): GaebDocument {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const warnings: ConversionWarning[] = [];
  const prjInfo: ProjectInfo = {};
  let da: DANumber | null = null;

  const rootChildren: BoqNode[] = [];
  const boqStack: BoqCtgy[] = [];
  let currentItem: BoqItem | null = null;
  const sectionStack: string[] = [];

  const currentChildren = (): BoqNode[] =>
    boqStack.length > 0 ? boqStack[boqStack.length - 1].children : rootChildren;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const beginMatch = BEGIN_RE.exec(line);
    if (beginMatch) {
      const section = beginMatch[1];
      sectionStack.push(section);

      if (section === 'LVBereich') {
        const ctgy: BoqCtgy = { kind: 'ctgy', rNoPart: '', label: '', children: [] };
        currentChildren().push(ctgy);
        boqStack.push(ctgy);
      } else if (section === 'Position') {
        const item: BoqItem = {
          kind: 'item',
          rNoPart: '',
          rNoFull: '',
          shortText: '',
          itemType: 'normal',
        };
        currentChildren().push(item);
        currentItem = item;
      }
      continue;
    }

    const endMatch = END_RE.exec(line);
    if (endMatch) {
      const section = endMatch[1];
      if (section === 'LVBereich') boqStack.pop();
      if (section === 'Position') currentItem = null;
      // Pop sectionStack (tolerate slight mismatches).
      const last = sectionStack.lastIndexOf(section);
      if (last >= 0) sectionStack.splice(last, 1);
      continue;
    }

    const kvMatch = KV_RE.exec(line);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2];
      handleKV(key, value, sectionStack, prjInfo, boqStack, currentItem, warnings, (n) => {
        da = n;
      }, i + 1);
      continue;
    }

    // Ignore any other syntactic noise (blank indent, comments, …).
  }

  if (da === null && daHint !== undefined) {
    da = daHint;
  }
  if (da === null) {
    warnings.push({
      severity: 'warn',
      code: 'DA_DEFAULTED',
      message:
        'No [DP] entry found in [Vergabe] and no DA hint from caller — defaulting to 83.',
    });
    da = 83;
  }

  return {
    da,
    generation: 'gaeb2000',
    prjInfo,
    award: { boq: rootChildren },
    warnings,
  };
}

function handleKV(
  key: string,
  value: string,
  sectionStack: string[],
  prjInfo: ProjectInfo,
  boqStack: BoqCtgy[],
  currentItem: BoqItem | null,
  warnings: ConversionWarning[],
  setDa: (n: DANumber) => void,
  lineNumber: number,
): void {
  const section = sectionStack[sectionStack.length - 1] ?? '';
  const top = boqStack[boqStack.length - 1] ?? null;

  if (section === 'GAEBInfo') {
    if (key === 'Datum') prjInfo.creationDate = value.trim();
    return;
  }

  if (section === 'PrjInfo') {
    if (key === 'Name') prjInfo.name = value.trim() || prjInfo.name;
    else if (key === 'Bez') prjInfo.label = value.trim() || prjInfo.label;
    else if (key === 'Wae') {
      const v = value.trim().toUpperCase();
      if (v === 'EUR' || v === 'DM') prjInfo.currency = v;
    }
    return;
  }

  if (section === 'Vergabe' || section === 'VergabeInfo') {
    if (key === 'DP') {
      const n = Number(value.trim());
      if (n >= 81 && n <= 86) setDa(n as DANumber);
      return;
    }
    if (key === 'Wae' && !prjInfo.currency) {
      const v = value.trim().toUpperCase();
      if (v === 'EUR' || v === 'DM') prjInfo.currency = v;
    }
    return;
  }

  if (section === 'Adresse' && key === 'Name1' && sectionStack.includes('AG')) {
    prjInfo.clientRef = value.trim() || prjInfo.clientRef;
    return;
  }

  if (section === 'LVInfo') {
    // LVInfo.Bez often repeats the project description — prefer the outer
    // PrjInfo.Bez if already set, otherwise adopt the LV label.
    if (key === 'Bez' && !prjInfo.label) prjInfo.label = value.trim();
    return;
  }

  if (section === 'LVBereich' && top) {
    if (key === 'OZ') {
      top.rNoPart = value.trim();
    } else if (key === 'Bez') {
      top.label = value.trim();
    }
    return;
  }

  if (section === 'Position' && currentItem) {
    if (key === 'OZ') {
      currentItem.rNoPart = value.trim();
      currentItem.rNoFull = value.trim();
    } else if (key === 'ME') {
      currentItem.qu = value.trim() || undefined;
    } else if (key === 'Menge') {
      currentItem.qty = parseGermanNumber(value);
    } else if (key === 'EP') {
      currentItem.unitPrice = parseGermanNumber(value);
    } else if (key === 'GB' || key === 'GP') {
      currentItem.totalPrice = parseGermanNumber(value);
    }
    return;
  }

  if (section === 'Beschreibung' && currentItem) {
    if (key === 'Kurztext') {
      currentItem.shortText = value.trim();
    } else if (key === 'Langtext') {
      const block: LongTextBlock = {
        kind: 'paragraph',
        runs: [{ text: value.trim() }],
      };
      (currentItem.longText ??= []).push(block);
    }
    return;
  }

  // Silently accept values under sections we don't yet model — only raise
  // a warning for values that look schema-unexpected at a meaningful depth.
  if (section === '' && key !== '_RIB_UPFracDig') {
    warnings.push({
      severity: 'info',
      code: 'UNSCOPED_KV',
      message: `Key [${key}] outside of any known section.`,
      line: lineNumber,
    });
  }
}

function parseGermanNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // German decimal: comma. Thousands separators (dot) are rare in GAEB
  // numeric fields but we handle "1.234,56" just in case.
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}
