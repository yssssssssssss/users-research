import { appConfig } from '../config/env.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  relevanceScore?: number;
  engine: 'tavily' | 'google_pse' | 'exa';
}

interface WebSearchOptions {
  maxResults?: number;
  engine?: 'tavily' | 'google_pse' | 'exa';
}

const DEFAULT_MAX_RESULTS = 5;

const withTimeout = async <T>(label: string, operation: Promise<T>): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} 超时（>${appConfig.search.timeoutMs}ms）`));
        }, appConfig.search.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const safeFetchJson = async <T>(
  label: string,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<T> => {
  const response = await withTimeout(label, fetch(input, init));

  if (!response.ok) {
    const errorText = await withTimeout(`${label} 错误响应读取`, response.text());
    throw new Error(`${label} 请求失败：HTTP ${response.status} ${errorText}`);
  }

  return withTimeout(`${label} 响应解析`, response.json() as Promise<T>);
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
      engine: 'exa' as const,
    })),
    maxResults,
  );
};

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
