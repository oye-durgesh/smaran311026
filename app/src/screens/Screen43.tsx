import { useApp } from '../app/AppContext'
import { decideProposals } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, ScrollArea, Tap } from '../ui/kit'
import { displayName, foodLabel, freqLabel, timesLabel } from '../domain/medicines'
import { ChevRight } from '../ui/kit'
import type { Medicine, Proposal } from '../domain/types'

function diffs(p: Proposal, med?: Medicine): Array<{ label: string; from: string; to: string }> {
  if (!p.patch || !med) return []
  const out: Array<{ label: string; from: string; to: string }> = []
  const pt = p.patch
  if (pt.times && pt.times.join() !== med.times.join()) out.push({ label: 'Times', from: timesLabel(med), to: timesLabel({ times: pt.times }) })
  if (pt.strength !== undefined && pt.strength !== med.strength) out.push({ label: 'Strength', from: med.strength, to: pt.strength })
  if (pt.dose !== undefined && pt.dose !== med.dose) out.push({ label: 'Dose', from: med.dose, to: pt.dose })
  if (pt.frequency && pt.frequency !== med.frequency) out.push({ label: 'Frequency', from: freqLabel(med.frequency), to: freqLabel(pt.frequency) })
  if (pt.food !== undefined && pt.food !== med.food) out.push({ label: 'Food', from: foodLabel(med.food), to: foodLabel(pt.food ?? null) })
  return out
}

export default function Screen43() {
  const { back, go, toast, confirm } = useApp()
  const proposals = useStore((s) => s.family.proposals).filter((p) => p.state === 'awaiting')
  const meds = useStore((s) => s.medicines)
  const by = proposals[0]?.by ?? 'A family member'
  const decide = (approve: boolean) => {
    const apply = () => {
      const r = decideProposals(approve)
      toast(r.ok ? (approve ? 'Changes approved and applied.' : 'Changes declined. Nothing was changed.') : r.error, r.ok ? 'success' : 'error')
      if (r.ok) go('24', undefined, { replace: true })
    }
    if (approve) apply()
    else confirm({ title: 'Decline these changes?', message: 'Your medicines and reminders stay exactly as they are.', confirmLabel: 'Decline', danger: true, onConfirm: apply })
  }
  return (
    <div className="scr" style={{ padding: '20px 24px 100px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Review changes</div>
        </div>
        {proposals.length === 0 ? (
          <div style={{ marginTop: 24, fontSize: 15, color: '#7A6B5D', lineHeight: 1.5 }}>There are no changes waiting for your decision.<Tap onClick={() => go('24')} style={{ marginTop: 12, color: '#7B8B5A', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>Back to Family Space <ChevRight color="#7B8B5A" /></Tap></div>
        ) : (
          <>
            <div style={{ marginTop: 16, background: '#ECE4EE', border: '1px solid #D8CEDB', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: '#526D51' }}>{by[0]}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{by} suggested changes</div><div style={{ fontSize: 12, color: '#6F526C', marginTop: 2 }}>{proposals.length} medicine{proposals.length > 1 ? 's' : ''} updated</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
              {proposals.map((p) => {
                const med = meds.find((m) => m.id === p.medicineId)
                const d = diffs(p, med)
                return (
                  <div key={p.id} className="crd">
                    <div style={{ fontSize: 12, color: p.kind === 'new' ? '#526D51' : '#C08560', letterSpacing: '.08em', fontWeight: 500 }}>{p.kind === 'new' ? 'NEW MEDICINE' : 'CHANGED'}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, marginTop: 6 }}>{p.kind === 'new' && p.newMedicine ? displayName(p.newMedicine) : p.title}</div>
                    {p.kind === 'new' ? <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 4 }}>{p.summary}</div>
                      : d.length ? d.map((x) => (
                        <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          {d.length > 1 && <span style={{ fontSize: 12, color: '#8A7F6A' }}>{x.label}</span>}
                          <span style={{ fontSize: 13, color: '#7A6B5D', textDecoration: 'line-through' }}>{x.from}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                          <span style={{ fontSize: 13, color: '#526D51', fontWeight: 500 }}>{x.to}</span>
                        </div>))
                        : <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 8 }}>{p.summary}</div>}
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 12 }}>Only you can approve changes to your own medicines.</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <Tap onClick={() => decide(false)} style={{ flex: 1, height: 56, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 500 }}>Decline</Tap>
              <Tap onClick={() => decide(true)} style={{ flex: 2, height: 56, background: '#526D51', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 500 }}>Approve changes</Tap>
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  )
}
