/**
 * CSV export of the position list directly from the `GaebDocument`
 * domain model. Includes dedicated columns for the four price components
 * (labor / material / equipment / other) for DA 84/86 bidder documents.
 *
 * No third-party spreadsheet library — XLSX support has been removed
 * because every available browser-side option pulled native Node deps
 * into the bundle. CSV is library-free, opens cleanly in Excel /
 * LibreOffice / Numbers, and keeps the bundle small.
 */

import type { BoqItem, BoqNode, GaebDocument } from './types';

export interface PositionListRow {
  'Pos. Nr.': string;
  Kategorie: string;
  Kurztext: string;
  Menge: string;
  Einheit: string;
  EP: string;
  GP: string;
  'Lohn-Anteil': string;
  'Stoff-Anteil': string;
  'Geräte-Anteil': string;
  'Sonstige-Anteil': string;
  Langtext: string;
  'Pos.-Typ': string;
  Bedarf: string;
}

export interface DocToRowsOptions {
  includeLongText?: boolean;
}

export interface BookEntry {
  fileName: string;
  doc: GaebDocument;
}

export const POSITION_LIST_COLUMNS: Array<keyof PositionListRow> = [
  'Pos. Nr.',
  'Kategorie',
  'Kurztext',
  'Menge',
  'Einheit',
  'EP',
  'GP',
  'Lohn-Anteil',
  'Stoff-Anteil',
  'Geräte-Anteil',
  'Sonstige-Anteil',
  'Langtext',
  'Pos.-Typ',
  'Bedarf',
];

export function docToRows(
  doc: GaebDocument,
  options: DocToRowsOptions = {},
): PositionListRow[] {
  const rows: PositionListRow[] = [];
  const walk = (nodes: BoqNode[], categoryPath: string) => {
    for (const node of nodes) {
      if (node.kind === 'ctgy') {
        const label = node.label || `Kategorie ${node.rNoPart}`;
        const path = categoryPath ? `${categoryPath} > ${label}` : label;
        walk(node.children, path);
      } else {
        rows.push(itemToRow(node, categoryPath, options));
      }
    }
  };
  walk(doc.award.boq, '');
  return rows;
}

/** Emits a CSV string for a single entry with the standard column header. */
export function buildPositionListCsv(
  entry: BookEntry,
  options: DocToRowsOptions = {},
): string {
  const rows = docToRows(entry.doc, options);
  const lines: string[] = [POSITION_LIST_COLUMNS.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(POSITION_LIST_COLUMNS.map(col => csvCell(row[col])).join(','));
  }
  return lines.join('\n') + '\n';
}

function csvCell(value: string): string {
  if (value === '' || value === undefined) return '';
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function itemToRow(
  item: BoqItem,
  categoryPath: string,
  options: DocToRowsOptions,
): PositionListRow {
  const pc = item.priceComponents ?? {};
  return {
    'Pos. Nr.': item.rNoFull || item.rNoPart,
    Kategorie: categoryPath,
    Kurztext: item.shortText,
    Menge: item.qty !== undefined ? formatNumber(item.qty) : '',
    Einheit: item.qu ?? '',
    EP: item.unitPrice !== undefined ? formatNumber(item.unitPrice) : '',
    GP: item.totalPrice !== undefined ? formatNumber(item.totalPrice) : '',
    'Lohn-Anteil': pc.labor !== undefined ? formatNumber(pc.labor) : '',
    'Stoff-Anteil': pc.material !== undefined ? formatNumber(pc.material) : '',
    'Geräte-Anteil': pc.equipment !== undefined ? formatNumber(pc.equipment) : '',
    'Sonstige-Anteil': pc.other !== undefined ? formatNumber(pc.other) : '',
    Langtext: options.includeLongText
      ? (item.longText ?? [])
          .map(b => b.runs.map(r => r.text).join(''))
          .join('\n')
      : '',
    'Pos.-Typ': item.itemType,
    Bedarf: item.isBedarfsposition ? 'ja' : '',
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 3 });
}
