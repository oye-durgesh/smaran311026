import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { useVoice, voice } from '../voice/session'
import { MicIcon, PhoneDownIcon, Tap } from '../ui/kit'
import { CALL_BG } from '../ui/callparts'
import { Orb } from '../ui/SathiStage'

export default function Screen17() {
  const { home, toast } = useApp()
  const v = useVoice()
  const reminders = useStore((s) => s.reminders)
  const meds = useStore((s) => s.medicines)
  const r = v.reminderId ? reminders.find((x) => x.id === v.reminderId) : undefined
  const med = r?.medicineId ? meds.find((m) => m.id === r.medicineId) : undefined
  const subject = med?.name ?? r?.title ?? 'your medicine'

  const answer = () => (v.incoming ? void voice.answer() : voice.startAssistant())
  const notNow = () => { if (v.incoming) voice.decline(); home() }
  const later = () => {
    if (!v.incoming) { toast('No reminder is ringing right now.'); return }
    voice.snoozeFromRing(15); toast('Okay, I will remind you again in 15 minutes.', 'success'); home()
  }
  return (
    <div className="scr">
      <div style={{ position: 'absolute', inset: 0, background: CALL_BG }} />
      <div style={{ position: 'relative', padding: '40px 24px', boxSizing: 'border-box', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: '.14em', color: 'rgba(245,239,230,.65)', marginBottom: 28 }}>{v.incoming ? 'INCOMING REMINDER' : 'SATHI'}</div>
          <Orb size={110} state={v.incoming ? 'speaking' : 'ready'} />
          <div className="sf" style={{ fontSize: 28, color: '#fff', marginTop: 20 }}>Sathi</div>
          <div style={{ fontSize: 16, color: 'rgba(245,239,230,.9)', marginTop: 6, textAlign: 'center' }}>{r && r.kind !== 'medicine' ? r.title : `Time for ${subject}`}</div>
          <div role="status" style={{ fontSize: 13, color: 'rgba(245,239,230,.7)', marginTop: 8 }}>{v.incoming ? (v.ringStatus === 'none' ? 'Waiting for you…' : v.ringStatus === 'quiet' ? 'Ringing… (quiet hours: no sound)' : 'Ringing…') : 'Ready'}</div>
          {v.incoming && v.ringStatus === 'blocked' && <div style={{ fontSize: 12, color: 'rgba(245,239,230,.7)', marginTop: 6, maxWidth: 260, textAlign: 'center' }}>Your browser is blocking the ring sound until you tap the screen.</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', gap: 80 }}>
            <Tap label="Not now" onClick={notNow} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#C08560', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PhoneDownIcon /></div>
              <div style={{ fontSize: 13, color: '#fff' }}>Not now</div>
            </Tap>
            <Tap label="Answer" onClick={answer} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#7A9B6B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MicIcon size={30} color="#fff" /></div>
              <div style={{ fontSize: 13, color: '#fff' }}>Answer</div>
            </Tap>
          </div>
          <Tap onClick={later} style={{ fontSize: 14, color: 'rgba(245,239,230,.8)' }}>Remind me in 15 minutes</Tap>
        </div>
      </div>
    </div>
  )
}
