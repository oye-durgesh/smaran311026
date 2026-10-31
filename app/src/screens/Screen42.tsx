import { useApp } from '../app/AppContext'
import { removeProposal, sendProposals } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, Btn, ScrollArea, Tap } from '../ui/kit'
import { SheetTitle } from '../ui/Overlays'
import { displayName } from '../domain/medicines'
import { activePerson, addressName } from '../domain/people'
import { backendConfigured } from '../services/backend'
import type { Proposal } from '../domain/types'

const badge = (p: Proposal): [string, React.CSSProperties] => {
  if (p.state === 'draft') return p.kind === 'new' ? ['New', { background: '#E7EDE2', color: '#526D51' }] : ['Draft', { background: 'rgba(217,130,85,.1)', color: '#D98255' }]
  if (p.state === 'awaiting') return ['Awaiting', { background: 'rgba(217,130,85,.1)', color: '#D98255' }]
  if (p.state === 'approved') return ['Approved', { background: '#E7EDE2', color: '#526D51' }]
  return ['Declined', { background: 'rgba(183,91,83,.1)', color: '#B75B53' }]
}

export default function Screen42() {
  const { go, back, toast, confirm, openSheet, closeSheet } = useApp()
  const callName = useStore((s) => { const p = activePerson(s); return p ? addressName(p) : '' }) || 'your parent'
  const proposals = useStore((s) => s.family.proposals)
  const meds = useStore((s) => s.medicines).filter((m) => m.status === 'active' || m.status === 'paused')
  const shown = proposals.filter((p) => p.state === 'draft' || p.state === 'awaiting')
  const drafts = shown.filter((p) => p.state === 'draft').length

  const send = () => {
    const r = sendProposals('You (family helper)')
    toast(r.ok ? (backendConfigured() ? 'Sent for confirmation.' : `Saved as awaiting confirmation. This is a local demo — no other device was notified.`) : r.error, r.ok ? 'success' : 'error')
  }
  const pickMed = () => openSheet(
    <div>
      <SheetTitle sub="Choose a medicine to propose a change for.">Propose a change</SheetTitle>
      {meds.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D' }}>There are no active medicines yet.</div>}
      {meds.map((m) => <Tap key={m.id} className="crd" style={{ marginBottom: 10 }} onClick={() => { closeSheet(); go('11', `prop:${m.id}`) }}>{displayName(m)}</Tap>)}
    </div>,
  )
  const syncRows = [
    ...meds.map((m) => {
      const awaiting = proposals.some((p) => p.state === 'awaiting' && p.medicineId === m.id)
      return { id: m.id, name: displayName(m), label: awaiting ? 'Awaiting confirmation' : backendConfigured() ? 'Synced' : 'Saved on this device', color: awaiting ? '#D98255' : '#7B8B5A', text: awaiting ? '#D98255' : '#526D51' }
    }),
    ...shown.filter((p) => p.kind === 'new').map((p) => ({ id: p.id, name: p.title, label: p.state === 'draft' ? 'Draft' : 'Awaiting confirmation', color: p.state === 'draft' ? '#C4BAA8' : '#D98255', text: p.state === 'draft' ? '#8A7F6A' : '#D98255' })),
  ]
  return (
    <div className="scr" style={{ padding: '20px 24px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div><div style={{ fontSize: 13, color: '#6F526C' }}>Managing for</div><div className="sf" style={{ fontSize: 20 }}>{callName}'s medicines</div></div>
        </div>
        <div style={{ marginTop: 16, background: '#ECE4EE', border: '1px solid #D8CEDB', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6F526C" strokeWidth="1.5" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <div style={{ fontSize: 13, color: '#6F526C', lineHeight: 1.4 }}>Changes you make here will be sent to {callName} for confirmation.</div>
        </div>
        <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 20, fontWeight: 500 }}>Proposed changes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {shown.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', lineHeight: 1.5 }}>No proposed changes yet.</div>}
          {shown.map((p) => {
            const [label, st] = badge(p)
            return (
              <div key={p.id} className="crd" style={{ borderLeft: `3px solid ${p.kind === 'new' ? '#526D51' : '#D98255'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 15, fontWeight: 500 }}>{p.title}</span><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, ...st }}>{label}</span></div>
                <div style={{ fontSize: 13, color: '#7A6B5D', marginTop: 4 }}>{p.summary}</div>
                {p.state === 'draft' && <Tap style={{ marginTop: 6, fontSize: 12, color: '#B75B53', fontWeight: 500 }} onClick={() => confirm({ title: 'Remove this proposed change?', confirmLabel: 'Remove', danger: true, onConfirm: () => removeProposal(p.id) })}>Remove</Tap>}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <Tap style={{ fontSize: 13, color: '#7B8B5A', fontWeight: 500 }} onClick={() => go('31', 'prop')}>+ Propose a new medicine</Tap>
          <Tap style={{ fontSize: 13, color: '#7B8B5A', fontWeight: 500 }} onClick={pickMed}>+ Propose a change</Tap>
        </div>
        <div style={{ marginTop: 16 }}><Btn kind="sg" onClick={send} disabled={drafts === 0}>Send for confirmation</Btn></div>
        <div className="sep" />
        <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>Sync status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, fontSize: 13 }}>
          {syncRows.length === 0 && <div style={{ color: '#7A6B5D' }}>Nothing to sync yet.</div>}
          {syncRows.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', ...(i < syncRows.length - 1 ? { borderBottom: '1px solid #F0EBE0' } : {}) }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} /><span style={{ flex: 1, color: '#7A6B5D' }}>{r.name}</span><span style={{ color: r.text, fontWeight: 500 }}>{r.label}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
