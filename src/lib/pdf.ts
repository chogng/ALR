import * as pdfjsLib from 'pdfjs-dist';

let configured = false;

export function ensurePdfJsWorker() {
  if (configured) return;
  // Vite-friendly worker resolution.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  configured = true;
}

export async function extractFirstPagesText(data: Uint8Array, pages: number): Promise<string> {
  ensurePdfJsWorker();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const total = Math.min(Math.max(1, pages), doc.numPages);
  const chunks: string[] = [];

  for (let p = 1; p <= total; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items
      .map((it) => {
        const anyItem = it as unknown as { str?: unknown };
        return typeof anyItem.str === 'string' ? anyItem.str : '';
      })
      .filter(Boolean);
    chunks.push(strings.join(' '));
  }

  try {
    await doc.destroy();
  } catch {
    // ignore
  }

  return chunks.join('\n');
}

