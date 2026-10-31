import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { deleteReading, saveReading } from '../store/actions'
import { now, store, useStore } from '../store/store'
import { BackBtn, Chip, Err, InputBox, NoteArea, ScrollArea, Tap } from '../ui/kit'
import { useDraft } from '../ui/hooks'
import { MG_PER_MMOL, contextLabel, validateSugar, type SugarInput } from '../domain/health'
import { fmtDayTime, fromLocalInput, toLocalInput } from '../domain/time'
import type { SugarContext } from '../domain/types'

const CTX: Array<[SugarContext, string]> = [['fasting', 'Fasting'], ['before_meal', 'Before meal'], ['after_meal', 'After meal'], ['random', 'Random']]

/** param = reading id to edit. */
export default function Screen21({ param }: { param?: string }) {
  const { go, back, toast, confirm } = useApp()
  const tz = useStore((s) => s.profile.timeZone)
  const existing = param ? store.get().readings.find((r) => r.id === param) : undefined
  const [f, upd, discard] = useDraft<SugarInput>(`sugar:${param ?? 'new'}`, () => existing
    ? { value: String(existing.value ?? ''), unit: existing.unit ?? 'mg/dL', context: existing.context ?? 'unspecified', at: toLocalInput(existing.at, tz), note: existing.note ?? '' }
    : { value: '', unit: 'mg/dL', context: 'unspecified', at: toLocalInput(now().toISOString(), tz), note: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const valueRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!param) valueRef.current?.focus() }, [param])

  const set = (p: Partial<SugarInput>) => { setErrors({}); upd(p) }
  const toggleUnit = () => {
    const to = f.unit === 'mg/dL' ? 'mmol/L' : 'mg/dL'
    const n = Number(f.value)
    const value = f.value.trim() && !Number.isNaN(n) ? (to === 'mmol/L' ? (n / MG_PER_MMOL).toFixed(1) : String(Math.round(n * MG_PER_MMOL))) : f.value
    set({ unit: to, value })
  }
  const save = () => {
    const at = fromLocalInput(f.at, tz)
    const v = validateSugar({ ...f, at: at ? at.toISOString() : '' }, now())
    setErrors(v.errors)
    if (!v.ok || !at) { toast('Please check the reading.', 'error'); return }
    const r = saveReading({ id: existing?.id, type: 'sugar', value: Number(f.value.replace(',', '.')), unit: f.unit, context: f.context, at: at.toISOString(), note: f.note.trim() || undefined, source: existing?.source ?? 'manual' })
    discard(); go('40', r.id, { replace: true })
  }
  const del = () => confirm({ title: 'Delete this reading?', message: 'It will be removed from your history and charts.', confirmLabel: 'Delete reading', danger: true, onConfirm: () => { deleteReading(existing!.id); discard(); toast('Reading deleted.'); go('23', undefined, { replace: true }) } })
  const at = fromLocalInput(f.at, tz)
  const summary = f.value.trim() ? `${f.value} ${f.unit}${f.context !== 'unspecified' ? `, ${contextLabel(f.context).toLowerCase()}` : ''}${at ? `, ${fmtDayTime(at.toISOString(), now(), tz).toLowerCase()}` : ''}` : null
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={() => { back() }} />
          <div className="sf" style={{ fontSize: 22 }}>Blood Sugar</div>
        </div>
        <label className="lbl" htmlFor="bs-val" style={{ display: 'block', marginTop: 24 }}>READING</label>
        <InputBox style={{ marginTop: 10, fontSize: 28, fontWeight: 600, height: 64 }} invalid={!!errors.value}>
          <input id="bs-val" ref={valueRef} className="fi" inputMode="decimal" placeholder="0" value={f.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d.,]/g, '') })} style={{ flex: 1, fontSize: 28, fontWeight: 600 }} />
          <Tap onClick={toggleUnit} label={`Unit ${f.unit}, tap to change`} style={{ fontSize: 16, color: '#8A7F6A', fontWeight: 400 }}>{f.unit}</Tap>
        </InputBox>
        <Err>{errors.value}</Err>
        <div className="lbl">CONTEXT</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {CTX.map(([k, l]) => <Chip key={k} on={f.context === k} onClick={() => set({ context: f.context === k ? 'unspecified' : k })}>{l}</Chip>)}
        </div>
        <label className="lbl" htmlFor="bs-at" style={{ display: 'block' }}>DATE &amp; TIME</label>
        <InputBox style={{ marginTop: 10 }} invalid={!!errors.at}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>
          <input id="bs-at" type="datetime-local" className="fi" value={f.at} onChange={(e) => set({ at: e.target.value })} style={{ flex: 1 }} />
        </InputBox>
        <Err>{errors.at}</Err>
        <label className="lbl" htmlFor="bs-note" style={{ display: 'block' }}>NOTE (OPTIONAL)</label>
        <NoteArea id="bs-note" h={80} placeholder="Had dinner late last night…" value={f.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} />
        <div className="sep" />
        <div style={{ background: '#E7EDE2', border: '1px solid #C4D4B8', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5" style={{ flexShrink: 0 }}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
          <div style={{ fontSize: 14, color: '#526D51', lineHeight: 1.4 }}>{summary ? <>You entered <strong>{summary}</strong>. Is that correct?</> : 'Enter your reading above, then confirm it here.'}</div>
        </div>
        {existing && <Tap onClick={del} style={{ marginTop: 16, textAlign: 'center', fontSize: 14, color: '#B75B53', fontWeight: 500 }}>Delete this reading</Tap>}
      </ScrollArea>
      <div className="ft"><div style={{ display: 'flex', gap: 10 }}>
        <Tap onClick={() => valueRef.current?.focus()} style={{ flex: 1, height: 56, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 500 }}>Edit</Tap>
        <Tap onClick={save} style={{ flex: 2, height: 56, background: '#526D51', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 500 }}>Confirm &amp; save</Tap>
      </div></div>
    </div>
  )
}
