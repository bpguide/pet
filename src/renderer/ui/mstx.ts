import { SwfPlayer } from '../swf/player'
import { openFrame } from './box'
import './css/mstx.css'
import { div, touch } from './dom'
import { gamepad } from './gamepad'

let open = false

/** The SWF traces each original request (…duobaoqibin?cmd=3&id=qq_mstx&gate=2…) as it loads the canned reply. */
const REQUEST = /cmd=(\d+)&id=qq_mstx&gate=(\d+)/
const REPLY = /\/pet\/mstx\/cmd(\d+)\.xml$/
const LEVELS = 10

/**
 * The <gate> a canned reply should carry, from the level of its request; null leaves the reply alone. Each file holds
 * one recorded <gate>, but the game plays the level it names: every clear answered 2, so level 2 led back to itself.
 */
function replyGate(cmd: string, gate: number): number | null {
  // Cleared: the next level.
  if (cmd === '3') return Math.min(gate + 1, LEVELS)
  // Start the level picked, retry after a failure, continue, close the tips: that same level.
  if (cmd === '2' || cmd === '4' || cmd === '5' || cmd === '10') return gate
  return null
}

/** Rewrites the <gate> of the replies replyGate covers; every other request passes through. Returns the undo. */
function fixReplies(player: SwfPlayer, loaded: Promise<unknown>): () => void {
  const asked = new Map<string, number>()
  void loaded.then(() => {
    player.el.ruffle().traceObserver = (line) => {
      const m = REQUEST.exec(line)
      if (m) asked.set(m[1], Number(m[2]))
    }
  }, () => {})
  const prev = window.fetch
  const hook: typeof window.fetch = async (input, init) => {
    const res = await prev(input, init)
    const href = String(input instanceof Request ? input.url : input)
    const cmd = REPLY.exec(new URL(href, location.href).pathname)?.[1]
    if (!cmd || !res.ok) return res
    const gate = asked.get(cmd)
    if (gate === undefined || gate < 1 || gate > LEVELS) return res
    const reply = replyGate(cmd, gate)
    if (reply === null) return res
    asked.delete(cmd)
    const xml = (await res.text()).replace(/<gate>\s*\d+\s*<\/gate>/, `<gate>${reply}</gate>`)
    return new Response(xml, { status: res.status, headers: res.headers })
  }
  window.fetch = hook
  return () => {
    if (window.fetch === hook) window.fetch = prev
  }
}

/** 密室探险: the game reads canned server replies (cmdN.xml) from its own folder. */
export function openMstx(): void {
  if (open) return
  open = true
  const host = div('mstx')
  const ui = div('ui-mstx', host)
  const remove = openFrame(ui)
  window.qqpet.setFocusable(true)
  // The SWF calls this from its own script, and Ruffle cannot destroy an instance until that call returns.
  window.closeFrame = () =>
    setTimeout(() => {
      unfix()
      remove()
      window.qqpet.setFocusable(false)
      open = false
    })
  const player = new SwfPlayer(host)
  const unfix = fixReplies(player, player.load('pet/mstx/main_qq_mstx.swf', 'pet/mstx/'))
  // It walks by the arrow keys and uses items by A/S/D.
  if (touch) gamepad(player.el, 'mstx', ui, () => window.closeFrame())
}
