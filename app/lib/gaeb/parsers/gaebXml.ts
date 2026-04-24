/**
 * Parses GAEB DA XML (versions 3.1, 3.2 and 3.3) into the neutral
 * `GaebDocument` domain model.
 *
 * The three supported versions differ in namespace (3.1 is date-based
 * `/GAEB_DA_XML/200407`, 3.2/3.3 is `/GAEB_DA_XML/DAxx/3.y`) and in minor
 * structural details (3.1 carries the DA number in `<Award><DP>`, 3.2/3.3
 * in the namespace URL). To absorb these differences the parser traverses
 * by *local* element names and does not hard-code a namespace.
 */

import type {
  Award,
  BoqCtgy,
  BoqItem,
  BoqNode,
  ConversionWarning,
  DANumber,
  GaebDocument,
  ItemType,
  LongTextBlock,
  ProjectInfo,
  TextRun,
} from '../types';

export class GaebXmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GaebXmlParseError';
  }
}

export function parseGaebXml(text: string, daHint?: DANumber): GaebDocument {
  // Strip a leading UTF-8 BOM; xmldom rejects it as "xml declaration at
  // position 1". Our encoding layer also strips it for bytes that came from
  // `readGaebFile`, but callers may hand us a string directly (tests, future
  // API routes that get pre-decoded text).
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let doc;
  try {
    doc = new DOMParser().parseFromString(normalized, 'application/xml');
  } catch (err) {
    // xmldom throws on fatal parse errors; browser DOMParser embeds a
    // <parsererror> element instead. Normalize both paths.
    throw new GaebXmlParseError(
      `Not well-formed XML: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new GaebXmlParseError(
      `Not well-formed XML: ${parseError.textContent ?? '(no detail)'}`,
    );
  }

  const root = firstElementByLocalName(doc.documentElement, 'GAEB')
    ?? (doc.documentElement?.localName === 'GAEB' ? doc.documentElement : null);
  if (!root) {
    throw new GaebXmlParseError('Missing <GAEB> root element.');
  }

  const warnings: ConversionWarning[] = [];

  const prjInfo = readProjectInfo(root);
  const awardEl = firstChildByLocalName(root, 'Award');
  const da = readDa(root, awardEl, daHint);
  const award: Award = awardEl ? readAward(awardEl, warnings) : { boq: [] };

  return {
    da,
    generation: 'gaebXml',
    sourceEncoding: 'utf-8',
    prjInfo,
    award,
    warnings,
  };
}

function readProjectInfo(root: Element): ProjectInfo {
  const info: ProjectInfo = {};

  const gaebInfo = firstChildByLocalName(root, 'GAEBInfo');
  if (gaebInfo) {
    const date = textOfFirstChild(gaebInfo, 'Date');
    if (date) info.creationDate = date;
  }

  const prjInfo = firstChildByLocalName(root, 'PrjInfo');
  if (prjInfo) {
    info.name = textOfFirstChild(prjInfo, 'NamePrj') ?? info.name;
    info.label = textOfFirstChild(prjInfo, 'LblPrj') ?? info.label;
    const cur = textOfFirstChild(prjInfo, 'Cur');
    if (cur === 'EUR' || cur === 'DM') info.currency = cur;
  }

  return info;
}

function readDa(
  root: Element,
  awardEl: Element | null,
  daHint?: DANumber,
): DANumber {
  // Preferred: namespace URL of the root (3.2/3.3).
  const ns = root.getAttribute('xmlns');
  if (ns) {
    const m = ns.match(/\/DA(8[1-6])\//);
    if (m) return Number(m[1]) as DANumber;
  }

  // 3.1 fallback: <Award><DP>NN</DP>
  if (awardEl) {
    const dp = textOfFirstChild(awardEl, 'DP');
    if (dp && /^8[1-6]$/.test(dp)) return Number(dp) as DANumber;
  }

  if (daHint) return daHint;

  throw new GaebXmlParseError(
    'Cannot determine DA number: no /DAxx/ namespace and no <Award><DP>.',
  );
}

function readAward(awardEl: Element, warnings: ConversionWarning[]): Award {
  const boqEl = firstChildByLocalName(awardEl, 'BoQ');
  if (!boqEl) {
    warnings.push({
      severity: 'warn',
      code: 'MISSING_BOQ',
      message: '<Award> has no <BoQ> child — bill of quantities is empty.',
    });
    return { boq: [] };
  }

  const boqBody = firstChildByLocalName(boqEl, 'BoQBody');
  if (!boqBody) {
    return { boq: [] };
  }

  return { boq: readBoqChildren(boqBody, warnings) };
}

/**
 * Reads the children of a `<BoQBody>` (or a nested body) into a list of
 * `BoqNode`s. GAEB XML mixes three kinds of direct children:
 *   - <BoQCtgy> — a category with its own nested body (recursive)
 *   - <Itemlist> — a container holding one or more <Item> leaves
 *   - <Remark> — pre-/post-remark, not a regular item (recorded as warning)
 */
function readBoqChildren(
  bodyEl: Element,
  warnings: ConversionWarning[],
): BoqNode[] {
  const out: BoqNode[] = [];
  for (const child of elementChildren(bodyEl)) {
    switch (child.localName) {
      case 'BoQCtgy': {
        out.push(readCategory(child, warnings));
        break;
      }
      case 'Itemlist': {
        for (const item of elementChildren(child)) {
          if (item.localName === 'Item') {
            out.push(readItem(item, warnings));
          }
        }
        break;
      }
      case 'Item': {
        // Some exporters omit the <Itemlist> wrapper.
        out.push(readItem(child, warnings));
        break;
      }
      case 'Remark': {
        warnings.push({
          severity: 'info',
          code: 'REMARK_DROPPED',
          message: `Remark ${child.getAttribute('ID') ?? ''} present in BoQ — not represented in the domain model yet.`,
        });
        break;
      }
      default:
        // Ignore other structural elements silently — they are schema metadata.
        break;
    }
  }
  return out;
}

function readCategory(
  ctgyEl: Element,
  warnings: ConversionWarning[],
): BoqCtgy {
  const rNoPart = ctgyEl.getAttribute('RNoPart') ?? '';

  let label = '';
  const lblTx = firstChildByLocalName(ctgyEl, 'LblTx');
  if (lblTx) {
    label = collapseText(lblTx);
  }

  const nestedBody = firstChildByLocalName(ctgyEl, 'BoQBody');
  const children = nestedBody ? readBoqChildren(nestedBody, warnings) : [];

  return { kind: 'ctgy', rNoPart, label, children };
}

function readItem(itemEl: Element, warnings: ConversionWarning[]): BoqItem {
  const rNoPart = itemEl.getAttribute('RNoPart') ?? '';

  const qtyText = textOfFirstChild(itemEl, 'Qty');
  const qty = qtyText ? parseNumber(qtyText) : undefined;
  const qu = textOfFirstChild(itemEl, 'QU') ?? undefined;

  const upText = textOfFirstChild(itemEl, 'UP');
  const itText = textOfFirstChild(itemEl, 'IT');
  const unitPrice = upText ? parseNumber(upText) : undefined;
  const totalPrice = itText ? parseNumber(itText) : undefined;

  const itemType = readItemType(itemEl);
  const { shortText, longText } = readDescription(itemEl, warnings);

  const isBedarfsposition =
    textOfFirstChild(itemEl, 'Provisional')?.toLowerCase() === 'yes'
      ? true
      : undefined;

  return {
    kind: 'item',
    rNoPart,
    rNoFull: rNoPart,
    shortText,
    longText,
    qty,
    qu,
    unitPrice,
    totalPrice,
    itemType,
    isBedarfsposition,
  };
}

function readItemType(itemEl: Element): ItemType {
  if (boolChild(itemEl, 'LumpSumItem')) return 'lumpSum';
  if (boolChild(itemEl, 'HourlyWageItem')) return 'hourly';
  if (boolChild(itemEl, 'AlternativeItem')) return 'alternative';
  if (boolChild(itemEl, 'OptionalItem')) return 'optional';
  return 'normal';
}

function boolChild(parent: Element, name: string): boolean {
  const v = textOfFirstChild(parent, name);
  return v !== null && v.toLowerCase() === 'yes';
}

function readDescription(
  itemEl: Element,
  _warnings: ConversionWarning[],
): { shortText: string; longText?: LongTextBlock[] } {
  const desc = firstChildByLocalName(itemEl, 'Description');
  if (!desc) return { shortText: '' };

  const complete = firstChildByLocalName(desc, 'CompleteText');
  if (!complete) return { shortText: '' };

  const outline = firstChildByLocalName(complete, 'OutlineText');
  const shortText = outline
    ? collapseText(firstChildByLocalName(outline, 'TextOutlTxt') ?? outline)
    : '';

  const detail = firstChildByLocalName(complete, 'DetailTxt');
  const longText = detail ? readLongText(detail) : undefined;

  return { shortText, longText };
}

function readLongText(detailEl: Element): LongTextBlock[] {
  const text = firstChildByLocalName(detailEl, 'Text') ?? detailEl;
  const blocks: LongTextBlock[] = [];
  for (const p of elementChildren(text)) {
    if (p.localName !== 'p') continue;
    const runs: TextRun[] = [];
    for (const node of childNodes(p)) {
      if (isElement(node) && node.localName === 'span') {
        runs.push(readRun(node));
      } else if (isText(node)) {
        const s = node.nodeValue ?? '';
        if (s.trim()) runs.push({ text: s });
      }
    }
    if (runs.length === 0) {
      const fallback = p.textContent?.trim();
      if (fallback) runs.push({ text: fallback });
    }
    if (runs.length > 0) {
      blocks.push({ kind: 'paragraph', runs });
    }
  }
  return blocks;
}

function readRun(spanEl: Element): TextRun {
  const text = spanEl.textContent ?? '';
  const style = spanEl.getAttribute('style') ?? '';
  const run: TextRun = { text };
  if (/font-weight\s*:\s*bold/i.test(style) || spanEl.getAttribute('bold') === 'true') {
    run.bold = true;
  }
  if (/font-style\s*:\s*italic/i.test(style) || spanEl.getAttribute('italic') === 'true') {
    run.italic = true;
  }
  if (/text-decoration\s*:\s*underline/i.test(style) || spanEl.getAttribute('underline') === 'true') {
    run.underline = true;
  }
  return run;
}

// ---------- DOM helpers (namespace-agnostic via localName) ----------

function elementChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (const node of childNodes(el)) {
    if (isElement(node)) out.push(node);
  }
  return out;
}

function childNodes(el: Element): ChildNode[] {
  const out: ChildNode[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) out.push(n);
  return out;
}

function firstChildByLocalName(el: Element, name: string): Element | null {
  for (const child of elementChildren(el)) {
    if (child.localName === name) return child;
  }
  return null;
}

function firstElementByLocalName(el: Element | null, name: string): Element | null {
  if (!el) return null;
  const walker: Element[] = [el];
  while (walker.length) {
    const current = walker.shift()!;
    if (current.localName === name && current !== el) return current;
    for (const child of elementChildren(current)) walker.push(child);
  }
  return null;
}

function textOfFirstChild(el: Element, name: string): string | null {
  const child = firstChildByLocalName(el, name);
  return child ? (child.textContent?.trim() ?? '') : null;
}

function collapseText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function parseNumber(raw: string): number | undefined {
  // XML uses '.' as decimal separator. Some exporters still emit German commas;
  // accept both for robustness.
  const normalized = raw.replace(',', '.').trim();
  if (!normalized) return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function isElement(n: unknown): n is Element {
  return (
    !!n &&
    typeof n === 'object' &&
    'nodeType' in (n as object) &&
    (n as { nodeType?: number }).nodeType === 1
  );
}

function isText(n: unknown): n is Text {
  return (
    !!n &&
    typeof n === 'object' &&
    'nodeType' in (n as object) &&
    (n as { nodeType?: number }).nodeType === 3
  );
}
