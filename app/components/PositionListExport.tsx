'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import type { ProcessedFile } from '../hooks/useGAEBProcessor';
import {
  buildPositionListCsv,
  buildPositionListWorkbook,
  docToRows,
} from '../lib/gaeb';

interface PositionListExportProps {
  files: ProcessedFile[];
}

type OutputFormat = 'xlsx' | 'csv';

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function PositionListExport({ files }: PositionListExportProps) {
  const [format, setFormat] = useState<OutputFormat>('xlsx');
  const [includeLongText, setIncludeLongText] = useState(false);

  if (files.length === 0) return null;

  const entries = files.map(f => ({ fileName: f.viewModel.fileName, doc: f.doc }));
  const totalItems = entries.reduce(
    (sum, e) => sum + docToRows(e.doc).length,
    0,
  );
  const itemsWithPriceComponents = entries.reduce((sum, e) => {
    const rows = docToRows(e.doc);
    return (
      sum +
      rows.filter(
        r =>
          r['Lohn-Anteil'] ||
          r['Stoff-Anteil'] ||
          r['Geräte-Anteil'] ||
          r['Sonstige-Anteil'],
      ).length
    );
  }, 0);

  const handleExport = () => {
    if (format === 'xlsx') {
      const wb = buildPositionListWorkbook(entries, { includeLongText });
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      downloadBlob(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `GAEB_Positionsliste_${timestamp()}.xlsx`,
      );
    } else {
      // CSV is single-sheet; stitch multiple files with a separator row.
      const parts = entries.map((entry, index) => {
        const csv = buildPositionListCsv(entry, { includeLongText });
        return index === 0 ? csv : `\n${entry.fileName}\n${csv}`;
      });
      downloadBlob(
        new Blob([parts.join('')], { type: 'text/csv;charset=utf-8' }),
        `GAEB_Positionsliste_${timestamp()}.csv`,
      );
    }
  };

  return (
    <section className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Positionsliste (mit Preisanteilen)
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Excel/CSV mit Pos.-Nr., Kurztext, Menge, EP/GP und den Preisanteilen
            Lohn/Stoff/Gerät/Sonstiges — direkt aus dem Domain-Modell.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {files.length} Datei{files.length === 1 ? '' : 'en'} · {totalItems}{' '}
            Positionen{' '}
            {itemsWithPriceComponents > 0 && (
              <span className="text-green-700 dark:text-green-400">
                (davon {itemsWithPriceComponents} mit Preisanteilen)
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={format}
            onChange={e => setFormat(e.target.value as OutputFormat)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
          >
            Positionsliste exportieren
          </button>
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={includeLongText}
          onChange={e => setIncludeLongText(e.target.checked)}
          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        Langtext als zusätzliche Spalte aufnehmen
      </label>
    </section>
  );
}
