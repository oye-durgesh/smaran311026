// Confirm extracted medicines via a single Postgres transaction (confirm_prescription_medicines).
// Client-side checks run first; the RPC re-validates auth.uid() and member ownership.

export type ConfirmFrequency = 'once' | 'twice' | 'thrice' | 'custom'
export type ConfirmFood = 'before' | 'with' | 'after' | 'none'
export type ConfirmDuration = 'ongoing' | 'course'

export interface ConfirmMedicineInput {
  name: string
  brandName?: string
  genericName?: string
  strength: string
  dose: string
  frequency: ConfirmFrequency | string
  times: string[]
  food: ConfirmFood | string
  duration: ConfirmDuration | string
  courseDays?: number
  startDate?: string
  endDate?: string
  notes?: string
  specialInstructions?: string
  sourceText?: string
}

export interface ConfirmScheduleRow {
  id: string
  owner_id: string
  family_member_id: string
  medicine_id: string
  kind: 'medicine'
  title: string
  local_time: string
  frequency: string
  time_zone: string
  active: boolean
  start_at: string
  ends_on: string | null
}

export interface ConfirmMedicineRow {
  id: string
  owner_id: string
  family_member_id: string
  name: string
  dosage: string
  strength: string
  dose: string
  instructions: string
  notes: string
  purpose: string | null
  frequency: ConfirmFrequency
  times: string[]
  time_zone: string
  food: ConfirmFood
  duration: ConfirmDuration
  course_days: number | null
  status: 'active'
  source: 'prescription'
  source_text: string | null
  start_date: string | null
  end_date: string | null
  prescriber: string | null
  prescription_ref: string
  flags: string[]
}

export type ConfirmErrorCode =
  | 'permission_denied'
  | 'not_found'
  | 'needs_confirmation'
  | 'missing_dosage'
  | 'missing_frequency'
  | 'duplicate'
  | 'unavailable'

export type ConfirmResult =
  | { ok: true; duplicate: boolean; medicines: ConfirmMedicineRow[]; schedules: ConfirmScheduleRow[] }
  | { ok: false; code: ConfirmErrorCode; message: string }

export interface ConfirmAtomicInput {
  ownerId: string
  memberId: string
  prescriptionId: string
  medicines: ConfirmMedicineInput[]
  prescriber?: string | null
}

export interface PrescriptionConfirmStore {
  confirmAtomic(input: ConfirmAtomicInput): Promise<ConfirmResult>
}

/** Must match the RPC: '^([01][0-9]|2[0-3]):[0-5][0-9]$' */
export const CONFIRM_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const FREQS = new Set(['once', 'twice', 'thrice', 'custom'])
export const CONFIRM_MAX_MEDICINES = 40

export function scheduleId(medicineId: string, time: string): string {
  return `sch_${medicineId}_${time.replace(':', '')}`
}

export function medicineKey(name: string, strength: string): string {
  return `${name.trim().toLowerCase()}|${strength.trim().toLowerCase()}`
}

export function normalizeConfirmTimes(times: string[]): { times: string[]; error: string | null } {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of times) {
    const t = String(raw || '').trim()
    if (!CONFIRM_TIME_RE.test(t)) return { times, error: 'Each dose needs an exact clock time (HH:MM) from the prescription or the user.' }
    if (seen.has(t)) return { times, error: 'Two doses have the same time.' }
    seen.add(t)
    out.push(t)
  }
  if (!out.length) return { times, error: 'Add at least one dose time.' }
  return { times: out, error: null }
}

export function validateConfirmMedicines(items: ConfirmMedicineInput[]): ConfirmResult | { ok: true } {
  if (!items.length) return { ok: false, code: 'needs_confirmation', message: 'Confirm at least one medicine before reminders can start.' }
  if (items.length > CONFIRM_MAX_MEDICINES) return { ok: false, code: 'needs_confirmation', message: 'Too many medicines on this prescription. Confirm fewer at a time.' }
  for (const m of items) {
    if (!m.name.trim()) return { ok: false, code: 'needs_confirmation', message: 'A medicine is missing its name. Enter it from the prescription or remove it.' }
    if (!m.dose.trim()) return { ok: false, code: 'missing_dosage', message: `Dosage for ${m.name} is missing. Enter it from the prescription or ask the doctor. Reminders were not created.` }
    const freq = String(m.frequency || '')
    if (!FREQS.has(freq)) return { ok: false, code: 'missing_frequency', message: `Frequency for ${m.name} is unclear. Enter it from the prescription or ask the doctor. Reminders were not created.` }
    const times = normalizeConfirmTimes(m.times)
    if (times.error) return { ok: false, code: 'needs_confirmation', message: `${m.name}: ${times.error}` }
    const n = freq === 'once' ? 1 : freq === 'twice' ? 2 : freq === 'thrice' ? 3 : times.times.length
    if (freq !== 'custom' && times.times.length !== n) {
      return { ok: false, code: 'needs_confirmation', message: `${m.name} needs ${n} daily dose time${n === 1 ? '' : 's'}.` }
    }
  }
  return { ok: true }
}

export function parseConfirmRpc(data: unknown): ConfirmResult {
  const row = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null
  if (!row) return { ok: false, code: 'unavailable', message: 'Saving the schedule failed. No medicines or reminders were left half-created.' }
  if (row.ok === false) {
    const code = typeof row.code === 'string' ? row.code as ConfirmErrorCode : 'unavailable'
    return { ok: false, code, message: String(row.message || 'Could not save the prescription.') }
  }
  if (row.ok !== true) return { ok: false, code: 'unavailable', message: 'Saving the schedule failed. No medicines or reminders were left half-created.' }
  return {
    ok: true,
    duplicate: row.duplicate === true,
    medicines: Array.isArray(row.medicines) ? row.medicines as ConfirmMedicineRow[] : [],
    schedules: Array.isArray(row.schedules) ? row.schedules as ConfirmScheduleRow[] : [],
  }
}

