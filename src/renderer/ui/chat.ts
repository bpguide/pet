import type { AiMessage } from '../../shared/ipc'
import { aiOn, ask, askClean, note } from '../pet/ai'
import { listGoods } from '../pet/goods'
import { useItem } from '../pet/items'
import { study, studyGoods, work, workGoods } from '../pet/jobs'
import { noteUserSpoke } from '../pet/calendar'
import { onEvent, onReply, onSaid } from '../pet/said'
import { speak } from '../pet/pet'
import { addInfo, info, save, setInfo, update } from '../pet/store'
import { sendLetterTo, lanPeers } from './lan-visit'
import { openBox } from './box'
import './css/chat.css'
import { button, div } from './dom'
import { setHidden } from './menu'

const DO =
  '回复写成：动作 台词。动作只能是 FEED、CLEAN、WORK、STUDY、HIDE、QUIET、LETTER 或 NONE。FEED=吃背包食物，CLEAN=用清洁用品，WORK=去打工，STUDY=去上学/学习，HIDE=隐身，QUIET=免打扰（再说一次就取消免打扰，主人嫌你太安静时用它解除）。不是办事就写 NONE。台词必须写在动作后面，不要只回动作词。主人让你学习时写成：STUDY:科目 台词 —— 科目只能是 数学、语文、政治、音乐、艺术、礼仪、体育、劳技、武术 之一，不确定科目就写 STUDY 台词。主人让你去送信/串门时写成：LETTER:好友名:「口信」台词 —— 好友名只能用在线好友名单里的名字，口信是要带的话（可以为空），台词照常写在后面。'

/** 粗略相关度：去掉常见字后，事实里的字在问题里出现 ≥2 个算相关（中文无词边界，用字符共现近似）。 */
function relevantTo(question: string, fact: string): boolean {
  const stop = /[，。！？~～·…的主人你我他她它啊呀嘛呢吗了吧得了在是很会要]/g
  const q = question.replace(stop, '')
  const f = fact.replace(/- /g, '').replace(stop, '')
  if (!q || !f) return false
  let hit = 0
  for (const ch of f) if (q.includes(ch)) hit++
  return hit >= 2
}

/** 注入记忆：挑跟当前话题相关的事实；都不相关就退回最近 20 条。 */
function injectMemory(question: string): string {
  if (!save.settings.memory || !facts.length) return ''
  const relevant = facts.filter((f) => relevantTo(question, f))
  const chosen = (relevant.length ? relevant : facts.slice(-20)).slice(0, 20)
  return `\n【关于主人的记忆】\n${chosen.join('\n')}\n（聊天时自然地用上这些，但不要生硬地报流水账）`
}

/** The protocol plus who is online, so LETTER has a real name to pick. */
function doPrompt(question = ''): string {
  const names = lanPeers().map((p) => p.name)
  const search = save.settings.search ? ' SEARCH=联网搜索。主人问你需要查证、实时或你不知道的事时，写成 SEARCH:关键词（只写关键词，我会先联网搜，再把结果给你据实回答）。' : ''
  const memory = injectMemory(question)
  return `${DO}${search}\n${names.length ? `当前在线好友：${names.join('、')}。` : '当前没有好友在线。'}${memory}`
}

// Small models also put the action word after the line instead of before it.
const ACT = /\b(FEED|CLEAN|WORK|STUDY|HIDE|QUIET|NONE)\b[:：]?/i
const LETTER = /^\s*LETTER[:：]\s*([^:：]+?)[:：]\s*(?:「([^」]*)」)?\s*/i
const SEARCH = /^\s*SEARCH[:：]\s*(.+)$/i
const STUDY = /^\s*STUDY[:：]\s*(.+)$/i

function parse(text: string): { act: string; arg: { name: string; text: string }; say: string } {
  const s = text.match(SEARCH)
  if (s) return { act: 'SEARCH', arg: { name: s[1].trim(), text: '' }, say: '' }
  const st = text.match(STUDY)
  if (st) {
    // STUDY:科目 台词 —— 第一个词是科目，其余是台词
    const sp = st[1].trim().match(/^(\S+)\s*(.*)$/)
    return { act: 'STUDY', arg: { name: sp?.[1] ?? '', text: '' }, say: sp?.[2]?.trim() ?? '' }
  }
  const l = text.match(LETTER)
  if (l) return { act: 'LETTER', arg: { name: l[1].trim(), text: (l[2] ?? '').trim() }, say: text.replace(LETTER, '').replace(/\s+/g, ' ').trim() }
  const m = text.match(ACT)
  return { act: m ? m[1].toUpperCase() : 'NONE', arg: { name: '', text: '' }, say: text.replace(ACT, '').replace(/\s+/g, ' ').trim() }
}

