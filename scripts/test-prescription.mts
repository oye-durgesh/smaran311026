import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapExtractResult, toExtractionOutput } from '../supabase/functions/_shared/extract-mapper.ts'
import { advanceExtraction, memoryJobStore, ServiceError, submitExtraction } from '../supabase/functions/_shared/extraction-service.ts'
import type { ExtractionJob } from '../supabase/functions/_shared/extraction-types.ts'
import {
  applyConfirmTransaction,
  confirmPrescription,
  parseConfirmRpc,
  validateConfirmMedicines,
  type ConfirmAtomicInput,
  type ConfirmMedicineInput,
  type ConfirmMedicineRow,
  type ConfirmResult,
  type ConfirmScheduleRow,
  type PrescriptionConfirmStore,
} from '../supabase/functions/_shared/prescription-confirm.ts'
import { activateExtraction, applyConfirmedMedicines, confirmExtracted, startExtraction } from '../src/services/medicineService.ts'
import { extractedToMedicine } from '../src/services/prescriptionService.ts'
import { createBlankState } from '../src/data/demoData.ts'

function check(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve(fn()).then(() => console.log('PASS', name))
}

const twice: ConfirmMedicineInput = {
  name: 'Metformin', strength: '500mg', dose: '1 tablet', frequency: 'twice',
  times: ['08:00', '20:00'], food: 'after', duration: 'ongoing', sourceText: 'Tab Metformin 500mg 1-0-1 after food',
}

class Mem implements PrescriptionConfirmStore {
  uid = 'u1'
  members = [{ id: 'self_u1', owner_id: 'u1', active: true, time_zone: 'Asia/Kolkata' }]
  prescriptions = [{ id: 'rx1', owner_id: 'u1', family_member_id: 'self_u1', status: 'extracted' }]
  meds: ConfirmMedicineRow[] = []
  schedules: ConfirmScheduleRow[] = []
  failAfter: 'medicine' | 'schedule' | null = null
  private chain = new Map<string, Promise<void>>()
  async confirmAtomic(input: ConfirmAtomicInput): Promise<ConfirmResult> {
    const key = `${input.ownerId}:${input.prescriptionId}`
    const prev = this.chain.get(key) ?? Promise.resolve()
    let release: () => void = () => undefined
    const mine = new Promise<void>((resolve) => { release = resolve })
    this.chain.set(key, prev.then(() => mine))
    await prev
    try {
      const out = applyConfirmTransaction(
        { uid: this.uid, members: this.members, prescriptions: this.prescriptions, meds: this.meds, schedules: this.schedules },
        input,
        { failAfter: this.failAfter ?? undefined, newId: () => 'med_abc' },
      )
      if (out.ok && out.state) {
        this.meds = out.state.meds
        this.schedules = out.state.schedules
        this.prescriptions = out.state.prescriptions
      }
      return out
    } finally {
      release()
    }
  }
}

const sarvamOk = {
  usesExtract: true,
  submit: async () => ({ jobId: 'sv1', state: 'pending' as const }),
  status: async () => ({ state: 'completed' as const, pages: { total: 1, processed: 1, succeeded: 1, failed: 0 }, raw: {} }),
  getResults: async () => ({
    status: 'completed' as const,
    result: {
      patient_name: 'Sita',
      doctor_name: 'Dr Rao',
      prescription_date: '1 Nov 2026',
      medicines: [{
        name: 'Metformin', brand_name: 'Glycomet', generic_name: 'Metformin', strength: '500mg', dosage: '1 tablet',
        frequency: 'BD', prescribed_times: '08:00, 20:00', food_instructions: 'after food', duration: 'ongoing',
      }],
    },
    annotations: { medicines: [{ name: { confidence: 0.95 } }] },
    pages: { total: 1, processed: 1, succeeded: 1, failed: 0 },
  }),
  downloadZip: async () => new Uint8Array(),
}

