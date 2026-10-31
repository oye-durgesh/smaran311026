import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { setActivePerson, setPrescription } from '../store/actions'
import { personLabel } from '../domain/people'
import { fileStore } from '../store/fileStore'
import { now, store, useStore } from '../store/store'
import { BackBtn, Btn, Chip, Err, ScrollArea, Tap } from '../ui/kit'
import { DOC_LANGUAGES, appLangToDoc, validatePrescriptionFile } from '../services/extraction'
import { medicineBuckets } from '../store/actions'

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function Screen08() {
  const { go, back, home, toast } = useApp()
  const rx = useStore((s) => s.setup.prescription)
  const people = useStore((s) => s.people).filter((x) => !x.archived)
  const activeId = useStore((s) => s.activePersonId)
  const [error, setError] = useState<string>()
  const [preview, setPreview] = useState<string | null>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  // Restore the preview after a refresh / coming back to this screen.
  useEffect(() => {
    let url: string | null = null
    let alive = true
    if (rx && rx.mime.startsWith('image/')) {
      fileStore.get(rx.fileKey).then((b) => { if (b && alive) { url = URL.createObjectURL(b); setPreview(url) } }).catch(() => undefined)
    } else setPreview(null)
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [rx?.fileKey, rx?.mime])

  const pick = async (f: File | undefined) => {
    if (!f) return
    const problem = validatePrescriptionFile(f)
    if (problem) { setError(problem); return }
    setError(undefined)
    const key = `rx-${Date.now()}`
    try {
      if (rx) await fileStore.del(rx.fileKey).catch(() => undefined)
      await fileStore.put(key, f)
    } catch {
      setError('Could not keep this file on your device (storage is unavailable or full). Try a smaller file.')
      return
    }
    setPrescription({ fileName: f.name, mime: f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'), size: f.size, fileKey: key, addedAt: now().toISOString(), language: appLangToDoc(store.get().profile.language), demoSample: false })
  }
  const loadDemoSample = async () => {
    setError(undefined)
    const blob = new Blob(['DEMO SAMPLE PRESCRIPTION — not a real document'], { type: 'application/pdf' })
    const key = 'rx-demo-sample'
    try {
      if (rx) await fileStore.del(rx.fileKey).catch(() => undefined)
      await fileStore.put(key, blob)
    } catch {
      setError('Could not keep the sample file on this device.')
      return
    }
    setPrescription({ fileName: 'sample-prescription (DEMO DATA).pdf', mime: 'application/pdf', size: blob.size, fileKey: key, addedAt: now().toISOString(), language: appLangToDoc(store.get().profile.language), demoSample: true })
  }
  const remove = async () => {
    if (rx) await fileStore.del(rx.fileKey).catch(() => undefined)
    setPrescription(null); setError(undefined)
  }
  const skip = () => {
    const b = medicineBuckets(store.get())
    b.active.length ? home() : go('13')
  }
  return (
    <div className="scr" style={{ background: '#F0EAE0', padding: '20px 24px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{}}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackBtn onClick={back} />
          <Tap style={{ fontSize: 15, color: '#7A6B5D' }} onClick={skip}>Skip</Tap>
        </div>
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>Let's add your medicines</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>Take a clear photo of your prescription or upload a document.</div>
        <input ref={gallery} type="file" hidden accept="image/jpeg,image/png,application/pdf,.pdf,.png,.jpg,.jpeg" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={camera} type="file" hidden accept="image/jpeg,image/png" capture="environment" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
        <Tap label="Upload prescription" onClick={() => gallery.current?.click()}
          style={{ marginTop: 24, border: '2px dashed #C4BAA8', borderRadius: 20, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, background: 'rgba(255,253,248,.5)' }}>
          {rx ? (
            <>
              {preview
                ? <img src={preview} alt="Selected prescription" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 8, border: '1px solid #E8DFD1' }} />
                : <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg></div>}
              <div style={{ fontSize: 16, fontWeight: 500, wordBreak: 'break-all', textAlign: 'center' }}>{rx.fileName}</div>
              <div style={{ fontSize: 13, color: '#8A7F6A', textAlign: 'center' }}>{fmtSize(rx.size)} · tap to replace</div>
            </>
          ) : (
            <>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" /></svg></div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>Upload prescription</div>
              <div style={{ fontSize: 13, color: '#8A7F6A', textAlign: 'center' }}>Photo, scan, or PDF of your doctor's prescription</div>
            </>
          )}
        </Tap>
        <Err>{error}</Err>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Tap onClick={() => camera.current?.click()} style={{ flex: 1, height: 52, background: '#F8F4EC', border: '1px solid #E8DFD1', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>Camera
          </Tap>
          <Tap onClick={() => gallery.current?.click()} style={{ flex: 1, height: 52, background: '#F8F4EC', border: '1px solid #E8DFD1', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>Gallery
          </Tap>
        </div>
        {rx && people.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <div className="lbl" style={{ marginTop: 0 }}>WHO IS THIS PRESCRIPTION FOR?</div>
            <div role="radiogroup" aria-label="Who is this prescription for" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {people.map((x) => <Chip key={x.id} on={activeId === x.id} onClick={() => setActivePerson(x.id)}>{personLabel(x)}</Chip>)}
            </div>
          </div>
        )}
        {rx && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#7A6B5D', display: 'flex', alignItems: 'center', gap: 8 }}>
              Language of the document
              <select aria-label="Document language" value={rx.language ?? 'en-IN'} onChange={(e) => setPrescription({ ...rx, language: e.target.value })}
                style={{ fontSize: 14, padding: '6px 8px', borderRadius: 8, border: '1px solid #E8DFD1', background: '#fff', color: '#2E241B' }}>
                {DOC_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
            <Btn onClick={() => go('09')}>{rx.demoSample ? 'Read sample (DEMO DATA)' : 'Read prescription'}</Btn>
            <Tap style={{ fontSize: 14, color: '#B75B53', fontWeight: 500 }} onClick={() => { void remove(); toast('Removed the selected file.') }}>Remove file</Tap>
          </div>
        )}
        {!rx && (
          <Tap onClick={() => { void loadDemoSample() }} style={{ marginTop: 16, fontSize: 14, color: '#6F526C', fontWeight: 500, textAlign: 'center' }}>
            Try a sample prescription (DEMO DATA)
          </Tap>
        )}
        {rx?.demoSample && <div style={{ fontSize: 12, color: '#C08560', marginTop: 10, textAlign: 'center' }}>DEMO DATA — sample medicines will be shown. Upload a real file to use Sarvam extraction.</div>}
        <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 12, textAlign: 'center' }}>Handwritten prescriptions may need manual confirmation.</div>
        <div className="sep" />
        <Tap onClick={() => go('31')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, color: '#7B8B5A', fontWeight: 500 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7B8B5A" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>Add medicine manually
        </Tap>
      </ScrollArea>
    </div>
  )
}
