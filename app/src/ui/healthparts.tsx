import type { Reading } from '../domain/types'
import { contextLabel, fmtBp, fmtSugar, isElevated } from '../domain/health'
import { fmtDayTime } from '../domain/time'

export const dotColor = (r: Reading) => (r.type === 'bp' ? '#6F526C' : isElevated(r) ? '#D98255' : '#7B8B5A')
export const readingTitle = (r: Reading, withContext: boolean) =>
  r.type === 'bp' ? fmtBp(r) : `${fmtSugar(r)}${withContext && r.context && r.context !== 'unspecified' ? ` · ${contextLabel(r.context)}` : ''}`
export const readingSub = (r: Reading, now: Date, tz: string, withContext: boolean) =>
  `${!withContext && r.type === 'sugar' && r.context && r.context !== 'unspecified' ? `${contextLabel(r.context)} · ` : ''}${fmtDayTime(r.at, now, tz)}`
export const byNewest = (a: Reading, b: Reading) => b.at.localeCompare(a.at)
