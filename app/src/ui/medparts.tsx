import type { Food, Frequency, Medicine, TimeOfDay } from '../domain/types'
import { FREQ_COUNT, HM_RE, TIME_OF_DAY_HM, periodOf } from '../domain/medicines'
import { Chip, ChevDown, Err, InputBox, TextInput } from './kit'
import type { MedValidation } from '../domain/medicines'

export const FREQS: Array<[Frequency, string]> = [['once', 'Once daily'], ['twice', 'Twice daily'], ['thrice', 'Thrice'], ['custom', 'Custom']]
export const DAYPARTS: Array<[TimeOfDay, string]> = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['night', 'Night']]
export const FOODS: Array<[Food, string]> = [['before', 'Before food'], ['with', 'With food'], ['after', 'After food'], ['none', 'No instruction']]

const sortTimes = (t: string[]) => [...t].sort()

export function TimePills({ frequency, times, onChange }: { frequency: Frequency; times: string[]; onChange: (t: string[]) => void }) {
  const need = FREQ_COUNT[frequency]
  const count = need || Math.max(times.length, 1)
  const slots = Array.from({ length: count }, (_, i) => times[i] ?? '')
  const set = (i: number, v: string) => { const next = [...slots]; next[i] = v; onChange(next.filter(Boolean)) }
  return (
    <>
      {slots.map((t, i) => (
        <label key={i} style={{ marginTop: 12, height: 48, padding: '0 16px', background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <input
            type="time" className="fi" aria-label={`Reminder time ${i + 1}`} value={HM_RE.test(t) ? t : ''}
            onChange={(e) => set(i, e.target.value)} style={{ fontSize: 15, fontWeight: 500, width: 'auto', flex: 1 }}
          />
          <ChevDown />
        </label>
      ))}
    </>
  )
}

/** Frequency / time of day / exact times / food / duration, shared by "Edit schedule" and "Add medicine". */
export function ScheduleFields({ m, update, errors, timeLabel = 'TIME OF DAY', freqUnset, durUnset }: {
  m: Pick<Medicine, 'frequency' | 'times' | 'food' | 'duration' | 'courseDays'>
  update: (p: Partial<Medicine>) => void
  errors: MedValidation['errors']
  timeLabel?: string
  /** Blank "Add medicine" form: no frequency / duration chip is highlighted until the user picks one. */
  freqUnset?: boolean
  durUnset?: boolean
}) {
  const need = FREQ_COUNT[m.frequency]
  const toggleDaypart = (k: TimeOfDay) => {
    const hm = TIME_OF_DAY_HM[k]
    const has = m.times.some((t) => periodOf(t).toLowerCase() === k)
    if (has) return update({ times: m.times.filter((t) => periodOf(t).toLowerCase() !== k) })
    const next = sortTimes([...m.times, hm])
    update({ times: need && next.length > need ? sortTimes([...m.times.slice(0, need - 1), hm]) : next })
  }
  return (
    <>
      <div className="lbl">FREQUENCY</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {FREQS.map(([k, label]) => (
          <Chip key={k} on={!freqUnset && m.frequency === k} onClick={() => {
            const n = FREQ_COUNT[k]
            update({ frequency: k, times: n && m.times.length > n ? m.times.slice(0, n) : m.times })
          }}>{label}</Chip>
        ))}
      </div>
      <Err>{errors.frequency}</Err>
      <div className="lbl">{timeLabel}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {DAYPARTS.map(([k, label]) => <Chip key={k} on={m.times.some((t) => periodOf(t).toLowerCase() === k)} onClick={() => toggleDaypart(k)}>{label}</Chip>)}
      </div>
      {!freqUnset && <TimePills frequency={m.frequency} times={m.times} onChange={(times) => update({ times: sortTimes(times) })} />}
      {!freqUnset && m.frequency === 'custom' && (
        <div role="button" tabIndex={0} onClick={() => update({ times: [...m.times, ''] })} style={{ marginTop: 10, fontSize: 14, color: '#7B8B5A', fontWeight: 500, cursor: 'pointer' }}>+ Add another time</div>
      )}
      <Err>{errors.times}</Err>
      <div className="lbl">FOOD INSTRUCTIONS</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {FOODS.map(([k, label]) => <Chip key={k} on={m.food === k} onClick={() => update({ food: k })}>{label}</Chip>)}
      </div>
      <Err>{errors.food}</Err>
      <div className="lbl">DURATION</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Chip on={!durUnset && m.duration === 'ongoing'} onClick={() => update({ duration: 'ongoing', courseDays: undefined })}>Ongoing</Chip>
        <Chip on={!durUnset && m.duration === 'course'} onClick={() => update({ duration: 'course', courseDays: m.courseDays ?? 7 })}>Fixed course</Chip>
      </div>
      {m.duration === 'course' && (
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.courseDays}>
          <TextInput aria-label="Course length in days" inputMode="numeric" value={m.courseDays ?? ''} placeholder="Number of days"
            onChange={(e) => update({ courseDays: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined })} />
          <span style={{ fontSize: 14, color: '#8A7F6A' }}>days</span>
        </InputBox>
      )}
      <Err>{errors.courseDays}</Err>
    </>
  )
}

export type DetailsDraft = { _qty?: string; _perDose?: string; _lowDays?: string; _for?: string; _open?: boolean }

const dateOk = (v?: string) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v)
/** Optional structured details copied from the prescription. Collapsed by default so the original form is unchanged until opened. */
export function MoreDetails<T extends Medicine & DetailsDraft>({ m, update, people, showPerson }: {
  m: T; update: (p: Partial<T>) => void; people?: Array<{ id: string; label: string }>; showPerson?: boolean
}) {
  const field = (id: string, label: string, props: Parameters<typeof TextInput>[0]) => (
    <>
      <label className="lbl" htmlFor={id} style={{ display: 'block' }}>{label}</label>
      <InputBox style={{ marginTop: 10 }}><TextInput id={id} {...props} /></InputBox>
    </>
  )
  return (
    <>
      <div role="button" tabIndex={0} aria-expanded={!!m._open} onClick={() => update({ _open: !m._open } as Partial<T>)}
        style={{ marginTop: 24, fontSize: 14, color: '#7B8B5A', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        {m._open ? 'Hide' : 'More details'} <span style={{ color: '#8A7F6A', fontWeight: 400 }}>(optional: stock, dates, prescriber)</span>
      </div>
      {m._open && (
        <div>
          {showPerson && people && people.length > 1 && (
            <>
              <div className="lbl">WHO IS THIS FOR?</div>
              <div role="radiogroup" aria-label="Who is this medicine for" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {people.map((p) => <Chip key={p.id} on={(m._for ?? m.personId) === p.id} onClick={() => update({ _for: p.id } as Partial<T>)}>{p.label}</Chip>)}
              </div>
            </>
          )}
          {field('d-qty', 'TABLETS AVAILABLE NOW', { inputMode: 'decimal', placeholder: 'e.g. 42', value: m._qty ?? '', onChange: (e) => update({ _qty: e.target.value.replace(/[^\d.]/g, '') } as Partial<T>) })}
          {field('d-per', 'TABLETS PER DOSE', { inputMode: 'decimal', placeholder: 'e.g. 1', value: m._perDose ?? '', onChange: (e) => update({ _perDose: e.target.value.replace(/[^\d.]/g, '') } as Partial<T>) })}
          <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 6, lineHeight: 1.4 }}>Enter this only if the prescription says it. It is used for the supply estimate, never to change a dose.</div>
          {field('d-low', 'WARN ME WHEN THIS MANY DAYS REMAIN', { inputMode: 'numeric', placeholder: '7', value: m._lowDays ?? '', onChange: (e) => update({ _lowDays: e.target.value.replace(/\D/g, '').slice(0, 3) } as Partial<T>) })}
          <label className="lbl" htmlFor="d-start" style={{ display: 'block' }}>START DATE</label>
          <InputBox style={{ marginTop: 10 }}><input id="d-start" type="date" className="fi" value={m.startDate ?? ''} onChange={(e) => update({ startDate: e.target.value || undefined } as Partial<T>)} /></InputBox>
          <label className="lbl" htmlFor="d-end" style={{ display: 'block' }}>END DATE</label>
          <InputBox style={{ marginTop: 10 }} invalid={!!m.startDate && !!m.endDate && m.endDate < m.startDate}><input id="d-end" type="date" className="fi" value={m.endDate ?? ''} min={m.startDate} onChange={(e) => update({ endDate: e.target.value || undefined } as Partial<T>)} /></InputBox>
          {field('d-doc', 'PRESCRIBED BY', { maxLength: 120, placeholder: 'Doctor or clinic', value: m.prescriber ?? '', onChange: (e) => update({ prescriber: e.target.value || undefined } as Partial<T>) })}
          {field('d-ref', 'PRESCRIPTION REFERENCE', { maxLength: 120, placeholder: 'If written on the prescription', value: m.prescriptionRef ?? '', onChange: (e) => update({ prescriptionRef: e.target.value || undefined } as Partial<T>) })}
          <label className="lbl" htmlFor="d-fu" style={{ display: 'block' }}>FOLLOW-UP DATE</label>
          <InputBox style={{ marginTop: 10 }}><input id="d-fu" type="date" className="fi" value={m.followUpDate ?? ''} onChange={(e) => update({ followUpDate: e.target.value || undefined } as Partial<T>)} /></InputBox>
          <label className="lbl" htmlFor="d-notes" style={{ display: 'block' }}>SPECIAL INSTRUCTIONS FROM THE PRESCRIPTION</label>
          <InputBox style={{ marginTop: 10 }}><TextInput id="d-notes" maxLength={500} placeholder="Copy exactly as written" value={m.notes} onChange={(e) => update({ notes: e.target.value } as Partial<T>)} /></InputBox>
        </div>
      )}
    </>
  )
}

/** Validation for the optional details. Returns a message or null. Nothing here calculates or changes a dose. */
export function detailsError(m: Medicine & DetailsDraft): string | null {
  if (!dateOk(m.startDate) || !dateOk(m.endDate) || !dateOk(m.followUpDate)) return 'Check the dates.'
  if (m.startDate && m.endDate && m.endDate < m.startDate) return 'The end date must be on or after the start date.'
  if (m._qty && !(Number(m._qty) >= 0 && Number(m._qty) <= 10000)) return 'Check the number of tablets available.'
  if (m._perDose && !(Number(m._perDose) > 0 && Number(m._perDose) <= 20)) return 'Tablets per dose must be more than 0.'
  if (m._lowDays && !(Number(m._lowDays) >= 1 && Number(m._lowDays) <= 365)) return 'Enter a warning between 1 and 365 days.'
  return null
}