function doAct(act: string, say: string, arg: { name: string; text: string }): void {
  if (act === 'LETTER') {
    sendLetterTo(arg.name, arg.text, say)
    return
  }
  if (act === 'FEED') {
    const g = listGoods('food', 1, 1).list[0]
    if (g) return useItem(g, false, say)
  } else if (act === 'CLEAN') {
    const g = listGoods('clean', 1, 1).list[0]
    if (g) return useItem(g, false, say)
  } else if (act === 'WORK') {
    const g = workGoods()[0]
    // A refusal (ill, busy, level too low) is spoken by work itself; the AI's "off to work" would contradict it.
    if (g) return void work(g)
  } else if (act === 'STUDY') {
    // 去上学：科目匹配（数学/语文/...），不确定就随机挑一门；study 自己说台词
    const goods = studyGoods()
    const wanted = arg.name
    const g = wanted ? goods.find((x) => x.name.includes(wanted)) : goods[Math.floor(Math.random() * goods.length)]
    if (g) return void study(g)
  } else if (act === 'HIDE' && !save.settings.hidden) {
    speak({ s: say, now: true, ai: false }, 'hide', { end: () => setHidden(true) })
    return
  } else if (act === 'QUIET') {
    // 免打扰是开关：它自己开的，它自己也关得了；先恢复再说话，取消的那句才听得见
    if (save.settings.quiet) {
      update('settings', { quiet: false })
      speak({ s: say, now: true, ai: false }, 'speak')
    } else {
      speak({ s: say, now: true, ai: false }, 'speak', { start: () => update('settings', { quiet: true }) })
    }
    return
  }
  speak({ s: say, now: true, ai: false }, 'speak')
}

/** Cheat codes typed into the chat, e.g. 元宝+100000. Stats with a bar stop at its max. */
const CHEAT = /^(元宝|成长值?|心情|饥饿|饱食|清洁)\s*[+＋]\s*(\d{1,9})$/
const STATS = { 元宝: 'yb', 成长: 'growth', 成长值: 'growth', 心情: 'mood', 饥饿: 'hunger', 饱食: 'hunger', 清洁: 'clean' } as const

function cheat(text: string): string | null {
  if (text === '不要死') {
    update('settings', { undying: true })
    return `好的${info.host}，${info.name}以后再也不会死啦！`
  }
  const m = text.match(CHEAT)
  if (!m) return null
  const key = STATS[m[1] as keyof typeof STATS]
  const n = Number(m[2])
  if (key === 'yb' || key === 'growth') addInfo(key, n)
  else setInfo(key, Math.min(info[key] + n, save.petComputedlInfo[`${key}Max`]))
  return `${info.host}，${m[1]}+${n}，${info.name}收到啦！`
}

/** Without AI the pet still answers, just without understanding a word. */
const SILLY = [
  (n: string) => `嗯，${n}看不懂呢~`,
  (n: string, h: string) => `${h}说的话好深奥，${n}要想一想……`,
  () => '诶？再说一遍嘛~',
  (n: string) => `${n}歪了歪头，不太明白呢~`,
  (_: string, h: string) => `嘿嘿，${h}说什么都对！`,
  (n: string) => `这个……${n}还小，听不懂啦~`,
  () => '唔……能换个简单点的说法吗？',
  (n: string) => `${n}偷偷记下来了，等长大了再回答你~`,
  (n: string, h: string) => `${h}是在考${n}吗？好难呀~`,
  () => '嗯嗯！（其实没听懂）',
  (n: string) => `${n}刚刚走神了，你说什么来着？`,
  (n: string, h: string) => `听不懂，但是${n}最喜欢${h}啦~`,
]

/** The conversation, kept until the app quits; the latest turns go to the AI. */
const history: AiMessage[] = []
const TURNS = 12

/** 纯对话（user + assistant 回复），供提炼——自言自语与事件旁白不混进来，避免稀释对话窗口。 */
const dialogue: AiMessage[] = []
/** 待提炼的事件旁白缓冲，搭下一次真实对话触发的提炼的车。 */
const events: string[] = []

