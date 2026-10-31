/**
 * Live ElevenLabs Agents conversation (beta). The browser never sees the API key: it receives a short-lived signed URL
 * from the `elevenlabs-session` Edge Function, then talks to ElevenLabs directly through @elevenlabs/client.
 * The agent acts on the user's data only through the client tools below, which reuse the app's validated actions.
 * Requires an agent configured in the ElevenLabs dashboard (see docs/BACKEND_SETUP.md). Not exercised against a live
 * agent in this repo's automated tests.
 */
import { backendConfigured, callFunction, callFunctionLoose, hasSession } from './backend'
import { reminderTools } from './agentTools'
import { localHealth } from './localApi'
import * as A from '../store/actions'
import { describeWhen } from '../domain/nlp'
import { validateParsed } from '../voice/brain'
import { fmtDayTime } from '../domain/time'
import { now, store } from '../store/store'
import { agentSessionConfig } from './agentConfig'
import { SELF_LOCAL_ID } from '../domain/people'
import { pushNow, syncStatus } from './sync'

export interface AgentHandlers {
  onConnect(): void
  onDisconnect(): void
  onMode(mode: 'speaking' | 'listening'): void
  onMessage(role: 'user' | 'agent', text: string): void
  onError(message: string): void
}
export interface AgentController { end(): Promise<void>; setMuted(muted: boolean): void; sendText(t: string): void }

const s0 = () => store.get()

