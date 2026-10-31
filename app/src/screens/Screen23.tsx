import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useStore } from '../store/store'
import { BottomNav } from '../ui/BottomNav'
import { BackBtn, ScrollArea, Tap } from '../ui/kit'
import { byNewest, dotColor, readingSub, readingTitle } from '../ui/healthparts'
import { useNow } from '../ui/useNow'
import { addLocalDays, dayName, localDateKey, pad, tzParts } from '../domain/time'
import { isElevated, MG_PER_MMOL } from '../domain/health'
import type { Reading } from '../domain/types'

type F = 'all' | 'sugar' | 'bp'

export default function Screen23() {
  const { go, back } = useApp()
  const now = useNow()
  const tz = useStore((s) => s.profile.timeZone)
  const all = useStore((s) => s.readings)
  const [f, setF] = useState<F>('all')
  useEffect(() => { if (all.length === 0) go('27', undefined, { replace: true }) }, [all.length, go])

  const list = useMemo(() => all.filter((r) => f === 'all' || r.type === f).sort(byNewest), [all, f])
  const metric: 'sugar' | 'bp' = f === 'bp' ? 'bp' : 'sugar'
  const days = useMemo(() => {
    const p = tzParts(now, tz)
    return Array.from({ length: 7 }, (_, i) => {
      const d = addLocalDays(p.y, p.m, p.d, i - 6)
      const key = `${d.y}-${pad(d.m)}-${pad(d.d)}`
      const dow = new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay()
      const rs = all.filter((r) => r.type === metric && localDateKey(new Date(r.at), tz) === key)
      const val = (r: Reading) => (metric === 'bp' ? r.systolic ?? 0 : r.unit === 'mmol/L' ? (r.value ?? 0) * MG_PER_MMOL : r.value ?? 0)
      const avg = rs.length ? rs.reduce((a, r) => a + val(r), 0) / rs.length : null
      return { key, letter: dayName(dow)[0], avg, elevated: rs.some(isElevated), today: i === 6 }
    })
  }, [all, now, tz, metric])
  const max = Math.max(metric === 'bp' ? 200 : 250, ...days.map((d) => d.avg ?? 0))
  const pill = (on: boolean): React.CSSProperties => (on
    ? { padding: '6px 14px', background: '#2E241B', borderRadius: 999, fontSize: 13, color: '#F5EFE6', fontWeight: 500 }
    : { padding: '6px 14px', border: '1px solid #E8DFD1', borderRadius: 999, fontSize: 13, color: '#7A6B5D' })
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Health History</div>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Tap role="tab" aria-selected={f === 'all'} style={pill(f === 'all')} onClick={() => setF('all')}>All</Tap>
          <Tap role="tab" aria-selected={f === 'sugar'} style={pill(f === 'sugar')} onClick={() => setF('sugar')}>Blood Sugar</Tap>
          <Tap role="tab" aria-selected={f === 'bp'} style={pill(f === 'bp')} onClick={() => setF('bp')}>BP</Tap>
        </div>
        <div role="img" aria-label={`Last 7 days, ${metric === 'bp' ? 'systolic blood pressure' : 'blood sugar'}`} style={{ marginTop: 20, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 16, padding: 16, height: 140, display: 'flex', alignItems: 'flex-end', gap: 8, boxSizing: 'content-box' }}>
          {days.map((d) => (
            <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {d.avg == null
                ? <div style={{ width: '100%', background: '#E8DFD1', borderRadius: '4px 4px 0 0', height: 20, border: '1px dashed #C4BAA8' }} />
                : <div style={{ width: '100%', background: d.elevated ? '#D98255' : '#7B8B5A', borderRadius: '4px 4px 0 0', height: Math.max(6, Math.round((d.avg / max) * 84)) }} />}
              <div style={{ fontSize: 10, color: d.today ? '#7B8B5A' : '#7A6B5D', fontWeight: d.today ? 600 : 400 }}>{d.letter}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#7A6B5D', justifyContent: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#7B8B5A' }} />Normal</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#D98255' }} />Elevated</span>
        </div>
        <div style={{ fontSize: 11, color: '#8A7F6A', textAlign: 'center', marginTop: 6, lineHeight: 1.4 }}>Daily average, {metric === 'bp' ? 'top (systolic) number' : 'blood sugar in mg/dL'}. Colours use general reference ranges and are not medical advice. Empty days have no readings.</div>
        <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 24, fontWeight: 500 }}>All readings</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {list.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', padding: '12px 0' }}>No readings of this type yet.</div>}
          {list.map((r, i) => (
            <Tap key={r.id} onClick={() => go(r.type === 'bp' ? '22' : '21', r.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', ...(i < list.length - 1 ? { borderBottom: '1px solid #E8DFD1' } : {}) }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(r) }} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{readingTitle(r, true)}</div><div style={{ fontSize: 12, color: '#7A6B5D' }}>{readingSub(r, now, tz, true)}</div></div>
            </Tap>
          ))}
        </div>
      </ScrollArea>
      <BottomNav active="health" />
    </div>
  )
}
