import { useFiles } from '../contexts/FileContext';
import { removeExt } from '../lib/path';
import './MainContent.css';

export const MainContent: React.FC = () => {
    const {
        filePaths,
        scanResults,
        selectedPath,
        setSelectedPath,
    } = useFiles();

    const showRenamedOnly = scanResults.some((r) => r.status === 'success');
    const formatStatus = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

    const getStatusColor = (status: string): string => {
        switch (status) {
            case 'matched': return 'status-matched';
            case 'skipped': return 'status-skipped';
            case 'unmatched': return 'status-unmatched';
            case 'conflict': return 'status-conflict';
            case 'error': return 'status-error';
            case 'success': return 'status-success';
            default: return '';
        }
    };

    return (
        <div className="main-content">
            <div className="content-card">
                <div className="file-list-content">
                    <table>
                        <thead>
                            <tr>
                                <th className="col-status">STATUS</th>
                                <th className="col-name">{showRenamedOnly ? 'RENAMED NAME' : 'FILE NAME'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filePaths.length === 0 && scanResults.length === 0 ? (
                                <tr>
                                    <td colSpan={2} className="empty-state-cell">
                                        <div className="file-list-empty">
                                        </div>
                                    </td>
                                </tr>
                            ) : scanResults.length > 0 ? (
                                scanResults.map((row, index) => (
                                    <tr
                                        key={index}
                                        className={`file-list-item${selectedPath === row.path ? ' selected' : ''}`}
                                        onClick={() => setSelectedPath(row.path)}
                                    >
                                        <td><span className={getStatusColor(row.status)}>{formatStatus(row.status)}</span></td>
                                        <td>
                                            <span title={row.path}>
                                                {removeExt(row.fileName)}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                filePaths.map((path, index) => (
                                    <tr
                                        key={index}
                                        className={`file-list-item${selectedPath === path ? ' selected' : ''}`}
                                        onClick={() => setSelectedPath(path)}
                                    >
                                        <td><span className="status-pending">{formatStatus('pending')}</span></td>
                                        <td><span title={path}>{removeExt(path.split(/[\\/]/).pop() || '')}</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
