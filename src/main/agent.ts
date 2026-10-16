import { createServer, type Server } from 'node:http'
import { basename } from 'node:path'
import type { AgentNotice } from '../shared/ipc'

/** Claude Code hooks POST their stdin JSON here: /notify?kind=stop (Stop) or /notify?kind=notify (Notification). */
export const AGENT_PORT = 17321
const MAX_BODY = 64 * 1024

let server: Server | undefined

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
      let input: { cwd?: unknown; message?: unknown } = {}
      try {
        input = JSON.parse(body) ?? {}
      } catch {
        /* an empty or foreign body still means the task stopped */
      }
      emit({
        kind: url.searchParams.get('kind') === 'notify' ? 'notify' : 'stop',
        project: typeof input.cwd === 'string' ? basename(input.cwd) : '',
        message: typeof input.message === 'string' ? input.message : '',
      })
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
