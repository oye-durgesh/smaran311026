/** MOCK: the Supabase client is replaced. Server-side enforcement (expiry, email match, scope, revocation) is tested for real against Postgres in supabase/tests/db.test.ts. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let inserted: any, rpcCalls: Array<[string, any]> = [], rpcError: { message: string } | null = null, insertError: any = null
vi.mock('../backend', () => {
  class BackendError extends Error { constructor(m: string, readonly status: number) { super(m) } }
  const client = {
    from: () => ({ insert: (row: any) => { inserted = row; return { select: () => ({ single: async () => (insertError ? { data: null, error: insertError } : { data: { id: row.id, expires_at: '2026-11-05T00:00:00Z' }, error: null }) }) } } }),
    rpc: async (name: string, args: any) => { rpcCalls.push([name, args]); return { error: rpcError } },
  }
  return { BackendError, getClient: async () => client, currentSession: async () => ({ user: { id: 'owner-1' } }) }
})
import { acceptInvitation, createInvitation, randomCode, revokeMembership } from '../familyApi'

const perms = { helpSetup: true, viewSchedule: true, viewReadings: false }
beforeEach(() => { vi.stubGlobal('window', { location: { origin: 'https://app.test', pathname: '/' } }); inserted = undefined; rpcCalls = []; rpcError = null; insertError = null })

describe('family invitations (mock client)', () => {
  it('creates a pending invitation owned by the signed-in user, bound to a lower-cased email and a profile scope; no phone number is involved', async () => {
    const r = await createInvitation({ email: ' Anita@Example.COM ', relation: 'Daughter', role: 'helper', personScope: ['per_mum'], permissions: perms })
    expect(inserted).toMatchObject({ owner_id: 'owner-1', status: 'pending', role: 'helper', invited_email: 'anita@example.com', person_scope: ['per_mum'], perm_view_readings: false })
    expect(inserted).not.toHaveProperty('member_id'); expect(JSON.stringify(inserted)).not.toMatch(/phone/i)
    expect(r.code).toMatch(/^[a-z0-9]{12}$/); expect(r.url).toContain(`#join/${r.code}`)
  })
  it('rejects a bad email and an empty profile scope before contacting the server', async () => {
    await expect(createInvitation({ email: 'nope', relation: 'x', role: 'helper', personScope: null, permissions: perms })).rejects.toThrow(/valid email/)
    await expect(createInvitation({ relation: 'x', role: 'helper', personScope: [], permissions: perms })).rejects.toThrow(/at least one person/)
    expect(inserted).toBeUndefined()
  })
  it('codes are random and long enough', () => { const s = new Set(Array.from({ length: 50 }, () => randomCode())); expect(s.size).toBe(50) })
  it('a failed insert is reported, never as success', async () => {
    insertError = { message: 'boom' }
    await expect(createInvitation({ relation: 'x', role: 'helper', personScope: null, permissions: perms })).rejects.toThrow(/could not be created/)
  })
  it.each([
    ['invitation has expired', /expired/], ['this invitation was sent to a different email address', /different email/],
    ['invitation is invalid or already used', /not valid any more/], ['not signed in', /sign in/],
  ])('accepting: "%s" becomes a plain message', async (dbMsg, want) => {
    rpcError = { message: dbMsg }
    await expect(acceptInvitation('abc')).rejects.toThrow(want)
    expect(rpcCalls[0]).toEqual(['accept_invite', { p_code: 'abc' }])
  })
  it('revoking calls the owner-only function', async () => {
    await revokeMembership('ms_1'); expect(rpcCalls[0]).toEqual(['revoke_membership', { p_id: 'ms_1' }])
    rpcError = { message: 'not allowed' }; await expect(revokeMembership('ms_1')).rejects.toThrow(/could not be removed/)
  })
})
