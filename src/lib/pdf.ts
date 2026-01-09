type PdfJsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJsModule> | null = null;
let workerConfigured = false;

async function getPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist');
  }
  return pdfjsPromise;
}

async function ensurePdfJsWorker(): Promise<void> {
  if (workerConfigured) return;
  const pdfjsLib = await getPdfJs();
  // Vite-friendly worker resolution.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  workerConfigured = true;
}

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

export type PdfExtractResult = {
  metadata: PdfMetadata;
  firstPagesText: string;
};

/**
 * Extract both metadata and first pages text from a PDF in one pass.
 * This avoids the ArrayBuffer detachment issue that occurs when loading
 * the same data twice.
 */
export async function extractPdfInfo(data: Uint8Array, pages: number = 2): Promise<PdfExtractResult> {
  await ensurePdfJsWorker();
  const pdfjsLib = await getPdfJs();
  const doc = await pdfjsLib.getDocument({ data }).promise;

  try {
    // Extract metadata
    const metaResult = await doc.getMetadata();
    const info = metaResult.info as Record<string, unknown> | undefined;

    const getString = (key: string): string | null => {
      if (!info) return null;
      const val = info[key];
      if (typeof val === 'string' && val.trim().length > 0) {
        return val.trim();
      }
      return null;
    };

    const metadata: PdfMetadata = {
      title: getString('Title'),
      author: getString('Author'),
      subject: getString('Subject'),
      keywords: getString('Keywords'),
      creator: getString('Creator'),
      producer: getString('Producer'),
      creationDate: getString('CreationDate'),
      modDate: getString('ModDate'),
    };

    // Extract text from first pages
    const total = pages <= 0 ? 0 : Math.min(pages, doc.numPages);
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

    return {
      metadata,
      firstPagesText: chunks.join('\n'),
    };
  } finally {
    try {
      await doc.destroy();
    } catch {
      // ignore
    }
  }
}

// Keep legacy functions for backward compatibility
export async function extractPdfMetadata(data: Uint8Array): Promise<PdfMetadata> {
  const result = await extractPdfInfo(data, 0);
  return result.metadata;
}

export async function extractFirstPagesText(data: Uint8Array, pages: number): Promise<string> {
  const result = await extractPdfInfo(data, pages);
  return result.firstPagesText;
}
