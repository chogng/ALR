import { exists, readDir, readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { extractDoisFromText, doiToSuffix, looksLikeTitleFileName, normalizeDoi } from './doi';
import { extractFirstPagesText } from './pdf';
import { basename, dirname, extname, joinPath, removeExt } from './path';
import { sanitizeFileStem } from './sanitize';
import type { LiteratureMap, ScanRow } from './types';

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
  const picked = await open({
    title: 'Select PDF files',
    multiple: true,
    directory: false,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (Array.isArray(picked)) return picked.filter((p): p is string => typeof p === 'string');
  if (typeof picked === 'string') return [picked];
  return [];
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
    const maybePdf = extname(p) === '.pdf';
    if (maybePdf) {
      out.push(p);
      continue;
    }
    const children = await listPdfFilesRecursively(p);
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

export async function scanPdfs(paths: string[], map: LiteratureMap): Promise<ScanRow[]> {
  const rows: ScanRow[] = [];
  const seen = new Set<string>();

  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (extname(p) !== '.pdf') continue;

    const fileName = basename(p);
    const baseNoExt = removeExt(fileName);

    try {
      const { doi, title, reason } = await findBestDoiAndTitle(p, baseNoExt, map);
      if (!doi || !title) {
        rows.push({
          id: p,
          path: p,
          fileName,
          status: 'unmatched',
          doi: doi,
          title: title,
          proposedName: null,
          proposedPath: null,
          reason: reason || 'No matching DOI found in mapping',
          conflictSuggestion: null,
        });
        continue;
      }

      if (looksLikeTitleFileName(baseNoExt, title)) {
        rows.push({
          id: p,
          path: p,
          fileName,
          status: 'skipped',
          doi,
          title,
          proposedName: null,
          proposedPath: null,
          reason: 'Already named like title',
          conflictSuggestion: null,
        });
        continue;
      }

      const stem = sanitizeFileStem(title);
      const proposedName = `${stem}.pdf`;
      const proposedPath = joinPath(dirname(p), proposedName);
      const conflict = await exists(proposedPath);

      if (!conflict) {
        rows.push({
          id: p,
          path: p,
          fileName,
          status: 'matched',
          doi,
          title,
          proposedName,
          proposedPath,
          reason: null,
          conflictSuggestion: null,
        });
        continue;
      }

      const suggestion = await buildConflictSuggestion(dirname(p), title, doi);
      rows.push({
        id: p,
        path: p,
        fileName,
        status: 'conflict',
        doi,
        title,
        proposedName,
        proposedPath,
        reason: 'Target file already exists',
        conflictSuggestion: suggestion,
      });
    } catch (err) {
      rows.push({
        id: p,
        path: p,
        fileName,
        status: 'error',
        doi: null,
        title: null,
        proposedName: null,
        proposedPath: null,
        reason: (err as any)?.message || String(err),
        conflictSuggestion: null,
      });
    }
  }

  return rows;
}

async function findBestDoiAndTitle(
  filePath: string,
  baseNoExt: string,
  map: LiteratureMap,
): Promise<{ doi: string | null; title: string | null; reason: string | null }> {
  // 1) filename-based DOI
  const fileDoiCandidates = extractDoiCandidatesFromFileName(baseNoExt);
  const fileHit = pickBestDoiCandidate(fileDoiCandidates, map);
  if (fileHit) return { doi: fileHit, title: map.doiToTitle.get(fileHit) || null, reason: 'Matched by filename' };

  // 2) PDF text-based DOI (first 2 pages)
  const bytes = await readFile(filePath);
  const text = await extractFirstPagesText(bytes, 2);
  const candidates = extractDoisFromText(text);
  const hit = pickBestDoiCandidate(candidates, map);
  if (hit) return { doi: hit, title: map.doiToTitle.get(hit) || null, reason: 'Matched by PDF text' };

  const normalizedFirst = candidates.length ? normalizeDoi(candidates[0]) : null;
  return { doi: normalizedFirst, title: null, reason: 'DOI not found in map' };
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

async function buildConflictSuggestion(dir: string, title: string, doi: string): Promise<string> {
  const stem = sanitizeFileStem(title);
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
