import { open } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { basename } from 'node:path'
import type { AgentNotice } from '../shared/ipc'

/** Claude Code hooks POST their stdin JSON here: /notify?kind=stop (Stop) or /notify?kind=notify (Notification). */
export const AGENT_PORT = 17321
const MAX_BODY = 64 * 1024

let server: Server | undefined

/** Only work done while the pet runs counts; older transcript lines are skipped. */
const since = Date.now()
/** Per transcript: bytes already read and the assistant messages already counted. */
const read = new Map<string, { offset: number; ids: Set<string> }>()

/**
 * Output tokens added to a session transcript since the last call. One reply is written as several lines
 * (thinking, text, each tool call) that repeat the same usage, so each message id counts once.
 */
async function newOutput(path: string): Promise<number> {
  const seen = read.get(path) ?? { offset: 0, ids: new Set<string>() }
  read.set(path, seen)
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    if (size <= seen.offset) return 0
    const buf = Buffer.alloc(size - seen.offset)
    await file.read(buf, 0, buf.length, seen.offset)
    // A line still being written is left for next time.
    const end = buf.lastIndexOf(0x0a) + 1
    seen.offset += end
    let tokens = 0
    for (const line of buf.subarray(0, end).toString('utf8').split('\n')) {
      if (!line.includes('"output_tokens"')) continue
      try {
        const o = JSON.parse(line) as { type?: string; timestamp?: string; message?: { id?: string; usage?: { output_tokens?: number } } }
        const id = o.message?.id
        const out = o.message?.usage?.output_tokens
        if (o.type !== 'assistant' || !id || typeof out !== 'number' || seen.ids.has(id)) continue
        seen.ids.add(id)
        if (Date.parse(o.timestamp ?? '') >= since) tokens += out
      } catch {
        /* a foreign or broken line counts nothing */
      }
    }
    return tokens
  } finally {
    await file.close()
  }
}

export function startAgent(emit: (n: AgentNotice) => void): void {
  if (server) return
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    // A web page may also reach localhost; browsers always send Origin, curl does not.
    if (req.method !== 'POST' || url.pathname !== '/notify' || req.headers.origin) {
      res.writeHead(404).end()
      return
    }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
      if (body.length > MAX_BODY) req.destroy()
    })
    req.on('end', () => {
      res.writeHead(204).end()
      let input: { cwd?: unknown; message?: unknown; transcript_path?: unknown } = {}
      try {
        input = JSON.parse(body) ?? {}
      } catch {
        /* an empty or foreign body still means the task stopped */
      }
      const kind = url.searchParams.get('kind') === 'notify' ? 'notify' : 'stop'
      const transcript = input.transcript_path
      // Only a stopped task is paid for; the path comes from the hook, so only session logs are read.
      const counted =
        kind === 'stop' && typeof transcript === 'string' && transcript.endsWith('.jsonl')
          ? newOutput(transcript).catch((e: unknown) => (console.error('[agent]', e), 0))
          : Promise.resolve(0)
      void counted.then((tokens) =>
        emit({
          kind,
          project: typeof input.cwd === 'string' ? basename(input.cwd) : '',
          message: typeof input.message === 'string' ? input.message : '',
          tokens,
        }),
      )
    })
  })
  // A taken port must never take the pet down.
  server.on('error', (e) => {
    console.error('[agent]', e)
    server = undefined
  })
  server.listen(AGENT_PORT, '127.0.0.1')
}

export function stopAgent(): void {
  server?.close()
  server = undefined
}