async function main() {
  await check('successful prescription extraction', async () => {
    const jobs = memoryJobStore()
    const job = await submitExtraction({ sarvam: sarvamOk, jobs, unzip: () => ({}) }, {
      ownerId: 'u1', file: new Blob(['x']), fileName: 'rx.jpg', mime: 'image/jpeg', size: 12, language: 'en-IN',
    })
    const done = await advanceExtraction({ sarvam: sarvamOk, jobs, unzip: () => ({}) }, job.id, 'u1')
    assert.equal(done.status, 'completed')
    assert.equal(done.result?.medicines[0]?.name, 'Metformin')
    assert.deepEqual(done.result?.medicines[0]?.times, ['08:00', '20:00'])
    assert.equal(done.result?.document?.patientName, 'Sita')
  })

  await check('unreadable or ambiguous prescription', () => {
    const mapped = mapExtractResult({
      result: { medicines: [{ name: '??', unclear_or_missing: 'illegible' }], unclear_or_missing: 'blurred' },
      annotations: { medicines: [{ name: { confidence: 0.2 } }] },
    })
    assert.ok(mapped.warnings.length)
    const out = toExtractionOutput(mapped, { partial: true, pages: { total: 1, succeeded: 0, failed: 1 } })
    assert.equal(out.outcome, 'partial')
  })

  await check('missing dosage or frequency blocks confirm', () => {
    const missDose = validateConfirmMedicines([{ ...twice, dose: '' }])
    assert.equal(missDose.ok, false)
    if (!missDose.ok) assert.equal(missDose.code, 'missing_dosage')
    const missFreq = validateConfirmMedicines([{ ...twice, frequency: '' }])
    assert.equal(missFreq.ok, false)
    if (!missFreq.ok) assert.equal(missFreq.code, 'missing_frequency')
  })

  await check('user correction and confirmation', () => {
    let s = startExtraction(createBlankState())
    const id = s.extraction!.items[0].id
    s = confirmExtracted(s, id, { dose: '1 tablet', frequency: 'Twice daily', times: ['08:00', '20:00'], status: 'ready' })
    assert.ok(s.extraction?.reviewed.includes(id))
    assert.equal(s.extraction?.items.find((m) => m.id === id)?.status, 'ready')
  })

  await check('duplicate prescription confirmation is idempotent', async () => {
    const store = new Mem()
    const first = await confirmPrescription(store, { ownerId: 'u1', memberId: 'self_u1', prescriptionId: 'rx1', medicines: [twice] })
    assert.equal(first.ok, true)
    if (first.ok) assert.equal(first.duplicate, false)
    const medCount = store.meds.length
    const schCount = store.schedules.length
    const second = await confirmPrescription(store, { ownerId: 'u1', memberId: 'self_u1', prescriptionId: 'rx1', medicines: [twice] })
    assert.equal(second.ok, true)
    if (second.ok) {
      assert.equal(second.duplicate, true)
      assert.ok(second.medicines.length >= 1)
      assert.ok(second.schedules.length >= 1)
    }
    assert.equal(store.meds.length, medCount)
    assert.equal(store.schedules.length, schCount)
  })

  await check('multiple daily doses create one schedule per time', async () => {
    const store = new Mem()
    const r = await confirmPrescription(store, { ownerId: 'u1', memberId: 'self_u1', prescriptionId: 'rx1', medicines: [twice] })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.schedules.length, 2)
      assert.deepEqual(r.schedules.map((s) => s.local_time).sort(), ['08:00', '20:00'])
      assert.ok(r.schedules.every((s) => s.time_zone === 'Asia/Kolkata'))
    }
  })

  await check('unauthorized family-member access is denied', async () => {
    const store = new Mem()
    const r = await confirmPrescription(store, { ownerId: 'u1', memberId: 'father_u2', prescriptionId: 'rx1', medicines: [twice] })
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, 'permission_denied')
    assert.equal(store.meds.length, 0)
    const other = new Mem()
    other.uid = 'u2'
    const cross = await confirmPrescription(other, { ownerId: 'u2', memberId: 'self_u1', prescriptionId: 'rx1', medicines: [twice] })
    assert.equal(cross.ok, false)
    if (!cross.ok) assert.equal(cross.code, 'permission_denied')
    const noAuth = applyConfirmTransaction(
      { uid: null, members: store.members, prescriptions: store.prescriptions, meds: [], schedules: [] },
      { ownerId: 'u1', memberId: 'self_u1', prescriptionId: 'rx1', medicines: [twice] },
    )
    assert.equal(noAuth.ok, false)
    if (!noAuth.ok) assert.equal(noAuth.code, 'permission_denied')
  })

  await check('Sarvam API failure or timeout', async () => {
    const jobs = memoryJobStore()
    const failing = {
      usesExtract: true,
      submit: async () => { throw Object.assign(new Error('down'), { code: 'unavailable', status: 503 }) },
      status: async () => ({ state: 'failed' as const, pages: { total: 0, processed: 0, succeeded: 0, failed: 0 }, raw: {} }),
      getResults: async () => ({ status: 'failed' as const, result: {}, annotations: {}, pages: { total: 1, processed: 0, succeeded: 0, failed: 0 } }),
      downloadZip: async () => new Uint8Array(),
    }
    await assert.rejects(
      () => submitExtraction({ sarvam: failing as never, jobs, unzip: () => ({}) }, {
        ownerId: 'u1', file: new Blob(['x']), fileName: 'rx.jpg', mime: 'image/jpeg', size: 12, language: 'en-IN',
      }),
      (e: unknown) => e instanceof ServiceError || e instanceof Error,
    )
    const stuck: ExtractionJob = {
      id: 'xj1', ownerId: 'u1', provider: 'sarvam', sarvamJobId: 'sv', fileName: 'rx.jpg', mime: 'image/jpeg', size: 12,
      language: 'en-IN', outputFormat: 'json', status: 'running', createdAt: new Date(Date.now() - 11 * 60_000).toISOString(), updatedAt: new Date().toISOString(),
    }
    const store = memoryJobStore()
    await store.create(stuck)
    const timed = await advanceExtraction({
      sarvam: { ...sarvamOk, status: async () => ({ state: 'running' as const, pages: { total: 1, processed: 0, succeeded: 0, failed: 0 }, raw: {} }) },
      jobs: store, unzip: () => ({}), now: () => new Date(),
    }, 'xj1', 'u1')
    assert.equal(timed.status, 'timed_out')
  })

  await check('successful reminder creation after confirm', () => {
    let s = startExtraction(createBlankState())
    for (const m of s.extraction!.items) {
      s = confirmExtracted(s, m.id, { ...m, dose: m.dose || '1 tablet', status: 'ready', times: m.times.length ? m.times : ['08:00'] })
    }
    s = activateExtraction(s)
    assert.equal(s.extraction, null)
    assert.ok(s.medicines.some((m) => m.name === 'Metformin' && m.status === 'ready'))
    assert.ok(s.events.some((e) => e.medicineId && e.kind !== 'custom'))
  })

  await check('transaction rollback leaves no partial schedules', async () => {
    for (const failAfter of ['medicine', 'schedule'] as const) {
      const store = new Mem()
      store.failAfter = failAfter
      const r = await confirmPrescription(store, { ownerId: 'u1', memberId: 'self_u1', prescriptionId: 'rx1', medicines: [twice] })
      assert.equal(r.ok, false)
      assert.equal(store.meds.length, 0)
      assert.equal(store.schedules.length, 0)
      assert.equal(store.prescriptions[0].status, 'extracted')
    }
  })

  await check('RPC result is returned only after success', () => {
    const fail = parseConfirmRpc({ ok: false, code: 'unavailable', message: 'no' })
    assert.equal(fail.ok, false)
    const ok = parseConfirmRpc({
      ok: true, duplicate: false,
      medicines: [{ id: 'med_1' }],
      schedules: [{ id: 'sch_med_1_0800' }, { id: 'sch_med_1_2000' }],
    })
    assert.equal(ok.ok, true)
    if (ok.ok) {
      assert.equal(ok.medicines[0].id, 'med_1')
      assert.equal(ok.schedules.length, 2)
    }
  })

  await check('confirm RPC migration is a single SECURITY DEFINER transaction', () => {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/20261107000002_confirm_prescription_rpc.sql'), 'utf8')
    assert.match(sql, /create or replace function public\.confirm_prescription_medicines/)
    assert.match(sql, /security definer/i)
    assert.match(sql, /set search_path = pg_catalog, public/)
    assert.match(sql, /auth\.uid\(\)/)
    assert.match(sql, /for update/i)
    assert.match(sql, /medicines_rx_name_strength_uidx/)
    assert.match(sql, /grant execute on function public\.confirm_prescription_medicines/)
    assert.match(sql, /revoke all on function public\.confirm_prescription_medicines[\s\S]*from anon/)
    assert.match(sql, /extraction_jobs_member_fk/)
    assert.match(sql, /m\.owner_id = uid/)
    assert.match(sql, /s\.owner_id = uid/)
    assert.doesNotMatch(sql, /deleteMedicine|compensating/)
  })

  await check('concurrent duplicate confirmation does not double-insert', async () => {
    const store = new Mem()
    const payload = { ownerId: 'u1', memberId: 'self_u1', prescriptionId: 'rx1', medicines: [twice] }
    const [a, b] = await Promise.all([confirmPrescription(store, payload), confirmPrescription(store, payload)])
    assert.equal(a.ok, true)
    assert.equal(b.ok, true)
    if (a.ok && b.ok) {
      assert.equal([a.duplicate, b.duplicate].filter(Boolean).length, 1)
      assert.equal([a.duplicate, b.duplicate].filter((d) => !d).length, 1)
    }
    assert.equal(store.meds.length, 1)
    assert.equal(store.schedules.length, 2)
    assert.equal(store.prescriptions[0].status, 'confirmed')
  })

  await check('invalid medicine fields and clock times are rejected', () => {
    const badTime = ['25:00', '8:00', '08:00:00', '24:00', '08:60', '']
    for (const t of badTime) {
      const r = validateConfirmMedicines([{ ...twice, times: [t, '20:00'] }])
      assert.equal(r.ok, false, t)
    }
    assert.equal(validateConfirmMedicines([{ ...twice, name: '  ' }]).ok, false)
    assert.equal(validateConfirmMedicines([{ ...twice, dose: '' }]).ok, false)
    assert.equal(validateConfirmMedicines([{ ...twice, frequency: 'daily' }]).ok, false)
    assert.equal(validateConfirmMedicines([]).ok, false)
    const tooMany = Array.from({ length: 41 }, (_, i) => ({ ...twice, name: `Med${i}` }))
    assert.equal(validateConfirmMedicines(tooMany).ok, false)
    const viaTx = applyConfirmTransaction(
      { uid: 'u1', members: [{ id: 'self_u1', owner_id: 'u1', active: true }], prescriptions: [{ id: 'rx1', owner_id: 'u1', family_member_id: 'self_u1', status: 'extracted' }], meds: [], schedules: [] },
      { ownerId: 'u1', memberId: 'self_u1', prescriptionId: 'rx1', medicines: [{ ...twice, times: ['08:00'] }] },
    )
    assert.equal(viaTx.ok, false)
    if (!viaTx.ok) assert.equal(viaTx.code, 'needs_confirmation')
  })

  await check('extracted draft is not active until confirm', () => {
    const m = extractedToMedicine({ name: 'X', strength: '5mg', dose: '', frequency: null, times: [], flags: ['dose_missing', 'frequency_unclear'] }, 'self', 'rx1')
    assert.equal(m.status, 'needs_review')
    assert.equal(m.times.length, 0)
    const s = applyConfirmedMedicines(createBlankState(), [])
    assert.equal(s.extraction, null)
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
