export type ScanStatus = 'matched' | 'skipped' | 'unmatched' | 'conflict' | 'error' | 'success';

export type MapItem = {
  doi?: unknown;
  title?: unknown;
  [key: string]: unknown;
};

export type LiteratureMap = {
  doiToTitle: Map<string, string>;
  size: number;
};

export type PdfMetadata = {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modDate: string | null;
};

export type CrossRefInfo = {
  title: string | null;
  journal: string | null;
  publisher: string | null;
  year: number | null;
  authors: string[] | null;
  volume: string | null;
  issue: string | null;
  page: string | null;
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
  metadata: PdfMetadata | null;
  crossref: CrossRefInfo | null;
};

export type RenameLogEntry = {
  oldPath: string;
  newPath: string;
  doi: string | null;
  title: string | null;
  timestamp: string;
  status: 'ok' | 'failed';
  error: string | null;
};
