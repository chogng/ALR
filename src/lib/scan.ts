import { exists, readDir, readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { extractDoisFromText, doiToSuffix, looksLikeTitleFileName, normalizeDoi } from './doi';
import { extractPdfInfo, type PdfMetadata } from './pdf';
import { fetchCrossRefMetadata, type CrossRefMetadata } from './crossref';
import { normalizeError } from './error';
import { basename, dirname, extname, joinPath, removeExt, toNativePath } from './path';
import { sanitizeFileStem } from './sanitize';
import type { LiteratureMap, ScanRow, CrossRefInfo } from './types';

function normalizeTitleSpacing(title: string): string {
  // CrossRef titles sometimes include HTML-like markup (e.g. NiTe<sub>2</sub>on ...).
  const cleaned = String(title || '')
    .replace(/\u200B/g, '') // zero-width space
    // Preserve the content of <sub>/<sup> instead of dropping it.
    .replace(/<\s*sub[^>]*>(.*?)<\s*\/\s*sub\s*>/gi, '$1')
    .replace(/<\s*sup[^>]*>(.*?)<\s*\/\s*sup\s*>/gi, '$1')
    // Drop any other tags.
    .replace(/<[^>]+>/g, '');

  // Fix common concatenations like "NiTe2with" -> "NiTe2 with" while avoiding "2D" -> "2 D".
  return cleaned
    // "NiTe2with" -> "NiTe2 with"
    .replace(/([A-Za-z])(\d+)([a-z])/g, '$1$2 $3')
    // "NiTe2on" / "WS2for" -> "NiTe2 on" / "WS2 for" (avoid "2D")
    .replace(/(\d)([a-z]{2,})/g, '$1 $2')
    // "WSe2FETs" -> "WSe2 FETs" (avoid "2D" by requiring 2+ letters)
    .replace(/(\d)([A-Z][A-Za-z]{1,})/g, '$1 $2');
}

export async function pickMapFile(): Promise<string | null> {
  const file = await open({
    title: 'Select literature_map.json',
    multiple: false,
    directory: false,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  return typeof file === 'string' ? file : null;
}

export async function pickPdfFiles(): Promise<string[]> {
  try {
    const picked = await open({
      title: 'Select PDF files',
      multiple: true,
      directory: false,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (Array.isArray(picked)) return picked.filter((p): p is string => typeof p === 'string');
    if (typeof picked === 'string') return [picked];
    return [];
  } catch (error) {
    console.error('Error opening file picker dialog:', error);
    throw error; // Re-throw to let caller handle it
  }
}

export async function pickPdfFolder(): Promise<string | null> {
  const picked = await open({
    title: 'Select a folder (PDFs will be scanned recursively)',
    multiple: false,
    directory: true,
    recursive: true,
  });
  return typeof picked === 'string' ? picked : null;
}

export async function expandPdfPaths(inputPaths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of inputPaths) {
    const fsPath = toNativePath(p);
    const maybePdf = extname(p) === '.pdf';
    if (maybePdf) {
      out.push(fsPath);
      continue;
    }
    const children = await listPdfFilesRecursively(fsPath);
    for (const c of children) out.push(c);
  }
  return [...new Set(out)];
}

async function listPdfFilesRecursively(dirPath: string): Promise<string[]> {
  const out: string[] = [];

  const walk = async (dir: string) => {
    const entries = await readDir(dir);
    for (const e of entries) {
      const name = typeof e?.name === 'string' ? e.name : '';
      if (!name) continue;
      const fullPath = joinPath(dir, name);
      if (e.isDirectory) {
        await walk(fullPath);
        continue;
      }
      if (e.isFile && extname(fullPath) === '.pdf') {
        out.push(fullPath);
      }
    }
  };

  await walk(dirPath);
  return out;
}

export async function scanPdfs(
  paths: string[],
  map: LiteratureMap | null,
  options?: { useCrossRef?: boolean; crossRefEmail?: string; concurrency?: number; pages?: number }
): Promise<ScanRow[]> {
  const seen = new Set<string>();
  const useCrossRef = options?.useCrossRef ?? true;
  const pages = options?.pages ?? 1;

  const unique: Array<{ index: number; fsPath: string }> = [];
  for (let i = 0; i < paths.length; i += 1) {
    const fsPath = toNativePath(paths[i]);
    if (!fsPath || seen.has(fsPath)) continue;
    seen.add(fsPath);
    if (extname(fsPath) !== '.pdf') continue;
    unique.push({ index: i, fsPath });
  }

  const concurrencyRaw = options?.concurrency ?? 3;
  const concurrency = Math.max(1, Math.min(16, Math.floor(concurrencyRaw)));

  const scanOne = async (fsPath: string): Promise<ScanRow> => {
    const fileName = basename(fsPath);
    const baseNoExt = removeExt(fileName);

    try {
      const fileExists = await exists(fsPath);
      if (!fileExists) {
        return {
          id: fsPath,
          path: fsPath,
          fileName,
          status: 'error',
          doi: null,
          title: null,
          proposedName: null,
          proposedPath: null,
          reason: `File not found: ${fsPath}`,
          conflictSuggestion: null,
          metadata: null,
          crossref: null,
        };
      }

      // Fast path: try to resolve title from filename DOI (map and/or CrossRef) without parsing PDF bytes.
      let doi: string | null = null;
      let title: string | null = null;
      let reason: string | null = null;
      let crossrefData: CrossRefMetadata | null = null;
      let metadata: PdfMetadata | null = null;

      const fileDoiCandidates = extractDoiCandidatesFromFileName(baseNoExt);
      if (map) {
        const fileHit = pickBestDoiCandidate(fileDoiCandidates, map);
        if (fileHit) {
          doi = fileHit;
          title = map.doiToTitle.get(fileHit) || null;
          reason = 'Matched by filename DOI';
        }
      }
      if (!title && useCrossRef && fileDoiCandidates.length > 0) {
        const normalizedFirst = normalizeDoi(fileDoiCandidates[0]);
        if (normalizedFirst) {
          crossrefData = await fetchCrossRefMetadata(normalizedFirst, options?.crossRefEmail);
          if (crossrefData?.title) {
            doi = normalizedFirst;
            title = crossrefData.title;
            reason = 'Title from CrossRef API';
          }
        }
      }

      // Slow path: parse PDF only when needed.
      let firstPagesText = '';
      if (!title) {
        const bytes = await readFile(fsPath);
        const extracted = await extractPdfInfo(bytes, pages);
        metadata = extracted.metadata;
        firstPagesText = extracted.firstPagesText;
        const resolved = await findBestDoiAndTitle(
          baseNoExt,
          map,
          firstPagesText,
          extracted.metadata,
          useCrossRef,
          options?.crossRefEmail
        );
        doi = resolved.doi;
        title = resolved.title;
        reason = resolved.reason;
        crossrefData = resolved.crossrefData;
      }

      const normalizedTitle = title ? normalizeTitleSpacing(title) : null;
      const normalizedReason =
        title && normalizedTitle && normalizedTitle !== title
          ? `${reason || 'Title found'} (normalized spacing)`
          : reason;

      const crossref: CrossRefInfo | null = crossrefData ? {
        title: crossrefData.title,
        journal: crossrefData.journal,
        publisher: crossrefData.publisher,
        year: crossrefData.year,
        authors: crossrefData.authors,
        volume: crossrefData.volume,
        issue: crossrefData.issue,
        page: crossrefData.page,
      } : null;

      if (!normalizedTitle) {
        return {
          id: fsPath,
          path: fsPath,
          fileName,
          status: 'unmatched',
          doi: doi,
          title: null,
          proposedName: null,
          proposedPath: null,
          reason: normalizedReason || 'No title found (no DOI match and no PDF metadata title)',
          conflictSuggestion: null,
          metadata,
          crossref,
        };
      }

      if (looksLikeTitleFileName(baseNoExt, normalizedTitle)) {
        return {
          id: fsPath,
          path: fsPath,
          fileName,
          status: 'skipped',
          doi,
          title: normalizedTitle,
          proposedName: null,
          proposedPath: null,
          reason: 'Already named like title',
          conflictSuggestion: null,
          metadata,
          crossref,
        };
      }

      const stem = sanitizeFileStem(normalizedTitle);
      const proposedName = `${stem}.pdf`;
      const proposedPath = joinPath(dirname(fsPath), proposedName);
      const conflict = await exists(proposedPath);

      if (!conflict) {
        return {
          id: fsPath,
          path: fsPath,
          fileName,
          status: 'matched',
          doi,
          title: normalizedTitle,
          proposedName,
          proposedPath,
          reason: normalizedReason,
          conflictSuggestion: null,
          metadata,
          crossref,
        };
      }

      const suggestion = await buildConflictSuggestion(dirname(fsPath), normalizedTitle, doi);
      return {
        id: fsPath,
        path: fsPath,
        fileName,
        status: 'conflict',
        doi,
        title: normalizedTitle,
        proposedName,
        proposedPath,
        reason: 'Target file already exists',
        conflictSuggestion: suggestion,
        metadata,
        crossref,
      };
    } catch (err) {
      return {
        id: fsPath,
        path: fsPath,
        fileName,
        status: 'error',
        doi: null,
        title: null,
        proposedName: null,
        proposedPath: null,
        reason: normalizeError(err),
        conflictSuggestion: null,
        metadata: null,
        crossref: null,
      };
    }
  };

  const results = new Array<{ index: number; row: ScanRow }>(unique.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const my = cursor;
      cursor += 1;
      if (my >= unique.length) return;
      const { index, fsPath } = unique[my];
      const row = await scanOne(fsPath);
      results[my] = { index, row };
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, unique.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Keep output stable (input order).
  results.sort((a, b) => a.index - b.index);
  return results.map((r) => r.row);
}

async function findBestDoiAndTitle(
  baseNoExt: string,
  map: LiteratureMap | null,
  pdfText: string,
  metadata: PdfMetadata,
  useCrossRef: boolean = true,
  crossRefEmail?: string,
): Promise<{ doi: string | null; title: string | null; reason: string | null; crossrefData: CrossRefMetadata | null }> {
  // 1) filename-based DOI
  if (map) {
    const fileDoiCandidates = extractDoiCandidatesFromFileName(baseNoExt);
    const fileHit = pickBestDoiCandidate(fileDoiCandidates, map);
    if (fileHit) {
      return {
        doi: fileHit,
        title: map.doiToTitle.get(fileHit) || null,
        reason: 'Matched by filename DOI',
        crossrefData: null
      };
    }
  }

  // 2) PDF text-based DOI (first 2 pages)
  const candidates = extractDoisFromText(pdfText);

  if (map) {
    const hit = pickBestDoiCandidate(candidates, map);
    if (hit) {
      return {
        doi: hit,
        title: map.doiToTitle.get(hit) || null,
        reason: 'Matched by PDF text DOI',
        crossrefData: null
      };
    }
  }

  const normalizedFirst = candidates.length ? normalizeDoi(candidates[0]) : null;

  // 3) Try CrossRef API for title lookup (when no map or DOI not in map)
  if (useCrossRef && normalizedFirst) {
    const crossrefData = await fetchCrossRefMetadata(normalizedFirst, crossRefEmail);
    if (crossrefData?.title) {
      return {
        doi: normalizedFirst,
        title: crossrefData.title,
        reason: 'Title from CrossRef API',
        crossrefData
      };
    }
  }

  // 4) Fallback to PDF metadata title if no DOI match and no CrossRef result
  if (metadata.title) {
    return {
      doi: normalizedFirst,
      title: metadata.title,
      reason: 'Title from PDF metadata',
      crossrefData: null
    };
  }

  return { doi: normalizedFirst, title: null, reason: 'No title source available', crossrefData: null };
}

function extractDoiCandidatesFromFileName(baseNoExt: string): string[] {
  const direct = extractDoisFromText(baseNoExt);
  if (direct.length) return direct;
  const swapped = extractDoisFromText(baseNoExt.replace(/_/g, '/'));
  return swapped;
}

function pickBestDoiCandidate(candidates: string[], map: LiteratureMap): string | null {
  for (const c of candidates) {
    const doi = normalizeDoi(c);
    if (!doi) continue;
    if (map.doiToTitle.has(doi)) return doi;
  }
  return null;
}

async function buildConflictSuggestion(dir: string, title: string, doi: string | null): Promise<string> {
  const stem = sanitizeFileStem(title);

  // If we have a DOI, use it as suffix
  if (doi) {
    const suffixRaw = doiToSuffix(doi) || doi;
    const suffix = sanitizeFileStem(suffixRaw.replace(/\//g, '_'), { maxLen: 80 });
    const base = `${stem} - ${suffix}`;

    const primary = `${base}.pdf`;
    const primaryPath = joinPath(dir, primary);
    if (!(await exists(primaryPath))) return primary;

    for (let i = 2; i < 200; i += 1) {
      const candidate = `${base} (${i}).pdf`;
      if (!(await exists(joinPath(dir, candidate)))) return candidate;
    }

    return `${base} (conflict).pdf`;
  }

  // No DOI, just use incremental numbering
  const primary = `${stem}.pdf`;
  const primaryPath = joinPath(dir, primary);
  if (!(await exists(primaryPath))) return primary;

  for (let i = 2; i < 200; i += 1) {
    const candidate = `${stem} (${i}).pdf`;
    if (!(await exists(joinPath(dir, candidate)))) return candidate;
  }

  return `${stem} (conflict).pdf`;
}
