import assert from 'node:assert/strict'
import { voiceLog } from '../src/services/callAudio.ts'
import { classifyVoiceMessage } from '../src/services/voiceService.ts'

let last: unknown[] = []
const orig = console.info
console.info = (...args: unknown[]) => { last = args }

voiceLog('audio_event', { chunks: 2, bytes: 1200, encoding: 'base64' })
assert.equal(last[0], '[smaran-voice]')
assert.equal(last[1], 'audio_event')

voiceLog('ws_connected', { signedUrl: 'wss://example/secret', token: 'abc', chunks: 1 })
const extra = last[2] as Record<string, unknown>
assert.equal(extra.signedUrl, '[redacted]')
assert.equal(extra.token, '[redacted]')
assert.equal(extra.chunks, 1)

console.info = orig
console.log('PASS call-audio diagnostics redact secrets')

assert.deepEqual(classifyVoiceMessage({ role: 'user', source: 'user', message: 'Maine dawa le li' }), { role: 'user', text: 'Maine dawa le li' })
assert.deepEqual(classifyVoiceMessage({ role: 'agent', source: 'ai', message: 'Achha, main note kar leti hoon' }), { role: 'agent', text: 'Achha, main note kar leti hoon' })
assert.equal(classifyVoiceMessage({ source: 'ai', message: 'I have marked it taken' })?.role, 'agent')
assert.equal(classifyVoiceMessage({ source: 'user', message: '   ' }), null)
assert.equal(classifyVoiceMessage({ message: 'fallback without role' })?.role, 'agent')
console.log('PASS user transcripts are never inferred from agent/AI messages')
