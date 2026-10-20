/** A message pushed into the pet by an outside service. */
export interface WebhookMsg {
  text: string
  title?: string
  /** http(s) link the bubble's 打开 button jumps to. */
  url?: string
  /** Seconds the bubble stays; 0 = until clicked. */
  duration: number
}

export const WEBHOOK_PORT = 17788
export const WEBHOOK_DEFAULT_SECONDS = 30
const MAX_SECONDS = 3600
const MAX_TEXT = 500

const first = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
}

/**
 * Reads a webhook call: a JSON object, form/query fields, or a plain-text body.
 * `fields` are the query parameters; the body wins when both carry a key.
 */
export function parseHook(body: string, contentType: string, fields: Record<string, string>): WebhookMsg | null {
  let o: Record<string, unknown> = { ...fields }
  const text = body.trim()
  if (text) {
    if (/json/i.test(contentType) || /^[{[]/.test(text)) {
      try {
        const j: unknown = JSON.parse(text)
        if (j && typeof j === 'object' && !Array.isArray(j)) o = { ...o, ...(j as Record<string, unknown>) }
        else return null
      } catch {
        return null
      }
    } else if (/x-www-form-urlencoded/i.test(contentType)) o = { ...o, ...Object.fromEntries(new URLSearchParams(text)) }
    else o.text = text
  }
  const msg = first(o, ['text', 'message', 'msg', 'content', 'body'])
  if (!msg) return null
  const link = first(o, ['url', 'link'])
  const d = Number(first(o, ['duration', 'seconds']))
  return {
    text: msg.slice(0, MAX_TEXT),
    title: first(o, ['title', 'subject'])?.slice(0, 60),
    url: link && /^https?:\/\//i.test(link) ? link : undefined,
    duration: Number.isFinite(d) && d >= 0 ? Math.min(d, MAX_SECONDS) : WEBHOOK_DEFAULT_SECONDS,
  }
}

/** Constant-time comparison so a token cannot be guessed from response timing. */
export function sameToken(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