/** 长期记忆（memory.md 的行）与历史落盘节流；一切只存在本地。 */
let facts: string[] = []
let sinceMemo = 0
let lastChatLine = ''
let saveTimer: ReturnType<typeof setTimeout> | undefined

function persistHistory(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.qqpet.memHistory?.(history)
    // 未提炼完的对话缓冲 + 计数也一起落盘，重启接着攒，不丢
    window.qqpet.memDialogueSave?.({ dialogue, sinceMemo })
  }, 1000)
}

/** L2+L3：把一段对话提炼成事实，存进记忆（旧片段由此浓缩后再丢弃）。 */
const EXTRACT =
  '从下面的对话中提取关于主人以及你们共同经历的、值得长期记住的事实（喜好、习惯、约定、发生过的重要事）。每条一行，以「- 」开头；只记事实，不记寒暄客套；没有值得记的就只输出 NONE。对话：'

async function remember(turns: AiMessage[], evs: string[] = []): Promise<void> {
  const lines = turns.map((m) => `${m.role === 'user' ? '主人' : '我'}：${m.content}`)
  if (evs.length) lines.push(`（旁白）${evs.join('；')}`)
  const text = lines.join('\n')
  const out = await askClean('你是记忆整理器，只按格式输出，不要解释。', [{ role: 'user', content: `${EXTRACT}\n${text}` }])
  if (!out) return
  const extracted = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
  if (!extracted.length) return
  facts = [...facts, ...extracted]
  window.qqpet.memFacts?.(extracted)
}

/** 记忆压缩：超过阈值时把旧事实合并成摘要，保留最近 20 条。 */
const MEMORY_MAX = 50
const KEEP_RECENT = 20

async function compressMemory(): Promise<void> {
  if (facts.length <= MEMORY_MAX) return
  const old = facts.slice(0, facts.length - KEEP_RECENT)
  const recent = facts.slice(-KEEP_RECENT)
  const out = await askClean('你是记忆整理器。把下面这些关于主人的旧记忆合并成更少的条目：同类合并成一条、去掉过时/重复/琐碎的内容、只保留值得长期记住的核心事实。每条一行，以「- 」开头。只输出合并后的记忆，不要解释。', [{ role: 'user', content: old.join('\n') }])
  if (!out) return
  const merged = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
  if (!merged.length) return
  facts = [...merged, ...recent]
  window.qqpet.memRewrite?.(facts)
}

/** 启动时接上上次的记忆与话头（L1）。 */
export function initMemory(): void {
  void window.qqpet.memLoad?.().then(({ memory, history: old }) => {
    facts = memory
    if (old.length) history.push(...old.slice(-TURNS))
  })
  // 恢复"未提炼完"的对话缓冲与计数（重启接着攒，不丢）
  void window.qqpet.memDialogueLoad?.().then((state) => {
    if (state?.dialogue.length) dialogue.push(...state.dialogue)
    sinceMemo = state?.sinceMemo ?? 0
  })
  // 宠物的自言自语（闲聊/问候/事件反应）也入账，这样"你刚才说的啥"答得上来；
  // 聊天回复本身已在账上，不重复记
  onSaid((text) => {
    if (!save.settings.memory || !text || text === lastChatLine) return
    history.push({ role: 'assistant', content: `NONE ${text}` })
    persistHistory()
  })
  // 发生在它身上的事以旁白入账：它才"知道"自己刚洗过澡、吃过药
  onEvent((text) => {
    if (!save.settings.memory || !text) return
    history.push({ role: 'system', content: `[事件] ${text}` })
    events.push(text)
    persistHistory()
  })
  // 点气泡按钮 = 主人开口回话（"好的"也算理它了）
  onReply((text) => {
    if (!save.settings.memory || !text) return
    noteUserSpoke()
    history.push({ role: 'user', content: text })
    dialogue.push({ role: 'user', content: text })
    persistHistory()
  })
}

export function forgetMemory(): void {
  facts = []
  window.qqpet.memClear?.()
}

/**
 * One line through the whole pipeline — the chat box and the talk key share it:
 * cheat codes, canned lines when AI is off, then the model's reply with its
 * action (LETTER included). Returns the line the pet shows.
 */
