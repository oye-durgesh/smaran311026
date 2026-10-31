import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=')
  if (i < 1 || line.startsWith('#')) continue
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
}
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.log('BLOCKED: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const stamp = Date.now().toString(36)
const A = { email: `smaran.a.${stamp}@example.com`, password: 'SmaranTest9!', name: 'Asha Test' }
const B = { email: `smaran.b.${stamp}@example.com`, password: 'SmaranTest9!', name: 'Bharat Test' }
const results = []
const log = (k, ok, detail = '') => {
  results.push({ k, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${detail ? ` — ${detail}` : ''}`)
}

const client = () => createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })

async function sign(user) {
  const db = client()
  const up = await db.auth.signUp({ email: user.email, password: user.password, options: { data: { full_name: user.name } } })
  if (up.error) throw new Error(up.error.message)
  if (up.data.session) return { db, uid: up.data.user.id, session: up.data.session }
  const inn = await db.auth.signInWithPassword({ email: user.email, password: user.password })
  if (inn.error || !inn.data.session) throw new Error(inn.error?.message || 'No session after signup (email confirmation may be required)')
  return { db, uid: inn.data.user.id, session: inn.data.session }
}

function member(uid, who, name) {
  return {
    id: `${who}_${uid}`,
    owner_id: uid,
    relationship: who,
    relationship_label: who === 'mother' ? 'Mother' : who === 'father' ? 'Father' : 'Me',
    display_name: name,
    greeting_name: name,
    language: 'hi',
    time_zone: 'Asia/Kolkata',
    speaking_speed: 'normal',
    reminder_tone: 'gentle',
    sathi_voice: who === 'mother' ? 'mom' : who === 'father' ? 'dad' : 'default',
    notifications_enabled: true,
    active: true,
  }
}

try {
  const a = await sign(A)
  log('New user registration', true, 'account A created')

  const { error: pe } = await a.db.from('profiles').upsert({
    id: a.uid, display_name: A.name, full_name: A.name, call_name: 'Asha', language: 'hi', time_zone: 'Asia/Kolkata', role: 'self',
  })
  log('Profile upsert', !pe, pe?.message)

  const { error: me } = await a.db.from('family_members').upsert([
    member(a.uid, 'self', 'Asha'),
    member(a.uid, 'mother', 'Mummy A'),
    member(a.uid, 'father', 'Papa A'),
  ])
  log('Family member creation', !me, me?.message)

  const { error: me2 } = await a.db.from('family_members').update({ display_name: 'Kamla A' }).eq('id', `mother_${a.uid}`).eq('owner_id', a.uid)
  log('Family member editing', !me2, me2?.message)

  const medM = {
    id: `med-m-${stamp}`, owner_id: a.uid, family_member_id: `mother_${a.uid}`, name: 'Metformin', dosage: '500mg 1 tablet',
    strength: '500mg', dose: '1 tablet', instructions: 'after food', notes: '', purpose: 'sugar', frequency: 'twice',
    times: ['08:00', '20:00'], time_zone: 'Asia/Kolkata', food: 'after', duration: 'ongoing', status: 'active', source: 'manual',
    start_date: '2026-10-31',
  }
  const { error: mm } = await a.db.from('medicines').upsert(medM)
  const { error: sch } = await a.db.from('medicine_schedules').upsert({
    id: `sch_${medM.id}`, owner_id: a.uid, family_member_id: medM.family_member_id, medicine_id: medM.id,
    kind: 'medicine', title: 'Metformin', local_time: '08:00', frequency: 'twice', time_zone: 'Asia/Kolkata', active: true,
  })
  log("Mother's medicine create", !mm && !sch, mm?.message || sch?.message)
  const { error: mm2 } = await a.db.from('medicines').update({ dose: '2 tablets', dosage: '500mg 2 tablets' }).eq('id', medM.id).eq('owner_id', a.uid)
  log("Mother's medicine edit", !mm2, mm2?.message)
  const medDel = { ...medM, id: `med-mdel-${stamp}`, name: 'TempDel' }
  await a.db.from('medicines').upsert(medDel)
  const { error: mm3 } = await a.db.from('medicines').delete().eq('id', medDel.id).eq('owner_id', a.uid)
  log("Mother's medicine delete", !mm3, mm3?.message)

  const medF = { ...medM, id: `med-f-${stamp}`, family_member_id: `father_${a.uid}`, name: 'Amlodipine', strength: '5mg', dosage: '5mg 1 tablet' }
  const { error: mf } = await a.db.from('medicines').upsert(medF)
  log("Father's medicine create", !mf, mf?.message)
  const { data: onlyM } = await a.db.from('medicines').select('name,family_member_id').eq('owner_id', a.uid).eq('family_member_id', `mother_${a.uid}`)
  const { data: onlyF } = await a.db.from('medicines').select('name,family_member_id').eq('owner_id', a.uid).eq('family_member_id', `father_${a.uid}`)
  const sep = (onlyM ?? []).every((r) => r.family_member_id.startsWith('mother_')) && (onlyF ?? []).every((r) => r.family_member_id.startsWith('father_')) && (onlyF ?? []).some((r) => r.name === 'Amlodipine') && !(onlyM ?? []).some((r) => r.name === 'Amlodipine')
  log('Medicine member isolation', sep, `mother=${(onlyM ?? []).map((r) => r.name).join(',')} father=${(onlyF ?? []).map((r) => r.name).join(',')}`)

  const apM = { id: `ap-m-${stamp}`, owner_id: a.uid, family_member_id: `mother_${a.uid}`, title: 'Eye checkup', doctor: 'Dr Rao', clinic: 'Sankara', at: new Date('2026-11-10T10:00:00+05:30').toISOString(), time_zone: 'Asia/Kolkata', notes: 'bring reports', reminder: '1d', status: 'upcoming' }
  let { error: ae } = await a.db.from('member_appointments').upsert(apM)
  if (ae && /clinic/i.test(ae.message)) {
    const { clinic: _c, ...noClinic } = apM
    ae = (await a.db.from('member_appointments').upsert(noClinic)).error
  }
  log("Mother's appointment create", !ae, ae?.message)
  const { error: ae2 } = await a.db.from('member_appointments').update({ doctor: 'Dr Rao Jr', status: 'upcoming' }).eq('id', apM.id)
  const { error: ae3 } = await a.db.from('member_appointments').update({ status: 'cancelled' }).eq('id', apM.id)
  log("Mother's appointment edit/cancel", !ae2 && !ae3, ae2?.message || ae3?.message)
  const apF = { ...apM, id: `ap-f-${stamp}`, family_member_id: `father_${a.uid}`, title: 'Cardio review', doctor: 'Dr Shah' }
  const { error: af } = await a.db.from('member_appointments').upsert(apF)
  log("Father's appointment create", !af, af?.message)

  const rmM = {
    id: `rm-m-${stamp}`, owner_id: a.uid, family_member_id: `mother_${a.uid}`, kind: 'custom', title: 'Walk', notes: 'evening walk',
    medicine_id: null, schedule_id: null, scheduled_for: new Date('2026-10-31T18:00:00+05:30').toISOString(),
    original_scheduled_for: new Date('2026-10-31T18:00:00+05:30').toISOString(), time_zone: 'Asia/Kolkata', recurrence: { every: 'daily' },
    status: 'scheduled', idempotency_key: `rm-m-${stamp}`,
  }
  const { error: re } = await a.db.from('member_reminders').upsert(rmM)
  log("Mother's reminder create", !re, re?.message)
  const { error: re2 } = await a.db.from('member_reminders').update({ title: 'Evening walk', status: 'completed', completed_at: new Date().toISOString() }).eq('id', rmM.id)
  log("Mother's reminder edit/complete", !re2, re2?.message)
  const rmDel = { ...rmM, id: `rm-mdel-${stamp}`, idempotency_key: `rm-mdel-${stamp}`, title: 'Temp' }
  await a.db.from('member_reminders').upsert(rmDel)
  const { error: re3 } = await a.db.from('member_reminders').delete().eq('id', rmDel.id)
  log("Mother's reminder delete", !re3, re3?.message)
  const rmF = { ...rmM, id: `rm-f-${stamp}`, family_member_id: `father_${a.uid}`, idempotency_key: `rm-f-${stamp}`, title: 'BP check' }
  const { error: rf } = await a.db.from('member_reminders').upsert(rmF)
  log("Father's reminder create", !rf, rf?.message)

  const rdM = {
    id: `rd-m-${stamp}`, owner_id: a.uid, family_member_id: `mother_${a.uid}`, type: 'sugar', at: new Date().toISOString(),
    value: 132, unit: 'mg/dL', context: 'after_meal', note: 'After breakfast · two rotis', source: 'manual',
  }
  const { error: he } = await a.db.from('health_readings').upsert(rdM)
  const rdF = {
    id: `rd-f-${stamp}`, owner_id: a.uid, family_member_id: `father_${a.uid}`, type: 'bp', at: new Date().toISOString(),
    systolic: 128, diastolic: 78, pulse: 72, source: 'manual',
  }
  const { error: hf } = await a.db.from('health_readings').upsert(rdF)
  const { data: hm } = await a.db.from('health_readings').select('type,family_member_id,value').eq('family_member_id', `mother_${a.uid}`)
  const { data: hfrows } = await a.db.from('health_readings').select('type,family_member_id,systolic').eq('family_member_id', `father_${a.uid}`)
  const healthOk = !he && !hf && (hm ?? []).every((r) => r.type === 'sugar') && (hfrows ?? []).every((r) => r.type === 'bp')
  log('Health readings and history', healthOk, he?.message || hf?.message)

  const b = await sign(B)
  await b.db.from('profiles').upsert({ id: b.uid, display_name: B.name, full_name: B.name, call_name: 'Bharat', language: 'hi', time_zone: 'Asia/Kolkata', role: 'self' })
  await b.db.from('family_members').upsert([member(b.uid, 'self', 'Bharat')])
  const { data: leakMed } = await b.db.from('medicines').select('id,name')
  const { data: leakFam } = await b.db.from('family_members').select('id,owner_id')
  const { data: leakRd } = await b.db.from('health_readings').select('id')
  const { data: stolen, error: steal } = await b.db.from('medicines').update({ name: 'Hacked' }).eq('id', medM.id).select()
  const { data: still } = await a.db.from('medicines').select('name').eq('id', medM.id).maybeSingle()
  const isolated = !(leakMed ?? []).some((r) => r.id === medM.id)
    && !(leakFam ?? []).some((r) => r.owner_id === a.uid)
    && !(leakRd ?? []).some((r) => r.id === rdM.id)
    && (stolen ?? []).length === 0
    && still?.name === 'Metformin'
  log('Supabase RLS and family isolation', isolated, steal ? steal.message : `B saw ${leakMed?.length ?? 0} meds; A name still ${still?.name}`)

  const { data: after } = await a.db.from('medicines').select('name').eq('id', medM.id).maybeSingle()
  log('Data persistence after writes', after?.name === 'Metformin', after?.name)

  const { data: demoLeak } = await a.db.from('medicines').select('id,name,source').eq('owner_id', a.uid)
  const noDemoSource = (demoLeak ?? []).every((r) => r.source !== 'sample' && r.name !== 'Ramesh')
  log('Demo/live data separation (no Ramesh rows for A)', noDemoSource)

  const { data: reload } = await a.db.from('family_members').select('relationship,display_name').eq('owner_id', a.uid)
  log('Persistence after re-query (login equivalent)', (reload ?? []).some((r) => r.relationship === 'mother' && r.display_name === 'Kamla A'))
} catch (e) {
  log('Remote test run', false, e instanceof Error ? e.message : String(e))
}

console.log('\n--- summary ---')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}\t${r.k}`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
