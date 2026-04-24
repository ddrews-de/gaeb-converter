/**
 * Adapter from the new domain model (`GaebDocument`) to the legacy
 * `GAEBData` / `GAEBPosition` shape that `GAEBViewer` and `ExcelExporter`
 * consume today.
 *
 * Kept deliberately lossy: the view model is a flat list with an
 * `indent level` and a string title. Long-text formatting runs, price
 * components, warnings etc. are not surfaced here — consumers that need
 * them should use `GaebDocument` directly (e.g. the upcoming XML download
 * button).
 */

import type {
  GAEBData,
  GAEBHeader,
  GAEBPosition,
} from '../../gaeb-parser';
import type {
  BoqCtgy,
  BoqItem,
  GaebDocument,
  LongTextBlock,
} from '../types';

export function toViewModel(
  doc: GaebDocument,
  fileName: string,
  rawContent = '',
): GAEBData {
  const positions: GAEBPosition[] = [];
  walk(doc.award.boq, 0, undefined, positions);
  return {
    header: buildHeader(doc),
    positions,
    rawContent,
    fileName,
    processedAt: new Date().toISOString(),
    totalPositions: positions.length,
  };
}

function buildHeader(doc: GaebDocument): GAEBHeader {
  return {
    version: doc.generation === 'gaebXml' ? 'GAEB DA XML' : doc.generation,
    project: doc.prjInfo.name,
    description: doc.prjInfo.label,
    date: doc.prjInfo.creationDate,
    format: formatTag(doc),
  };
}

function formatTag(doc: GaebDocument): string {
  const letter =
    doc.generation === 'gaeb90' ? 'D'
    : doc.generation === 'gaeb2000' ? 'P'
    : 'X';
  return `${letter}${doc.da}`;
}

function walk(
  nodes: (BoqCtgy | BoqItem)[],
  level: number,
  parentId: string | undefined,
  out: GAEBPosition[],
  prefix = '',
): void {
  for (const node of nodes) {
    if (node.kind === 'ctgy') {
      const positionNumber = joinRNo(prefix, node.rNoPart);
      const id = positionNumber || `ctgy_${out.length + 1}`;
      const ctgyPos: GAEBPosition = {
        id,
        positionNumber: positionNumber || undefined,
        title: node.label || `Kategorie ${node.rNoPart}`,
        level,
        type: 'title',
        parent: parentId,
        children: [],
      };
      out.push(ctgyPos);

      const childStart = out.length;
      walk(node.children, level + 1, id, out, positionNumber);
      ctgyPos.children = out
        .slice(childStart)
        .filter(p => p.parent === id)
        .map(p => p.id);
    } else {
      const positionNumber = joinRNo(prefix, node.rNoPart);
      const id = positionNumber || node.rNoFull || `item_${out.length + 1}`;
      out.push({
        id,
        positionNumber: positionNumber || undefined,
        title: node.shortText || `Position ${node.rNoPart}`,
        description: renderLongText(node.longText),
        unit: node.qu,
        quantity: node.qty,
        unitPrice: node.unitPrice,
        totalPrice: node.totalPrice,
        level,
        type: 'position',
        parent: parentId,
      });
    }
  }
}

function joinRNo(prefix: string, rNoPart: string): string {
  if (!rNoPart) return prefix;
  if (!prefix) return rNoPart;
  return `${prefix}.${rNoPart}`;
}

function renderLongText(blocks: LongTextBlock[] | undefined): string | undefined {
  if (!blocks || blocks.length === 0) return undefined;
  const paragraphs = blocks.map(b =>
    b.runs.map(r => r.text).join('').trim(),
  );
  const combined = paragraphs.filter(Boolean).join('\n');
  return combined.length > 0 ? combined : undefined;
}