export async function talkToPet(content: string): Promise<string> {
  const said: AiMessage = { role: 'user', content }
  noteUserSpoke()
  const canned = (save.settings.chatCheat ? cheat(content) : null) ?? (aiOn() ? null : SILLY[Math.floor(Math.random() * SILLY.length)](info.name, info.host))
  if (canned) {
    speak({ s: canned, now: true, ai: false }, 'speak')
    return canned
  }
  let reply = await ask([...history.slice(-TURNS), said], doPrompt(content))
  let { act, arg, say } = parse(reply ?? '')
  // SEARCH：像 Hermes 的 web_search——先联网查，再把结果喂回去据实回答（单轮工具调用）
  if (act === 'SEARCH' && arg.name && save.settings.search) {
    const hits = await window.qqpet.webSearch(arg.name)
    if (hits.length) {
      const brief = hits.map((h, i) => `${i + 1}. ${h.title}：${h.description}`).join('\n')
      const again = await ask([...history.slice(-TURNS), said], `主人让你联网查「${arg.name}」，下面是刚搜到的结果。用你自己的口吻、据实回答主人，不要编造结果里没有的内容，一两句话即可，不要用动作词：\n${brief}`)
      if (again) {
        const p2 = parse(again)
        say = p2.say || again
        act = 'NONE'
      } else {
        say = '呜…我搜到了点东西，但一时说不上来~'
        act = 'NONE'
      }
    } else {
      say = `呜…我试了联网搜「${arg.name}」，但没搜到，网络可能不太给力~`
      act = 'NONE'
    }
  }
  const line = reply ? say || '……' : '呜…我现在脑袋转不动，等会儿再聊吧~'
  lastChatLine = line
  // The model keeps to the action protocol only while its own earlier replies show it.
  if (reply) {
    const asst: AiMessage = { role: 'assistant', content: act === 'LETTER' ? `LETTER:${arg.name}:「${arg.text}」 ${line}` : `${act} ${line}` }
    history.push(said, asst)
    dialogue.push(said, asst)
    persistHistory()
    if (save.settings.memory) {
      // L2：每 5 个真实来回提炼一次（纯对话窗口 + 积攒的事件旁白搭车）；L3：对话过长把最老一段交接进记忆后丢弃
      if (++sinceMemo >= 5) {
        sinceMemo = 0
        void remember(dialogue.slice(-12), events.splice(0)).then(() => void compressMemory())
      }
      if (dialogue.length > 48) {
        const old = dialogue.splice(0, 24)
        persistHistory()
        void remember(old)
      }
    }
  }
  note('刚和主人聊过天')
  if (reply) doAct(act, line, arg)
  return line
}

let close: (() => void) | null = null
let chatInput: HTMLInputElement | null = null

/** Voice fills the chat box (opening it when needed) and never sends by itself. */
export function toChat(text: string): void {
  if (!close) openChat()
  if (chatInput) {
    chatInput.value = text
    chatInput.focus()
  }
}

/** Chat with the pet; replies also come in its speech bubble. The window keeps keyboard focus while this is open. */
export function openChat(): void {
  if (close) return
  const log = div('chatLog f1')
  const show = (m: AiMessage): void => {
    log.append(div(`chatLine ${m.role}`, m.content))
    log.scrollTop = log.scrollHeight
  }
  history.forEach((m) => show(m.role === 'assistant' ? { ...m, content: parse(m.content).say } : m))
  const input = Object.assign(document.createElement('input'), { className: 'chatInput f1', maxLength: 200, placeholder: `和${info.name}说点什么，回车发送` })
  chatInput = input

  async function send(): Promise<void> {
    const content = input.value.trim()
    if (!content || input.disabled) return
    input.value = ''
    input.disabled = true
    show({ role: 'user', content })
    show({ role: 'assistant', content: await talkToPet(content) })
    input.disabled = false
    input.focus()
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) void send()
  })

  close = openBox(
    div(
      'ui-chat',
      div(
        'chatMain fC',
        div('chatTitle', `和${info.name}聊天`),
        log,
        div(
          'chatBar fc',
          input,
          button('chatSend fcc', () => void send(), '发送'),
        ),
      ),
    ),
    {
      onClose: () => {
        window.qqpet.setFocusable(false)
        close = null
        chatInput = null
      },
    },
  )
  window.qqpet.setFocusable(true)
  // 记录渲染进 DOM 后才滚到底部（初始 forEach 时 log 还没挂载，scrollHeight 为 0）
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight })
  const into = (): void => input.focus()
  window.addEventListener('focus', into, { once: true })
  setTimeout(into, 50)
}
