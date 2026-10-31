/**
 * Which language is the person speaking RIGHT NOW? Sathi answers in that language, not in the profile default.
 * Deterministic and offline: script detection (Devanagari / Kannada) plus word lists for romanised Hindi and English.
 * Hinglish (romanised Hindi mixed with English) is answered in Hindi, written in the same romanised style the screens use.
 * Very short or ambiguous utterances ("ok", "haan") keep the language already in use.
 */
import type { Lang } from '../domain/types'

const HI = new Set('mujhe mujhko mera meri mere aap aapko aapki aapka main hum humein kya kab kal aaj parso subah savere dopahar shaam raat baje bajey yaad dila dilao dilana dena do de dijiye kijiye karo kar karna lagao laga lena le li liya lo lijiye dawa dawai goli haan nahi nahin theek achha accha bahut abhi baad pehle phir roz rozana har din hai hain ho hoga tha thi nikal chalna tehelna tahalna ka ki ke ko se par mein chahiye jaana jaane bhi'.split(' '))
const EN = new Set('remind reminder me to at pm am tomorrow today tonight morning evening afternoon night every day daily please take medicine tablet pill the my a an is it for and yes no not now minutes minute hour hours later cancel snooze done have has walk water check blood pressure what when how'.split(' '))
// markers that separate Marathi from Hindi in Devanagari
const MR = /(आहे|आहेत|मला|तुम्ही|तुला|करा|नका|होय|नाही|वाजता|सकाळी|संध्याकाळी|आठवण)/

export function detectLang(text: string, current: Lang): Lang {
  const t = text.normalize('NFC')
  if (/[\u0C80-\u0CFF]/.test(t)) return 'kn'
  if (/[\u0900-\u097F]/.test(t)) return MR.test(t) ? 'mr' : 'hi'
  const words = t.toLowerCase().match(/[a-z]+/g) ?? []
  if (words.length === 0) return current
  const hi = words.filter((w) => HI.has(w)).length
  const en = words.filter((w) => EN.has(w)).length
  if (hi === 0 && en === 0) return current          // unknown / ambiguous: keep the language in use
  if (hi > 0 && hi >= en) return 'hi'               // Hindi or Hinglish
  if (hi > 0 && en > hi) return hi >= 2 ? 'hi' : 'en'
  return 'en'
}
