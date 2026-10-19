/** 联网检索层（可插拔）。 */

/** 一条搜索结果（已屏蔽各家字段差异） */
export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

/** 单次搜索超时 */
const TIMEOUT_MS = 12_000;
/** 摘要片段上限 */
const MAX_SNIPPET = 400;
/** 同问句缓存时长 */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** 缓存条目上限 */
const CACHE_MAX = 50;

const cache = new Map<string, { at: number; hits: WebSearchHit[] }>();

/** @returns 两个环境变量都配好才算 true */
export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.SEARCH_PROVIDER && process.env.SEARCH_API_KEY);
}

function normalizeKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * 按 provider 组装请求并归一化结果。
 * @returns 不认识的 provider 返回空数组
 */
async function requestProvider(
  provider: string,
  key: string,
  query: string,
  limit: number,
): Promise<WebSearchHit[]> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  const toHits = (raw: unknown): WebSearchHit[] => {
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .map((item) => {
        const r = (item ?? {}) as Record<string, unknown>;
        return {
          title: str(r.title),
          url: str(r.url),
          snippet: str(r.snippet).slice(0, MAX_SNIPPET),
        };
      })
      .filter((h) => h.url && (h.title || h.snippet));
  };

  switch (provider) {
    case 'tavily': {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query, max_results: limit, search_depth: 'basic' }),
        signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`tavily ${res.status}`);
      const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
      // tavily 用 content 装摘要
      return toHits((json.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content })));
    }

    case 'bocha': {
      const res = await fetch('https://api.bochaai.com/v1/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query, count: limit, summary: true }),
        signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`bocha ${res.status}`);
      const json = (await res.json()) as {
        data?: { webPages?: { value?: Array<Record<string, unknown>> } };
      };
      // 博查结果在 data.webPages.value，字段名是 name
      return toHits(
        (json.data?.webPages?.value ?? []).map((r) => ({ title: r.name, url: r.url, snippet: r.snippet })),
      );
    }

    case 'serper': {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body: JSON.stringify({ q: query, num: limit }),
        signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`serper ${res.status}`);
      const json = (await res.json()) as { organic?: Array<Record<string, unknown>> };
      // serper 的链接字段叫 link
      return toHits((json.organic ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet })));
    }

    default:
      return [];
  }
}

/**
 * @param limit 最多返回几条
 * @returns 未配置、失败、无结果都返回空数组
 */
export async function webSearch(query: string, limit = 5): Promise<WebSearchHit[]> {
  if (!isWebSearchConfigured()) return [];
  const provider = String(process.env.SEARCH_PROVIDER).trim().toLowerCase();
  const key = String(process.env.SEARCH_API_KEY).trim();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `${provider}::${normalizeKey(trimmed)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.hits;

  try {
    const hits = await requestProvider(provider, key, trimmed, limit);
    cache.set(cacheKey, { at: Date.now(), hits });
    if (cache.size > CACHE_MAX) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    return hits;
  } catch (err) {
    console.warn('[assistant] 联网检索失败，降级为无联网资料：', (err as Error)?.message ?? 'unknown');
    return [];
  }
}

/**
 * 渲染成可拼进 system prompt 的「联网资料」。
 * @returns 无结果时返回空串
 */
export function formatWebResults(hits: WebSearchHit[]): string {
  if (hits.length === 0) return '';
  return hits.map((h, i) => `【联网结果 ${i + 1}】${h.title}\n${h.snippet}\n来源：${h.url}`).join('\n\n');
}
