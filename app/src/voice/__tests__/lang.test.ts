import { describe, expect, it } from 'vitest'
import { detectLang } from '../lang'

describe('language the person is speaking now', () => {
  it.each([
    ['Remind me to go for a walk at 6 PM', 'en'],
    ['Remind Mummy every day at 6 PM to go for a walk', 'en'],
    ['Mujhe shaam 6 baje walk par jaane ki yaad dila dena', 'hi'],
    ['Mujhe subah 7 baje walk ki yaad dila dena', 'hi'],
    ['Papa ko raat 9 baje BP medicine ka reminder laga do', 'hi'],
    ['मुझे शाम 6 बजे टहलने की याद दिला देना', 'hi'],
    ['मला संध्याकाळी सहा वाजता आठवण करा', 'mr'],
    ['ನನಗೆ ಸಂಜೆ ನೆನಪಿಸಿ', 'kn'],
  ])('%s → %s', (text, want) => expect(detectLang(text, want === 'hi' ? 'en' : 'hi')).toBe(want))
  it('switches to English when a Hindi-profile user speaks English, and back', () => {
    let lang: 'hi' | 'en' | 'mr' | 'kn' = 'hi'
    lang = detectLang('please remind me to take my tablet at 8 pm', lang); expect(lang).toBe('en')
    lang = detectLang('theek hai, aaj shaam ko bhi yaad dila dena', lang); expect(lang).toBe('hi')
  })
  it('short or ambiguous replies keep the language already in use', () => {
    expect(detectLang('ok', 'hi')).toBe('hi'); expect(detectLang('ok', 'en')).toBe('en'); expect(detectLang('6', 'hi')).toBe('hi'); expect(detectLang('', 'en')).toBe('en')
  })
  it('Hinglish is answered in Hindi style', () => {
    expect(detectLang('mujhe walk ka reminder chahiye at 6 pm', 'en')).toBe('hi')
  })
})
