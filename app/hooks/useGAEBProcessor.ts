'use client';

import { useState, useCallback } from 'react';
import type { GAEBData } from '../lib/gaeb-parser';
import type { GaebDocument } from '../lib/gaeb';
import { readGaebFile } from '../lib/gaeb/encoding';
import { toViewModel } from '../lib/gaeb/legacy/toViewModel';
import { runConvert } from '../lib/gaeb/worker/run';

/**
 * Full set of GAEB extensions supported end-to-end (parse + serialize).
 * Covers GAEB 90 (.d8x), GAEB 2000 (.p8x), and GAEB DA XML (.x8x) for all
 * DA numbers 81 – 86, plus the generic .gaeb extension.
 */
export const SUPPORTED_GAEB_EXTENSIONS: readonly string[] = [
  '.gaeb',
  '.d81', '.d82', '.d83', '.d84', '.d85', '.d86',
  '.p81', '.p82', '.p83', '.p84', '.p85', '.p86',
  '.x81', '.x82', '.x83', '.x84', '.x85', '.x86',
];

/**
 * Single uploaded file after the full parse + convert pipeline. `viewModel`
 * feeds the legacy GAEBViewer and ExcelExporter; the rest is what the
 * ConvertDownload component needs to offer the GAEB DA XML 3.3 output.
 */
export interface ProcessedFile {
  viewModel: GAEBData;
  doc: GaebDocument;
  xml: string;
  targetFileName: string;
}

interface UseGAEBProcessorReturn {
  processedFiles: ProcessedFile[];
  isProcessing: boolean;
  error: string | null;
  processFile: (file: File) => Promise<ProcessedFile>;
  clearFiles: () => void;
  removeFile: (fileName: string) => void;
}

function hasSupportedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  return SUPPORTED_GAEB_EXTENSIONS.includes(lower.slice(dot));
}

export function useGAEBProcessor(): UseGAEBProcessorReturn {
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File): Promise<ProcessedFile> => {
    setIsProcessing(true);
    setError(null);

    try {
      if (!hasSupportedExtension(file.name)) {
        throw new Error(
          `Unsupported file type: ${file.name}. Expected one of ${SUPPORTED_GAEB_EXTENSIONS.join(', ')}.`,
        );
      }

      const { text, bytes } = await readGaebFile(file);
      const { doc, xml, targetFileName } = await runConvert(bytes, file.name);
      const viewModel = toViewModel(doc, file.name, text);
      const processed: ProcessedFile = { viewModel, doc, xml, targetFileName };

      setProcessedFiles(prev => {
        const filtered = prev.filter(f => f.viewModel.fileName !== file.name);
        return [...filtered, processed];
      });

      return processed;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clearFiles = useCallback(() => {
    setProcessedFiles([]);
    setError(null);
  }, []);

  const removeFile = useCallback((fileName: string) => {
    setProcessedFiles(prev => prev.filter(f => f.viewModel.fileName !== fileName));
  }, []);

  return {
    processedFiles,
    isProcessing,
    error,
    processFile,
    clearFiles,
    removeFile,
  };
}
