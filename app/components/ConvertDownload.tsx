'use client';

import type { ProcessedFile } from '../hooks/useGAEBProcessor';
import type { ConversionWarning, Generation } from '../lib/gaeb';

interface ConvertDownloadProps {
  files: ProcessedFile[];
}

const GENERATION_LABEL: Record<Generation, string> = {
  gaeb90: 'GAEB 90',
  gaeb2000: 'GAEB 2000',
  gaebXml: 'GAEB DA XML',
};

function sourceFormatTag(file: ProcessedFile): string {
  const letter =
    file.doc.generation === 'gaeb90'
      ? 'D'
      : file.doc.generation === 'gaeb2000'
      ? 'P'
      : 'X';
  return `${letter}${file.doc.da}`;
}

function targetFormatTag(file: ProcessedFile): string {
  return `X${file.doc.da}`;
}

function downloadXml(file: ProcessedFile): void {
  const blob = new Blob([file.xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.targetFileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

type SeverityCounts = Record<ConversionWarning['severity'], number>;

function countBySeverity(warnings: ConversionWarning[]): SeverityCounts {
  const out: SeverityCounts = { error: 0, warn: 0, info: 0 };
  for (const w of warnings) out[w.severity]++;
  return out;
}

function severityRowClass(s: ConversionWarning['severity']): string {
  switch (s) {
    case 'error':
      return 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500';
    case 'warn':
      return 'text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500';
    default:
      return 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 border-l-4 border-gray-300 dark:border-gray-600';
  }
}

function severityIcon(s: ConversionWarning['severity']): string {
  if (s === 'error') return '✕';
  if (s === 'warn') return '!';
  return 'i';
}

function severityBadgeClass(
  s: ConversionWarning['severity'],
  active: boolean,
): string {
  if (!active) return 'hidden';
  switch (s) {
    case 'error':
      return 'px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
    case 'warn':
      return 'px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
    default:
      return 'px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300';
  }
}

export default function ConvertDownload({ files }: ConvertDownloadProps) {
  if (files.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Konvertierung nach GAEB DA XML 3.3
      </h2>
      <div className="space-y-3">
        {files.map(file => {
          const srcTag = sourceFormatTag(file);
          const dstTag = targetFormatTag(file);
          const srcLabel = GENERATION_LABEL[file.doc.generation];
          const counts = countBySeverity(file.doc.warnings);
          const hasErrors = counts.error > 0;
          const hasAny = file.doc.warnings.length > 0;

          return (
            <article
              key={file.viewModel.fileName}
              className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {file.viewModel.fileName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                      {srcLabel} · {srcTag}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                      GAEB DA XML 3.3 · {dstTag}
                    </span>
                    {file.doc.sourceEncoding && (
                      <span className="text-gray-500 dark:text-gray-400">
                        Encoding: {file.doc.sourceEncoding}
                      </span>
                    )}
                    <span className={severityBadgeClass('error', counts.error > 0)}>
                      {counts.error} Fehler
                    </span>
                    <span className={severityBadgeClass('warn', counts.warn > 0)}>
                      {counts.warn} Warnung{counts.warn === 1 ? '' : 'en'}
                    </span>
                    <span className={severityBadgeClass('info', counts.info > 0)}>
                      {counts.info} Hinweis{counts.info === 1 ? '' : 'e'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Zieldatei: <code>{file.targetFileName}</code>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => downloadXml(file)}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Als GAEB DA XML 3.3 herunterladen
                </button>
              </div>

              {hasAny && (
                <details className="mt-3" open={hasErrors}>
                  <summary className="cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                    {file.doc.warnings.length} Meldung
                    {file.doc.warnings.length === 1 ? '' : 'en'} anzeigen
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {file.doc.warnings.map((w, i) => (
                      <li
                        key={i}
                        className={`px-3 py-1.5 rounded ${severityRowClass(w.severity)}`}
                      >
                        <span className="font-mono font-bold mr-2">
                          {severityIcon(w.severity)}
                        </span>
                        <span className="font-mono opacity-70">[{w.code}]</span>{' '}
                        {w.message}
                        {w.line !== undefined && (
                          <span className="opacity-60"> (Zeile {w.line})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
