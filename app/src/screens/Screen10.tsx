import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { medicineBuckets } from '../store/actions'
import { store, useStore } from '../store/store'
import { BackBtn, Btn, Err, ScrollArea, Tap, PlusIcon } from '../ui/kit'
import { displayName } from '../domain/medicines'
import { flagText, reviewLine } from '../ui/medcards'
import { activePerson, personLabel } from '../domain/people'

export default function Screen10() {
  const { go, back, toast } = useApp()
  const meds = useStore((s) => s.medicines)
  const extraction = useStore((s) => s.setup.extraction)
  const who = useStore((s) => s.activePersonId)
  const forName = useStore((s) => (s.people.filter((p) => !p.archived).length > 1 ? (() => { const p = activePerson(s); return p ? personLabel(p) : '' })() : ''))
  const [error, setError] = useState<string>()
  const [showText, setShowText] = useState(false)
  const pending = meds.filter((m) => {
    if (!(m.status === 'draft' || m.status === 'confirmed')) return false
    if ((m.personId ?? who) !== who) return false
    if (extraction?.batchId) return m.extractionBatch === extraction.batchId || m.source !== 'prescription'
    return true
  })
  const reviewed = pending.filter((m) => m.status === 'confirmed').length

  const next = () => {
    const open = medicineBuckets(store.get()).drafts.length
    if (open > 0) { setError(`${open} medicine${open > 1 ? 's still need' : ' still needs'} your review. Tap a medicine to check it.`); toast('Review every medicine before continuing.', 'error'); return }
    if (pending.length === 0) { setError('Add at least one medicine to continue.'); return }
    go('12')
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackBtn onClick={back} />
          <div style={{ padding: '4px 12px', background: '#E7EDE2', borderRadius: 999, fontSize: 13, color: '#526D51', fontWeight: 500 }}>{reviewed} of {pending.length} reviewed</div>
        </div>
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>Medicines found</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>Review each medicine before setting reminders.{forName ? ` These are for ${forName}.` : ''}</div>
        {extraction?.document && (extraction.document.patientName || extraction.document.doctorName || extraction.document.prescriptionDate) && (
          <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 8, lineHeight: 1.5 }}>
            {extraction.document.patientName ? <>Patient: {extraction.document.patientName}<br /></> : null}
            {extraction.document.doctorName ? <>Doctor: {extraction.document.doctorName}<br /></> : null}
            {extraction.document.prescriptionDate ? <>Date: {extraction.document.prescriptionDate}</> : null}
          </div>
        )}
        {extraction?.isMock && (
          <div style={{ fontSize: 12, color: '#C08560', marginTop: 8, lineHeight: 1.4 }}>DEMO DATA — these sample medicines were not read from a real prescription file.</div>
        )}
        {extraction && !extraction.isMock && (extraction.warnings ?? []).map((w) => <div key={w} style={{ fontSize: 12, color: '#C08560', marginTop: 8, lineHeight: 1.4 }}>{w}</div>)}
        {extraction?.rawText && (
          <Tap onClick={() => setShowText((v) => !v)} style={{ marginTop: 10, fontSize: 13, color: '#7A6B5D', textDecoration: 'underline' }}>{showText ? 'Hide' : 'Compare with'} {showText ? 'original text' : 'original text'}</Tap>
        )}
        {showText && extraction?.rawText && (
          <div style={{ marginTop: 8, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 11, color: '#8A7F6A', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Text read from your document</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 200, overflow: 'auto', fontFamily: 'inherit' }}>{extraction.rawText}</pre>
            {(extraction.otherInstructions ?? []).length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#7A6B5D' }}>Other instructions in the document: {(extraction.otherInstructions ?? []).join(' · ')}</div>}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {pending.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', lineHeight: 1.5 }}>No medicines to review yet. Add one below, or scan a prescription.</div>}
          {pending.map((m) => {
            const ok = m.status === 'confirmed'
            const reasons = m.flags.map((f) => flagText[f]).join(', ')
            return (
              <Tap key={m.id} className="crd" style={{ borderLeft: `3px solid ${ok ? '#7B8B5A' : '#C08560'}` }} onClick={() => go('11', m.id)} label={`${displayName(m)}, ${ok ? 'confirmed' : 'needs review'}`}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{displayName(m)}</div>
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, ...(ok ? { background: '#E7EDE2', color: '#526D51' } : { background: 'rgba(192,133,96,.12)', color: '#C08560' }) }}>{ok ? 'Confirmed' : 'Needs review'}</span>
                </div>
                <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 6 }}>{reviewLine(m)}</div>
                {ok && m.sourceText && <div style={{ fontSize: 12, color: '#A89584', marginTop: 4, fontStyle: 'italic' }}>Rx: "{m.sourceText}"</div>}
                {!ok && (m.sourceText || reasons) && <div style={{ fontSize: 12, color: '#C08560', marginTop: 4 }}>{m.sourceText ? `Rx: "${m.sourceText}"` : ''}{m.sourceText && reasons ? ' — ' : ''}{reasons}</div>}
                {!ok && (
                  <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#F8F4EC', border: '1px solid #E8DFD1', borderRadius: 999, fontSize: 13, fontWeight: 500 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>Review
                  </div>
                )}
              </Tap>
            )
          })}
        </div>
        <Tap onClick={() => go('31')} style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, color: '#7B8B5A', fontWeight: 500 }}>
          <PlusIcon size={16} color="#7B8B5A" />Add another medicine
        </Tap>
        <Err>{error}</Err>
      </ScrollArea>
      <div className="ft"><Btn onClick={next}>Continue</Btn></div>
    </div>
  )
}
