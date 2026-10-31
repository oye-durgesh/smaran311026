import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { recordExtraction } from '../store/actions'
import { fileStore } from '../store/fileStore'
import { now, store } from '../store/store'
import { ExtractionError, getExtractor, toDraftMedicines } from '../services/extraction'
import { Tap } from '../ui/kit'
import { newId } from '../domain/ids'

export default function Screen09() {
  const { go } = useApp()
  const [progress, setProgress] = useState<string>()
  const [canCancel, setCanCancel] = useState(false)
  const started = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const { back } = useApp()

  useEffect(() => {
    if (started.current) return
    started.current = true
    let cancelled = false
    const ac = new AbortController()
    abort.current = ac
    const tm = setTimeout(() => setCanCancel(true), 3000)
    ;(async () => {
      const rx = store.get().setup.prescription
      const prevBatch = store.get().setup.extraction?.batchId
      const batchId = newId('bat')
      const fail = (message: string, extra: { code?: string; rawText?: string; jobId?: string } = {}) => {
        recordExtraction({ batchId, provider: 'sarvam', at: now().toISOString(), isMock: false, rawText: extra.rawText ?? '', outcome: 'error', error: message, errorCode: extra.code, jobId: extra.jobId, language: rx?.language }, [], prevBatch)
        if (!cancelled) go('28', undefined, { replace: true })
      }
      if (!rx) return fail('No prescription file was selected.')
      const personId = store.get().activePersonId
      if (!personId) return fail('Choose who this prescription is for, then try again.', { code: 'permission_denied' })
      const demoSample = !!rx.demoSample
      const blob = await fileStore.get(rx.fileKey).catch(() => undefined)
      if (!blob) return fail('The selected file could not be found on this device. Please choose it again.')
      try {
        const ex = await getExtractor({ demoSample })
        if (!demoSample && ex.id === 'mock') return fail('A real upload cannot use sample medicines. Sign in so your file can be sent to the reading service.', { code: 'not_signed_in' })
        const res = await ex.extract(blob, {
          name: rx.fileName, mime: rx.mime, language: rx.language ?? 'en-IN', personId, documentType: 'prescription', signal: ac.signal,
          onProgress: (p) => { if (!cancelled) setProgress(p.pages && p.pages.total ? `Page ${Math.min(p.pages.processed + 1, p.pages.total)} of ${p.pages.total}` : undefined) },
        })
        if (cancelled) return
        if (!demoSample && (res.isMock || res.provider === 'mock')) return fail('A real upload cannot use sample medicines. Your file was not sent to the reading service.', { code: 'not_signed_in' })
        if (!res.medicines.length) return fail('We read the document but could not find any medicines in it. You can compare the text we read, or add medicines manually.', { code: 'no_medicines', rawText: res.rawText, jobId: res.jobId })
        const meds = toDraftMedicines(res, personId, { allowDemo: demoSample })
        recordExtraction({ batchId, provider: demoSample ? 'mock' : res.provider, at: now().toISOString(), isMock: demoSample, rawText: res.rawText, rawFormat: res.rawFormat, outcome: res.outcome, jobId: res.jobId, language: res.language ?? rx.language, otherInstructions: res.otherInstructions, warnings: res.warnings, document: res.document }, meds, prevBatch)
        go(res.outcome === 'partial' ? '45' : '10', undefined, { replace: true })
      } catch (e) {
        if (cancelled) return
        if (e instanceof ExtractionError && e.code === 'cancelled') return
        if (e instanceof ExtractionError) fail(e.message, { code: e.code, rawText: e.rawText, jobId: e.jobId })
        else fail('Something went wrong while reading the prescription.')
      }
    })()
    return () => { cancelled = true; started.current = false; clearTimeout(tm); ac.abort() }
  }, [go])

  return (
    <div className="scr" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', boxSizing: 'border-box', height: 'calc(100% - 47px)' }}>
      <div style={{ width: 120, height: 160, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#C4BAA8" strokeWidth="1"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6M8 9h2" /></svg>
      </div>
      <div role="status" aria-label="Reading prescription" style={{ width: 40, height: 40, marginTop: 32, border: '3px solid #E8DFD1', borderTopColor: '#7B8B5A', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <div className="sf" style={{ fontSize: 22, marginTop: 20, textAlign: 'center' }}>Reading your prescription</div>
      <div style={{ fontSize: 14, color: '#7A6B5D', marginTop: 12, textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>We'll ask you to check the details before setting any reminders.</div>
      {store.get().setup.prescription?.demoSample && <div style={{ fontSize: 12, color: '#C08560', marginTop: 12, textAlign: 'center', maxWidth: 280, lineHeight: 1.4 }}>DEMO DATA: this is a sample prescription. No text is read from a real file.</div>}
      {progress && <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 8 }}>{progress}</div>}
      {canCancel && <Tap style={{ fontSize: 14, color: '#7A6B5D', marginTop: 20, textDecoration: 'underline' }} onClick={() => { abort.current?.abort(); back() }}>Cancel</Tap>}
    </div>
  )
}