/** In-memory stand-in for the Postgres RPC: apply all writes or none. */
export function applyConfirmTransaction(
  state: {
    uid: string | null
    members: Array<{ id: string; owner_id: string; active: boolean; time_zone?: string }>
    prescriptions: Array<{ id: string; owner_id: string; family_member_id: string; status: string }>
    meds: ConfirmMedicineRow[]
    schedules: ConfirmScheduleRow[]
  },
  input: ConfirmAtomicInput,
  opts?: { failAfter?: 'medicine' | 'schedule'; newId?: () => string },
): ConfirmResult & { state?: typeof state } {
  if (!state.uid || state.uid !== input.ownerId) {
    return { ok: false, code: 'permission_denied', message: 'You cannot manage medicines for that family member.' }
  }
  const member = state.members.find((m) => m.id === input.memberId && m.owner_id === input.ownerId && m.active)
  if (!member) return { ok: false, code: 'permission_denied', message: 'You cannot manage medicines for that family member.' }
  const rx = state.prescriptions.find((p) => p.id === input.prescriptionId && p.owner_id === input.ownerId)
  if (!rx) return { ok: false, code: 'not_found', message: 'That prescription was not found.' }
  if (rx.family_member_id !== input.memberId) {
    return { ok: false, code: 'permission_denied', message: 'You cannot manage medicines for that family member.' }
  }
  const fromRx = state.meds.filter((m) => m.prescription_ref === input.prescriptionId && m.owner_id === input.ownerId)
  if (rx.status === 'confirmed' || fromRx.length) {
    const schedules = state.schedules.filter((s) => fromRx.some((m) => m.id === s.medicine_id))
    return { ok: true, duplicate: true, medicines: fromRx, schedules }
  }
  const checked = validateConfirmMedicines(input.medicines)
  if (!checked.ok) return checked

  const meds = [...state.meds]
  const schedules = [...state.schedules]
  const prescriptions = state.prescriptions.map((p) => ({ ...p }))
  const createdMeds: ConfirmMedicineRow[] = []
  const createdSchedules: ConfirmScheduleRow[] = []
  const tz = member.time_zone || 'Asia/Kolkata'
  const newId = opts?.newId ?? (() => `med_${Math.random().toString(36).slice(2, 10)}`)
  try {
    for (const item of input.medicines) {
      const key = medicineKey(item.name, item.strength)
      if (meds.some((m) => m.owner_id === input.ownerId && m.family_member_id === input.memberId && medicineKey(m.name, m.strength) === key)) {
        continue
      }
      const id = newId()
      const times = normalizeConfirmTimes(item.times).times
      const row: ConfirmMedicineRow = {
        id,
        owner_id: input.ownerId,
        family_member_id: input.memberId,
        name: item.name.trim(),
        dosage: `${item.strength} ${item.dose}`.trim(),
        strength: item.strength.trim(),
        dose: item.dose.trim(),
        instructions: item.sourceText || item.specialInstructions || '',
        notes: [item.notes, item.specialInstructions].filter(Boolean).join(' '),
        purpose: null,
        frequency: item.frequency as ConfirmFrequency,
        times,
        time_zone: tz,
        food: (['before', 'with', 'after', 'none'].includes(String(item.food)) ? item.food : 'none') as ConfirmFood,
        duration: item.duration === 'course' ? 'course' : 'ongoing',
        course_days: item.duration === 'course' ? (item.courseDays ?? null) : null,
        status: 'active',
        source: 'prescription',
        source_text: item.sourceText || null,
        start_date: item.startDate && /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) ? item.startDate : null,
        end_date: item.endDate && /^\d{4}-\d{2}-\d{2}$/.test(item.endDate) ? item.endDate : null,
        prescriber: input.prescriber ?? null,
        prescription_ref: input.prescriptionId,
        flags: [],
      }
      meds.push(row)
      createdMeds.push(row)
      if (opts?.failAfter === 'medicine') throw new Error('db')
      for (const t of times) {
        const sch: ConfirmScheduleRow = {
          id: scheduleId(id, t),
          owner_id: input.ownerId,
          family_member_id: input.memberId,
          medicine_id: id,
          kind: 'medicine',
          title: row.name,
          local_time: t,
          frequency: row.frequency,
          time_zone: tz,
          active: true,
          start_at: new Date().toISOString(),
          ends_on: row.end_date,
        }
        schedules.push(sch)
        createdSchedules.push(sch)
        if (opts?.failAfter === 'schedule') throw new Error('db')
      }
    }
    const rxRow = prescriptions.find((p) => p.id === input.prescriptionId)
    if (rxRow) rxRow.status = 'confirmed'
    return {
      ok: true,
      duplicate: createdMeds.length === 0,
      medicines: createdMeds,
      schedules: createdSchedules,
      state: { ...state, meds, schedules, prescriptions },
    }
  } catch {
    return { ok: false, code: 'unavailable', message: 'Saving the schedule failed. No medicines or reminders were left half-created.' }
  }
}

export async function confirmPrescription(
  store: PrescriptionConfirmStore,
  input: ConfirmAtomicInput,
): Promise<ConfirmResult> {
  const checked = validateConfirmMedicines(input.medicines)
  if (!checked.ok) return checked
  return store.confirmAtomic(input)
}
