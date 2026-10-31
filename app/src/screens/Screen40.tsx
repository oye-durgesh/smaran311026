import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { Btn, CheckIcon, Tap } from '../ui/kit'
import { contextLabel, fmtBp, fmtSugar } from '../domain/health'
import { fmtDayTime } from '../domain/time'
import { useNow } from '../ui/useNow'

export default function Screen40({ param }: { param?: string }) {
  const { go } = useApp()
  const now = useNow()
  const tz = useStore((s) => s.profile.timeZone)
  const r = useStore((s) => s.readings.find((x) => x.id === param))
  const row = (k: string, v: string, big = false) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: 14, color: '#7A6B5D' }}>{k}</span><span style={{ fontSize: big ? 16 : 14, fontWeight: big ? 600 : 500 }}>{v}</span></div>
  return (
    <div className="scr" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', boxSizing: 'border-box', height: 'calc(100% - 47px)' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#E7EDE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckIcon size={36} color="#526D51" w={2} /></div>
      <div className="sf" style={{ fontSize: 22, marginTop: 20, textAlign: 'center' }}>{r ? 'Reading saved' : 'Nothing to show'}</div>
      {r && (
        <div style={{ marginTop: 16, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: 14, width: '100%', boxSizing: 'border-box' }}>
          {r.type === 'sugar' ? [row('Blood sugar', fmtSugar(r), true), row('Context', contextLabel(r.context))] : [row('Blood pressure', fmtBp(r), true), ...(r.pulse ? [row('Pulse', `${r.pulse} bpm`)] : [])]}
          {row('Recorded', fmtDayTime(r.at, now, tz))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginTop: 24 }}>
        <Btn onClick={() => go('20')}>Done</Btn>
        <Tap style={{ fontSize: 14, color: '#7B8B5A', textAlign: 'center' }} onClick={() => go('23')}>View health history</Tap>
      </div>
    </div>
  )
}
