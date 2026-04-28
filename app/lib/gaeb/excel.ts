/**
 * XLSX / CSV export that reads directly from the `GaebDocument` domain
 * model. Exposes price components (labor / material / equipment / other)
 * as dedicated columns, next to qty / QU / EP / GP — useful for DA 84/86
 * bidder documents that carry a split unit price.
 *
 * Built on ExcelJS — replaces the previous `xlsx` dependency, which had
 * unpatched prototype-pollution and ReDoS advisories on its npm-published
 * version (the SheetJS team only ships fixes via their own CDN).
 *
 * The legacy ExcelExporter (app/lib/excel-exporter.ts) also uses ExcelJS
 * and stays focused on the workshop-tracking "Produktionsliste" shape.
 */

import ExcelJS from 'exceljs';
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

const COLUMN_WIDTHS: Record<keyof PositionListRow, number> = {
  'Pos. Nr.': 12,
  Kategorie: 32,
  Kurztext: 32,
  Menge: 10,
  Einheit: 8,
  EP: 12,
  GP: 12,
  'Lohn-Anteil': 12,
  'Stoff-Anteil': 12,
  'Geräte-Anteil': 12,
  'Sonstige-Anteil': 14,
  Langtext: 48,
  'Pos.-Typ': 10,
  Bedarf: 8,
};

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

export function buildPositionListWorkbook(
  entries: BookEntry[],
  options: DocToRowsOptions = {},
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  for (const entry of entries) {
    const ws = wb.addWorksheet(truncateSheetName(entry.fileName));
    ws.columns = POSITION_LIST_COLUMNS.map(col => ({
      header: col,
      key: col,
      width: COLUMN_WIDTHS[col],
    }));
    for (const row of docToRows(entry.doc, options)) {
      ws.addRow(row);
    }
  }
  return wb;
}

/** Emits CSV for the single entry. CSV is single-sheet, so callers that
 *  need multi-file should use the XLSX path. */
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

function truncateSheetName(name: string): string {
  // Excel forbids * ? : / \ [ ] and caps length at 31 chars per sheet.
  return name.replace(/[*?:/\\[\]]/g, '_').slice(0, 31);
}
