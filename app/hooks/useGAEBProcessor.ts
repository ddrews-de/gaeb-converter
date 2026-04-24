'use client';

import { useState, useCallback } from 'react';
import { GAEBParser, GAEBData } from '../lib/gaeb-parser';
import { readGaebFile } from '../lib/gaeb/encoding';
import { parse as parseNew } from '../lib/gaeb';
import { toViewModel } from '../lib/gaeb/legacy/toViewModel';

interface UseGAEBProcessorReturn {
  processedFiles: GAEBData[];
  isProcessing: boolean;
  error: string | null;
  processFile: (file: File) => Promise<GAEBData>;
  clearFiles: () => void;
  removeFile: (fileName: string) => void;
}

export function useGAEBProcessor(): UseGAEBProcessorReturn {
  const [processedFiles, setProcessedFiles] = useState<GAEBData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File): Promise<GAEBData> => {
    setIsProcessing(true);
    setError(null);

    try {
      // Validate file type
      const validExtensions = ['.gaeb', '.d83', '.p83', '.x83'];
      const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      
      if (!validExtensions.includes(fileExtension)) {
        throw new Error(`Unsupported file type: ${fileExtension}. Please use .gaeb, .d83, .p83, or .x83 files.`);
      }

      const { text, bytes } = await readGaebFile(file);
      const gaebData = parseThroughNewPipeline(bytes, text, file.name);
      
      // Add to processed files
      setProcessedFiles(prev => {
        // Remove any existing file with the same name
        const filtered = prev.filter(f => f.fileName !== file.name);
        return [...filtered, gaebData];
      });

      return gaebData;
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
    setProcessedFiles(prev => prev.filter(f => f.fileName !== fileName));
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

/**
 * Tries the new parse pipeline first; falls back to the legacy heuristic
 * parser for GAEB 90 / GAEB 2000 inputs until the dedicated parsers land
 * (plan steps 6 and 7). This keeps the viewer functional end-to-end
 * throughout the migration.
 */
function parseThroughNewPipeline(
  bytes: Uint8Array,
  text: string,
  fileName: string,
): GAEBData {
  try {
    const doc = parseNew(bytes, fileName);
    return toViewModel(doc, fileName, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not implemented yet/.test(msg)) {
      return GAEBParser.parse(text, fileName);
    }
    throw err;
  }
}
