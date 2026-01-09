/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { ScanRow } from '../lib/types';
import type { RenameLogEntry } from '../lib/types';
import { pathKey, toNativePath } from '../lib/path';

interface FileContextType {
    // Raw file paths (before scanning)
    filePaths: string[];
    addFiles: (paths: string[]) => void;
    clearFiles: () => void;
    removeFile: (path: string) => void;

    // Scanned results
    scanResults: ScanRow[];
    setScanResults: (results: ScanRow[]) => void;
    clearScanResults: () => void;

    // Scanning state
    isScanning: boolean;
    setIsScanning: (scanning: boolean) => void;
    scanProgress: { current: number; total: number };
    setScanProgress: (progress: { current: number; total: number }) => void;

    // UI selection
    selectedPath: string | null;
    setSelectedPath: (path: string | null) => void;

    // Rename history (last run)
    lastRenameLog: RenameLogEntry[];
    setLastRenameLog: (entries: RenameLogEntry[]) => void;

    // Update helpers
    replaceFilePath: (oldPath: string, newPath: string) => void;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

export const FileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [filePaths, setFilePaths] = useState<string[]>([]);
    const [scanResults, setScanResults] = useState<ScanRow[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [lastRenameLog, setLastRenameLog] = useState<RenameLogEntry[]>([]);

    const addFiles = (paths: string[]) => {
        const normalized = paths.map(toNativePath);
        console.log(`Adding ${normalized.length} file(s) to context:`, normalized);
        setFilePaths(prev => {
            const existingKeys = new Set(prev.map(pathKey));
            const uniqueNewPaths = normalized.filter(p => !existingKeys.has(pathKey(p)));
            console.log(`Adding ${uniqueNewPaths.length} unique new file(s) (${normalized.length - uniqueNewPaths.length} duplicates filtered out)`);
            return [...prev, ...uniqueNewPaths];
        });
    };

    const replaceFilePath = (oldPath: string, newPath: string) => {
        const oldFs = toNativePath(oldPath);
        const nextFs = toNativePath(newPath);
        const oldKey = pathKey(oldFs);
        setFilePaths((prev) => prev.map((p) => (pathKey(p) === oldKey ? nextFs : p)));
        setSelectedPath((prev) => (prev && pathKey(prev) === oldKey ? nextFs : prev));
    };

    const clearFiles = () => {
        console.log('Clearing all files');
        setFilePaths([]);
        setScanResults([]);
        setSelectedPath(null);
        setLastRenameLog([]);
    };

    const removeFile = (path: string) => {
        const key = pathKey(path);
        setFilePaths(prev => prev.filter(p => pathKey(p) !== key));
        setScanResults(prev => prev.filter(r => pathKey(r.path) !== key));
        setSelectedPath((prev) => (prev && pathKey(prev) === key ? null : prev));
    };

    const clearScanResults = () => {
        setScanResults([]);
        setSelectedPath(null);
    };

    return (
        <FileContext.Provider value={{
            filePaths,
            addFiles,
            clearFiles,
            removeFile,
            scanResults,
            setScanResults,
            clearScanResults,
            isScanning,
            setIsScanning,
            scanProgress,
            setScanProgress,
            selectedPath,
            setSelectedPath,
            lastRenameLog,
            setLastRenameLog,
            replaceFilePath,
        }}>
            {children}
        </FileContext.Provider>
    );
};

export const useFiles = () => {
    const context = useContext(FileContext);
    if (context === undefined) {
        throw new Error('useFiles must be used within a FileProvider');
    }
    return context;
};
