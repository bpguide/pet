// 对话记忆：三件套全在本地，一个字节都不出机器。
// L1 `chat-history.json` —— 对话历史，重启接着聊；
// L2 `memory.md` —— 长期记忆（关于主人的事实），一行一条，模型上下文里看得见；
// L3 交接 —— 历史太长时把最老的片段提炼进 memory.md 再丢弃（提炼由渲染层的模型完成）。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { atomicWrite } from './atomic-write'

export interface HistoryTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const memFile = (): string => join(app.getPath('userData'), 'memory.md')
const histFile = (): string => join(app.getPath('userData'), 'chat-history.json')

export function loadMemory(): string[] {
  try {
    if (!existsSync(memFile())) return []
    return readFileSync(memFile(), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
  } catch {
    return []
  }
}

/** Appends remembered facts, one per line; duplicates and empties are dropped. */
export function addFacts(lines: string[]): void {
  const have = new Set(loadMemory())
  const add = lines.map((l) => l.trim()).filter((l) => l && !have.has(l))
  if (!add.length) return
  atomicWrite(memFile(), [...loadMemory(), ...add].map((l) => `${l}\n`).join(''))
}

export function clearMemory(): void {
  atomicWrite(memFile(), '')
}

/** Replaces memory.md entirely with the given facts (used by memory compression). */
export function rewriteFacts(lines: string[]): void {
  atomicWrite(memFile(), lines.map((l) => `${l.trim()}\n`).join(''))
}

export function loadHistory(): HistoryTurn[] {
  try {
    if (!existsSync(histFile())) return []
    const v = JSON.parse(readFileSync(histFile(), 'utf8')) as unknown
    return Array.isArray(v) ? (v as HistoryTurn[]) : []
  } catch {
    return []
  }
}

export function saveHistory(turns: HistoryTurn[]): void {
  atomicWrite(histFile(), JSON.stringify(turns))
}

const dialogueFile = (): string => join(app.getPath('userData'), 'dialogue-state.json')

export interface DialogueState {
  dialogue: HistoryTurn[]
  sinceMemo: number
}

/** 未提炼完的对话缓冲 + 计数：重启后接着攒，不丢。 */
export function loadDialogueState(): DialogueState {
  try {
    if (!existsSync(dialogueFile())) return { dialogue: [], sinceMemo: 0 }
    const v = JSON.parse(readFileSync(dialogueFile(), 'utf8')) as Partial<DialogueState>
    return {
      dialogue: Array.isArray(v.dialogue) ? v.dialogue : [],
      sinceMemo: typeof v.sinceMemo === 'number' ? v.sinceMemo : 0,
    }
  } catch {
    return { dialogue: [], sinceMemo: 0 }
  }
}

export function saveDialogueState(state: DialogueState): void {
  atomicWrite(dialogueFile(), JSON.stringify({ dialogue: state.dialogue, sinceMemo: state.sinceMemo }))
}
