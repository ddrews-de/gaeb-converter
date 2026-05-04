/**
 * Serializes a `GaebDocument` into GAEB DA XML 3.3.
 *
 * Design: plain template strings with a small `xmlEscape` helper. No
 * third-party XML library — deterministic attribute order, tight control
 * over whitespace, small bundle footprint. Validated by a round-trip test
 * (`parseGaebXml(serialize(doc))` structurally equals `doc`) and by
 * re-parsing the output of every TestData fixture.
 */

import type {
  BoqCtgy,
  BoqItem,
  BoqNode,
  GaebDocument,
  ItemType,
  PriceComponents,
  ProjectInfo,
} from '../types';
import { renderDescription } from './longtext';
import {
  XML_PROLOG,
  formatNumber,
  gaebXml33Namespace,
  xmlEscape,
} from './xmlTemplates';

const PROG_SYSTEM = 'gaeb-converter';

export function serializeGaebXml33(doc: GaebDocument): string {
  const body: string[] = [];
  body.push(XML_PROLOG);
  body.push(`<GAEB xmlns="${xmlEscape(gaebXml33Namespace(doc.da))}">`);
  body.push(renderGAEBInfo(doc));
  body.push(renderPrjInfo(doc.prjInfo));
  body.push(renderAward(doc));
  body.push('</GAEB>');
  return body.join('\n') + '\n';
}

function renderGAEBInfo(doc: GaebDocument): string {
  const date = doc.prjInfo.creationDate ?? isoToday();
  return [
    ' <GAEBInfo>',
    '  <Version>3.3</Version>',
    // VersDate is the schema-version date; required by the GAEB DA XML 3.3
    // XSD between <Version> and <Date>. The 3.3 schema family ships as
    // 2021-05.
    '  <VersDate>2021-05</VersDate>',
    `  <Date>${xmlEscape(toIsoDate(date))}</Date>`,
    `  <ProgSystem>${xmlEscape(PROG_SYSTEM)}</ProgSystem>`,
    ' </GAEBInfo>',
  ].join('\n');
}

function renderPrjInfo(prj: ProjectInfo): string {
  const lines: string[] = [' <PrjInfo>'];
  if (prj.name) lines.push(`  <NamePrj>${xmlEscape(prj.name)}</NamePrj>`);
  if (prj.label) lines.push(`  <LblPrj>${xmlEscape(prj.label)}</LblPrj>`);
  if (prj.currency) lines.push(`  <Cur>${xmlEscape(prj.currency)}</Cur>`);
  lines.push(' </PrjInfo>');
  return lines.join('\n');
}

function renderAward(doc: GaebDocument): string {
  const lines: string[] = [' <Award>'];
  // DA XML 3.3 carries the DA both in the namespace URL and in <DP>, which
  // is redundant but harmless — and lets tools that bound to the 3.1-style
  // schema still find the number.
  lines.push(`  <DP>${doc.da}</DP>`);
  // <Cur> belongs inside <AwardInfo>, not directly under <Award>. The 3.3
  // XSD allows AwardInfo / OWN / Requester / CnstSite / AddText / BoQ /
  // WgChange under Award — Cur is not in that list.
  if (doc.prjInfo.currency) {
    lines.push('  <AwardInfo>');
    lines.push(`   <Cur>${xmlEscape(doc.prjInfo.currency)}</Cur>`);
    lines.push('  </AwardInfo>');
  }
  lines.push('  <BoQ>');
  lines.push('   <BoQInfo>');
  if (doc.prjInfo.label) {
    lines.push(`    <LblBoQ>${xmlEscape(doc.prjInfo.label)}</LblBoQ>`);
  }
  lines.push('   </BoQInfo>');
  lines.push('   <BoQBody>');
  for (const node of doc.award.boq) {
    lines.push(renderNode(node, '    '));
  }
  lines.push('   </BoQBody>');
  lines.push('  </BoQ>');
  lines.push(' </Award>');
  return lines.join('\n');
}

function renderNode(node: BoqNode, indent: string): string {
  return node.kind === 'ctgy'
    ? renderCategory(node, indent)
    : renderItem(node, indent);
}

