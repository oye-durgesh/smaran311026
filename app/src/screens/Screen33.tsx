import { useApp } from '../app/AppContext'
import { store, useStore } from '../store/store'
import { Btn, Tap } from '../ui/kit'
import { routineGroups } from '../ui/medcards'
import { fmtTime } from '../domain/time'
import { speak } from '../voice/speech'
import { upcoming } from '../domain/reminders'

export default function Screen33() {
  const { home, toast } = useApp()
  const profile = useStore((s) => s.profile)
  const meds = useStore((s) => s.medicines).filter((m) => m.status === 'active')
  const reminders = useStore((s) => s.reminders)
  const groups = routineGroups(meds)
  const first = upcoming(reminders.filter((r) => r.kind === 'medicine'))[0]
  const firstName = profile.name.trim().split(/\s+/)[0] || 'there'
  const firstLine = first ? `Sathi will call you at ${fmtTime(first.scheduledFor, profile.timeZone)} for your first medicine.` : 'Your reminders are active.'
  const sentence = `You're all set, ${firstName}. Your reminders are active. ${firstLine} ${groups.map((g) => `${g.label}: ${g.meds.length} medicine${g.meds.length > 1 ? 's' : ''}.`).join(' ')}`
  const hear = () => {
    const ok = speak(sentence, sentence, { lang: store.get().profile.language === 'hi' ? 'en' : store.get().profile.language, rate: profile.speakingSpeed === 'slower' ? 0.8 : 1, onEnd: () => undefined, onError: () => toast("Sathi's voice could not play.", 'error') })
    if (!ok) toast("Voice playback isn't supported in this browser.", 'error')
  }
  return (
    <div className="scr">
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 60% at 50% 20%,rgba(212,165,124,.4) 0%,rgba(135,165,138,.3) 40%,rgba(245,239,230,0) 75%)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 24px 100px', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ flex: 1 }} />
        <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="2"><path d="M5 12l5 5L20 7" /></svg></div>
        <div className="sf" style={{ fontSize: 26, marginTop: 24, textAlign: 'center' }}>You're all set, {firstName}.</div>
        <div style={{ fontSize: 15, color: '#7A6B5D', marginTop: 12, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>Your reminders are active. {firstLine}</div>
        <div style={{ marginTop: 24, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: 14, width: '100%' }}>
          <div style={{ fontSize: 12, color: '#8A7F6A', letterSpacing: '.08em' }}>YOUR ROUTINE</div>
          {groups.map((g, i) => (
            <div key={g.time} style={{ display: 'flex', justifyContent: 'space-between', marginTop: i === 0 ? 8 : 6 }}>
              <span style={{ fontSize: 14, color: '#7A6B5D' }}>{`${g.label.split(' ')[0]} (${g.label.split(' ').slice(1).join(' ')})`}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{g.meds.length} medicine{g.meds.length > 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
        <Tap onClick={hear} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#7B8B5A"><path d="M6 4l14 8-14 8V4z" /></svg>
          <span style={{ fontSize: 14, color: '#7B8B5A' }}>Hear Sathi say this</span>
        </Tap>
        <div style={{ flex: 1 }} />
        <Btn style={{ marginTop: 20 }} onClick={home}>Go to Home</Btn>
      </div>
    </div>
  )
}
