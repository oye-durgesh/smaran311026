import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { deleteReading, saveReading } from '../store/actions'
import { now, store, useStore } from '../store/store'
import { BackBtn, Btn, Err, InputBox, NoteArea, ScrollArea, Tap, TextInput } from '../ui/kit'
import { useDraft } from '../ui/hooks'
import { validateBp, type BpInput } from '../domain/health'
import { fromLocalInput, toLocalInput } from '../domain/time'

const big = { fontSize: 28, fontWeight: 600, height: 64, justifyContent: 'center' } as const

export default function Screen22({ param }: { param?: string }) {
  const { go, back, toast, confirm } = useApp()
  const tz = useStore((s) => s.profile.timeZone)
  const existing = param ? store.get().readings.find((r) => r.id === param) : undefined
  const [f, upd, discard] = useDraft<BpInput>(`bp:${param ?? 'new'}`, () => existing
    ? { systolic: String(existing.systolic ?? ''), diastolic: String(existing.diastolic ?? ''), pulse: existing.pulse ? String(existing.pulse) : '', at: toLocalInput(existing.at, tz), note: existing.note ?? '' }
    : { systolic: '', diastolic: '', pulse: '', at: toLocalInput(now().toISOString(), tz), note: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const sys = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!param) sys.current?.focus() }, [param])
  const set = (p: Partial<BpInput>) => { setErrors({}); upd(p) }
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 3)

  const save = () => {
    const at = fromLocalInput(f.at, tz)
    const v = validateBp({ ...f, at: at ? at.toISOString() : '' }, now())
    setErrors(v.errors)
    if (!v.ok || !at) { toast('Please check the reading.', 'error'); return }
    const r = saveReading({ id: existing?.id, type: 'bp', systolic: Number(f.systolic), diastolic: Number(f.diastolic), pulse: f.pulse.trim() ? Number(f.pulse) : undefined, at: at.toISOString(), note: f.note.trim() || undefined, source: existing?.source ?? 'manual' })
    discard(); go('40', r.id, { replace: true })
  }
  const del = () => confirm({ title: 'Delete this reading?', message: 'It will be removed from your history and charts.', confirmLabel: 'Delete reading', danger: true, onConfirm: () => { deleteReading(existing!.id); discard(); toast('Reading deleted.'); go('23', undefined, { replace: true }) } })
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Blood Pressure</div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <div style={{ flex: 1 }}>
            <label className="lbl" htmlFor="bp-sys" style={{ display: 'block', marginTop: 0 }}>SYSTOLIC</label>
            <InputBox style={{ marginTop: 10, ...big }} invalid={!!errors.systolic}><input id="bp-sys" ref={sys} className="fi" inputMode="numeric" placeholder="120" value={f.systolic} onChange={(e) => set({ systolic: digits(e.target.value) })} style={{ textAlign: 'center', fontSize: 28, fontWeight: 600 }} /></InputBox>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 20, fontSize: 24, color: '#8A7F6A', fontWeight: 300 }}>/</div>
          <div style={{ flex: 1 }}>
            <label className="lbl" htmlFor="bp-dia" style={{ display: 'block', marginTop: 0 }}>DIASTOLIC</label>
            <InputBox style={{ marginTop: 10, ...big }} invalid={!!errors.diastolic}><input id="bp-dia" className="fi" inputMode="numeric" placeholder="80" value={f.diastolic} onChange={(e) => set({ diastolic: digits(e.target.value) })} style={{ textAlign: 'center', fontSize: 28, fontWeight: 600 }} /></InputBox>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 14, color: '#8A7F6A', marginTop: 4 }}>mmHg</div>
        <Err>{errors.systolic}</Err><Err>{errors.diastolic}</Err>
        <label className="lbl" htmlFor="bp-pulse" style={{ display: 'block' }}>PULSE (OPTIONAL)</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.pulse}><TextInput id="bp-pulse" inputMode="numeric" placeholder="72" value={f.pulse} onChange={(e) => set({ pulse: digits(e.target.value) })} /><span style={{ fontSize: 14, color: '#8A7F6A' }}>bpm</span></InputBox>
        <Err>{errors.pulse}</Err>
        <label className="lbl" htmlFor="bp-at" style={{ display: 'block' }}>DATE &amp; TIME</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.at}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>
          <input id="bp-at" type="datetime-local" className="fi" value={f.at} onChange={(e) => set({ at: e.target.value })} />
        </InputBox>
        <Err>{errors.at}</Err>
        <label className="lbl" htmlFor="bp-note" style={{ display: 'block' }}>NOTE (OPTIONAL)</label>
        <NoteArea id="bp-note" h={56} color="#2E241B" placeholder="Add a note…" value={f.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} />
        {existing && <Tap onClick={del} style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: '#B75B53', fontWeight: 500 }}>Delete this reading</Tap>}
      </ScrollArea>
      <div className="ft"><Btn kind="sg" onClick={save}>Confirm &amp; save</Btn></div>
    </div>
  )
}
