/**
 * Family access against Supabase (Row Level Security does the enforcing; this file only calls it).
 *  - Invitations are rows the OWNER creates. Acceptance happens in the database (`accept_invite`), only for a signed-in user, before expiry,
 *    and, when the invitation names an email, only for that verified email. Nothing here can grant access by typing a phone number.
 *  - Revocation is `revoke_membership` (owner only).
 */
import type { Permissions } from '../domain/types'
import { BackendError, currentSession, getClient } from './backend'

export type MemberRole = 'admin' | 'read-only' | 'helper'
export const ROLE_LABEL: Record<MemberRole, string> = { admin: 'Caregiver (can help set up)', helper: 'Helper (suggests changes)', 'read-only': 'Family member (view only)' }

export function randomCode(len = 12): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export interface CreateInvitation { email?: string; relation: string; role: MemberRole; personScope: string[] | null; permissions: Permissions }
export interface CreatedInvitation { id: string; code: string; url: string; expiresAt: string }

export async function createInvitation(i: CreateInvitation): Promise<CreatedInvitation> {
  const s = await currentSession(); if (!s) throw new BackendError('Please sign in first.', 401)
  const email = i.email?.trim().toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new BackendError('Enter a valid email address, or leave it empty.', 400)
  if (i.personScope && i.personScope.length === 0) throw new BackendError('Choose at least one person this invitation can see.', 400)
  const id = `ms_${randomCode(10)}`, code = randomCode(12)
  const { data, error } = await (await getClient()).from('family_memberships').insert({
    id, owner_id: s.user.id, invite_code: code, relation: i.relation.slice(0, 40) || 'Family member', role: i.role, status: 'pending', invited_email: email || null,
    person_scope: i.personScope, perm_help_setup: i.permissions.helpSetup, perm_view_schedule: i.permissions.viewSchedule, perm_view_readings: i.permissions.viewReadings,
  }).select('id, expires_at').single()
  if (error) throw new BackendError('The invitation could not be created. Please try again.', 500)
  return { id: data.id, code, url: `${window.location.origin}${window.location.pathname}#join/${code}`, expiresAt: data.expires_at }
}

const friendly = (m: string) =>
  /expired/i.test(m) ? 'This invitation has expired. Ask for a new one.'
  : /different email/i.test(m) ? 'This invitation was sent to a different email address. Sign in with the address it was sent to.'
  : /invalid or already used/i.test(m) ? 'This invitation is not valid any more. It may have been used, cancelled or withdrawn.'
  : /not signed in/i.test(m) ? 'Please sign in first.' : 'Something went wrong. Please try again.'

export async function acceptInvitation(code: string): Promise<void> {
  const { error } = await (await getClient()).rpc('accept_invite', { p_code: code.trim() })
  if (error) throw new BackendError(friendly(error.message), 400)
}
export async function revokeMembership(id: string): Promise<void> {
  const { error } = await (await getClient()).rpc('revoke_membership', { p_id: id })
  if (error) throw new BackendError('Access could not be removed. Please try again.', 400)
}
export interface MembershipRow { id: string; relation: string; role: MemberRole; status: 'pending' | 'active' | 'revoked'; invited_email: string | null; person_scope: string[] | null; perm_help_setup: boolean; perm_view_schedule: boolean; perm_view_readings: boolean; expires_at: string }
export async function listMemberships(ownerId: string): Promise<MembershipRow[]> {
  const { data, error } = await (await getClient()).from('family_memberships').select('id, relation, role, status, invited_email, person_scope, perm_help_setup, perm_view_schedule, perm_view_readings, expires_at').eq('owner_id', ownerId).neq('status', 'revoked').order('created_at')
  if (error) throw error
  return (data ?? []) as MembershipRow[]
}

/** Owner changes what an existing member may see. The server rejects anyone else (RLS: only the owner can update the row). */
export async function updateMemberPermission(id: string, key: keyof Permissions, value: boolean): Promise<void> {
  const col = key === 'helpSetup' ? 'perm_help_setup' : key === 'viewSchedule' ? 'perm_view_schedule' : 'perm_view_readings'
  const { error } = await (await getClient()).from('family_memberships').update({ [col]: value }).eq('id', id)
  if (error) throw new BackendError('The permission could not be changed. Please try again.', 400)
}
