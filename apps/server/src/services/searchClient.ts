import { appConfig } from '../config/env.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  relevanceScore?: number;
  sourceDomain?: string;
  engine: 'tavily' | 'google_pse' | 'exa';
}

export interface SearchArticleSnapshot {
  url: string;
  finalUrl: string;
  title?: string;
  sourceDomain?: string;
  publishedDate?: string;
  contentType?: string;
  extractionMode: 'html_text' | 'plain_text' | 'pdf_text' | 'pdf_metadata';
  fetchedAt: string;
  excerpt: string;
  extractedText: string;
}

interface WebSearchOptions {
  maxResults?: number;
  engine?: 'tavily' | 'google_pse' | 'exa';
}

const DEFAULT_MAX_RESULTS = 5;
const PDF_FETCH_TIMEOUT_MS = 25000;

const summarizeErrorBody = (raw: string, maxLength = 220): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const titleMatch = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim();
  if (title) {
    return title.length > maxLength ? `${title.slice(0, maxLength - 1)}…` : title;
  }

  const normalized = trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

const withTimeout = async <T>(
  label: string,
  operation: Promise<T>,
  timeoutMs = appConfig.search.timeoutMs,
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} 超时（>${timeoutMs}ms）`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const safeFetchResponse = async (
  label: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> => {
  const response = await withTimeout(label, fetch(input, init), timeoutMs);

  if (!response.ok) {
    const errorText = await withTimeout(
      `${label} 错误响应读取`,
      response.text().catch(() => Promise.resolve('')),
      timeoutMs,
    );
    const errorSummary = summarizeErrorBody(errorText);
    throw new Error(
      `${label} 请求失败：HTTP ${response.status}${errorSummary ? ` ${errorSummary}` : ''}`,
    );
  }

  return response;
};

const safeFetchText = async (
  label: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<{ response: Response; text: string }> => {
  const response = await safeFetchResponse(label, input, init, timeoutMs);
  const text = await withTimeout(`${label} 响应文本读取`, response.text(), timeoutMs);
  return { response, text };
};

const safeFetchBytes = async (
  label: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<{ response: Response; bytes: Buffer }> => {
  const response = await safeFetchResponse(label, input, init, timeoutMs);
  const arrayBuffer = await withTimeout(`${label} 响应字节读取`, response.arrayBuffer(), timeoutMs);
  return {
    response,
    bytes: Buffer.from(arrayBuffer),
  };
};

const safeFetchJson = async <T>(
  label: string,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs?: number,
): Promise<T> => {
  const response = await withTimeout(label, fetch(input, init), timeoutMs);

  if (!response.ok) {
    const errorText = await withTimeout(`${label} 错误响应读取`, response.text(), timeoutMs);
    throw new Error(`${label} 请求失败：HTTP ${response.status} ${errorText}`);
  }

  return withTimeout(`${label} 响应解析`, response.json() as Promise<T>, timeoutMs);
};

const getSourceDomain = (rawUrl: string): string | undefined => {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
};

const decodeHtmlEntities = (raw: string): string =>
  raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const normalizeText = (raw: string): string =>
  decodeHtmlEntities(raw)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const stripHtml = (html: string): string =>
  normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<\/?(article|main|section|div|p|li|ul|ol|h[1-6]|br|blockquote|pre)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );

const extractHtmlTitle = (html: string): string | undefined => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = normalizeText(titleMatch?.[1] || '');
  return title || undefined;
};

const extractPublishedDate = (html: string): string | undefined => {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:updated_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']publishdate["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const matched = html.match(pattern)?.[1]?.trim();
    if (matched) return matched;
  }

  return undefined;
};

const buildExcerpt = (text: string, maxLength = 320): string => {
  const normalized = normalizeText(text).replace(/\n/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const getFilenameFromUrl = (rawUrl: string): string | undefined => {
  try {
    const pathname = new URL(rawUrl).pathname;
    const filename = pathname.split('/').filter(Boolean).pop();
    return filename ? decodeURIComponent(filename) : undefined;
  } catch {
    return undefined;
  }
};

const decodePdfEscapedString = (raw: string): string =>
  raw
    .replace(/\\([nrtbf()\\])/g, (_, token: string) => {
      const map: Record<string, string> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        '(': '(',
        ')': ')',
        '\\': '\\',
      };
      return map[token] || token;
    })
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\\r?\n/g, '');

const decodeUtf16BeBuffer = (buffer: Buffer): string => {
  const chars: number[] = [];
  for (let index = 0; index + 1 < buffer.length; index += 2) {
    chars.push(buffer.readUInt16BE(index));
  }
  return String.fromCharCode(...chars);
};

const decodePdfHexString = (raw: string): string => {
  const normalized = raw.replace(/\s+/g, '');
  if (!normalized || /[^0-9a-f]/i.test(normalized)) return '';

  const padded = normalized.length % 2 === 1 ? `${normalized}0` : normalized;
  const buffer = Buffer.from(padded, 'hex');

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return decodeUtf16BeBuffer(buffer.subarray(2));
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }

  return buffer.toString('utf8');
};

const isLikelyUsefulPdfText = (raw: string): boolean => {
  const normalized = normalizeText(raw);
  if (normalized.length < 8) return false;

  const meaningfulCharCount = (normalized.match(/[A-Za-z0-9\u4e00-\u9fff]/g) || []).length;
  return meaningfulCharCount / normalized.length >= 0.35;
};

const collectPdfTextCandidates = (pdfBytes: Buffer): string[] => {
  const raw = pdfBytes.toString('latin1');
  const candidates: string[] = [];
  const push = (value?: string) => {
    const normalized = normalizeText(value || '');
    if (!isLikelyUsefulPdfText(normalized)) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const metadataLiteralPatterns = [
    /\/Title\s*\(((?:\\.|[^\\)])+)\)/g,
    /\/Subject\s*\(((?:\\.|[^\\)])+)\)/g,
    /\/Keywords\s*\(((?:\\.|[^\\)])+)\)/g,
    /\/Author\s*\(((?:\\.|[^\\)])+)\)/g,
  ];

  for (const pattern of metadataLiteralPatterns) {
    for (const matched of raw.matchAll(pattern)) {
      push(decodePdfEscapedString(matched[1] || ''));
    }
  }

  const metadataHexPatterns = [
    /\/Title\s*<([0-9A-Fa-f\s]+)>/g,
    /\/Subject\s*<([0-9A-Fa-f\s]+)>/g,
  ];

  for (const pattern of metadataHexPatterns) {
    for (const matched of raw.matchAll(pattern)) {
      push(decodePdfHexString(matched[1] || ''));
    }
  }

  for (const matched of raw.matchAll(/\((?:\\.|[^\\()]){12,}\)/g)) {
    push(decodePdfEscapedString(matched[0].slice(1, -1)));
    if (candidates.length >= 40) break;
  }

  for (const matched of raw.matchAll(/<([0-9A-Fa-f\s]{24,})>/g)) {
    push(decodePdfHexString(matched[1] || ''));
    if (candidates.length >= 60) break;
  }

  return candidates;
};

const buildPdfSnapshot = (options: {
  url: string;
  finalUrl: string;
  contentType?: string;
  pdfBytes: Buffer;
}): SearchArticleSnapshot => {
  const candidates = collectPdfTextCandidates(options.pdfBytes);
  const titleCandidate = candidates[0] || getFilenameFromUrl(options.finalUrl) || getFilenameFromUrl(options.url);
  const extractedText = candidates.join('\n').slice(0, 12000);
  const extractionMode = extractedText.length >= 120 ? 'pdf_text' : 'pdf_metadata';
  const metadataFallback = normalizeText(
    [
      titleCandidate ? `PDF 文档：${titleCandidate}` : undefined,
      extractedText || '当前仅抓到 PDF 文档元数据，未提取到足够正文文本。',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return {
    url: options.url,
    finalUrl: options.finalUrl,
    title: titleCandidate,
    sourceDomain: getSourceDomain(options.finalUrl),
    contentType: options.contentType,
    extractionMode,
    fetchedAt: new Date().toISOString(),
    excerpt: buildExcerpt(extractedText || metadataFallback),
    extractedText: extractedText || metadataFallback,
  };
};

const dedupeResults = (results: SearchResult[], maxResults: number): SearchResult[] => {
  const seen = new Set<string>();

  return results
    .filter((item) => {
      const url = item.url.trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return Boolean(item.title.trim() && item.snippet.trim());
    })
    .slice(0, maxResults);
};

const searchWithTavily = async (query: string, maxResults: number): Promise<SearchResult[]> => {
  if (!appConfig.search.tavilyApiKey) return [];

  type TavilyResponse = {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      published_date?: string;
      score?: number;
    }>;
  };

  const payload = await safeFetchJson<TavilyResponse>('Tavily 搜索', appConfig.search.tavilyApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: appConfig.search.tavilyApiKey,
      query,
      search_depth: 'advanced',
      max_results: maxResults,
      include_answer: false,
      include_images: false,
    }),
  });

  return dedupeResults(
    (payload.results || []).map((item) => ({
      title: item.title || '未命名搜索结果',
      url: item.url || '',
      snippet: item.content || '',
      publishedDate: item.published_date,
      relevanceScore: item.score,
      sourceDomain: getSourceDomain(item.url || ''),
      engine: 'tavily' as const,
    })),
    maxResults,
  );
};

const searchWithGooglePse = async (query: string, maxResults: number): Promise<SearchResult[]> => {
  if (!appConfig.search.googlePseApiKey || !appConfig.search.googlePseCx) return [];

  type GoogleResponse = {
    items?: Array<{
      title?: string;
      link?: string;
      snippet?: string;
      pagemap?: {
        metatags?: Array<{
          'article:published_time'?: string;
          'og:updated_time'?: string;
        }>;
      };
    }>;
  };

  const searchUrl = new URL(appConfig.search.googlePseApiUrl);
  searchUrl.searchParams.set('key', appConfig.search.googlePseApiKey);
  searchUrl.searchParams.set('cx', appConfig.search.googlePseCx);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('num', String(Math.min(maxResults, 10)));
  searchUrl.searchParams.set('safe', 'active');

  const payload = await safeFetchJson<GoogleResponse>('Google PSE 搜索', searchUrl.toString(), {
    method: 'GET',
  });

  return dedupeResults(
    (payload.items || []).map((item) => ({
      title: item.title || '未命名搜索结果',
      url: item.link || '',
      snippet: item.snippet || '',
      publishedDate:
        item.pagemap?.metatags?.[0]?.['article:published_time']
        || item.pagemap?.metatags?.[0]?.['og:updated_time'],
      sourceDomain: getSourceDomain(item.link || ''),
      engine: 'google_pse' as const,
    })),
    maxResults,
  );
};

const searchWithExa = async (query: string, maxResults: number): Promise<SearchResult[]> => {
  if (!appConfig.search.exaApiKey) return [];

  type ExaResponse = {
    results?: Array<{
      title?: string;
      url?: string;
      publishedDate?: string;
      text?: string;
      score?: number;
    }>;
  };

  const payload = await safeFetchJson<ExaResponse>('Exa 搜索', appConfig.search.exaApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': appConfig.search.exaApiKey,
    },
    body: JSON.stringify({
      query,
      numResults: maxResults,
      type: 'auto',
      text: true,
    }),
  });

  return dedupeResults(
    (payload.results || []).map((item) => ({
      title: item.title || '未命名搜索结果',
      url: item.url || '',
      snippet: item.text || '',
      publishedDate: item.publishedDate,
      relevanceScore: item.score,
      sourceDomain: getSourceDomain(item.url || ''),
      engine: 'exa' as const,
    })),
    maxResults,
  );
};

export async function fetchSearchArticle(url: string): Promise<SearchArticleSnapshot> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new Error('缺少可抓取的 URL');
  }

  const looksLikePdfUrl = /\.pdf(?:$|[?#])/i.test(trimmedUrl);

  const response = await safeFetchResponse('外部文章抓取', trimmedUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'users-research-bot/0.2',
      Accept: 'text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  }, looksLikePdfUrl ? PDF_FETCH_TIMEOUT_MS : undefined);

  const finalUrl = response.url || trimmedUrl;
  const contentType = response.headers.get('content-type') || undefined;
  const isPdf =
    Boolean(contentType && /application\/pdf/i.test(contentType))
    || /\.pdf(?:$|[?#])/i.test(finalUrl)
    || looksLikePdfUrl;

  if (isPdf) {
    const { bytes } = await safeFetchBytes('PDF 文档抓取', trimmedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'users-research-bot/0.2',
        Accept: 'application/pdf,text/plain;q=0.8,*/*;q=0.5',
      },
      redirect: 'follow',
    }, PDF_FETCH_TIMEOUT_MS);

    return buildPdfSnapshot({
      url: trimmedUrl,
      finalUrl,
      contentType,
      pdfBytes: bytes,
    });
  }

  if (contentType && !/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error(`暂不支持的内容类型：${contentType}`);
  }

  const text = await withTimeout('外部文章抓取 响应文本读取', response.text());

  const extractedText = stripHtml(text).slice(0, 12000);
  if (extractedText.length < 120) {
    throw new Error('正文提取结果过短');
  }

  return {
    url: trimmedUrl,
    finalUrl,
    title: extractHtmlTitle(text),
    sourceDomain: getSourceDomain(finalUrl),
    publishedDate: extractPublishedDate(text),
    contentType,
    extractionMode: /text\/plain/i.test(contentType || '') ? 'plain_text' : 'html_text',
    fetchedAt: new Date().toISOString(),
    excerpt: buildExcerpt(extractedText),
    extractedText,
  };
}

export async function webSearch(
  query: string,
  options: WebSearchOptions = {},
): Promise<SearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const maxResults = Math.max(1, Math.min(options.maxResults || DEFAULT_MAX_RESULTS, 10));
  const defaultChain = ['tavily', 'google_pse', 'exa'] as const;
  const searchChain = options.engine
    ? [options.engine, ...defaultChain.filter((item) => item !== options.engine)]
    : [...defaultChain];

  for (const engine of searchChain) {
    try {
      const results =
        engine === 'tavily'
          ? await searchWithTavily(trimmedQuery, maxResults)
          : engine === 'google_pse'
            ? await searchWithGooglePse(trimmedQuery, maxResults)
            : await searchWithExa(trimmedQuery, maxResults);

      if (results.length > 0) {
        return results;
      }
    } catch {
      // 单引擎失败时静默降级到下一个引擎。
    }
  }

  return [];
}

/**
 * 并发执行多个查询，合并去重后返回所有结果。
 * @param queries   查询词列表
 * @param options   搜索选项，额外支持 concurrency（默认 3）
 */
export async function multiQuerySearch(
  queries: string[],
  options: WebSearchOptions & { concurrency?: number } = {},
): Promise<SearchResult[]> {
  const { concurrency = 3, ...searchOptions } = options;
  const validQueries = queries.map((q) => q.trim()).filter(Boolean);
  if (!validQueries.length) return [];

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < validQueries.length; i += concurrency) {
    const batch = validQueries.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((q) => webSearch(q, searchOptions)));

    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue;
      for (const item of outcome.value) {
        const key = item.url.trim();
        if (key && !seenUrls.has(key)) {
          seenUrls.add(key);
          allResults.push(item);
        }
      }
    }
  }

  return allResults;
}
