import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { addProposal, confirmMedicine, getMedicine, removeMedicine } from '../store/actions'
import { now, store } from '../store/store'
import { txn } from '../domain/inventory'
import { BackBtn, Btn, Err, InputBox, ScrollArea, Tap, TextInput } from '../ui/kit'
import { useDraft } from '../ui/hooks'
import { MoreDetails, ScheduleFields, detailsError, type DetailsDraft } from '../ui/medparts'
import { displayName, validateMedicine, type MedValidation } from '../domain/medicines'
import type { Medicine } from '../domain/types'
import { fmtHMShort } from '../domain/time'

/** param = medicine id, or "prop:<id>" to propose a change for a family member to approve. */
export default function Screen11({ param }: { param?: string }) {
  const { back, toast, confirm, go } = useApp()
  const proposing = param?.startsWith('prop:') ?? false
  const id = proposing ? param!.slice(5) : param
  const saved = id ? getMedicine(id) : undefined
  const [m, update, discard] = useDraft<Medicine & DetailsDraft>(`med:${id}`, () => saved as Medicine)
  const [errors, setErrors] = useState<MedValidation['errors']>({})

  if (!saved) return <div className="scr" style={{ background: '#F0EAE0', padding: 24 }}><BackBtn onClick={back} /><div style={{ marginTop: 20, fontSize: 15 }}>This medicine no longer exists.</div></div>

  const set = (p: Partial<Medicine>) => { setErrors({}); update(p) }
  const save = () => {
    const v = validateMedicine(m)
    setErrors(v.errors)
    if (!v.ok) { toast('Please fix the highlighted fields.', 'error'); return }
    if (proposing) {
      const times = m.times.map(fmtHMShort).join(', ')
      addProposal({ kind: 'change', medicineId: m.id, title: displayName(m), summary: `Changed: ${saved.times.map(fmtHMShort).join(', ') || 'no time'} → ${times}`, patch: { strength: m.strength, dose: m.dose, frequency: m.frequency, times: m.times, food: m.food, duration: m.duration, courseDays: m.courseDays }, by: 'You' })
      discard(); toast('Change added as a draft proposal.', 'success'); back(); return
    }
    const detail = detailsError(m)
    if (detail) { toast(detail, 'error'); return }
    const { _qty, _perDose, _lowDays, _for, _open, ...clean } = m; void _for; void _open
    const stock = (_qty && Number(_qty) > 0 && !(clean.stock?.ledger?.length)) || _perDose || _lowDays
      ? { unit: clean.stock?.unit ?? 'tablet', dosesPerDay: clean.stock?.dosesPerDay ?? 0, ledger: [...(clean.stock?.ledger ?? []), ...(_qty && Number(_qty) > 0 && !(clean.stock?.ledger?.length) ? [txn('opening', Number(_qty), 'user', now())] : [])],
          perDose: _perDose ? Number(_perDose) : clean.stock?.perDose ?? 0, lowDays: _lowDays ? Number(_lowDays) : clean.stock?.lowDays, lowPct: clean.stock?.lowPct, leadDays: clean.stock?.leadDays } : clean.stock
    const res = confirmMedicine({ ...clean, stock })
    if (!res.ok) { toast(res.error, 'error'); return }
    discard(); toast(m.status === 'active' ? 'Schedule updated.' : 'Medicine confirmed.', 'success'); back()
  }
  const remove = () => confirm({
    title: `Remove ${displayName(m)}?`, message: 'This medicine and its reminders will be removed.', confirmLabel: 'Remove medicine', danger: true,
    onConfirm: () => { removeMedicine(m.id); discard(); toast('Medicine removed.'); go(store.view().medicines.some((x) => x.status === 'draft' || x.status === 'confirmed') ? '10' : '15', undefined, { replace: true }) },
  })
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div><div style={{ fontSize: 13, color: '#8A7F6A' }}>{proposing ? 'Propose a change for' : 'Edit schedule for'}</div><div className="sf" style={{ fontSize: 20 }}>{displayName(m) || 'Medicine'}</div></div>
        </div>
        <label className="lbl" htmlFor="m-name" style={{ display: 'block', marginTop: 24 }}>MEDICINE NAME</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.name}><TextInput id="m-name" value={m.name} onChange={(e) => set({ name: e.target.value })} /></InputBox>
        <Err>{errors.name}</Err>
        <label className="lbl" htmlFor="m-str" style={{ display: 'block' }}>STRENGTH</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.strength}><TextInput id="m-str" value={m.strength} placeholder="e.g. 50mg" onChange={(e) => set({ strength: e.target.value })} /></InputBox>
        <Err>{errors.strength}</Err>
        <label className="lbl" htmlFor="m-dose" style={{ display: 'block' }}>DOSE</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.dose}><TextInput id="m-dose" value={m.dose} placeholder="e.g. 1 tablet" onChange={(e) => set({ dose: e.target.value })} /></InputBox>
        <Err>{errors.dose}</Err>
        <ScheduleFields m={m} update={set} errors={errors} />
        <MoreDetails m={m} update={set} />
        {m.sourceText && <div style={{ fontSize: 12, color: '#A89584', marginTop: 16, fontStyle: 'italic' }}>Prescription text: "{m.sourceText}"</div>}
        {!proposing && <Tap onClick={remove} style={{ marginTop: 20, fontSize: 14, color: '#B75B53', fontWeight: 500, textAlign: 'center' }}>Remove this medicine</Tap>}
      </ScrollArea>
      <div className="ft"><Btn kind="sg" onClick={save}>{proposing ? 'Add to proposal' : 'Confirm schedule'}</Btn></div>
    </div>
  )
}