function renderCategory(ctgy: BoqCtgy, indent: string): string {
  const lines: string[] = [];
  const attrs = ctgy.rNoPart ? ` RNoPart="${xmlEscape(ctgy.rNoPart)}"` : '';
  lines.push(`${indent}<BoQCtgy${attrs}>`);
  if (ctgy.label) {
    lines.push(`${indent} <LblTx>`);
    lines.push(`${indent}  <p>`);
    lines.push(`${indent}   <span>${xmlEscape(ctgy.label)}</span>`);
    lines.push(`${indent}  </p>`);
    lines.push(`${indent} </LblTx>`);
  }
  lines.push(`${indent} <BoQBody>`);

  const items: BoqItem[] = [];
  const subCats: BoqCtgy[] = [];
  for (const child of ctgy.children) {
    if (child.kind === 'ctgy') subCats.push(child);
    else items.push(child);
  }

  for (const sub of subCats) {
    lines.push(renderCategory(sub, indent + '  '));
  }
  if (items.length > 0) {
    lines.push(`${indent}  <Itemlist>`);
    for (const item of items) {
      lines.push(renderItem(item, indent + '   '));
    }
    lines.push(`${indent}  </Itemlist>`);
  }
  lines.push(`${indent} </BoQBody>`);
  lines.push(`${indent}</BoQCtgy>`);
  return lines.join('\n');
}

function renderItem(item: BoqItem, indent: string): string {
  const lines: string[] = [];
  const attrs = item.rNoPart ? ` RNoPart="${xmlEscape(item.rNoPart)}"` : '';
  lines.push(`${indent}<Item${attrs}>`);

  const typeTag = itemTypeTag(item.itemType);
  if (typeTag) lines.push(`${indent} <${typeTag}>Yes</${typeTag}>`);
  if (item.qty !== undefined)
    lines.push(`${indent} <Qty>${formatNumber(item.qty)}</Qty>`);
  if (item.qu) lines.push(`${indent} <QU>${xmlEscape(item.qu)}</QU>`);
  if (item.unitPrice !== undefined)
    lines.push(`${indent} <UP>${formatNumber(item.unitPrice)}</UP>`);
  if (item.totalPrice !== undefined)
    lines.push(`${indent} <IT>${formatNumber(item.totalPrice)}</IT>`);
  if (item.priceComponents) {
    for (const line of renderPriceComponents(item.priceComponents, indent + ' ')) {
      lines.push(line);
    }
  }

  const desc = renderDescription(
    { shortText: item.shortText, longText: item.longText },
    indent + ' ',
  );
  if (desc) lines.push(desc);

  lines.push(`${indent}</Item>`);
  return lines.join('\n');
}

/**
 * Emits <UPComp> children of an <Item> in the canonical order
 * (labor / material / equipment / other) with a German Label attribute
 * so GAEB validators and human readers can tell the components apart.
 */
function renderPriceComponents(pc: PriceComponents, indent: string): string[] {
  const entries: Array<[keyof PriceComponents, string]> = [
    ['labor', 'Lohn'],
    ['material', 'Stoff'],
    ['equipment', 'Gerät'],
    ['other', 'Sonstiges'],
  ];
  const out: string[] = [];
  for (const [key, label] of entries) {
    const value = pc[key];
    if (value === undefined) continue;
    out.push(
      `${indent}<UPComp Label="${xmlEscape(label)}">${formatNumber(value)}</UPComp>`,
    );
  }
  return out;
}

function itemTypeTag(t: ItemType): string | null {
  switch (t) {
    case 'lumpSum': return 'LumpSumItem';
    case 'hourly': return 'HourlyWageItem';
    case 'alternative': return 'AlternativeItem';
    case 'optional': return 'OptionalItem';
    default: return null;
  }
}

function toIsoDate(input: string): string {
  // Accept ISO (YYYY-MM-DD), German DD.MM.YYYY, or DD.MM.YY — normalize.
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(input)) return input;
  const m = input.match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (m) {
    const [, dd, mm, rawYy] = m;
    const yy = rawYy.length === 2
      ? (Number(rawYy) >= 70 ? '19' : '20') + rawYy
      : rawYy;
    return `${yy}-${mm}-${dd}`;
  }
  return input;
}

function isoToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
