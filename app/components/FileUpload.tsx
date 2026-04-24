'use client';

import { useState, useCallback } from 'react';
import {
  SUPPORTED_GAEB_EXTENSIONS,
  useGAEBProcessor,
  type ProcessedFile,
} from '../hooks/useGAEBProcessor';

interface FileUploadProps {
  onFileProcessed?: (processed: ProcessedFile) => void;
}

interface UploadedFile {
  file: File;
  name: string;
  size: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  processed?: ProcessedFile;
  error?: string;
}

export default function FileUpload({ onFileProcessed }: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const { processFile } = useGAEBProcessor();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFile = useCallback(async (file: File) => {
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!SUPPORTED_GAEB_EXTENSIONS.includes(fileExtension)) {
      alert(
        `Please select a valid GAEB file. Supported extensions: ${SUPPORTED_GAEB_EXTENSIONS.join(', ')}`,
      );
      return;
    }

    const newFile: UploadedFile = {
      file,
      name: file.name,
      size: formatFileSize(file.size),
      status: 'uploading',
    };

    setUploadedFiles(prev => [...prev, newFile]);

    try {
      // Update status to processing
      setUploadedFiles(prev => 
        prev.map(f => f.file === file ? { ...f, status: 'processing' } : f)
      );

      const processed = await processFile(file);

      setUploadedFiles(prev =>
        prev.map(f =>
          f.file === file ? { ...f, status: 'completed', processed } : f,
        ),
      );

      if (onFileProcessed) {
        onFileProcessed(processed);
      }

    } catch (error) {
      console.error('Error processing file:', error);
      setUploadedFiles(prev => 
        prev.map(f => f.file === file ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error'
        } : f)
      );
    }
  }, [processFile, onFileProcessed]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      Array.from(e.dataTransfer.files).forEach(handleFile);
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      Array.from(e.target.files).forEach(handleFile);
    }
  }, [handleFile]);

  const removeFile = (fileToRemove: File) => {
    setUploadedFiles(prev => prev.filter(f => f.file !== fileToRemove));
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return '📤';
      case 'processing':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📄';
    }
  };

  const getStatusText = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing GAEB file...';
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={SUPPORTED_GAEB_EXTENSIONS.join(',')}
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          multiple
        />

        <div className="space-y-4">
          <div className="text-6xl">📁</div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Upload GAEB Files
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Drag and drop your GAEB files here, or click to browse
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              GAEB 90 (.d8x), GAEB 2000 (.p8x), GAEB DA XML (.x8x) — DA 81–86
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Choose Files
          </button>
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Processing Files
          </h4>
          {uploadedFiles.map((uploadedFile, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{getStatusIcon(uploadedFile.status)}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {uploadedFile.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {uploadedFile.size} • {getStatusText(uploadedFile.status)}
                  </p>
                  {uploadedFile.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {uploadedFile.error}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeFile(uploadedFile.file)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <span className="sr-only">Remove</span>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}