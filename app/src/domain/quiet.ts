import { store, now } from '../store/store'
import { parseHM, tzParts } from './time'

/** Within the user's quiet hours reminders are shown silently (no ringtone / silent notification). */
export function inQuietHours(at: Date = now()): boolean {
  const { quietHours, } = store.get().prefs
  if (!quietHours.enabled) return false
  const tz = store.get().profile.timeZone
  const p = tzParts(at, tz)
  const cur = p.h * 60 + p.min
  const f = parseHM(quietHours.from), t = parseHM(quietHours.to)
  const from = f.h * 60 + f.min, to = t.h * 60 + t.min
  return from === to ? false : from < to ? cur >= from && cur < to : cur >= from || cur < to
}
