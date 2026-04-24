/**
 * Builds a human-readable conversion report as plain UTF-8 text.
 *
 * Emitted as a companion to the converted XML so reviewers get a compact
 * single-file summary: source → target, item and category counts per
 * BoQ category, warnings grouped by severity, document metadata. Keeps
 * the verified state of a conversion reproducible outside of our UI.
 */

import type {
  BoqCtgy,
  BoqItem,
  BoqNode,
  ConversionWarning,
  GaebDocument,
  Generation,
} from './types';

export interface AuditLogOptions {
  /** Original uploaded file name (display purposes only). */
  sourceFileName: string;
  /** File name chosen for the XML 3.3 output. */
  targetFileName: string;
  /** Current timestamp; overridable to keep tests deterministic. */
  generatedAt?: Date;
}

const GENERATION_LABEL: Record<Generation, string> = {
  gaeb90: 'GAEB 90',
  gaeb2000: 'GAEB 2000',
  gaebXml: 'GAEB DA XML',
};

export function buildAuditLog(
  doc: GaebDocument,
  options: AuditLogOptions,
): string {
  const {
    sourceFileName,
    targetFileName,
    generatedAt = new Date(),
  } = options;

  const items = collectItems(doc.award.boq);
  const topLevelCtgys = doc.award.boq.filter(
    (n): n is BoqCtgy => n.kind === 'ctgy',
  );

  const totals = doc.award.boq.length === 0
    ? 'empty bill of quantities'
    : `${topLevelCtgys.length} top-level ${pluralize('category', 'categories', topLevelCtgys.length)}, ${items.length} ${pluralize('item', 'items', items.length)}`;

  const lines: string[] = [];
  lines.push('GAEB Converter — Conversion Report');
  lines.push('='.repeat(70));
  lines.push(`Generated:        ${generatedAt.toISOString()}`);
  lines.push(`Source file:      ${sourceFileName}`);
  lines.push(`Target file:      ${targetFileName}`);
  lines.push(`Source format:    ${GENERATION_LABEL[doc.generation]} (DA ${doc.da})`);
  lines.push(`Target format:    GAEB DA XML 3.3 (DA ${doc.da})`);
  if (doc.sourceEncoding) {
    lines.push(`Source encoding:  ${doc.sourceEncoding}`);
  }
  if (doc.prjInfo.name) lines.push(`Project name:     ${doc.prjInfo.name}`);
  if (doc.prjInfo.label) lines.push(`Project label:    ${doc.prjInfo.label}`);
  if (doc.prjInfo.clientRef) {
    lines.push(`Client:           ${doc.prjInfo.clientRef}`);
  }
  if (doc.prjInfo.currency) {
    lines.push(`Currency:         ${doc.prjInfo.currency}`);
  }
  if (doc.prjInfo.creationDate) {
    lines.push(`Creation date:    ${doc.prjInfo.creationDate}`);
  }
  if (doc.award.oZMask) {
    lines.push(`OZ mask:          ${doc.award.oZMask}`);
  }
  lines.push('');
  lines.push(`Totals: ${totals}`);

  lines.push('');
  lines.push('Bill of quantities');
  lines.push('-'.repeat(70));
  if (doc.award.boq.length === 0) {
    lines.push('(no categories or items)');
  } else {
    for (const node of doc.award.boq) {
      appendNode(lines, node, 0);
    }
  }

  lines.push('');
  lines.push('Conversion warnings');
  lines.push('-'.repeat(70));
  appendWarnings(lines, doc.warnings);

  return lines.join('\n') + '\n';
}

function appendNode(out: string[], node: BoqNode, depth: number): void {
  const indent = '  '.repeat(depth);
  if (node.kind === 'ctgy') {
    const nested = collectItems(node.children);
    const label = node.label || '(unnamed category)';
    out.push(`${indent}[${node.rNoPart}] ${label}  (${nested.length} ${pluralize('item', 'items', nested.length)})`);
    for (const child of node.children) {
      appendNode(out, child, depth + 1);
    }
  } else {
    const qty = node.qty !== undefined
      ? `${formatNumber(node.qty)}${node.qu ? ' ' + node.qu : ''}`
      : '—';
    const title = node.shortText || '(no short text)';
    out.push(`${indent}[${node.rNoFull || node.rNoPart}] ${title}  (${qty})`);
  }
}

function appendWarnings(out: string[], warnings: ConversionWarning[]): void {
  if (warnings.length === 0) {
    out.push('(none)');
    return;
  }
  const grouped: Record<ConversionWarning['severity'], ConversionWarning[]> = {
    error: [],
    warn: [],
    info: [],
  };
  for (const w of warnings) grouped[w.severity].push(w);

  const labels: Array<[ConversionWarning['severity'], string]> = [
    ['error', 'ERROR'],
    ['warn', 'WARNING'],
    ['info', 'INFO'],
  ];
  for (const [severity, label] of labels) {
    const list = grouped[severity];
    if (list.length === 0) continue;
    out.push(`${label} (${list.length}):`);
    for (const w of list) {
      const line = w.line !== undefined ? ` @line ${w.line}` : '';
      out.push(`  [${w.code}]${line}  ${w.message}`);
    }
  }
}

function collectItems(nodes: BoqNode[]): BoqItem[] {
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

function pluralize(singular: string, plural: string, count: number): string {
  return count === 1 ? singular : plural;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function auditLogFileName(targetFileName: string): string {
  const dot = targetFileName.lastIndexOf('.');
  const base = dot >= 0 ? targetFileName.slice(0, dot) : targetFileName;
  return `${base}.audit.txt`;
}
