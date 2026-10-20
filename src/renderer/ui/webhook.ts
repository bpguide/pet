import type { WebhookMsg } from '../../shared/webhook'
import { save } from '../pet/store'
import { say } from './talk'

/** A queued message gives way to the next one after this long, however long it asked to stay. */
const HANDOFF_MS = 10_000
const MAX_QUEUE = 20

const queue: WebhookMsg[] = []
let busy = false

function next(): void {
  const m = queue.shift()
  if (!m) {
    busy = false
    return
  }
  busy = true
  const text = m.title ? `【${m.title}】${m.text}` : m.text
  const url = m.url
  const open = (): void => window.qqpet.openUrl(url!)
  void say(text, url ? ['打开链接', '知道了'] : ['知道了'], url ? [open] : [], m.duration * 1000)
  window.setTimeout(next, m.duration > 0 ? Math.min(m.duration * 1000, HANDOFF_MS) : HANDOFF_MS)
}

/** Outside services reach the pet through the local webhook; do-not-disturb drops their bubbles. */
export function initWebhook(): void {
  window.qqpet.onWebhook?.((m) => {
    if (!save.havePet || save.settings.quiet || !save.settings.webhook) return
    if (queue.length < MAX_QUEUE) queue.push(m)
    if (!busy) next()
  })
}
