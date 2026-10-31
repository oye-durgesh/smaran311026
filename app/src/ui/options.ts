import type { Lang } from '../domain/types'
import { DEFAULT_TZ, deviceTimeZone } from '../store/defaults'

export const LANGS: Array<{ code: Lang; native: string; sample: string; letter: string; bg: string }> = [
  { code: 'hi', native: 'हिन्दी', sample: '"नमस्ते, मैं साथी हूँ"', letter: 'अ', bg: '#E8C4B5' },
  { code: 'en', native: 'English', sample: '"Hello, I\'m Sathi"', letter: 'A', bg: '#E4EBEF' },
  { code: 'mr', native: 'मराठी', sample: '"नमस्कार, मी साथी आहे"', letter: 'म', bg: '#F3D6C6' },
  { code: 'kn', native: 'ಕನ್ನಡ', sample: '"ನಮಸ್ಕಾರ, ನಾನು ಸಾಥಿ"', letter: 'ಅ', bg: '#E8D8A5' },
]
export const langNative = (c: Lang) => LANGS.find((l) => l.code === c)!.native

const ZONES = ['Asia/Kolkata', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney']

function offsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    const o = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    return o.replace('GMT', 'UTC').replace(/^UTC$/, 'UTC±0') || 'UTC'
  } catch { return '' }
}
export function tzLabel(tz: string): string {
  if (tz === 'Asia/Kolkata') return 'India (IST, UTC+5:30)'
  const city = tz.split('/').pop()!.replace(/_/g, ' ')
  return `${city} (${offsetLabel(tz)})`
}
export function tzOptions(current: string): string[] {
  const set = new Set([DEFAULT_TZ, ...ZONES, deviceTimeZone(), current])
  return [...set]
}
