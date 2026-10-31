import assert from 'node:assert/strict'
import { signToolSession, verifyToolSession, relAllowedForAgent } from '../supabase/functions/_shared/tool-session.ts'
import { runMedicineTool, type MedRow, type MedicineStore, type MemberRow, type RemRow } from '../supabase/functions/_shared/medicine-tools.ts'
import { promptHasHardcodedSchedule } from '../supabase/functions/_shared/register-tools.ts'

const SECRET = 'test-tool-secret'

class Mem implements MedicineStore {
  members: MemberRow[] = []
  meds: MedRow[] = []
  rems: RemRow[] = []
  fail = false
  async getMember(ownerId: string, memberId: string) {
    if (this.fail) throw new Error('down')
    return this.members.find((m) => m.owner_id === ownerId && m.id === memberId) ?? null
  }
  async listMedicines(ownerId: string, memberId: string) {
    if (this.fail) throw new Error('down')
    return this.meds.filter((m) => m.owner_id === ownerId && m.family_member_id === memberId)
  }
  async listReminders(ownerId: string, memberId: string) {
    if (this.fail) throw new Error('down')
    return this.rems.filter((r) => r.owner_id === ownerId && r.family_member_id === memberId)
  }
  async getReminder(ownerId: string, id: string) {
    return this.rems.find((r) => r.owner_id === ownerId && r.id === id) ?? null
  }
  async upsertReminder(row: RemRow) {
    const i = this.rems.findIndex((r) => r.id === row.id)
    if (i >= 0) this.rems[i] = row
    else this.rems.push(row)
    return row
  }
}

const member = (p: Partial<MemberRow> & Pick<MemberRow, 'id' | 'owner_id' | 'relationship'>): MemberRow => ({
  active: true, language: 'hi', time_zone: 'Asia/Kolkata', display_name: p.relationship, ...p,
})
const med = (p: Partial<MedRow> & Pick<MedRow, 'id' | 'owner_id' | 'family_member_id' | 'name' | 'times'>): MedRow => ({
  strength: '500mg', dose: '1 tablet', frequency: 'once', food: 'after', status: 'active', ...p,
})

async function claims(uid: string, mid: string, rel: 'mother' | 'father' | 'self') {
  const ag = rel === 'mother' ? 'mummy' as const : rel === 'father' ? 'papa' as const : 'self' as const
  const tok = await signToolSession(SECRET, { uid, mid, rel, ag })
  const c = await verifyToolSession(SECRET, tok)
  assert.ok(c)
  return c!
}

const now = new Date('2026-10-31T03:00:00+05:30') // 03:00 IST — before 05:51

function check(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve(fn()).then(() => console.log('PASS', name))
}

const A = 'user-a'
const B = 'user-b'
const momA = 'mother_user-a'
const dadA = 'father_user-a'
const momB = 'mother_user-b'

