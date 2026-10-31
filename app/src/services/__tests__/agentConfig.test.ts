import { beforeEach, describe, expect, it } from 'vitest'
import * as A from '../../store/actions'
import { initialState } from '../../store/defaults'
import { store } from '../../store/store'
import { agentOverrides, agentSessionConfig } from '../agentConfig'

let mum: string, papa: string
beforeEach(() => {
  store.replace(initialState())
  A.updateProfile({ name: 'Durgesh', callName: 'Durgesh', language: 'en' })
  mum = (A.addPerson({ relationship: 'mother', displayName: 'Sunita', greetingName: 'Mummy', language: 'hi' }) as any).value.person.id
  papa = (A.addPerson({ relationship: 'father', displayName: 'Ramesh', greetingName: 'Papa', language: 'en' }) as any).value.person.id
  A.setPersonVoice(mum, 'mom'); A.setPersonVoice(papa, 'dad'); A.updatePerson(papa, { speakingSpeed: 'slower' })
})

describe('what the ElevenLabs session is told (mock-free, pure)', () => {
  it('Mummy’s session carries Mummy’s name, language and voice request', () => {
    A.setActivePerson(mum)
    const c = agentSessionConfig(store.get(), {})
    expect(c).toMatchObject({ personId: mum, persona: 'mom', dynamicVariables: { user_name: 'Mummy', person_label: 'Sunita', relationship: 'mother', default_language: 'hi', account_holder: 'false' } })
    expect(agentOverrides(c.persona, 'MomVoiceId0000000001')).toEqual({ tts: { voiceId: 'MomVoiceId0000000001' } })
  })
  it('Papa’s session is independent of Mummy’s (computed from state each time, nothing shared)', () => {
    A.setActivePerson(mum); const a = agentSessionConfig(store.get(), {})
    A.setActivePerson(papa); const b = agentSessionConfig(store.get(), {})
    A.setActivePerson(mum); const c = agentSessionConfig(store.get(), {})
    expect(b).toMatchObject({ personId: papa, persona: 'dad', dynamicVariables: { user_name: 'Papa', default_language: 'en', speaking_speed: 'slower' } })
    expect(a).toEqual(c)
    expect(a.personId).not.toBe(b.personId)
  })
  it('Mummy with the Default chip still requests mom; only self default sends no voice override', () => {
    A.setPersonVoice(mum, 'default'); A.setActivePerson(mum)
    expect(agentSessionConfig(store.get(), {}).persona).toBe('mom')
    const me = store.get().people.find((p) => p.relationship === 'self')!.id
    A.setActivePerson(me)
    expect(agentOverrides(agentSessionConfig(store.get(), {}).persona, 'x')).toBeUndefined()
  })
  it('sends no medical values or foreign identifiers, and never a language override', () => {
    A.setActivePerson(mum)
    const c = agentSessionConfig(store.get(), { reminderTitle: 'Walk' })
    expect(Object.keys(c.dynamicVariables).sort()).toEqual(['account_holder', 'default_language', 'person_label', 'relationship', 'reminder_title', 'speaking_speed', 'time_zone', 'user_name'])
    expect(JSON.stringify(c)).not.toMatch(/medicine|dose|sugar/i)
    expect(JSON.stringify(c)).not.toContain(papa)
  })
})
