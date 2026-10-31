import { createReminder as mk, fireDue } from '../reminders'
import type { Reminder } from '../types'

export function createReminder(title: string, when: Date, now = new Date(when.getTime() - 3600_000)): Reminder {
  return mk({ ownerId: 'me', title, when, timeZone: 'Asia/Kolkata' }, now)
}
export function ringing(title: string, now: Date): Reminder {
  const r = createReminder(title, new Date(now.getTime() - 60_000), new Date(now.getTime() - 3600_000))
  return fireDue([r], now).reminders[0]
}
