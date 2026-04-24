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
  // Revoke on the next frame so the browser has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function severityColor(s: ConversionWarning['severity']): string {
  if (s === 'error') return 'text-red-600 dark:text-red-400';
  if (s === 'warn') return 'text-amber-600 dark:text-amber-400';
  return 'text-gray-500 dark:text-gray-400';
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
          const warningCount = file.doc.warnings.length;

          return (
            <div
              key={file.viewModel.fileName}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
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
                  {warningCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {warningCount} Warning{warningCount === 1 ? '' : 's'}
                    </span>
                  )}
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
          );
        })}
      </div>

      {files.some(f => f.doc.warnings.length > 0) && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
            Warnungen der Konvertierung anzeigen
          </summary>
          <div className="mt-3 space-y-3">
            {files
              .filter(f => f.doc.warnings.length > 0)
              .map(file => (
                <div
                  key={file.viewModel.fileName}
                  className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {file.viewModel.fileName}
                  </p>
                  <ul className="space-y-1 text-xs">
                    {file.doc.warnings.map((w, i) => (
                      <li key={i} className={severityColor(w.severity)}>
                        [{w.code}] {w.message}
                        {w.line !== undefined ? ` (line ${w.line})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </details>
      )}
    </section>
  );
}
