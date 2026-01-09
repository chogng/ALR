export function basename(path: string): string {
  const p = String(path || '');
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

export function dirname(path: string): string {
  const p = String(path || '');
  // Preserve Windows backslash paths to avoid mixing separators for fs operations.
  if (p.includes('\\')) {
    const idx = p.lastIndexOf('\\');
    if (idx <= 0) return p.replace(/\\[^\\]*$/, '');
    return p.slice(0, idx);
  }

  const normalized = p.replace(/[\\/]+/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return p.replace(/\/[^/]*$/, '');
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

// Best-effort normalization for Tauri fs operations on Windows.
// If a path looks like "C:/..." convert it to "C:\\...".
export function toNativePath(path: string): string {
  const p = String(path || '');
  if (!p) return p;
  if (p.includes('\\')) return p;
  if (/^[a-zA-Z]:\//.test(p)) return p.replace(/\//g, '\\');
  return p;
}

// Best-effort key for comparing paths in-memory (Windows-friendly).
export function pathKey(path: string): string {
  const p = toNativePath(String(path || ''));
  if (!p) return '';
  // Normalize case for Windows drive-letter paths.
  if (/^[a-zA-Z]:\\/.test(p)) return p.toLowerCase();
  return p;
}
