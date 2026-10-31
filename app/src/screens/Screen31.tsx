import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { addProposal, newDraftMedicine, saveMedicine } from '../store/actions'
import { now, store, useStore } from '../store/store'
import { txn } from '../domain/inventory'
import { BackBtn, Btn, Err, InputBox, MicIcon, ScrollArea, Tap, TextInput } from '../ui/kit'
import { useDraft } from '../ui/hooks'
import { startDictation } from '../ui/dictation'
import { MoreDetails, ScheduleFields, detailsError, type DetailsDraft } from '../ui/medparts'
import { personLabel } from '../domain/people'
import { displayName, validateMedicine, type MedValidation } from '../domain/medicines'
import { parseMedicineText } from '../domain/medparse'
import type { Medicine } from '../domain/types'
import { fmtHMShort } from '../domain/time'

type Draft = Medicine & DetailsDraft & { _f?: boolean; _d?: boolean }
const stripUi = ({ _f, _d, _qty, _perDose, _lowDays, _for, _open, ...rest }: Draft): Medicine => { void _f; void _d; void _qty; void _perDose; void _lowDays; void _for; void _open; return rest }

/** param: "dictate" starts voice entry; "prop" / "prop-dictate" create a proposal for a family member instead of a medicine. */
export default function Screen31({ param }: { param?: string }) {
  const { back, go, toast } = useApp()
  const lang = useStore((s) => s.profile.language)
  const people = useStore((s) => s.people).filter((p) => !p.archived).map((p) => ({ id: p.id, label: personLabel(p) }))
  const proposing = param?.startsWith('prop') ?? false
  const key = proposing ? 'med:new-prop' : 'med:new'
  const [m, update, discard] = useDraft<Draft>(key, () => newDraftMedicine())
  const [errors, setErrors] = useState<MedValidation['errors']>({})
  const [heard, setHeard] = useState<string>()
  const dictated = useRef(false)

  const set = (p: Partial<Medicine>) => { setErrors({}); update({ ...p, ...('frequency' in p ? { _f: true } : {}), ...('duration' in p ? { _d: true } : {}) }) }
  const dictate = () => startDictation(lang, (text) => {
    const p = parseMedicineText(text)
    dictated.current = true
    setHeard(text)
    update({ ...p, name: p.name ?? m.name, ...(p.frequency ? { _f: true } : {}) })
  }, (msg) => toast(msg, 'error'))
  useEffect(() => { if (param?.endsWith('dictate')) dictate() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const save = () => {
    const v = validateMedicine(m)
    if (!m._f) v.errors.frequency = 'Choose how often to take it.'
    if (!m._d) m.duration = 'ongoing'
    const dup = store.view().medicines.some((x) => x.id !== m.id && x.status !== 'removed' && x.name.trim().toLowerCase() === m.name.trim().toLowerCase() && x.strength.trim().toLowerCase() === m.strength.trim().toLowerCase())
    const detail = detailsError(m)
    if (detail) { setErrors({}); toast(detail, 'error'); return }
    const errs = { ...v.errors, ...(dup && !v.errors.name ? { name: 'This medicine is already in your list.' } : {}) }
    setErrors(errs)
    if (Object.keys(errs).length) { toast('Please fix the highlighted fields.', 'error'); return }
    if (proposing) {
      addProposal({ kind: 'new', title: displayName(m), summary: `${m.frequency === 'once' ? 'Once daily' : m.frequency === 'twice' ? 'Twice daily' : 'Custom'} · ${m.times.map(fmtHMShort).join(', ')}`, newMedicine: { ...stripUi(m), status: 'confirmed', source: 'family' }, by: 'You' })
      discard(); toast('Added as a draft proposal.', 'success'); back(); return
    }
    // Entered by the user: confirmed, but NOT active until they activate on the routine screen.
    const base = stripUi(m)
    const stock = m._qty && Number(m._qty) > 0 ? { unit: 'tablet', perDose: Number(m._perDose) || 0, dosesPerDay: 0, lowDays: m._lowDays ? Number(m._lowDays) : undefined, ledger: [txn('opening', Number(m._qty), 'user', now())] } : m._perDose || m._lowDays ? { unit: 'tablet', perDose: Number(m._perDose) || 0, dosesPerDay: 0, lowDays: m._lowDays ? Number(m._lowDays) : undefined, ledger: [] } : undefined
    saveMedicine({ ...base, ...(m._for ? { personId: m._for } : {}), ...(stock ? { stock } : {}), name: m.name.trim(), strength: m.strength.trim(), dose: m.dose.trim(), status: 'confirmed', flags: [], source: dictated.current ? 'voice' : 'manual', sourceText: heard })
    discard(); toast('Medicine added. Review your routine to activate reminders.', 'success')
    go('10', undefined, { replace: true })
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Add medicine</div>
        </div>
        {heard && <div style={{ marginTop: 16, fontSize: 13, color: '#6F526C', background: '#ECE4EE', borderRadius: 12, padding: '10px 14px', lineHeight: 1.4 }}>I heard: "{heard}". Please check the fields below — only what you said was filled in.</div>}
        <label className="lbl" htmlFor="a-name" style={{ display: 'block', marginTop: 24 }}>MEDICINE NAME</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.name}>
          <TextInput id="a-name" value={m.name} placeholder="e.g. Metoprolol" onChange={(e) => set({ name: e.target.value })} />
          <Tap label="Speak medicine details" onClick={dictate} style={{ display: 'flex' }}><MicIcon /></Tap>
        </InputBox>
        <Err>{errors.name}</Err>
        <label className="lbl" htmlFor="a-str" style={{ display: 'block' }}>STRENGTH</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.strength}><TextInput id="a-str" value={m.strength} placeholder="e.g. 50mg" onChange={(e) => set({ strength: e.target.value })} /></InputBox>
        <Err>{errors.strength}</Err>
        <label className="lbl" htmlFor="a-dose" style={{ display: 'block' }}>DOSE</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.dose}><TextInput id="a-dose" value={m.dose} placeholder="e.g. 1 tablet" onChange={(e) => set({ dose: e.target.value })} /></InputBox>
        <Err>{errors.dose}</Err>
        <ScheduleFields m={m} update={set} errors={errors} timeLabel="TIME" freqUnset={!m._f} durUnset={!m._d} />
        <MoreDetails m={m} update={set} people={people} showPerson={!proposing} />
      </ScrollArea>
      <div className="ft"><Btn kind="sg" onClick={save}>{proposing ? 'Add to proposal' : 'Add medicine'}</Btn></div>
    </div>
  )
}
