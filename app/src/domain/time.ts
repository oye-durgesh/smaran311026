/** Time-zone aware helpers (no dependencies). All instants are ISO-8601 UTC strings in storage. */

export interface Parts { y: number; m: number; d: number; h: number; min: number; s: number; dow: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function dtf(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    })
    fmtCache.set(tz, f)
  }
  return f
}
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function tzParts(date: Date, tz: string): Parts {
  const o: Record<string, string> = {}
  for (const p of dtf(tz).formatToParts(date)) o[p.type] = p.value
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, s: +o.second, dow: DOW[o.weekday] }
}

function offsetMs(date: Date, tz: string): number {
  const p = tzParts(date, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000
}

/** Wall-clock time in `tz` → UTC instant. Handles DST by re-checking the offset. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min)
  let t = guess - offsetMs(new Date(guess), tz)
  const off2 = offsetMs(new Date(t), tz)
  t = guess - off2
  return new Date(t)
}

export function pad(n: number): string { return String(n).padStart(2, '0') }
export function localDateKey(date: Date, tz: string): string {
  const p = tzParts(date, tz)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}
export function parseHM(hm: string): { h: number; min: number } {
  const [h, min] = hm.split(':').map(Number)
  return { h, min }
}
export function addLocalDays(y: number, m: number, d: number, n: number): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}
/** Instant for HH:mm on the local date `dayOffset` days from `base` in tz. */
export function localTimeToUtc(base: Date, dayOffset: number, hm: string, tz: string): Date {
  const p = tzParts(base, tz)
  const dd = addLocalDays(p.y, p.m, p.d, dayOffset)
  const { h, min } = parseHM(hm)
  return zonedToUtc(dd.y, dd.m, dd.d, h, min, tz)
}

export function fmtTime(iso: string | Date, tz: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const p = tzParts(d, tz)
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12
  return `${h12}:${pad(p.min)} ${p.h < 12 ? 'AM' : 'PM'}`
}
export function fmtHM(hm: string): string {
  const { h, min } = parseHM(hm)
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(min)} ${h < 12 ? 'AM' : 'PM'}`
}
/** "8 AM" / "8:30 PM" short form used in routine summaries. */
export function fmtHMShort(hm: string): string {
  const { h, min } = parseHM(hm)
  const base = `${h % 12 === 0 ? 12 : h % 12}`
  return `${base}${min ? ':' + pad(min) : ''} ${h < 12 ? 'AM' : 'PM'}`
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const monthShort = (m: number) => MONTHS[m - 1]
export const dayName = (dow: number) => DAYS[dow]

/** "Today" / "Yesterday" / "Tomorrow" / weekday for the last 6 days / "29 Oct". */
export function fmtDayRel(iso: string | Date, now: Date, tz: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const a = tzParts(d, tz), b = tzParts(now, tz)
  const diff = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0 && diff > -7) return DAYS[a.dow]
  return `${a.d} ${MONTHS[a.m - 1]}`
}
export function fmtDayTime(iso: string, now: Date, tz: string): string {
  return `${fmtDayRel(iso, now, tz)}, ${fmtTime(iso, tz)}`
}
/** "Wednesday, 29 Oct" */
export function fmtLongDay(now: Date, tz: string): string {
  const p = tzParts(now, tz)
  return `${DAYS[p.dow]}, ${p.d} ${MONTHS[p.m - 1]}`
}
export function fmtFullDay(now: Date, tz: string): string {
  const p = tzParts(now, tz)
  const full = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${DAYS[p.dow]}, ${p.d} ${full[p.m - 1]}`
}
/** Value for <input type="datetime-local"> in tz. */
export function toLocalInput(iso: string, tz: string): string {
  const p = tzParts(new Date(iso), tz)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`
}
export function fromLocalInput(v: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v)
  if (!m) return null
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz)
}
export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}
export function greeting(now: Date, tz: string): string {
  const h = tzParts(now, tz).h
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
