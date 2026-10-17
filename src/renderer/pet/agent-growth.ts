import { addInfo, growthPerMinute, info, save, update } from './store'
import { dayStart } from './vip'

/** Claude Code work counts as time spent with the pet: 10,000 output tokens are 10 minutes. */
const MINUTES_PER_TOKEN = 10 / 10_000
/** At most 3 hours a day, so heavy days do not outgrow the online clock (about 640 growth in 8 hours). */
const DAY_CAP = 180
/** Of what those minutes are worth, 75% goes to growth and 25% to intelligence. */
const GROWTH_SHARE = 0.75

/** saveJsonData.agent: minutes counted today, and intelligence below one point not yet added. */
interface Tally {
  day: number
  minutes: number
  intelRest: number
}

const tally = (): Tally => {
  const t: Partial<Tally> = JSON.parse(save.saveJsonData.agent || '{}')
  return t.day === dayStart() ? { day: t.day, minutes: t.minutes ?? 0, intelRest: t.intelRest ?? 0 } : { day: dayStart(), minutes: 0, intelRest: t.intelRest ?? 0 }
}

/** Grows the pet for a finished Claude Code task; what it gained, rounded for the bubble. */
export function feedTokens(tokens: number): { growth: number; intel: number } {
  const t = tally()
  const minutes = Math.min(tokens * MINUTES_PER_TOKEN, DAY_CAP - t.minutes)
  // A dead pet does not grow, like the online clock.
  if (minutes <= 0 || !info.health) return { growth: 0, intel: 0 }
  const worth = growthPerMinute() * minutes
  const growth = +(worth * GROWTH_SHARE).toFixed(8)
  // Intelligence is shown as a whole number; fractions wait in the tally.
  const intelSum = t.intelRest + worth * (1 - GROWTH_SHARE)
  const intel = Math.floor(intelSum)
  addInfo('growth', growth)
  if (intel) addInfo('intel', intel)
  update('saveJsonData', { agent: JSON.stringify({ day: t.day, minutes: t.minutes + minutes, intelRest: intelSum - intel }) })
  return { growth: Math.round(growth), intel }
}
