/**
 * XLSX / CSV export that reads directly from the `GaebDocument` domain
 * model. Exposes price components (labor / material / equipment / other)
 * as dedicated columns, next to qty / QU / EP / GP — useful for DA 84/86
 * bidder documents that carry a split unit price.
 *
 * The legacy ExcelExporter (app/lib/excel-exporter.ts) remains the source
 * for the "Produktionsliste" (workshop tracking) output, which is a
 * different spreadsheet shape and stays unchanged here.
 */

import * as XLSX from 'xlsx';
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

export function buildPositionListWorkbook(
  entries: BookEntry[],
  options: DocToRowsOptions = {},
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  if (entries.length === 0) return wb;

  for (const entry of entries) {
    const rows = docToRows(entry.doc, options);
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: POSITION_LIST_COLUMNS as string[],
    });
    worksheet['!cols'] = POSITION_LIST_COLUMNS.map(col => ({
      wch: col === 'Kurztext' || col === 'Kategorie' ? 32 :
           col === 'Langtext' ? 48 :
           col === 'Pos. Nr.' ? 12 :
           col.endsWith('-Anteil') || col === 'EP' || col === 'GP' ? 12 :
           col === 'Menge' ? 10 :
           10,
    }));
    XLSX.utils.book_append_sheet(wb, worksheet, truncateSheetName(entry.fileName));
  }
  return wb;
}

/** Emits CSV for the first entry. CSV is single-sheet, so multiple files
 *  would collide — callers that need multi-file should use XLSX. */
export function buildPositionListCsv(
  entry: BookEntry,
  options: DocToRowsOptions = {},
): string {
  const rows = docToRows(entry.doc, options);
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: POSITION_LIST_COLUMNS as string[],
  });
  return XLSX.utils.sheet_to_csv(worksheet);
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
