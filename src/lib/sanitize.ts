const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

export function sanitizeFileStem(value: string, { maxLen = 140 } = {}): string {
  const raw = String(value || '');
  let s = raw
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  s = s.replace(/[. ]+$/g, '').trim();
  if (!s) s = 'article';

  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  if (!s) s = 'article';

  const lower = s.toLowerCase();
  if (WINDOWS_RESERVED.has(lower)) s = `_${s}_`;

  s = s.replace(/[. ]+$/g, '').trim();
  return s || 'article';
}

