import { createServer, type Server } from 'node:http'
import { parseHook, sameToken, type WebhookMsg } from '../shared/webhook'

const MAX_BODY = 16 * 1024
/** Calls a minute, so a looping sender cannot flood the pet with bubbles. */
const MAX_PER_MINUTE = 30

/** Local HTTP endpoint: `POST|GET /hook?token=…` turns a request into a pet bubble. Bound to 127.0.0.1 only. */
export class WebhookServer {
  private server: Server | undefined
  private recent: number[] = []

  constructor(private readonly deliver: (m: WebhookMsg) => void) {}

  get running(): boolean {
    return !!this.server
  }

  start(port: number, token: string): Promise<void> {
    this.stop()
    return new Promise((resolve, reject) => {
      const s = createServer((req, res) => {
        const reply = (code: number, msg: string): void => {
          res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: code === 200, msg }))
        }
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/hook') return reply(404, 'not found')
        if (req.method !== 'POST' && req.method !== 'GET') return reply(405, 'method not allowed')
        const auth = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? ''))?.[1]
        const supplied = auth ?? (String(req.headers['x-token'] ?? '') || (url.searchParams.get('token') ?? ''))
        if (!sameToken(supplied, token)) return reply(401, 'bad token')
        const chunks: Buffer[] = []
        let size = 0
        let dead = false
        req.on('data', (c: Buffer) => {
          size += c.length
          if (size > MAX_BODY) {
            dead = true
            reply(413, 'too large')
            req.destroy()
          } else chunks.push(c)
        })
        req.on('end', () => {
          if (dead) return
          const fields: Record<string, string> = {}
          url.searchParams.forEach((v, k) => k !== 'token' && (fields[k] = v))
          const m = parseHook(Buffer.concat(chunks).toString('utf8'), String(req.headers['content-type'] ?? ''), fields)
          if (!m) return reply(400, 'need text')
          const now = Date.now()
          this.recent = this.recent.filter((t) => now - t < 60_000)
          if (this.recent.length >= MAX_PER_MINUTE) return reply(429, 'too many')
          this.recent.push(now)
          this.deliver(m)
          reply(200, 'delivered')
        })
      })
      s.once('error', reject)
      s.listen(port, '127.0.0.1', () => {
        s.removeListener('error', reject)
        s.on('error', (e) => console.error('webhook error:', e))
        this.server = s
        resolve()
      })
    })
  }

  stop(): void {
    this.server?.close()
    this.server?.closeAllConnections()
    this.server = undefined
  }
}
