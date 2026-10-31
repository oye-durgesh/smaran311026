/**
 * What the app sends to ElevenLabs when it starts a live Sathi conversation. Pure, so it can be unit-tested.
 *  - dynamicVariables tell the shared agent WHO it is talking to (name, relationship, default language, timezone); they carry
 *    no identifiers a model could use to reach other people's data, and no medical values.
 *  - live conversations do not send a voice override; each dedicated agent uses the voice set in the ElevenLabs dashboard.
 *  - no language override is sent: the agent should answer in the language the person speaks (see docs/ELEVENLABS_AGENT.md).
 */
import type { AppState } from '../domain/types'
import { activePerson, effectiveSettings, voicePersona } from '../domain/people'

export interface AgentSessionConfig {
  personId: string
  persona: 'default' | 'mom' | 'dad'
  dynamicVariables: Record<string, string>
}
export function agentSessionConfig(s: AppState, ctx: { reminderTitle?: string }): AgentSessionConfig {
  const e = effectiveSettings(s)
  const p = activePerson(s)
  return {
    personId: e.personId,
    persona: voicePersona(s),
    dynamicVariables: {
      user_name: e.address,
      person_label: e.label,
      relationship: e.relationship,
      default_language: e.language,
      time_zone: e.timeZone,
      speaking_speed: e.speakingSpeed,
      reminder_title: ctx.reminderTitle ?? '',
      account_holder: p?.relationship === 'self' ? 'true' : 'false',
    },
  }
}
export const agentOverrides = (persona: AgentSessionConfig['persona'], voiceId: string) =>
  persona === 'default' ? undefined : { tts: { voiceId } }
