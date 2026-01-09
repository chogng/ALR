import React, { useState, useEffect, useRef } from 'react';
import { rename } from '@tauri-apps/plugin-fs';
import { pickMapFile, pickPdfFiles, pickPdfFolder, scanPdfs, expandPdfPaths } from '../lib/scan';
import { writeRenameLog } from '../lib/log';
import { useMap } from '../contexts/MapContext';
import { useFiles } from '../contexts/FileContext';
import type { RenameLogEntry, ScanRow } from '../lib/types';
import { basename, toNativePath } from '../lib/path';
import './TopBar.css';

export const TopBar: React.FC = () => {
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const { loadMap, clearMap, currentMap } = useMap();
    const {
        addFiles,
        clearFiles,
        replaceFilePath,
        filePaths,
        scanResults,
        setScanResults,
        clearScanResults,
        isScanning,
        setIsScanning,
        setScanProgress,
        lastRenameLog,
        setLastRenameLog,
    } = useFiles();

    const renameableCount = scanResults.filter((r) => r.status === 'matched' && r.proposedPath).length;
    const undoableCount = lastRenameLog.filter((e) => e.status === 'ok').length;

    const hw = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
    const defaultConcurrency = hw && Number.isFinite(hw) ? Math.max(1, Math.min(6, Math.floor(hw / 2))) : 3;

    const runWithConcurrency = async <TItem, TResult>(
        items: TItem[],
        concurrency: number,
        fn: (item: TItem) => Promise<TResult>
    ): Promise<TResult[]> => {
        const limit = Math.max(1, Math.min(16, Math.floor(concurrency)));
        const results: TResult[] = new Array(items.length);
        let cursor = 0;

        const worker = async () => {
            while (true) {
                const my = cursor;
                cursor += 1;
                if (my >= items.length) return;
                results[my] = await fn(items[my]);
            }
        };

        const workers: Promise<void>[] = [];
        for (let i = 0; i < Math.min(limit, items.length); i += 1) {
            workers.push(worker());
        }
        await Promise.all(workers);
        return results;
    };

    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setActiveMenu(null);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const closeMenu = () => setActiveMenu(null);

    const handleSelectMapJson = async () => {
        closeMenu();
        const file = await pickMapFile();
        if (!file) return;

        try {
            await loadMap(file);
            console.log('Map loaded successfully:', file);
        } catch (error) {
            console.error('Failed to load map:', error);
        }
    };

    const handleAddPdfs = async () => {
        closeMenu();
        try {
            const files = await pickPdfFiles();
            if (files.length > 0) addFiles(files);
        } catch (error) {
            console.error('Error picking PDF files:', error);
            alert(`Failed to open file picker: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleAddFolder = async () => {
        closeMenu();
        const folder = await pickPdfFolder();
        if (folder) {
            addFiles([folder]);
        }
    };

    const handleScan = async () => {
        if (filePaths.length === 0) {
            alert('Please add PDF files first');
            return;
        }

        try {
            setIsScanning(true);
            clearScanResults();

            const expandedPaths = await expandPdfPaths(filePaths);
            setScanProgress({ current: 0, total: expandedPaths.length });

            const results = await scanPdfs(expandedPaths, currentMap, { useCrossRef: true, concurrency: defaultConcurrency, pages: 1 });
            setScanResults(results);
            setScanProgress({ current: results.length, total: results.length });
        } catch (error) {
            console.error('Scan failed:', error);
            alert(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsScanning(false);
        }
    };

    const handleRename = async () => {
        const toRename = scanResults.filter((r) => r.status === 'matched' && r.proposedPath);

        if (toRename.length === 0) {
            alert('No files to rename. Run Scan first and ensure there are matched files.');
            return;
        }

        const confirmed = confirm(
            `Rename ${toRename.length} file(s)?\n\nThis will rename the files to their new titles.`
        );
        if (!confirmed) return;

        const nowIso = new Date().toISOString();
        const logEntries = await runWithConcurrency(toRename, defaultConcurrency, async (row): Promise<RenameLogEntry> => {
            const src = toNativePath(row.path);
            const dst = toNativePath(row.proposedPath || '');
            try {
                await rename(src, dst);
                return {
                    oldPath: src,
                    newPath: dst,
                    doi: row.doi,
                    title: row.title,
                    timestamp: nowIso,
                    status: 'ok',
                    error: null,
                };
            } catch (error) {
                console.error(`Failed to rename ${row.path}:`, error);
                return {
                    oldPath: src,
                    newPath: dst,
                    doi: row.doi,
                    title: row.title,
                    timestamp: nowIso,
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        });

        let successCount = 0;
        let failCount = 0;
        for (const e of logEntries) {
            if (e.status === 'ok') successCount += 1;
            else failCount += 1;
        }

        try {
            const logPath = await writeRenameLog(logEntries);
            console.log('Rename log written to:', logPath);
        } catch (error) {
            console.error('Failed to write rename log:', error);
        }

        setLastRenameLog(logEntries);

        // Keep UI state; update in-memory paths so the list doesn't look "refreshed".
        for (const entry of logEntries) {
            if (entry.status !== 'ok') continue;
            replaceFilePath(entry.oldPath, entry.newPath);
        }

        const byOldPath = new Map<string, RenameLogEntry>();
        for (const e of logEntries) byOldPath.set(e.oldPath, e);

        const renamedScanResults: ScanRow[] = scanResults.map((row): ScanRow => {
            const rowPath = toNativePath(row.path);
            const entry = byOldPath.get(rowPath);
            if (!entry) return row;
            if (entry.status === 'ok') {
                return {
                    ...row,
                    id: entry.newPath,
                    path: entry.newPath,
                    fileName: basename(entry.newPath),
                    status: 'success',
                    proposedName: null,
                    proposedPath: null,
                    reason: 'Renamed successfully',
                };
            }
            return {
                ...row,
                status: 'error',
                proposedName: null,
                proposedPath: null,
                reason: entry.error || 'Rename failed',
            };
        });
        setScanResults(renamedScanResults);

        alert(`Rename complete!\n\nSuccess: ${successCount}\nFailed: ${failCount}`);
    };

    const handleUndo = async () => {
        const ok = lastRenameLog.filter((e) => e.status === 'ok');
        if (ok.length === 0) {
            alert('Nothing to undo.');
            return;
        }

        const confirmed = confirm(`Undo last rename run?\n\nThis will restore ${ok.length} file(s) to their original names.`);
        if (!confirmed) return;

        const nowIso = new Date().toISOString();
        const undoLog = await runWithConcurrency(ok, defaultConcurrency, async (entry): Promise<RenameLogEntry> => {
            const src = toNativePath(entry.newPath);
            const dst = toNativePath(entry.oldPath);
            try {
                await rename(src, dst);
                return {
                    oldPath: src,
                    newPath: dst,
                    doi: entry.doi,
                    title: entry.title,
                    timestamp: nowIso,
                    status: 'ok',
                    error: null,
                };
            } catch (error) {
                return {
                    oldPath: src,
                    newPath: dst,
                    doi: entry.doi,
                    title: entry.title,
                    timestamp: nowIso,
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        });

        let successCount = 0;
        let failCount = 0;
        for (const e of undoLog) {
            if (e.status === 'ok') successCount += 1;
            else failCount += 1;
        }

        setLastRenameLog([]);

        for (const entry of undoLog) {
            if (entry.status !== 'ok') continue;
            // undoLog: oldPath = renamed path (source), newPath = original path (dest)
            replaceFilePath(entry.oldPath, entry.newPath);
        }

        const byRenamedPath = new Map<string, RenameLogEntry>();
        for (const e of undoLog) byRenamedPath.set(e.oldPath, e);

        const undoneScanResults: ScanRow[] = scanResults.map((row): ScanRow => {
            const rowPath = toNativePath(row.path);
            const entry = byRenamedPath.get(rowPath);
            if (!entry) return row;
            if (entry.status === 'ok') {
                return {
                    ...row,
                    id: entry.newPath,
                    path: entry.newPath,
                    fileName: basename(entry.newPath),
                    status: 'matched',
                    reason: 'Undo rename',
                };
            }
            return row;
        });
        setScanResults(undoneScanResults);

        alert(`Undo complete!\n\nSuccess: ${successCount}\nFailed: ${failCount}`);
    };

    return (
        <div className="top-bar">
            <div className="menu-bar" ref={menuRef}>
                <div className="menu-item-container" onMouseLeave={() => setActiveMenu(null)}>
                    <div
                        className={`menu-label ${activeMenu === 'select' ? 'active' : ''}`}
                        onMouseEnter={() => setActiveMenu('select')}
                    >
                        Add
                    </div>
                    {activeMenu === 'select' && (
                        <div className="dropdown-menu">
                            <div className="dropdown-item" onClick={handleSelectMapJson}>
                                Add map JSON
                            </div>
                            <div className="dropdown-item" onClick={handleAddPdfs}>
                                Add PDFs
                            </div>
                            <div className="dropdown-item" onClick={handleAddFolder}>
                                Add folder
                            </div>
                        </div>
                    )}
                </div>

                <div className="menu-item-container" onMouseLeave={() => setActiveMenu(null)}>
                    <div
                        className={`menu-label ${activeMenu === 'clear' ? 'active' : ''}`}
                        onMouseEnter={() => setActiveMenu('clear')}
                    >
                        Clear
                    </div>
                    {activeMenu === 'clear' && (
                        <div className="dropdown-menu">
                            <div className="dropdown-item" onClick={() => { closeMenu(); clearMap(); }}>
                                Clear map JSON
                            </div>
                            <div className="dropdown-item" onClick={() => { closeMenu(); clearFiles(); }}>
                                Clear PDFs
                            </div>
                        </div>
                    )}
                </div>

                <div className="menu-item-container">
                    <button
                        className="undo-btn"
                        onClick={handleScan}
                        disabled={isScanning || filePaths.length === 0}
                        title={filePaths.length === 0 ? 'Add PDFs first' : 'Scan PDFs'}
                    >
                        {isScanning ? 'Scanning...' : 'Scan'}
                    </button>
                </div>

                <div className="menu-item-container">
                    <button
                        className="undo-btn"
                        onClick={handleRename}
                        disabled={renameableCount === 0}
                        title={
                            renameableCount === 0 ? 'No matched PDFs' : 'Rename matched PDFs'
                        }
                    >
                        Rename
                    </button>
                </div>

                <div className="menu-item-container">
                    <button
                        className="undo-btn"
                        onClick={handleUndo}
                        disabled={undoableCount === 0}
                        title={
                            undoableCount === 0 ? 'No renamed PDFs' : 'Undo last rename run'
                        }
                    >
                        Undo
                    </button>
                </div>
            </div>
        </div>
    );
};
