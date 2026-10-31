import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { ScrollArea, Tap } from '../ui/kit'
import { Section, HelpLink } from '../ui/homeparts'
import { byNewest, dotColor, readingSub, readingTitle } from '../ui/healthparts'
import { useNow } from '../ui/useNow'
import { VoiceCapture } from '../ui/VoiceCapture'

export default function Screen20() {
  const { go } = useApp()
  const now = useNow()
  const readings = useStore((s) => s.readings)
  const tz = useStore((s) => s.profile.timeZone)
  const recent = [...readings].sort(byNewest).slice(0, 3)
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div className="sf" style={{ fontSize: 24 }}>Health</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 4 }}>Record and track your readings</div>
        <Section mt={24}>Record manually</Section>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <Tap onClick={() => go('21')} style={{ flex: 1, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#F3D6C6,#D98255)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" /></svg></div>
            <div style={{ fontSize: 15, fontWeight: 500, textAlign: 'center' }}>Blood<br />Sugar</div>
          </Tap>
          <Tap onClick={() => go('22')} style={{ flex: 1, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#ECE4EE,#6F526C)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg></div>
            <div style={{ fontSize: 15, fontWeight: 500, textAlign: 'center' }}>Blood<br />Pressure</div>
          </Tap>
        </div>
        <Section mt={28}>Recent readings</Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {recent.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', lineHeight: 1.5 }}>No readings yet. Your recorded readings will appear here.</div>}
          {recent.map((r) => (
            <Tap key={r.id} onClick={() => go(r.type === 'bp' ? '22' : '21', r.id)} style={{ background: '#fff', border: '1px solid #E8DFD1', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(r) }} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{readingTitle(r, false)}</div><div style={{ fontSize: 12, color: '#7A6B5D' }}>{readingSub(r, now, tz, false)}</div></div>
            </Tap>
          ))}
        </div>
        <Tap onClick={() => go(readings.length ? '23' : '27')} style={{ marginTop: 16, fontSize: 14, color: '#7B8B5A', fontWeight: 500, textAlign: 'center' }}>View full history</Tap>
        <HelpLink />
        <div style={{ height: 96 }} />
      </ScrollArea>
      <VoiceCapture />
      <BottomNav active="health" />
    </div>
  )
}
