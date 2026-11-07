import type { ProfileId, ReminderEvent } from '../types'
import { isVoiceRole } from './identity'
import { memberId } from './mapping'
import { scheduleRowId } from './scheduleUtils'

/** Spoken lines stay in voiceDiag / onTranscript. They are not rendered on the call screen. */
export const SHOW_CALL_TRANSCRIPTS = false

const DUE_HREF_KEY = 'smaran.dueCallHref'
const OPENED_KEY = 'smaran.openedCall'

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

export type DueReminderAction =
  | { type: 'skip'; reason: string }
  | { type: 'sheet' }
  | { type: 'call'; href: string; autoStart: boolean }

export function isEligibleMedicineReminder(e: Pick<ReminderEvent, 'kind' | 'status' | 'medicineId'>): boolean {
  if (e.kind === 'custom' || e.kind === 'appointment') return false
  if (e.status === 'taken' || e.status === 'skipped') return false
  return !!e.medicineId
}

export function canAutoStartCall(input: {
  micAllowed: boolean
  micPermission?: MicPermission
  userActivation: boolean
  callActive: boolean
  muted?: boolean
}): boolean {
  if (input.callActive) return false
  if (input.muted) return false
  if (!input.micAllowed) return false
  if (input.micPermission === 'denied' || input.micPermission === 'prompt') return false
  return input.userActivation
}

export function shouldBeginLiveSession(input: { alreadyActive: boolean; onCallScreen: boolean }): boolean {
  if (input.alreadyActive) return false
  if (input.onCallScreen) return false
  return true
}

export function hasOpenedDueCall(occurrenceId: string, store?: Pick<Storage, 'getItem'> | null): boolean {
  if (!occurrenceId) return false
  try {
    const raw = store?.getItem(OPENED_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(arr) && arr.includes(occurrenceId)
  } catch {
    return false
  }
}

export function markOpenedDueCall(occurrenceId: string, store?: Pick<Storage, 'getItem' | 'setItem'> | null): void {
  if (!occurrenceId || !store) return
  try {
    const raw = store.getItem(OPENED_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    const next = Array.isArray(arr) ? arr : []
    if (!next.includes(occurrenceId)) next.push(occurrenceId)
    store.setItem(OPENED_KEY, JSON.stringify(next.slice(-400)))
  } catch { /* ignore quota */ }
}

export function stashDueCallHref(href: string, store?: Pick<Storage, 'setItem'> | null): void {
  try { store?.setItem(DUE_HREF_KEY, href) } catch { /* ignore */ }
}

export function takeDueCallHref(store?: Pick<Storage, 'getItem' | 'removeItem'> | null): string | null {
  if (!store) return null
  try {
    const href = store.getItem(DUE_HREF_KEY)
    store.removeItem(DUE_HREF_KEY)
    return href || null
  } catch {
    return null
  }
}

export function peekDueCallHref(store?: Pick<Storage, 'getItem'> | null): string | null {
  try { return store?.getItem(DUE_HREF_KEY) || null } catch { return null }
}

export function buildReminderCallSearch(
  e: Pick<ReminderEvent, 'id' | 'medicineId' | 'time' | 'date' | 'profileId'>,
  input: { userId?: string | null; autoStart?: boolean },
): string {
  const params = new URLSearchParams()
  params.set('e', e.id)
  params.set('oid', e.id)
  params.set('from', 'due')
  if (e.medicineId) {
    params.set('med', e.medicineId)
    params.set('sch', scheduleRowId(e.medicineId, e.time))
  }
  params.set('t', e.time)
  params.set('date', e.date)
  params.set('who', e.profileId)
  if (input.userId) params.set('member', memberId(input.userId, e.profileId))
  if (input.autoStart) params.set('go', '1')
  return params.toString()
}

export function reminderCallHref(
  e: Pick<ReminderEvent, 'id' | 'medicineId' | 'time' | 'date' | 'profileId'>,
  input: { userId?: string | null; autoStart?: boolean },
): string {
  const auto = !!input.autoStart
  return `/call/${auto ? 'connecting' : 'incoming'}?${buildReminderCallSearch(e, input)}`
}

export function decideDueReminder(
  e: ReminderEvent,
  ctx: {
    activeProfileId: ProfileId
    pathname: string
    callActive: boolean
    alreadyOpened: boolean
    micAllowed: boolean
    micPermission?: MicPermission
    userActivation: boolean
    muted?: boolean
    userId?: string | null
  },
): DueReminderAction {
  if (e.kind === 'custom' || e.kind === 'appointment') return { type: 'sheet' }
  if (!isEligibleMedicineReminder(e)) return { type: 'skip', reason: 'not_eligible' }
  if (e.profileId !== ctx.activeProfileId) return { type: 'skip', reason: 'other_member' }
  if (ctx.alreadyOpened) return { type: 'skip', reason: 'already_opened' }
  if (ctx.callActive) return { type: 'skip', reason: 'call_active' }
  if (ctx.pathname.startsWith('/call')) return { type: 'skip', reason: 'on_call_screen' }
  const autoStart = isVoiceRole(e.profileId) && canAutoStartCall({
    micAllowed: ctx.micAllowed,
    micPermission: ctx.micPermission,
    userActivation: ctx.userActivation,
    callActive: ctx.callActive,
    muted: ctx.muted,
  })
  return {
    type: 'call',
    href: reminderCallHref(e, { userId: ctx.userId, autoStart }),
    autoStart,
  }
}

export function callStartMarksTaken(): boolean {
  return false
}
