export type ScanStatus = 'matched' | 'skipped' | 'unmatched' | 'conflict' | 'error';

export type MapItem = {
  doi?: unknown;
  title?: unknown;
  [key: string]: unknown;
};

export type LiteratureMap = {
  doiToTitle: Map<string, string>;
  size: number;
};

export type ScanRow = {
  id: string;
  path: string;
  fileName: string;
  status: ScanStatus;
  doi: string | null;
  title: string | null;
  proposedName: string | null;
  proposedPath: string | null;
  reason: string | null;
  conflictSuggestion: string | null;
};

export type RenameLogEntry = {
  oldPath: string;
  newPath: string;
  doi: string | null;
  title: string | null;
  timestamp: string;
};

