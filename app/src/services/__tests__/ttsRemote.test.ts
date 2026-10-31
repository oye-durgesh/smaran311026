import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<{ name: string; body: any }> = []
let respond: (body: any) => { blob: Blob; headers: Headers } | Error
vi.mock('../backend', () => {
  class BackendError extends Error { constructor(m: string, readonly status: number, readonly code?: string) { super(m) } }
  return {
    BackendError, backendConfigured: () => true, hasSession: async () => true,
    callFunctionBlobWithHeaders: async (name: string, body: any) => { calls.push({ name, body }); const r = respond(body); if (r instanceof Error) throw r; return r },
  }
})
vi.mock('../localApi', () => ({ localHealth: async () => null }))

import { store } from '../../store/store'
import { speakRemote } from '../ttsRemote'
import { BackendError } from '../backend'

class FakeAudio { onplay?: () => void; onended?: () => void; onerror?: () => void; playbackRate = 1; constructor(public src: string) {} async play() { this.onplay?.(); setTimeout(() => this.onended?.(), 0) } pause() {} }
beforeEach(() => {
  calls.length = 0
  ;(globalThis as any).Audio = FakeAudio
  ;(globalThis as any).URL.createObjectURL = () => 'blob:x'; (globalThis as any).URL.revokeObjectURL = () => {}
  respond = (b) => ({ blob: new Blob(['a']), headers: new Headers({ 'x-voice-persona': b.persona }) })
})
import { setPersonVoice, setActivePerson } from '../../store/actions'
import { selfOf } from '../../domain/people'
const setVoice = (v: 'default' | 'mom' | 'dad') => { const id = selfOf(store.get())!.id; setActivePerson(id); setPersonVoice(id, v) }
const speak = () => new Promise<string | null>((res) => { void speakRemote('hi', { rate: 1, onEnd: () => res(null), onError: (m) => res(m) }) })

describe('client voice selection', () => {
  it('sends the CURRENT selection with every utterance; switching applies immediately in both directions', async () => {
    for (const v of ['mom', 'dad', 'mom', 'default'] as const) { setVoice(v); expect(await speak()).toBeNull() }
    expect(calls.map((c) => c.body.persona)).toEqual(['mom', 'dad', 'mom', 'default'])
    expect(calls.every((c) => c.name === 'tts')).toBe(true)
    expect(calls.every((c) => 'personId' in c.body)).toBe(true)
  })
  it('discards audio if the server says it used a different persona', async () => {
    setVoice('mom')
    respond = () => ({ blob: new Blob(['a']), headers: new Headers({ 'x-voice-persona': 'dad' }) })
    expect(await speak()).toMatch(/different voice/)
  })
  it('a missing voice yields a clear message (caller shows it and uses the browser voice, never another person)', async () => {
    setVoice('dad')
    respond = () => new BackendError("Dad's voice is not set up on the server.", 503, 'voice_not_configured')
    expect(await speak()).toMatch(/Dad's voice is not set up/)
    respond = () => new BackendError('x', 403, 'consent_required')
    expect(await speak()).toMatch(/consent/i)
    respond = () => new BackendError('x', 502, 'voice_invalid')
    expect(await speak()).toMatch(/Voice setting/)
  })
  it('network failure is reported as an error', async () => {
    respond = () => new Error('Failed to fetch')
    expect(await speak()).toMatch(/Failed to fetch/)
  })
})