async function main() {
  await check('session token rejects tampering', async () => {
    const tok = await signToolSession(SECRET, { uid: A, mid: momA, rel: 'mother', ag: 'mummy' })
    assert.equal(await verifyToolSession('other', tok), null)
    assert.equal(await verifyToolSession(SECRET, tok.slice(0, -2) + 'xx'), null)
  })

  await check('mother agent cannot bind father relationship', () => {
    assert.equal(relAllowedForAgent('mummy', 'father'), false)
    assert.equal(relAllowedForAgent('mummy', 'mother'), true)
    assert.equal(relAllowedForAgent('papa', 'mother'), false)
  })

  const store = new Mem()
  store.members.push(
    member({ id: momA, owner_id: A, relationship: 'mother', display_name: 'Mummy' }),
    member({ id: dadA, owner_id: A, relationship: 'father', display_name: 'Papa' }),
    member({ id: momB, owner_id: B, relationship: 'mother', display_name: 'Other' }),
  )
  store.meds.push(
    med({ id: 'met', owner_id: A, family_member_id: momA, name: 'Metformin', times: ['05:51'] }),
    med({ id: 'aml', owner_id: A, family_member_id: momA, name: 'Amlodipine', strength: '5mg', times: ['09:00'] }),
    med({ id: 'eco', owner_id: A, family_member_id: momA, name: 'Ecosprin', strength: '75mg', times: ['20:30'] }),
    med({ id: 'dad1', owner_id: A, family_member_id: dadA, name: 'Ecosprin', strength: '75mg', times: ['08:00'] }),
    med({ id: 'other', owner_id: B, family_member_id: momB, name: 'SecretMed', times: ['07:00'] }),
  )

  const momCtx = { claims: await claims(A, momA, 'mother'), webhookAgent: 'mummy' as const, now }
  const dadCtx = { claims: await claims(A, dadA, 'father'), webhookAgent: 'papa' as const, now }

  await check('mother schedule is live DB rows only', async () => {
    const r = await runMedicineTool(store, momCtx, 'get_medicine_schedule', { smaran_session: 'x' })
    assert.equal(r.ok, true)
    if (!r.ok) return
    const names = (r.medicines as { name: string; times: string[] }[]).map((m) => `${m.name}|${m.times.join(',')}`)
    assert.deepEqual(names.sort(), ['Amlodipine|09:00', 'Ecosprin|20:30', 'Metformin|05:51'])
  })

  await check('edit time is returned on next call', async () => {
    store.meds = store.meds.map((m) => m.id === 'met' ? { ...m, times: ['06:15'] } : m)
    const r = await runMedicineTool(store, momCtx, 'get_medicine_schedule', {})
    assert.ok(r.ok)
    if (!r.ok) return
    const met = (r.medicines as { name: string; times: string[] }[]).find((m) => m.name === 'Metformin')
    assert.deepEqual(met?.times, ['06:15'])
  })

  await check('discontinued medicine drops from active schedule', async () => {
    store.meds = store.meds.map((m) => m.id === 'met' ? { ...m, status: 'completed' } : m)
    const r = await runMedicineTool(store, momCtx, 'get_todays_medicine_status', {})
    assert.ok(r.ok)
    if (!r.ok) return
    const names = (r.doses as { name: string }[]).map((d) => d.name)
    assert.equal(names.includes('Metformin'), false)
    store.meds = store.meds.map((m) => m.id === 'met' ? { ...m, status: 'active', times: ['05:51'] } : m)
  })

  await check('father does not see mother medicines', async () => {
    const r = await runMedicineTool(store, dadCtx, 'get_medicine_schedule', {})
    assert.ok(r.ok)
    if (!r.ok) return
    const names = (r.medicines as { name: string }[]).map((m) => m.name)
    assert.deepEqual(names, ['Ecosprin'])
  })

  await check('cross-account family_member_id is ignored and denied when mismatched', async () => {
    const r = await runMedicineTool(store, momCtx, 'get_medicine_schedule', { family_member_id: momB })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'permission_denied')
  })

  await check('mother session cannot use father webhook agent', async () => {
    const r = await runMedicineTool(store, { ...momCtx, webhookAgent: 'papa' }, 'get_medicine_schedule', {})
    assert.equal(r.ok, false)
  })

  await check('user B token cannot read user A medicines', async () => {
    const r = await runMedicineTool(store, { claims: await claims(B, momB, 'mother'), webhookAgent: 'mummy', now }, 'get_medicine_schedule', {})
    assert.ok(r.ok)
    if (!r.ok) return
    const names = (r.medicines as { name: string }[]).map((m) => m.name)
    assert.deepEqual(names, ['SecretMed'])
    assert.equal(names.includes('Metformin'), false)
  })

  await check('today status before 05:51 is upcoming', async () => {
    const r = await runMedicineTool(store, momCtx, 'get_todays_medicine_status', {})
    assert.ok(r.ok)
    if (!r.ok) return
    const met = (r.doses as { name: string; status: string; time: string }[]).find((d) => d.name === 'Metformin')
    assert.equal(met?.time, '05:51')
    assert.equal(met?.status, 'upcoming')
  })

  await check('after scheduled time the dose is due', async () => {
    const late = { ...momCtx, now: new Date('2026-10-31T06:00:00+05:30') }
    const r = await runMedicineTool(store, late, 'get_next_medicine_dose', {})
    assert.ok(r.ok)
    if (!r.ok) return
    const next = r.next as { medicine?: string; time?: string; status?: string }
    assert.equal(next.medicine, 'Metformin')
    assert.equal(next.time, '05:51')
    assert.equal(next.status, 'due')
  })

  await check('taken requires confirmation', async () => {
    const r = await runMedicineTool(store, momCtx, 'mark_medicine_taken', { medicine_name: 'Metformin', time: '05:51' })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'needs_confirmation')
    assert.equal(store.rems.length, 0)
  })

  await check('taken after confirm updates status', async () => {
    const r = await runMedicineTool(store, momCtx, 'mark_medicine_taken', { medicine_name: 'Metformin', time: '05:51', confirmed: true })
    assert.equal(r.ok, true)
    const again = await runMedicineTool(store, momCtx, 'get_todays_medicine_status', {})
    assert.ok(again.ok)
    if (!again.ok) return
    const met = (again.doses as { name: string; status: string }[]).find((d) => d.name === 'Metformin')
    assert.equal(met?.status, 'taken')
  })

  await check('snooze requires confirm and updates next time', async () => {
    const r = await runMedicineTool(store, momCtx, 'snooze_medicine_reminder', { medicine_name: 'Amlodipine', time: '09:00' })
    assert.equal(r.ok, false)
    const ok = await runMedicineTool(store, momCtx, 'snooze_medicine_reminder', { medicine_name: 'Amlodipine', time: '09:00', confirmed: true, minutes: 10 })
    assert.equal(ok.ok, true)
    if (!ok.ok) return
    assert.ok(typeof ok.snoozed_until === 'string')
  })

  await check('backend down does not guess', async () => {
    store.fail = true
    const r = await runMedicineTool(store, momCtx, 'get_medicine_schedule', {})
    store.fail = false
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'unavailable')
    assert.match(r.message, /cannot verify/i)
  })

  await check('tool prompt addendum has no hardcoded schedule', () => {
    assert.equal(promptHasHardcodedSchedule('Never guess or memorise medicine names, doses, or reminder times.'), false)
    assert.equal(promptHasHardcodedSchedule('Remind Mummy to take Metformin at 05:51 AM'), true)
  })

  console.log('\nAll medicine-tool checks passed.')
}

main().catch((e) => { console.error(e); process.exit(1) })
