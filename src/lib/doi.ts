const DOI_REGEX = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

export function normalizeDoi(raw: string): string | null {
  const src = String(raw || '').trim();
  if (!src) return null;
  let s = src;

  s = s.replace(/^\s*(doi:\s*)/i, '');
  s = s.replace(/^\s*(https?:\/\/)?doi\.org\//i, '');

  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\/\s+/g, '/');

  s = s.trim();
  s = s.replace(/[)\].,;:}]+$/g, '');

  s = s.trim();
  if (!s) return null;
  return s.toLowerCase();
}

export function extractDoisFromText(text: string): string[] {
  const src = String(text || '');
  if (!src) return [];
  const matches = src.match(DOI_REGEX) || [];
  const normalized = matches
    .map((m) => normalizeDoi(m))
    .filter((d): d is string => Boolean(d));
  return [...new Set(normalized)];
}

export function doiToSuffix(doi: string): string | null {
  const normalized = normalizeDoi(doi);
  if (!normalized) return null;
  const parts = normalized.split('/');
  if (parts.length < 2) return null;
  const suffix = parts.slice(1).join('/').trim();
  return suffix || null;
}

export function looksLikeTitleFileName(basenameNoExt: string, title: string): boolean {
  const a = normalizeFilePart(basenameNoExt);
  const b = normalizeFilePart(title);
  return a === b;
}

function normalizeFilePart(value: string): string {
  return String(value || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