export async function startAgent(h: AgentHandlers, ctx: { reminderId?: string }): Promise<AgentController> {
  // The server picks the agent from the profile's relationship in the database (Mummy → Mummy's agent, Papa → Papa's). A failure here
  // (missing agent or key, no access, ElevenLabs error) is shown as is, and never replaced by the other person's agent.
  const cfg = agentSessionConfig(s0(), { reminderTitle: ctx.reminderId ? s0().reminders.find((r) => r.id === ctx.reminderId)?.title : undefined })
  const expected = cfg.dynamicVariables.relationship === 'mother' ? 'mummy' : cfg.dynamicVariables.relationship === 'father' ? 'papa' : null
  if (s0().demo.sampleData) throw new Error('Live Sathi is not available while demo data is loaded. Use a real family profile signed in to your account.')
  if (cfg.personId === SELF_LOCAL_ID) throw new Error('This family profile is not saved to your account yet. Sign in and wait a moment, then try again.')
  let sess: { signedUrl: string; agent: string; personId: string }
  try {
    if (backendConfigured() && (await hasSession())) {
      await pushNow()
      if (syncStatus.state === 'error') throw new (await import('./backend')).BackendError(syncStatus.error || 'Could not save this family profile to your account.', 503, 'profile_not_synced')
      sess = await callFunction<{ signedUrl: string; agent: string; personId: string }>('elevenlabs-session', { personId: cfg.personId })
    }
    else {
      if (!(await localHealth())?.elevenlabs.agent) throw new (await import('./backend')).BackendError('The live voice agent is not set up (MUMMY_ELEVENLABS_AGENT_ID / PAPA_ELEVENLABS_AGENT_ID).', 503, 'missing_credentials')
      const r = await fetch('/api/elevenlabs-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId: cfg.personId, relationship: cfg.dynamicVariables.relationship, consent: store.get().prefs.voiceCloningConsent }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new (await import('./backend')).BackendError(b.error ?? `Request failed (${r.status})`, r.status, b.code)
      sess = b
    }
  } catch (e) {
    const { BackendError } = await import('./backend')
    throw new Error(e instanceof BackendError ? e.message : 'Could not reach the server.')
  }
  if (!expected || sess.agent !== expected || sess.personId !== cfg.personId) throw new Error("The server answered for a different profile than the one selected, so the conversation was not started.")
  const { signedUrl } = sess
  const { Conversation } = await import('@elevenlabs/client')
  const s = store.get()
  const active = ctx.reminderId ? s.reminders.find((r) => r.id === ctx.reminderId) : undefined

  // Reminder tools: when signed in, every change goes through the authenticated `reminders` Edge Function and the UI is refreshed from the
  // server's answer. Without a backend session (local dev API only) they fall back to this device's store and SAY SO.
  const signedIn = backendConfigured() && (await hasSession())
  const serverTools = reminderTools({
    call: (body) => callFunctionLoose('reminders', body), personId: cfg.personId, label: cfg.dynamicVariables.person_label, language: cfg.dynamicVariables.default_language,
    refresh: async () => { const { pullNow } = await import('./sync'); await pullNow() },
  })
  const localTools = {
    create_reminder: ({ title, date, time }: { title?: string; date?: string; time?: string }) => {
      if (!title || !time) return 'NOT SAVED. Ask the user for the reminder and the time.'
      const [hh, mm] = time.split(':').map(Number)
      const base = new Date(now()); if (date === 'tomorrow') base.setDate(base.getDate() + 1)
      base.setHours(hh, mm, 0, 0)
      const r = A.createReminder({ title, when: base })
      return r.ok ? `SAVED ON THIS DEVICE ONLY (not synced to the server). "${title}" at ${time}. Say that it is saved on this device only.` : `NOT SAVED. ${r.error}`
    },
    list_todays_reminders: () => {
      const up = store.view().reminders.filter((r) => r.status === 'scheduled' || r.status === 'snoozed').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).slice(0, 6)
      return up.length ? up.map((r) => `${r.title} at ${fmtDayTime(r.scheduledFor, now(), s.profile.timeZone)}`).join('; ') : 'No upcoming reminders.'
    },
    snooze_reminder: ({ minutes }: { minutes: number }) => { if (!active) return 'NOT SAVED. No reminder is active.'; const r = A.snoozeReminder(active.id, minutes); return r.ok ? `SAVED ON THIS DEVICE ONLY. Snoozed ${minutes} minutes.` : 'NOT SAVED. Only 5, 10 or 15 minutes are possible.' },
    complete_reminder: () => { if (!active) return 'NOT SAVED. No reminder is active.'; const r = A.completeReminder(active.id, 'voice'); return r.ok ? 'SAVED ON THIS DEVICE ONLY. Marked as done, as reported by the user.' : `NOT SAVED. ${r.error}` },
    cancel_reminder: () => { if (!active) return 'NOT SAVED. No reminder is active.'; const r = A.cancelReminder(active.id); return r.ok ? 'SAVED ON THIS DEVICE ONLY. Cancelled.' : `NOT SAVED. ${r.error}` },
    reschedule_reminder: () => 'NOT SAVED. Rescheduling by voice needs the server connection.',
  }
  const clientTools = {
    ...(signedIn ? serverTools : localTools),
    save_health_reading: (p: { type: 'sugar' | 'bp'; value?: number; unit?: 'mg/dL' | 'mmol/L'; systolic?: number; diastolic?: number; pulse?: number; context?: string }) => {
      // The agent must have read the value back and received a clear "yes" before calling this tool.
      const parsed = { type: p.type, value: p.value, unit: p.unit ?? 'mg/dL', systolic: p.systolic, diastolic: p.diastolic, pulse: p.pulse, context: (p.context as never) ?? 'unspecified' }
      const bad = validateParsed(parsed, now())
      if (bad) return `Not saved: ${bad}`
      A.saveReading(p.type === 'sugar'
        ? { type: 'sugar', at: now().toISOString(), value: p.value, unit: p.unit ?? 'mg/dL', context: (p.context as never) ?? 'unspecified', source: 'voice' }
        : { type: 'bp', at: now().toISOString(), systolic: p.systolic, diastolic: p.diastolic, pulse: p.pulse, source: 'voice' })
      return 'Reading saved.'
    },
  }

  const conv = await Conversation.startSession({
    signedUrl,
    // No voice override: each agent speaks with the voice configured for it in the ElevenLabs dashboard.
    clientTools,
    dynamicVariables: cfg.dynamicVariables,
    onConnect: () => h.onConnect(),
    onDisconnect: () => h.onDisconnect(),
    onError: (m: unknown) => h.onError(typeof m === 'string' ? m : 'Voice connection error'),
    onModeChange: (m: { mode: 'speaking' | 'listening' }) => h.onMode(m.mode),
    onMessage: (m: { message: string; source: string }) => h.onMessage(m.source === 'user' ? 'user' : 'agent', m.message),
  } as unknown as Parameters<typeof Conversation.startSession>[0])
  return {
    end: () => conv.endSession(),
    setMuted: (muted) => { void conv.setVolume({ volume: muted ? 0 : 1 }) },
    sendText: (t) => conv.sendUserMessage(t),
  }
}
