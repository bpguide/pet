/** 宠物开口说话的广播口：pet.ts 的气泡把说出去的话发这里，
 *  chat.ts 收进对话历史——这样"你刚才说什么"才是它答得上来的问题。
 *  独立小模块，避免 pet.ts 与 chat.ts 互相 import 打结。 */

let sink: ((text: string) => void) | null = null

export const onSaid = (fn: (text: string) => void): void => {
  sink = fn
}

export const emitSaid = (text: string): void => {
  sink?.(text)
}

/** 主人点了气泡按钮（相当于主人开口回了一句）。 */
let replySink: ((text: string) => void) | null = null

export const onReply = (fn: (text: string) => void): void => {
  replySink = fn
}

export const emitReply = (text: string): void => {
  replySink?.(text)
}

/** 发生在宠物身上的事（喂食/洗澡/喂药…），旁白式入账。 */
let eventSink: ((text: string) => void) | null = null

export const onEvent = (fn: (text: string) => void): void => {
  eventSink = fn
}

export const emitEvent = (text: string): void => {
  eventSink?.(text)
}
