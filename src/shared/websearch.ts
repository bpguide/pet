import type { Fetch, SearchResult } from './ipc'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const stripTags = (s: string): string =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/** DuckDuckGo 的跳转链接形如 //duckduckgo.com/l/?uddg=<编码后的真实地址>。 */
function decodeDdgHref(href: string): string {
  try {
    const target = new URL(href, 'https://duckduckgo.com').searchParams.get('uddg')
    if (target) return decodeURIComponent(target)
  } catch {
    /* 忽略 */
  }
  return href
}

/** Bing 的跳转链接形如 https://www.bing.com/ck/a?...&u=<base64 目标地址>。 */
function decodeBingHref(href: string): string {
  try {
    const u = new URL(href)
    const target = u.searchParams.get('u')
    if (target && u.pathname.includes('/ck/') && typeof atob === 'function') {
      const decoded = atob(target)
      if (decoded.startsWith('http')) return decoded
    }
  } catch {
    /* 忽略 */
  }
  return href
}

/** DuckDuckGo HTML 端点：免 key，但国内裸连可能被墙。 */
async function ddgSearch(fetch: Fetch, query: string, max: number): Promise<SearchResult[]> {
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA },
  })
  if (!r.ok) return []
  const html = await r.text()
  const links = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)]
  const out: SearchResult[] = []
  for (let i = 0; i < links.length && out.length < max; i++) {
    const [, href, title] = links[i]
    const t = stripTags(title)
    if (!t || !href) continue
    out.push({ title: t, url: decodeDdgHref(href), description: stripTags(snippets[i]?.[1] ?? '') })
  }
  return out
}

/** Bing 中国版：国内裸连可用，免 key；作为 DDG 被墙时的回退。 */
async function bingSearch(fetch: Fetch, query: string, max: number): Promise<SearchResult[]> {
  const r = await fetch(`https://cn.bing.com/search?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA },
  })
  if (!r.ok) return []
  const html = await r.text()
  // 每个结果块以一个 <h2><a href> 标题开头
  const out: SearchResult[] = []
  for (const seg of html.split('<h2').slice(1)) {
    const a = seg.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!a) continue
    const title = stripTags(a[2])
    if (!title) continue
    const p = seg.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    out.push({ title, url: decodeBingHref(a[1]), description: stripTags(p?.[1] ?? '') })
    if (out.length >= max) break
  }
  return out
}

/** Tavily 搜索 API：正规、稳定、带 AI 摘要，需自填 key。 */
async function tavilySearch(fetch: Fetch, query: string, key: string, max: number): Promise<SearchResult[]> {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: max, search_depth: 'basic' }),
  })
  if (!r.ok) return []
  const j = (await r.json()) as { results?: { title?: string; url?: string; content?: string }[] }
  return (j.results ?? []).map((x) => ({ title: x.title ?? '', url: x.url ?? '', description: x.content ?? '' }))
}

/** Brave 搜索 API：需自填 key。 */
async function braveSearch(fetch: Fetch, query: string, key: string, max: number): Promise<SearchResult[]> {
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`, {
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
  })
  if (!r.ok) return []
  const j = (await r.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } }
  return (j.web?.results ?? []).map((x) => ({ title: x.title ?? '', url: x.url ?? '', description: x.description ?? '' }))
}

/**
 * 网页搜索：自填 key 时走 Tavily/Brave 正规 API，否则免 key（DDG 优先、Bing 回退）。
 * 全程优雅降级，失败时返回 []，调用方据实告知没搜到。
 */
export async function webSearch(fetch: Fetch, query: string, max = 6, backend: 'auto' | 'tavily' | 'brave' = 'auto', key = ''): Promise<SearchResult[]> {
  if (backend === 'tavily' && key) {
    try { return await tavilySearch(fetch, query, key, max) } catch { /* 回退免 key */ }
  }
  if (backend === 'brave' && key) {
    try { return await braveSearch(fetch, query, key, max) } catch { /* 回退免 key */ }
  }
  try {
    const ddg = await ddgSearch(fetch, query, max)
    if (ddg.length) return ddg
  } catch {
    /* 忽略，回退 Bing */
  }
  try {
    return await bingSearch(fetch, query, max)
  } catch {
    return []
  }
}
