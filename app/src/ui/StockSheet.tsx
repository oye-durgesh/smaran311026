import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { recordStock, recountStock, setStockSettings } from '../store/actions'
import { now, useStore } from '../store/store'
import { estimateStock } from '../domain/inventory'
import { displayName } from '../domain/medicines'
import { Btn, Chip, Err, InputBox, TextInput } from './kit'
import { SheetTitle } from './Overlays'

type Mode = 'refill' | 'count' | 'start'
/** Update the tablets on hand for one medicine: a refill that was bought, a recount, or first-time tracking. Each entry keeps its date and source. */
export function StockSheet({ medicineId }: { medicineId: string }) {
  const { toast, closeSheet } = useApp()
  const med = useStore((s) => s.medicines.find((m) => m.id === medicineId))
  const reminders = useStore((s) => s.reminders)
  const tracked = !!med?.stock?.ledger?.length
  const [mode, setMode] = useState<Mode>(tracked ? 'refill' : 'start')
  const [qty, setQty] = useState('')
  const [perDose, setPerDose] = useState(med?.stock?.perDose ? String(med.stock.perDose) : '')
  const [err, setErr] = useState<string>()
  if (!med) return null
  const est = estimateStock(med, reminders, now())
  const save = () => {
    const n = Number(qty)
    if (!qty || Number.isNaN(n)) { setErr('Enter a number of tablets.'); return }
    if (perDose) { const r = setStockSettings(med.id, { perDose: Number(perDose) }); if (!r.ok) { setErr(r.error); return } }
    const r = mode === 'count' ? recountStock(med.id, n) : recordStock(med.id, mode === 'refill' ? 'refill' : 'opening', n, 'user')
    if (!r.ok) { setErr(r.error); return }
    toast(mode === 'refill' ? 'Refill recorded.' : mode === 'count' ? 'Count saved.' : 'Stock saved.', 'success'); closeSheet()
  }
  return (
    <div>
      <SheetTitle sub={tracked ? `About ${est.onHand} ${est.unit}s by our records. ${est.message}` : 'Tell us how many tablets there are now.'}>{displayName(med)} · stock</SheetTitle>
      <div role="radiogroup" aria-label="What happened" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {tracked ? <><Chip on={mode === 'refill'} onClick={() => setMode('refill')}>I bought a refill</Chip><Chip on={mode === 'count'} onClick={() => setMode('count')}>I counted the tablets</Chip></>
          : <Chip on onClick={() => undefined}>Start tracking</Chip>}
      </div>
      <label className="lbl" htmlFor="st-qty" style={{ display: 'block' }}>{mode === 'refill' ? 'TABLETS ADDED' : mode === 'count' ? 'TABLETS LEFT NOW' : 'TABLETS AVAILABLE NOW'}</label>
      <InputBox style={{ marginTop: 10 }} invalid={!!err}><TextInput id="st-qty" inputMode="decimal" value={qty} onChange={(e) => { setErr(undefined); setQty(e.target.value.replace(/[^\d.]/g, '')) }} /></InputBox>
      {(!med.stock?.perDose || mode === 'start') && (
        <>
          <label className="lbl" htmlFor="st-per" style={{ display: 'block' }}>TABLETS PER DOSE (FROM THE PRESCRIPTION)</label>
          <InputBox style={{ marginTop: 10 }}><TextInput id="st-per" inputMode="decimal" value={perDose} placeholder="e.g. 1" onChange={(e) => setPerDose(e.target.value.replace(/[^\d.]/g, ''))} /></InputBox>
        </>
      )}
      <Err>{err}</Err>
      <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 10, lineHeight: 1.5 }}>Smaran never orders medicine or changes treatment. This only keeps a record so we can warn you in time.</div>
      <div style={{ marginTop: 16 }}><Btn kind="sg" onClick={save}>Save</Btn></div>
    </div>
  )
}
