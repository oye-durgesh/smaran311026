/**
 * Shared identity for voice: authenticated user + family_members row + agent role.
 * Demo localStorage profiles (mother/father) still resolve to real DB ids after upsert.
 * Agent IDs stay on the Edge Function. This module never sees ELEVENLABS_API_KEY.
 */
import type { ProfileId } from '../types'
import { BackendError, backendConfigured, currentSession, getClient, hasSession } from './backend'
import { familyMemberRow } from './mapping'
import { bindGetState } from './identityBind'

export type VoiceRole = 'mother' | 'father'
export type AgentWho = 'mummy' | 'papa'

export interface VoiceIdentity {
  userId: string
  personId: string
  role: VoiceRole
  expectedAgent: AgentWho
}

export const isVoiceRole = (id: ProfileId | string): id is VoiceRole => id === 'mother' || id === 'father'

export const agentForRole = (role: VoiceRole): AgentWho => (role === 'mother' ? 'mummy' : 'papa')

const SIGN_IN = 'Sign in to talk to Sathi. Mother and Father use a real voice session, which needs a Smaran account.'

export async function ensureFamilyMemberRows(): Promise<string> {
  if (!backendConfigured()) throw new BackendError(SIGN_IN, 401, 'not_signed_in')
  const session = await currentSession()
  if (!session) throw new BackendError(SIGN_IN, 401, 'not_signed_in')
  const uid = session.user.id
  const getState = bindGetState()
  if (!getState) throw new BackendError('The app is still starting. Please try again in a moment.', 0, 'not_ready')
  const s = getState()
  const members = s.profiles.map((p) => familyMemberRow(s, uid, p.id)).filter((row): row is NonNullable<typeof row> => !!row)
  if (!members.length) throw new BackendError('Could not save family profiles for voice.', 0, 'member_sync')
  const { error } = await (await getClient()).from('family_members').upsert(members)
  if (error) throw new BackendError(error.message || 'Could not save family profiles for voice.', 0, 'member_sync')
  return uid
}

export async function resolveVoiceIdentity(profileId: ProfileId): Promise<VoiceIdentity> {
  if (!isVoiceRole(profileId)) {
    throw new BackendError('Only Mother and Father have a dedicated Sathi voice agent.', 422, 'no_agent_for_profile')
  }
  if (!(await hasSession())) throw new BackendError(SIGN_IN, 401, 'not_signed_in')
  const uid = await ensureFamilyMemberRows()
  const { data, error } = await (await getClient())
    .from('family_members')
    .select('id, relationship, active')
    .eq('owner_id', uid)
    .eq('relationship', profileId)
    .maybeSingle()
  if (error) throw new BackendError(error.message || 'Could not load this family profile.', 0, 'member_lookup')
  if (!data?.id) throw new BackendError('This family profile is not saved to your account yet. Sign in, then try again.', 403, 'profile_not_synced')
  if (data.active === false) throw new BackendError('You do not have access to this family profile.', 403, 'forbidden')
  if (data.relationship !== profileId) {
    throw new BackendError('This family profile does not match Mother or Father.', 422, 'no_agent_for_profile')
  }
  return { userId: uid, personId: data.id, role: profileId, expectedAgent: agentForRole(profileId) }
}
