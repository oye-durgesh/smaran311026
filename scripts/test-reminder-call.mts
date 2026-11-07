import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  SHOW_CALL_TRANSCRIPTS,
  buildReminderCallSearch,
  callStartMarksTaken,
  canAutoStartCall,
  decideDueReminder,
  hasOpenedDueCall,
  markOpenedDueCall,
  reminderCallHref,
  shouldBeginLiveSession,
  stashDueCallHref,
  takeDueCallHref,
} from '../src/services/reminderCall.ts'
import type { ReminderEvent } from '../src/types/index.ts'

const mom: ReminderEvent = {
  id: 'med-mom-2026-11-07-08:00',
  profileId: 'mother',
  medicineId: 'med-mom',
  kind: 'medicine',
  date: '2026-11-07',
  time: '08:00',
  status: 'upcoming',
}

const dad: ReminderEvent = { ...mom, id: 'med-dad-2026-11-07-08:00', profileId: 'father', medicineId: 'med-dad' }
const custom: ReminderEvent = { ...mom, id: 'custom-1', kind: 'custom', title: 'Drink water', medicineId: '' }

const mem = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
}

{
  const href = reminderCallHref(mom, { userId: 'user-1', autoStart: false })
  assert.match(href, /^\/call\/incoming\?/)
  assert.match(href, /e=med-mom-2026-11-07-08%3A00|e=med-mom-2026-11-07-08:00/)
  const q = new URLSearchParams(href.split('?')[1])
  assert.equal(q.get('oid'), mom.id)
  assert.equal(q.get('med'), 'med-mom')
  assert.equal(q.get('sch'), 'sch_med-mom_0800')
  assert.equal(q.get('member'), 'mother_user-1')
  assert.equal(q.get('t'), '08:00')
  assert.equal(q.get('from'), 'due')
  assert.equal(q.get('go'), null)
  console.log('PASS due reminder opens the Sathi call screen directly')
}

{
  const action = decideDueReminder(mom, {
    activeProfileId: 'mother',
    pathname: '/home',
    callActive: false,
    alreadyOpened: false,
    micAllowed: true,
    micPermission: 'unknown',
    userActivation: false,
    userId: 'user-1',
  })
  assert.equal(action.type, 'call')
  assert.equal(action.type === 'call' && action.autoStart, false)
  assert.doesNotMatch(action.type === 'call' ? action.href : '', /sheet/)
  const customAction = decideDueReminder(custom, {
    activeProfileId: 'mother',
    pathname: '/home',
    callActive: false,
    alreadyOpened: false,
    micAllowed: true,
    userActivation: false,
  })
  assert.equal(customAction.type, 'sheet')
  console.log('PASS no reminder bottom sheet appears first for medicine dues')
}

{
  const store = mem()
  markOpenedDueCall(mom.id, store)
  assert.equal(hasOpenedDueCall(mom.id, store), true)
  const again = decideDueReminder(mom, {
    activeProfileId: 'mother',
    pathname: '/home',
    callActive: false,
    alreadyOpened: true,
    micAllowed: true,
    userActivation: true,
    micPermission: 'granted',
  })
  assert.equal(again.type, 'skip')
  if (again.type === 'skip') assert.equal(again.reason, 'already_opened')
  const dupHref = reminderCallHref(mom, { autoStart: true })
  stashDueCallHref(dupHref, store)
  takeDueCallHref(store)
  assert.equal(takeDueCallHref(store), null)
  console.log('PASS a reminder cannot trigger duplicate calls')
}

{
  assert.equal(shouldBeginLiveSession({ alreadyActive: true, onCallScreen: false }), false)
  const skip = decideDueReminder(mom, {
    activeProfileId: 'mother',
    pathname: '/today',
    callActive: true,
    alreadyOpened: false,
    micAllowed: true,
    userActivation: true,
    micPermission: 'granted',
  })
  assert.equal(skip.type, 'skip')
  if (skip.type === 'skip') assert.equal(skip.reason, 'call_active')
  const onScreen = decideDueReminder(dad, {
    activeProfileId: 'father',
    pathname: '/call/listening',
    callActive: false,
    alreadyOpened: false,
    micAllowed: true,
    userActivation: true,
    micPermission: 'granted',
  })
  assert.equal(onScreen.type, 'skip')
  console.log('PASS an already-active call is not interrupted')
}

{
  const denied = canAutoStartCall({ micAllowed: true, micPermission: 'denied', userActivation: true, callActive: false })
  const blocked = canAutoStartCall({ micAllowed: false, userActivation: true, callActive: false })
  const noGesture = canAutoStartCall({ micAllowed: true, micPermission: 'granted', userActivation: false, callActive: false })
  assert.equal(denied, false)
  assert.equal(blocked, false)
  assert.equal(noGesture, false)
  const fallback = decideDueReminder(mom, {
    activeProfileId: 'mother',
    pathname: '/home',
    callActive: false,
    alreadyOpened: false,
    micAllowed: true,
    micPermission: 'denied',
    userActivation: true,
  })
  assert.equal(fallback.type, 'call')
  if (fallback.type === 'call') {
    assert.equal(fallback.autoStart, false)
    assert.match(fallback.href, /\/call\/incoming/)
    assert.match(fallback.href, /from=due/)
  }
  console.log('PASS missing microphone permission gives a Start Call fallback')
}

{
  assert.equal(callStartMarksTaken(), false)
  const search = buildReminderCallSearch(mom, { userId: 'u', autoStart: true })
  assert.match(search, /go=1/)
  assert.match(search, /med=med-mom/)
  console.log('PASS successful taken confirmation is not implied by starting a call')
}

{
  assert.equal(SHOW_CALL_TRANSCRIPTS, false)
  console.log('PASS agent transcript is not rendered as a visible chat bubble')
}

{
  const other = decideDueReminder(mom, {
    activeProfileId: 'father',
    pathname: '/home',
    callActive: false,
    alreadyOpened: false,
    micAllowed: true,
    userActivation: true,
    micPermission: 'granted',
  })
  assert.equal(other.type, 'skip')
  const father = decideDueReminder(dad, {
    activeProfileId: 'father',
    pathname: '/home',
    callActive: false,
    alreadyOpened: false,
    micAllowed: true,
    userActivation: false,
  })
  assert.equal(father.type, 'call')
  console.log('PASS Mother and Father due navigation uses the selected member')
}

const callSrc = await readFile(resolve('src/screens/Call.tsx'), 'utf8')
assert.match(callSrc, /SHOW_CALL_TRANSCRIPTS/)
assert.match(callSrc, /Start Call/)
assert.doesNotMatch(callSrc, /liveBubble/)
assert.match(callSrc, /onTranscript/)
assert.match(callSrc, /setLines/)

const voiceSrc = await readFile(resolve('src/services/voiceService.ts'), 'utf8')
assert.match(voiceSrc, /textOnly:\s*false/)
assert.match(voiceSrc, /session\.setMicMuted\(false\)/)
assert.match(voiceSrc, /getUserMedia/)
assert.match(voiceSrc, /if \(activeLive\) return activeLive/)
assert.match(voiceSrc, /classifyVoiceMessage/)
console.log('PASS microphone capture and Sathi audio playback remain wired')

const runtimeSrc = await readFile(resolve('src/components/ReminderRuntime.tsx'), 'utf8')
assert.match(runtimeSrc, /decideDueReminder/)
assert.match(runtimeSrc, /nav\(href\)/)
assert.doesNotMatch(runtimeSrc, /if \(first\) setSheet/)
console.log('PASS ReminderRuntime navigates to the call screen instead of the due sheet')
