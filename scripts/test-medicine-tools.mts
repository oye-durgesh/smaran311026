import assert from 'node:assert/strict'
import { signToolSession, verifyToolSession, relAllowedForAgent } from '../supabase/functions/_shared/tool-session.ts'
import { MEDICINE_TOOL_NAMES, runMedicineTool, speakTimeHi, validateCallOccurrence, type MedRow, type MedicineStore, type MemberRow, type RemRow } from '../supabase/functions/_shared/medicine-tools.ts'
import { applyToolPrompt, ensureAgentTools, promptHasHardcodedSchedule, resetEnsureAgentToolsCache, webhookUrl } from '../supabase/functions/_shared/register-tools.ts'

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
  async getMedicine(ownerId: string, id: string) {
    if (this.fail) throw new Error('down')
    return this.meds.find((m) => m.owner_id === ownerId && m.id === id) ?? null
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

async function claims(uid: string, mid: string, rel: 'mother' | 'father' | 'self', oid?: string) {
  const ag = rel === 'mother' ? 'mummy' as const : rel === 'father' ? 'papa' as const : 'self' as const
  const tok = await signToolSession(SECRET, { uid, mid, rel, ag, ...(oid ? { oid } : {}) })
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

  await check('Hindi speech for arbitrary exact times', () => {
    assert.equal(speakTimeHi('12:25'), 'दोपहर बारह बजकर पच्चीस मिनट')
    assert.equal(speakTimeHi('17:00'), 'शाम पाँच बजे')
    assert.equal(speakTimeHi('15:52'), 'दोपहर तीन बजकर बावन मिनट')
    assert.equal(speakTimeHi('09:00'), 'सुबह नौ बजे')
  })

  await check('prompt update strips hardcoded schedule without duplicating', () => {
    const first = applyToolPrompt('You are Mummy Sathi. Remind her to take Metformin at 12:25. Stay respectful.')
    assert.equal(promptHasHardcodedSchedule(first.prompt), false)
    assert.match(first.prompt, /get_triggering_dose/)
    assert.equal(first.prompt.includes('Metformin'), false)
    const second = applyToolPrompt(first.prompt)
    assert.equal(second.changed, false)
    assert.equal(second.prompt.split('get_triggering_dose').length, 2)
  })

  store.meds.push(med({ id: 'flex', owner_id: A, family_member_id: momA, name: 'Telmisartan', strength: '40mg', times: ['12:25'] }))
  const oid1225 = 'flex-2026-10-31-12:25'
  const noon = { claims: await claims(A, momA, 'mother', oid1225), webhookAgent: 'mummy' as const, now: new Date('2026-10-31T12:30:00+05:30') }

  await check('bound reminder at 12:25 is retrieved, not a later dose', async () => {
    const r = await runMedicineTool(store, noon, 'get_triggering_dose', {})
    assert.equal(r.ok, true)
    if (!r.ok) return
    const t = r.trigger as { time: string; time_spoken_hi: string; name: string }
    assert.equal(t.time, '12:25')
    assert.equal(t.time_spoken_hi, 'दोपहर बारह बजकर पच्चीस मिनट')
    assert.equal(t.name, 'Telmisartan')
  })

  await check('edit to 17:00 rejects the stale 12:25 occurrence', async () => {
    store.meds = store.meds.map((m) => m.id === 'flex' ? { ...m, times: ['17:00'] } : m)
    const stale = await validateCallOccurrence(store, A, momA, oid1225, noon.now)
    assert.equal(stale.ok, false)
    if (stale.ok) return
    assert.equal(stale.code, 'stale')
    const r = await runMedicineTool(store, noon, 'get_triggering_dose', {})
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'not_found')
    assert.match(r.message, /no longer on the current schedule/i)
  })

  await check('new call after edit speaks 17:00 not 12:25', async () => {
    const oid1700 = 'flex-2026-10-31-17:00'
    const ok = await validateCallOccurrence(store, A, momA, oid1700, noon.now)
    assert.equal(ok.ok, true)
    const ctx = { claims: await claims(A, momA, 'mother', oid1700), webhookAgent: 'mummy' as const, now: new Date('2026-10-31T17:05:00+05:30') }
    const r = await runMedicineTool(store, ctx, 'get_triggering_dose', {})
    assert.equal(r.ok, true)
    if (!r.ok) return
    const t = r.trigger as { time: string; time_spoken_hi: string }
    assert.equal(t.time, '17:00')
    assert.equal(t.time_spoken_hi, 'शाम पाँच बजे')
    assert.notEqual(t.time, '12:25')
  })

  await check('3:52 PM exact time on triggering dose', async () => {
    store.meds = store.meds.map((m) => m.id === 'flex' ? { ...m, times: ['15:52'] } : m)
    const oid = 'flex-2026-10-31-15:52'
    const ctx = { claims: await claims(A, momA, 'mother', oid), webhookAgent: 'mummy' as const, now: new Date('2026-10-31T15:55:00+05:30') }
    const r = await runMedicineTool(store, ctx, 'get_triggering_dose', {})
    assert.equal(r.ok, true)
    if (!r.ok) return
    const t = r.trigger as { time: string; time_spoken_hi: string }
    assert.equal(t.time, '15:52')
    assert.equal(t.time_spoken_hi, 'दोपहर तीन बजकर बावन मिनट')
  })

  await check('father token cannot bind mother occurrence', async () => {
    const oid = 'flex-2026-10-31-15:52'
    const checkDad = await validateCallOccurrence(store, A, dadA, oid, noon.now)
    assert.equal(checkDad.ok, false)
    const r = await runMedicineTool(store, { ...dadCtx, claims: await claims(A, dadA, 'father', oid) }, 'get_triggering_dose', {})
    assert.equal(r.ok, false)
  })

  await check('snooze updates the bound occurrence time', async () => {
    const oid = 'flex-2026-10-31-15:52'
    const ctx = { claims: await claims(A, momA, 'mother', oid), webhookAgent: 'mummy' as const, now: new Date('2026-10-31T15:55:00+05:30') }
    const denied = await runMedicineTool(store, ctx, 'snooze_medicine_reminder', { confirmed: false })
    assert.equal(denied.ok, false)
    const ok = await runMedicineTool(store, ctx, 'snooze_medicine_reminder', { confirmed: true, minutes: 10 })
    assert.equal(ok.ok, true)
    if (!ok.ok) return
    const dose = ok.dose as { time: string; status: string }
    assert.equal(dose.status, 'snoozed')
    assert.equal(dose.time, '16:05')
    const again = await runMedicineTool(store, { ...ctx, now: new Date('2026-10-31T16:00:00+05:30') }, 'get_triggering_dose', {})
    assert.equal(again.ok, true)
    if (!again.ok) return
    assert.equal((again.trigger as { time: string }).time, '16:05')
  })

  await check('taken applies only to the confirmed bound occurrence', async () => {
    store.meds = store.meds.map((m) => m.id === 'flex' ? { ...m, times: ['18:00'] } : m)
    const oid = 'flex-2026-10-31-18:00'
    const ctx = { claims: await claims(A, momA, 'mother', oid), webhookAgent: 'mummy' as const, now: new Date('2026-10-31T18:01:00+05:30') }
    const need = await runMedicineTool(store, ctx, 'mark_medicine_taken', {})
    assert.equal(need.ok, false)
    const ok = await runMedicineTool(store, ctx, 'mark_medicine_taken', { confirmed: true })
    assert.equal(ok.ok, true)
    const later = await runMedicineTool(store, ctx, 'get_triggering_dose', {})
    assert.equal(later.ok, false)
    const aml = await runMedicineTool(store, momCtx, 'get_todays_medicine_status', {})
    assert.ok(aml.ok)
    if (!aml.ok) return
    const other = (aml.doses as { name: string; status: string }[]).find((d) => d.name === 'Amlodipine')
    assert.notEqual(other?.status, 'taken')
  })

  await check('unavailable tools never guess a medicine or time', async () => {
    store.fail = true
    const r = await runMedicineTool(store, noon, 'get_triggering_dose', {})
    store.fail = false
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.code, 'unavailable')
    assert.equal('trigger' in r, false)
  })

  const toolsEnv = (k: string) => ({
    ELEVENLABS_API_KEY: 'xi-test-key-not-secret',
    SMARAN_TOOL_SECRET: SECRET,
    ELEVENLABS_MOTHER_AGENT_ID: 'agent_mother_ok',
    ELEVENLABS_FATHER_AGENT_ID: 'agent_father_ok',
    SUPABASE_URL: 'https://oqcfpdfhtwvpirhcusbi.supabase.co',
    ELEVENLABS_BASE_URL: 'https://el.example',
  } as Record<string, string>)[k]

  await check('webhook URL is the elevenlabs-tools function', () => {
    assert.equal(webhookUrl(toolsEnv), 'https://oqcfpdfhtwvpirhcusbi.supabase.co/functions/v1/elevenlabs-tools')
  })

  await check('ensureAgentTools PATCHes existing tools instead of skipping them', async () => {
    resetEnsureAgentToolsCache()
    const existing = Object.fromEntries(MEDICINE_TOOL_NAMES.map((n, i) => [n, `tool-id-${i}`]))
    const patches: { id: string; url: string; method: string; content_type: string; headers: string[]; name: string; sessionPlaceholder?: string }[] = []
    const agentPatches: unknown[] = []
    const fakeFetch: typeof fetch = async (input, init) => {
      const u = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (u.endsWith('/tools') && method === 'GET') {
        return new Response(JSON.stringify({
          tools: MEDICINE_TOOL_NAMES.map((n) => ({ id: existing[n], tool_config: { name: n, api_schema: { url: 'https://old.example/hook', method: 'GET' } } })),
        }), { status: 200 })
      }
      const patchTool = u.match(/\/tools\/(tool-id-\d+)$/)
      if (patchTool && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { tool_config?: { name?: string; api_schema?: { url?: string; method?: string; content_type?: string; request_headers?: Record<string, string>; request_body_schema?: { required?: string[] } }; dynamic_variables?: { dynamic_variable_placeholders?: Record<string, string> } } }
        const cfg = body.tool_config
        patches.push({
          id: patchTool[1],
          url: cfg?.api_schema?.url ?? '',
          method: cfg?.api_schema?.method ?? '',
          content_type: cfg?.api_schema?.content_type ?? '',
          headers: Object.keys(cfg?.api_schema?.request_headers ?? {}),
          name: cfg?.api_schema?.request_headers?.['X-Smaran-Tool-Name'] ?? '',
          sessionPlaceholder: cfg?.dynamic_variables?.dynamic_variable_placeholders?.smaran_session,
        })
        assert.equal(cfg?.api_schema?.request_headers?.['X-Smaran-Tool-Secret'], SECRET)
        assert.ok(cfg?.api_schema?.request_body_schema?.required?.includes('smaran_session'))
        return new Response('{}', { status: 200 })
      }
      if (u.includes('/tools/') && method === 'GET') return new Response(JSON.stringify({ tool_config: { name: 'x' } }), { status: 200 })
      if (u.includes('/agents/') && method === 'GET') {
        return new Response(JSON.stringify({
          conversation_config: {
            agent: {
              prompt: { prompt: 'Warm respectful Hindi companion.', tool_ids: [], llm: 'gpt-keep' },
              tts: { voice_id: 'keep-voice' },
            },
          },
        }), { status: 200 })
      }
      if (u.includes('/agents/') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}'))
        agentPatches.push(body)
        return new Response('{}', { status: 200 })
      }
      if (u.endsWith('/tools') && method === 'POST') throw new Error('must PATCH existing tools, not create')
      return new Response('unexpected', { status: 500 })
    }
    const mom = await ensureAgentTools(toolsEnv, 'mummy', fakeFetch)
    assert.equal(mom.ok, true)
    assert.equal(patches.length, MEDICINE_TOOL_NAMES.length)
    assert.equal(MEDICINE_TOOL_NAMES.length, 7)
    for (const p of patches) {
      assert.equal(p.url, 'https://oqcfpdfhtwvpirhcusbi.supabase.co/functions/v1/elevenlabs-tools')
      assert.equal(p.method, 'POST')
      assert.equal(p.content_type, 'application/json')
      assert.deepEqual(p.headers.sort(), ['X-Smaran-Tool-Name', 'X-Smaran-Tool-Secret'])
      assert.equal(p.sessionPlaceholder, 'smaran_session')
      assert.ok(MEDICINE_TOOL_NAMES.includes(p.name as typeof MEDICINE_TOOL_NAMES[number]))
    }
    assert.equal(new Set(patches.map((p) => p.id)).size, 7)
    const ap = agentPatches[0] as { conversation_config?: { agent?: { tts?: { voice_id?: string }; prompt?: { llm?: string; tool_ids?: string[] } } } }
    assert.equal(ap.conversation_config?.agent?.tts?.voice_id, 'keep-voice')
    assert.equal(ap.conversation_config?.agent?.prompt?.llm, 'gpt-keep')
    assert.equal(ap.conversation_config?.agent?.prompt?.tool_ids?.length, 7)

    resetEnsureAgentToolsCache()
    const dad = await ensureAgentTools(toolsEnv, 'papa', fakeFetch)
    assert.equal(dad.ok, true)
    assert.equal(patches.length, 14)
  })

  await check('ensureAgentTools fails closed without SMARAN_TOOL_SECRET', async () => {
    resetEnsureAgentToolsCache()
    const r = await ensureAgentTools((k) => k === 'ELEVENLABS_API_KEY' ? 'xi-test-key-not-secret' : k === 'ELEVENLABS_MOTHER_AGENT_ID' ? 'agent_mother_ok' : k === 'ELEVENLABS_FATHER_AGENT_ID' ? 'agent_father_ok' : undefined, 'mummy')
    assert.equal(r.ok, false)
    assert.equal(r.error, 'missing_tool_secret')
  })

  console.log('\nAll medicine-tool checks passed.')
}

main().catch((e) => { console.error(e); process.exit(1) })
