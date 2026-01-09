/**
 * CrossRef API client for fetching academic paper metadata by DOI.
 *
 * CrossRef is a non-profit organization that provides a public API for querying
 * metadata about scholarly publications. This is NOT web scraping - it's an
 * official metadata registry service.
 *
 * Rate limits:
 * - Anonymous: ~50 requests/second
 * - With mailto in User-Agent: higher limits and priority
 *
 * @see https://api.crossref.org/swagger-ui/index.html
 */

export type CrossRefMetadata = {
  doi: string;
  title: string | null;
  journal: string | null;
  publisher: string | null;
  publishedDate: string | null;
  year: number | null;
  volume: string | null;
  issue: string | null;
  page: string | null;
  authors: string[] | null;
  type: string | null; // journal-article, book-chapter, etc.
  issn: string[] | null;
  url: string | null;
};

function decodeHtmlEntities(input: string): string {
  // Minimal decode for common named entities + numeric entities.
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function stripHtmlTags(input: string): string {
  // Keep inner text (e.g. "<sub>2</sub>" -> "2").
  return input.replace(/<[^>]*>/g, '');
}

function normalizePlainTextTitle(input: string): string {
  // Crossref titles sometimes contain lightweight HTML (sub/sup/italic/bold).
  // We normalize to filename-safe plain text.
  const tightened = input
    // Remove whitespace around sub/sup tags so "NbS <sub>2</sub>" -> "NbS<sub>2</sub>"
    .replace(/\s*<(sub|sup)\b[^>]*>\s*/gi, '<$1>')
    .replace(/\s*<\/(sub|sup)>\s*/gi, '</$1>');

  return decodeHtmlEntities(stripHtmlTags(tightened))
    // Remove spaces around hyphens: "p -Type" / "p- Type" -> "p-Type"
    .replace(/\s*-\s*/g, '-')
    // Remove spaces before common punctuation: "NbS2 : A" -> "NbS2: A"
    .replace(/\s+([:;,.)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

type CrossRefResponse = {
  status: string;
  'message-type': string;
  message: CrossRefWork;
};

type CrossRefWork = {
  DOI?: string;
  title?: string[];
  'container-title'?: string[];
  publisher?: string;
  published?: {
    'date-parts'?: number[][];
  };
  'published-print'?: {
    'date-parts'?: number[][];
  };
  'published-online'?: {
    'date-parts'?: number[][];
  };
  volume?: string;
  issue?: string;
  page?: string;
  author?: Array<{
    given?: string;
    family?: string;
    name?: string;
  }>;
  type?: string;
  ISSN?: string[];
  URL?: string;
};

// Simple in-memory cache to avoid repeated API calls
const cache = new Map<string, CrossRefMetadata | null>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const cacheTimestamps = new Map<string, number>();

function getCached(doi: string): CrossRefMetadata | null | undefined {
  const timestamp = cacheTimestamps.get(doi);
  if (timestamp && Date.now() - timestamp < CACHE_TTL) {
    return cache.get(doi);
  }
  // Expired or not found
  cache.delete(doi);
  cacheTimestamps.delete(doi);
  return undefined;
}

function setCache(doi: string, data: CrossRefMetadata | null): void {
  cache.set(doi, data);
  cacheTimestamps.set(doi, Date.now());
}

/**
 * Fetch metadata for a DOI from CrossRef API.
 *
 * @param doi - The DOI to look up (e.g., "10.1038/s41928-025-01540-w")
 * @param email - Optional email for polite pool (higher rate limits)
 * @returns CrossRefMetadata or null if not found
 */
export async function fetchCrossRefMetadata(
  doi: string,
  email?: string
): Promise<CrossRefMetadata | null> {
  // Check cache first
  const cached = getCached(doi);
  if (cached !== undefined) {
    return cached;
  }

  try {
    // Build URL - encode the DOI properly
    const encodedDoi = encodeURIComponent(doi);
    const url = new URL(`https://api.crossref.org/works/${encodedDoi}`);
    // Browsers/WebViews forbid setting the User-Agent header. Crossref supports a "mailto"
    // query parameter for polite requests.
    if (email) url.searchParams.set('mailto', email);

    // Build headers with polite User-Agent
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      if (response.status === 404) {
        // DOI not found in CrossRef
        setCache(doi, null);
        return null;
      }
      throw new Error(`CrossRef API error: ${response.status} ${response.statusText}`);
    }

    const data: CrossRefResponse = await response.json();
    const work = data.message;

    // Extract publication date
    const dateInfo = work.published || work['published-print'] || work['published-online'];
    const dateParts = dateInfo?.['date-parts']?.[0];
    let publishedDate: string | null = null;
    let year: number | null = null;

    if (dateParts && dateParts.length > 0) {
      year = dateParts[0];
      if (dateParts.length === 1) {
        publishedDate = `${year}`;
      } else if (dateParts.length === 2) {
        publishedDate = `${year}-${String(dateParts[1]).padStart(2, '0')}`;
      } else if (dateParts.length >= 3) {
        publishedDate = `${year}-${String(dateParts[1]).padStart(2, '0')}-${String(dateParts[2]).padStart(2, '0')}`;
      }
    }

    // Extract authors
    let authors: string[] | null = null;
    if (work.author && work.author.length > 0) {
      authors = work.author.map((a) => {
        if (a.name) return a.name;
        const parts = [a.given, a.family].filter(Boolean);
        return parts.join(' ');
      }).filter(Boolean);
      if (authors.length === 0) authors = null;
    }

    const metadata: CrossRefMetadata = {
      doi: work.DOI || doi,
      title: work.title?.[0] ? normalizePlainTextTitle(work.title[0]) : null,
      journal: work['container-title']?.[0] || null,
      publisher: work.publisher || null,
      publishedDate,
      year,
      volume: work.volume || null,
      issue: work.issue || null,
      page: work.page || null,
      authors,
      type: work.type || null,
      issn: work.ISSN || null,
      url: work.URL || null,
    };

    setCache(doi, metadata);
    return metadata;
  } catch (err) {
    console.error(`CrossRef lookup failed for ${doi}:`, err);
    // Don't cache errors - allow retry
    return null;
  }
}

/**
 * Batch fetch metadata for multiple DOIs.
 * Implements simple rate limiting to be polite to the API.
 */
export async function fetchCrossRefMetadataBatch(
  dois: string[],
  email?: string,
  delayMs: number = 100
): Promise<Map<string, CrossRefMetadata | null>> {
  const results = new Map<string, CrossRefMetadata | null>();

  for (const doi of dois) {
    const metadata = await fetchCrossRefMetadata(doi, email);
    results.set(doi, metadata);

    // Small delay between requests to be polite
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
