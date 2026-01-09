import React, { useMemo } from 'react';
import { useFiles } from '../contexts/FileContext';
import { useMap } from '../contexts/MapContext';
import './StatusBar.css';

export const StatusBar: React.FC = () => {
    const { mapFileName } = useMap();
    const { filePaths, scanResults, isScanning, scanProgress, selectedPath } = useFiles();

    const counts = useMemo(() => {
        const acc = { conflict: 0, error: 0, matched: 0, skipped: 0, unmatched: 0, success: 0 };
        for (const row of scanResults) {
            if (row.status in acc) acc[row.status as keyof typeof acc] += 1;
        }
        return acc;
    }, [scanResults]);

    const selectedRow = useMemo(
        () => (selectedPath ? scanResults.find((r) => r.path === selectedPath) : null),
        [scanResults, selectedPath]
    );

    const firstErrorReason = useMemo(() => {
        const err = scanResults.find((r) => r.status === 'error' && r.reason);
        return err?.reason || null;
    }, [scanResults]);

    const statusText = (() => {
        if (isScanning && scanProgress.total > 0) return `Scanning ${scanProgress.current}/${scanProgress.total}`;
        if (selectedRow?.reason) return selectedRow.reason;
        if (selectedPath && filePaths.includes(selectedPath)) return 'Waiting for scan';
        if (firstErrorReason) return `Error: ${firstErrorReason}`;
        if (scanResults.length > 0) return `Scanned ${scanResults.length}`;
        return 'Idle';
    })();

    return (
        <div className="status-bar" role="status" aria-live="polite">
            <div className="sb-left">
                <span className="sb-item">
                    <span className="sb-label">Map</span>
                    <span className="sb-value">{mapFileName || 'None'}</span>
                </span>
                <span className="sb-sep" />
                <span className="sb-item">
                    <span className="sb-label">Selected</span>
                    <span className="sb-value">{filePaths.length}</span>
                </span>
                <span className="sb-sep" />
                <span className="sb-item">
                    <span className="sb-label">Status</span>
                    <span className="sb-value" title={statusText}>{statusText}</span>
                </span>
            </div>

            <div className="sb-right">
                {scanResults.length > 0 && (
                    <>
                        <span className="sb-stat green">Matched</span>
                        <span className="sb-num">{counts.matched}</span>
                        {counts.success > 0 && (
                            <>
                                <span className="sb-sep" />
                                <span className="sb-stat blue">Success</span>
                                <span className="sb-num">{counts.success}</span>
                            </>
                        )}
                        <span className="sb-sep" />
                        <span className="sb-stat gray">Skipped</span>
                        <span className="sb-num">{counts.skipped}</span>
                        <span className="sb-sep" />
                        <span className="sb-stat gray">Unmatched</span>
                        <span className="sb-num">{counts.unmatched}</span>
                        <span className="sb-sep" />
                        <span className="sb-stat orange">Conflicts</span>
                        <span className="sb-num">{counts.conflict}</span>
                        <span className="sb-sep" />
                        <span className="sb-stat red">Errors</span>
                        <span className="sb-num">{counts.error}</span>
                    </>
                )}
            </div>
        </div>
    );
};
