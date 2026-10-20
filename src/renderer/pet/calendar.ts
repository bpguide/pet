import type { CalendarDay } from '../../shared/ipc'
import { findLast } from '../../shared/compat'
import { FESTIVAL, GREET, HOLIDAY } from './data/greet'
import type { Line } from './data/talk'
import { rand } from './rand'

const WEEK = '日一二三四五六'

/** Today first; empty while offline. */
let days: CalendarDay[] = []

/** Refreshes the calendar; today's entry, or undefined while offline. */
export async function loadCalendar(): Promise<CalendarDay | undefined> {
  days = await window.qqpet.calendar()
  return days[0]
}

const pick = <T>(list: T[]): T => list[rand(0, list.length - 1)]

/** Today's date as the pet would put it: weekday, lunar date, holiday or solar term. */
export function dayText(): string {
  const [d] = days
  const week = `星期${WEEK[new Date().getDay()]}`
  if (!d) return week
  return [week, `农历${d.lunar}`, d.holiday && (d.holiday.off ? `${d.holiday.name}放假` : `${d.holiday.name}调休上班`), d.term].filter(Boolean).join('，')
}

/** A launch greeting for the time of day. */
export function greeting(): Line {
  const h = new Date().getHours()
  return pick(findLast(GREET, ([from]) => h >= from)![1])
}

/** What the pet says about today's holiday, festival, make-up working day or solar term; only solar festivals while offline. */
// 节日提醒节流：没回应最多提 3 次，主人回应后只再提 1 次；计数与"已回应"落盘，重启不重置，跨天才清
const THROTTLE_KEY = 'qqpet:festival-throttle'
let festivalSaid = 0
let userAnswered = false
let lastLunar = ''

function saveThrottle(): void {
  try { localStorage.setItem(THROTTLE_KEY, JSON.stringify({ lastLunar, festivalSaid, userAnswered })) } catch { /* 忽略 */ }
}

/** 主人说了话（聊天/语音/点按钮）——节日提醒只再提一次就打住。 */
export function noteUserSpoke(): void {
  userAnswered = true
  saveThrottle()
}

/** 节日提醒是否已提满——供 AI 提示词用：提满后闲聊别再主动提节日，否则 AI 凭"农历九月初九"自己又编一堆重阳。 */
export function festivalExhausted(): boolean {
  return festivalSaid >= (userAnswered ? 2 : 3)
}

export function festival(): string | null {
  const [d, tomorrow] = days
  const now = new Date()
  const solar = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  // 节流键按农历日（无则公历日）：跨天自动重置
  const key = d?.lunar ?? solar
  if (key !== lastLunar) {
    // 跨天/重启：先恢复同一天的持久化计数，避免重启后重复提醒
    lastLunar = key
    festivalSaid = 0
    userAnswered = false
    try {
      const saved = JSON.parse(localStorage.getItem(THROTTLE_KEY) ?? 'null')
      if (saved && saved.lastLunar === key) {
        festivalSaid = saved.festivalSaid
        userAnswered = saved.userAnswered
      }
    } catch { /* 忽略 */ }
  }
  // 没回应最多提 3 次，回应后只再提 1 次——所有调用方（daily 问候、dateTalk 闲聊）共用此限
  const cap = userAnswered ? 2 : 3
  if (festivalSaid >= cap) return null
  const said = (line: string): string => { festivalSaid++; saveThrottle(); return line }
  const holiday = tomorrow?.lunar === '正月初一' ? '除夕' : d?.holiday?.off ? d.holiday.name : null
  const lines = (holiday && HOLIDAY[holiday]) || FESTIVAL[solar] || (d && FESTIVAL[d.lunar])
  if (lines) return said(pick(lines))
  if (holiday) return said(`[host]，今天是${holiday}，放假啦！祝你${holiday}快乐，今天要好好玩哦~`)
  if (d?.holiday) return said(`[host]，今天${d.holiday.name}调休要上班，辛苦啦，我给你加油！`)
  if (d?.term) return said(`[host]，今天是${d.term}，换季了要注意身体哦~`)
  return null
}

/** A small-talk line about the date; null while offline. */
export function dateTalk(): string | null {
  const [today] = days
  if (!today) return null
  const now = new Date()
  const lines = [`[host]，今天是农历${today.lunar}，星期${WEEK[now.getDay()]}~`]
  const i = days.findIndex((d, i) => i > 0 && d.holiday?.off && d.holiday.name !== today.holiday?.name)
  if (i > 0) lines.push(`[host]，再过${i}天就是${days[i].holiday!.name}啦，放假有什么计划吗？`)
  if ((now.getDay() === 0 || now.getDay() === 6) && !today.holiday) lines.push('周末啦，[host]今天好好休息一下吧~')
  const f = festival()
  if (f) lines.push(f)
  return pick(lines)
}
