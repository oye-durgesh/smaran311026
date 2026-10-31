import type { Food, Medicine } from './types'
import { TIME_OF_DAY_HM } from './medicines'

/**
 * Best-effort parse of a dictated/typed medicine sentence ("Metoprolol 50 mg subah shaam khane ke baad").
 * Only fills what was actually said; everything else stays empty for the user to complete. Never guesses.
 */
export function parseMedicineText(raw: string): Partial<Pick<Medicine, 'name' | 'strength' | 'dose' | 'frequency' | 'times' | 'food'>> {
  const t = raw.trim()
  const lc = t.toLowerCase()
  const out: ReturnType<typeof parseMedicineText> = {}
  const str = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|iu)\b/i.exec(t)
  if (str) out.strength = `${str[1]}${str[2].toLowerCase() === 'iu' ? ' IU' : str[2].toLowerCase()}`
  const nameEnd = str ? str.index : t.search(/\b(subah|shaam|raat|din|once|twice|daily|roz|khane|after|before|morning|evening|night)\b/i)
  const name = (nameEnd > 0 ? t.slice(0, nameEnd) : t.split(/\s+/)[0] ?? '').replace(/\b(tab|tablet|cap|capsule|syrup|medicine|dawa|dawai)\b/gi, '').trim()
  if (name) out.name = name.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase())
  const dose = /(\d+|ek|one|do|two|aadhi|half)\s*(tablets?|goli|capsules?|ml|teaspoons?|spoon)/i.exec(t)
  if (dose) out.dose = `${({ ek: '1', one: '1', do: '2', two: '2', aadhi: '1/2', half: '1/2' } as Record<string, string>)[dose[1].toLowerCase()] ?? dose[1]} ${/goli|tablet/i.test(dose[2]) ? 'tablet' : dose[2].toLowerCase()}`
  const periods: Array<[RegExp, keyof typeof TIME_OF_DAY_HM]> = [[/\b(subah|morning)\b/, 'morning'], [/\b(dopahar|afternoon)\b/, 'afternoon'], [/\b(shaam|evening)\b/, 'evening'], [/\b(raat|night)\b/, 'night']]
  const found = periods.filter(([re]) => re.test(lc)).map(([, k]) => TIME_OF_DAY_HM[k])
  if (found.length) {
    out.times = found
    out.frequency = found.length === 1 ? 'once' : found.length === 2 ? 'twice' : found.length === 3 ? 'thrice' : 'custom'
  } else if (/\b(twice|do baar|2 times)\b/.test(lc)) out.frequency = 'twice'
  else if (/\b(thrice|teen baar|3 times|three times)\b/.test(lc)) out.frequency = 'thrice'
  else if (/\b(once|ek baar|daily|roz)\b/.test(lc)) out.frequency = 'once'
  let food: Food | undefined
  if (/(khane ke baad|after (food|meal|eating)|khana khane ke baad)/.test(lc)) food = 'after'
  else if (/(khane se pehle|before (food|meal)|khali pet|empty stomach)/.test(lc)) food = 'before'
  else if (/(khane ke saath|with (food|meal))/.test(lc)) food = 'with'
  if (food) out.food = food
  return out
}
