import ExcelJS from 'exceljs';
import { GAEBData, GAEBPosition } from './gaeb-parser';

export interface ExcelExportOptions {
  includeDescription?: boolean;
  fileName?: string;
}

/**
 * Workshop production-list export ("Produktionsliste"). Each item gets a
 * row with empty tracking columns (zugeschnitten / gebaut / Zukauf /
 * bestellt / geliefert / Bemerkungen) for the workshop to fill in by hand.
 *
 * Built on ExcelJS — replaces the previous `xlsx` dependency, whose
 * npm-published version (0.18.5) carries unpatched prototype-pollution
 * and ReDoS advisories that the SheetJS team only fixes via their CDN.
 */
export class ExcelExporter {
  static async exportToExcel(
    gaebFiles: GAEBData[],
    options: ExcelExportOptions = {},
  ): Promise<void> {
    const { fileName = 'GAEB_Export' } = options;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'gaeb-converter';
    workbook.created = new Date();

    appendSummarySheet(workbook, gaebFiles);
    gaebFiles.forEach((gaebFile, index) => {
      const sheetName = makeSheetName(gaebFile.fileName, index, gaebFiles.length);
      appendPositionSheet(workbook, sheetName, gaebFile);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    triggerDownload(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${fileName}_${timestamp()}.xlsx`,
    );
  }

  /** CSV alternative — single concatenated file. */
  static exportToCSV(
    gaebFiles: GAEBData[],
    options: ExcelExportOptions = {},
  ): void {
    const { fileName = 'GAEB_Export' } = options;

    let csv = '';
    gaebFiles.forEach((file, fileIndex) => {
      if (fileIndex > 0) csv += '\n\n';
      csv += `File: ${file.fileName}\n`;
      csv += `Format: ${file.header.format || ''}\n`;
      csv += `Project: ${file.header.project || ''}\n\n`;
      csv += 'Position,Type,Title,Description,Quantity,Unit\n';

      file.positions.forEach(position => {
        const row = [
          position.positionNumber || '',
          getTypeDisplayName(position.type),
          quote(position.title),
          quote(position.description || ''),
          position.quantity ?? '',
          position.unit ?? '',
        ].join(',');
        csv += row + '\n';
      });
    });

    triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `${fileName}_${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }
}

function appendSummarySheet(workbook: ExcelJS.Workbook, gaebFiles: GAEBData[]): void {
  const ws = workbook.addWorksheet('Summary');
  ws.addRow(['GAEB Produktionsliste - Übersicht']);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow([]);

  const headerRow = ws.addRow([
    'Datei',
    'Format',
    'Kategorien',
    'Artikel',
    'Gesamt Positionen',
    'Bearbeitet am',
  ]);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };

  for (const file of gaebFiles) {
    const categories = file.positions.filter(p => p.type === 'title').length;
    const items = file.positions.filter(p => p.type === 'position').length;
    ws.addRow([
      file.fileName,
      file.header.format || 'X83',
      categories,
      items,
      file.totalPositions,
      new Date(file.processedAt).toLocaleString('de-DE'),
    ]);
  }

  if (gaebFiles.length > 1) {
    ws.addRow([]);
    const totalRow = ws.addRow([
      'GESAMT',
      '',
      gaebFiles.reduce(
        (sum, f) => sum + f.positions.filter(p => p.type === 'title').length,
        0,
      ),
      gaebFiles.reduce(
        (sum, f) => sum + f.positions.filter(p => p.type === 'position').length,
        0,
      ),
      gaebFiles.reduce((sum, f) => sum + f.totalPositions, 0),
      '',
    ]);
    totalRow.font = { bold: true };
  }

  ws.columns = [
    { width: 32 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 18 },
    { width: 22 },
  ];
}

function appendPositionSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  gaebFile: GAEBData,
): void {
  const ws = workbook.addWorksheet(sheetName);

  const titleRow = ws.addRow([
    `Projekt: ${gaebFile.header.project || gaebFile.fileName}`,
  ]);
  titleRow.font = { bold: true, size: 14 };
  ws.addRow([]);

  const sectionRow = ws.addRow([
    'Werkstatt', '', '', '', '',
    'Zukauf', '', '', '', '',
  ]);
  sectionRow.font = { bold: true };
  ws.getCell(sectionRow.number, 1).fill = neutralFill('E5E7EB');
  ws.getCell(sectionRow.number, 6).fill = neutralFill('E5E7EB');

  ws.addRow([]);

  const headerRow = ws.addRow([
    'Position', 'Produkt', 'Stückzahl', 'zugeschnitten', 'gebaut',
    '', 'Produkt', 'Stückzahl', 'bestellt am', 'geliefert',
    'Bemerkungen',
  ]);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell(cell => {
    cell.fill = neutralFill('E5E7EB');
  });

  for (const position of gaebFile.positions) {
    const row = ws.addRow([
      position.positionNumber || '',
      position.title,
      position.type === 'position' ? position.quantity ?? '' : '',
      '', '', '', '', '', '', '', '',
    ]);
    if (position.type === 'title') {
      row.font = { bold: true, color: { argb: 'FF1E40AF' } };
      row.eachCell(cell => {
        cell.fill = neutralFill('DBEAFE');
      });
    }
  }

  ws.columns = [
    { width: 12 }, { width: 50 }, { width: 10 }, { width: 12 }, { width: 10 },
    { width: 3 }, { width: 40 }, { width: 10 }, { width: 12 }, { width: 10 },
    { width: 30 },
  ];
}

function neutralFill(rgb: string): ExcelJS.Fill {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${rgb}` },
  };
}

function makeSheetName(fileName: string, index: number, total: number): string {
  const cleaned = fileName.replace(/[\\/:*?"<>|[\]]/g, '_');
  if (total > 1) {
    const prefix = `File_${index + 1}_`;
    return (prefix + cleaned).slice(0, 31);
  }
  return cleaned.slice(0, 31);
}

function getTypeDisplayName(type: GAEBPosition['type']): string {
  switch (type) {
    case 'title': return 'Category';
    case 'position': return 'Position';
    case 'text': return 'Text';
    case 'calculation': return 'Calculation';
    default: return type;
  }
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
