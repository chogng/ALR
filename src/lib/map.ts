import { readTextFile } from '@tauri-apps/plugin-fs';
import type { LiteratureMap, MapItem } from './types';
import { normalizeDoi } from './doi';

type RawMap = unknown;

export async function loadLiteratureMapFromPath(path: string): Promise<LiteratureMap> {
  const jsonText = await readTextFile(path);
  const parsed: RawMap = JSON.parse(jsonText);

  const items: MapItem[] = Array.isArray(parsed)
    ? (parsed as MapItem[])
    : typeof parsed === 'object' && parsed && Array.isArray((parsed as any).items)
      ? ((parsed as any).items as MapItem[])
      : [];

  const doiToTitle = new Map<string, string>();

  for (const item of items) {
    const doiRaw = item?.doi;
    const titleRaw = item?.title;
    const doi = typeof doiRaw === 'string' ? normalizeDoi(doiRaw) : null;
    const title = typeof titleRaw === 'string' ? titleRaw.trim() : '';
    if (!doi || !title) continue;
    if (!doiToTitle.has(doi)) {
      doiToTitle.set(doi, title);
    }
  }

  return { doiToTitle, size: doiToTitle.size };
}

