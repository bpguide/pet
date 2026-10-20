import { withTimeoutSignal } from './compat'
import type { AiConfig, AiMessage, Fetch } from './ipc'

/** The fields used from an OpenAI-compatible reply. */
interface Models {
  data: { id: string }[]
}
interface Completion {
  choices: { message: { content: string } }[]
}

/** One request to an OpenAI-compatible API; a non-2xx status throws with the server's message. */
async function call<T>(fetch: Fetch, c: Omit<AiConfig, 'model'>, path: string, body?: object): Promise<T> {
  return withTimeoutSignal(60_000, async (signal) => {
    const r = await fetch(c.url.replace(/\/+$/, '') + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(c.key && { Authorization: `Bearer ${c.key}` }) },
      body: body && JSON.stringify(body),
      signal,
    })
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
    return (await r.json()) as T
  })
}

export async function aiModels(fetch: Fetch, c: Omit<AiConfig, 'model'>): Promise<string[]> {
  return (await call<Models>(fetch, c, '/models')).data.map((m) => m.id)
}

export async function aiChat(fetch: Fetch, c: AiConfig, messages: AiMessage[]): Promise<string> {
  // 关思考：Qwen 系认 chat_template_kwargs.enable_thinking；DeepSeek 认 thinking.type=disabled（思考默认开、effort 默认 high，不关会烧光 max_tokens 导致 content 为空）。两字段互不干扰，各自服务端忽略另一个。
  const body: Record<string, unknown> = { model: c.model, messages, max_tokens: 300, chat_template_kwargs: { enable_thinking: false } }
  if (/deepseek/i.test(c.url)) body.thinking = { type: 'disabled' }
  // Ollama's OpenAI layer ignores the two fields above and only honours reasoning_effort.
  if (/ollama|:11434/i.test(c.url)) body.reasoning_effort = 'none'
  const r = await call<Completion>(fetch, c, '/chat/completions', body)
  // Some templates emit only the closing tag, so everything up to the last one is reasoning.
  return r.choices[0].message.content.replace(/^[\s\S]*<\/think>/, '').trim()
}
