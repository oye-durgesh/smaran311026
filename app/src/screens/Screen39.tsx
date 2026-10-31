import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { saveReading } from '../store/actions'
import { now } from '../store/store'
import { BackBtn, Btn, Chip, Err, InputBox, ScrollArea, TextInput } from '../ui/kit'
import { useDraft } from '../ui/hooks'
import { parseReadingText, validateBp, validateSugar } from '../domain/health'
import { validateParsed } from '../voice/brain'
import type { SugarContext } from '../domain/types'

/** param = the transcript that could not be understood. */
export default function Screen39({ param }: { param?: string }) {
  const { go, back, toast } = useApp()
  const parsed = param ? parseReadingText(param) : null
  const why = parsed ? validateParsed(parsed, now()) : null
  const [f, upd] = useDraft<{ type: 'sugar' | 'bp'; value: string; unit: 'mg/dL' | 'mmol/L'; sys: string; dia: string; context: SugarContext }>('manual-reading', () => ({ type: parsed?.type ?? 'sugar', value: '', unit: 'mg/dL', sys: '', dia: '', context: 'unspecified' }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (p: Partial<typeof f>) => { setErrors({}); upd(p) }

  const save = () => {
    const n = now()
    const at = n.toISOString()
    const v = f.type === 'sugar' ? validateSugar({ value: f.value, unit: f.unit, context: f.context, at, note: '' }, n) : validateBp({ systolic: f.sys, diastolic: f.dia, pulse: '', at, note: '' }, n)
    setErrors(v.errors)
    if (!v.ok) { toast('Please check the reading.', 'error'); return }
    const r = f.type === 'sugar'
      ? saveReading({ type: 'sugar', at, value: Number(f.value.replace(',', '.')), unit: f.unit, context: f.context, source: 'voice' })
      : saveReading({ type: 'bp', at, systolic: Number(f.sys), diastolic: Number(f.dia), source: 'voice' })
    upd({ value: '', sys: '', dia: '' })
    go('40', r.id, { replace: true })
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0', padding: '20px 24px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Record reading</div>
        </div>
        <div style={{ marginTop: 24, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#8A7F6A', letterSpacing: '.08em' }}>TRANSCRIPT</div>
          <div style={{ fontSize: 16, color: '#2E241B', marginTop: 8, lineHeight: 1.5 }}>{param ? `"${param}"` : 'Nothing was recorded.'}</div>
        </div>
        <div style={{ marginTop: 16, background: 'rgba(192,133,96,.1)', border: '1px solid rgba(192,133,96,.3)', borderRadius: 14, padding: 16, display: 'flex', gap: 12 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C08560" strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#2E241B' }}>{why ? 'That reading doesn\'t look right' : 'Could not detect a value'}</div>
            <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 4, lineHeight: 1.5 }}>{why ?? "I couldn't find a specific number in what you said. Please say or enter the reading value."}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 24, fontWeight: 500 }}>Enter manually</div>
        <div className="lbl" style={{ marginTop: 16 }}>TYPE</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Chip on={f.type === 'sugar'} onClick={() => set({ type: 'sugar' })}>Blood Sugar</Chip>
          <Chip on={f.type === 'bp'} onClick={() => set({ type: 'bp' })}>Blood Pressure</Chip>
        </div>
        {f.type === 'sugar' ? (
          <>
            <label className="lbl" htmlFor="mr-val" style={{ display: 'block' }}>VALUE</label>
            <InputBox style={{ marginTop: 10 }} invalid={!!errors.value}>
              <TextInput id="mr-val" inputMode="decimal" placeholder="Enter value…" value={f.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d.,]/g, '') })} />
              <span role="button" tabIndex={0} onClick={() => set({ unit: f.unit === 'mg/dL' ? 'mmol/L' : 'mg/dL', value: '' })} style={{ fontSize: 14, color: '#8A7F6A', cursor: 'pointer' }}>{f.unit}</span>
            </InputBox>
            <Err>{errors.value}</Err>
            <div className="lbl">CONTEXT</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {([['fasting', 'Fasting'], ['before_meal', 'Before meal'], ['after_meal', 'After meal'], ['random', 'Random']] as const).map(([k, l]) => <Chip key={k} on={f.context === k} onClick={() => set({ context: f.context === k ? 'unspecified' : k })}>{l}</Chip>)}
            </div>
          </>
        ) : (
          <>
            <label className="lbl" htmlFor="mr-sys" style={{ display: 'block' }}>VALUE</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
              <InputBox style={{ flex: 1 }} invalid={!!errors.systolic}><TextInput id="mr-sys" inputMode="numeric" placeholder="Top" value={f.sys} onChange={(e) => set({ sys: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></InputBox>
              <span style={{ color: '#8A7F6A' }}>/</span>
              <InputBox style={{ flex: 1 }} invalid={!!errors.diastolic}><TextInput aria-label="Bottom number" inputMode="numeric" placeholder="Bottom" value={f.dia} onChange={(e) => set({ dia: e.target.value.replace(/\D/g, '').slice(0, 3) })} /><span style={{ fontSize: 14, color: '#8A7F6A' }}>mmHg</span></InputBox>
            </div>
            <Err>{errors.systolic}</Err><Err>{errors.diastolic}</Err>
          </>
        )}
        <div style={{ marginTop: 24 }}><Btn kind="sg" onClick={save}>Save reading</Btn></div>
      </ScrollArea>
    </div>
  )
}
