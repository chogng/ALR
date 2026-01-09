export function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown; toString?: unknown };
    const message =
      typeof anyErr.message === 'string'
        ? anyErr.message
        : typeof anyErr.toString === 'function'
          ? String(err)
          : '';
    return message || 'Unknown error';
  }
  return 'Unknown error';
}
