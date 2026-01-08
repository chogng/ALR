export function basename(path: string): string {
  const p = String(path || '');
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

export function dirname(path: string): string {
  const p = String(path || '');
  const normalized = p.replace(/[\\/]+/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return p.includes('\\') ? p.replace(/\\[^\\]*$/, '') : p.replace(/\/[^/]*$/, '');
  return normalized.slice(0, idx);
}

export function extname(path: string): string {
  const b = basename(path);
  const idx = b.lastIndexOf('.');
  return idx >= 0 ? b.slice(idx).toLowerCase() : '';
}

export function removeExt(fileName: string): string {
  const b = String(fileName || '');
  const idx = b.lastIndexOf('.');
  return idx >= 0 ? b.slice(0, idx) : b;
}

export function joinPath(dir: string, fileName: string): string {
  const d = String(dir || '');
  if (!d) return fileName;
  const sep = d.includes('\\') ? '\\' : '/';
  const trimmed = d.replace(/[\\/]+$/, '');
  return `${trimmed}${sep}${fileName}`;
}

