'use client';

import { useMemo, useState } from 'react';
import FileUpload from './components/FileUpload';
import GAEBViewer from './components/GAEBViewer';
import ExportComponent from './components/ExportComponent';
import ConvertDownload from './components/ConvertDownload';
import PositionListExport from './components/PositionListExport';
import type { ProcessedFile } from './hooks/useGAEBProcessor';

export default function Home() {
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);

  const handleFileProcessed = (processed: ProcessedFile) => {
    setProcessedFiles(prev => {
      const filtered = prev.filter(
        f => f.viewModel.fileName !== processed.viewModel.fileName,
      );
      return [...filtered, processed];
    });
  };

  const clearFiles = () => {
    setProcessedFiles([]);
  };

  const viewModels = useMemo(
    () => processedFiles.map(f => f.viewModel),
    [processedFiles],
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black font-sans">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            GAEB Converter
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Konvertiert GAEB 90 (.d8x) und GAEB 2000 (.p8x) lokal im Browser nach
            GAEB DA XML 3.3 (.x8x). Unterstützt DA 81–86.
          </p>
        </header>

        <div className="mb-8">
          <FileUpload onFileProcessed={handleFileProcessed} />
        </div>

        {processedFiles.length > 0 && (
          <div className="text-center mb-8">
            <button
              onClick={clearFiles}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Alle Dateien entfernen
            </button>
          </div>
        )}

        <ConvertDownload files={processedFiles} />
        <PositionListExport files={processedFiles} />
        <GAEBViewer data={viewModels} />
        <ExportComponent data={viewModels} />

        <footer className="mt-16 text-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            GAEB Converter – lokale Verarbeitung im Browser
          </div>
        </footer>
      </div>
    </div>
  );
}
