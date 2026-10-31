import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { saveReading, setDraft } from '../store/actions'
import { now, useStore } from '../store/store'
import { BackBtn, MicIcon, ScrollArea, Tap } from '../ui/kit'
import { contextLabel, parseReadingText, type ParsedReading } from '../domain/health'
import { validateParsed } from '../voice/brain'
import { fmtDayTime, toLocalInput } from '../domain/time'
import { recognitionSupported, startRecognition, type Recognition } from '../voice/speech'

export default function Screen38() {
  const { go, back, toast } = useApp()
  const lang = useStore((s) => s.profile.language)
  const tz = useStore((s) => s.profile.timeZone)
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [note, setNote] = useState<string>()
  const rec = useRef<Recognition | null>(null)
  const supported = recognitionSupported()

  const stop = () => { rec.current?.abort(); rec.current = null; setListening(false) }
  const listen = () => {
    if (!supported) { setNote("Speech input isn't supported in this browser. Type what you want to record below."); return }
    setNote(undefined); setListening(true)
    rec.current = startRecognition(lang, {
      onInterim: (t) => setText(t),
      onFinal: (t) => { setText(t); setListening(false) },
      onError: (e) => {
        setListening(false)
        setNote(e === 'permission-denied' ? 'Microphone access is blocked. Allow it in your browser, or type below.' : e === 'no-speech' ? "I didn't hear anything. Tap the microphone to try again, or type below." : e === 'audio-capture' ? 'No microphone found. Type below.' : e === 'network' ? 'The speech service could not be reached. Type below.' : e === 'aborted' ? undefined : 'Could not listen. Type below.')
      },
      onEnd: () => setListening(false),
    })
  }
  useEffect(() => { listen(); return () => rec.current?.abort() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const parsed: ParsedReading | null = text.trim() ? parseReadingText(text) : null
  const problem = parsed ? validateParsed(parsed, now()) : null
  const atIso = now().toISOString()

  const confirm = () => {
    if (!parsed || problem) { go('39', text.trim() || undefined); return }
    const r = saveReading(parsed.type === 'sugar'
      ? { type: 'sugar', at: atIso, value: parsed.value, unit: parsed.unit ?? 'mg/dL', context: parsed.context ?? 'unspecified', source: 'voice' }
      : { type: 'bp', at: atIso, systolic: parsed.systolic, diastolic: parsed.diastolic, pulse: parsed.pulse, source: 'voice' })
    go('40', r.id, { replace: true })
  }
  const edit = () => {
    if (!parsed) { toast('Say or type a reading first.', 'error'); return }
    const t = toLocalInput(atIso, tz)
    if (parsed.type === 'sugar') { setDraft('sugar:new', { value: String(parsed.value ?? ''), unit: parsed.unit ?? 'mg/dL', context: parsed.context ?? 'unspecified', at: t, note: '' }); go('21') }
    else { setDraft('bp:new', { systolic: String(parsed.systolic ?? ''), diastolic: String(parsed.diastolic ?? ''), pulse: parsed.pulse ? String(parsed.pulse) : '', at: t, note: '' }); go('22') }
  }
  const row = (k: string, v: string, mt: number) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginTop: mt }}><span style={{ fontSize: 14, color: '#7A6B5D' }}>{k}</span><span style={{ fontSize: 15, fontWeight: 500, textAlign: 'right' }}>{v}</span></div>
  return (
    <div className="scr" style={{ background: '#F0EAE0', padding: '20px 24px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={() => { stop(); back() }} />
          <div className="sf" style={{ fontSize: 22 }}>Record reading</div>
        </div>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Tap label={listening ? 'Stop listening' : 'Start listening'} onClick={() => (listening ? stop() : listen())} style={{ width: 80, height: 80, borderRadius: '50%', background: '#6F526C', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {listening && <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '2px solid rgba(111,82,108,.3)', animation: 's-pulse 1.5s ease-out infinite' }} />}
            <MicIcon size={36} color="#fff" />
          </Tap>
          <div role="status" style={{ fontSize: 16, fontWeight: 500, color: '#6F526C', marginTop: 16 }}>{listening ? 'Listening…' : supported ? 'Tap the microphone to speak' : 'Type your reading'}</div>
          <div style={{ fontSize: 14, color: '#8A7F6A', marginTop: 8, maxWidth: 280, lineHeight: 1.5 }}>{note ?? 'Say something like "Mera sugar aaj 180 aaya, breakfast se pehle"'}</div>
        </div>
        <div style={{ marginTop: 28, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: 14 }}>
          <label htmlFor="vr-text" style={{ display: 'block', fontSize: 12, color: '#8A7F6A', letterSpacing: '.08em' }}>TRANSCRIPT</label>
          <textarea id="vr-text" className="fi-area" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your words appear here — you can also type or correct them"
            style={{ width: '100%', border: 0, background: 'none', resize: 'none', fontSize: 16, color: '#2E241B', marginTop: 8, lineHeight: 1.5, padding: 0, boxSizing: 'border-box' }} />
        </div>
        {parsed && !problem && (
          <div style={{ marginTop: 16, background: '#E7EDE2', border: '1px solid #C4D4B8', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#526D51', letterSpacing: '.08em' }}>PARSED READING</div>
            {row('Type', parsed.type === 'sugar' ? 'Blood Sugar' : 'Blood Pressure', 8)}
            {row('Value', parsed.type === 'sugar' ? `${parsed.value} ${parsed.unit}` : `${parsed.systolic}/${parsed.diastolic} mmHg`, 6)}
            {parsed.type === 'sugar' && row('Context', contextLabel(parsed.context) + (parsed.context === 'before_meal' ? ' (as you said)' : ''), 6)}
            {parsed.type === 'bp' && parsed.pulse != null && row('Pulse', `${parsed.pulse} bpm`, 6)}
            {row('Time', fmtDayTime(atIso, now(), tz), 6)}
          </div>
        )}
        {parsed && problem && <div role="alert" style={{ marginTop: 16, fontSize: 13, color: '#B75B53', lineHeight: 1.4 }}>That doesn't look right: {problem}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Tap onClick={edit} style={{ flex: 1, height: 48, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500 }}>Edit</Tap>
          <Tap onClick={confirm} style={{ flex: 2, height: 48, background: '#526D51', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 500 }}>Confirm &amp; save</Tap>
        </div>
      </ScrollArea>
    </div>
  )
}
