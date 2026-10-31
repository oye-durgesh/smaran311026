import { useApp } from '../app/AppContext'
import { createInvite, simulateInviteAccepted } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, ChevRight, ScrollArea, Tap } from '../ui/kit'
import { backendConfigured } from '../services/backend'

const roleLabel = { admin: 'Admin', 'read-only': 'Read-only', helper: 'Helper' } as const

export default function Screen24() {
  const { go, back, toast } = useApp()
  const family = useStore((s) => s.family)
  const waiting = family.proposals.filter((p) => p.state === 'awaiting').length
  const hasPendingInvite = family.invites.some((i) => i.status === 'pending')
  const active = family.members.filter((m) => m.status === 'active')
  const share = () => { createInvite(); go('41') }
  return (
    <div className="scr" style={{ background: '#F0EAE0', padding: '20px 24px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Family Space</div>
        </div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>Invite someone you trust to help set up your medicines and reminders.</div>
        {waiting > 0 && (
          <Tap onClick={() => go('43')} style={{ marginTop: 16, background: 'rgba(217,130,85,.12)', border: '1px solid rgba(217,130,85,.35)', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{waiting} suggested change{waiting > 1 ? 's' : ''} waiting for your decision</div><ChevRight />
          </Tap>
        )}
        <div style={{ marginTop: 20, background: '#ECE4EE', border: '1px solid #D8CEDB', borderRadius: 18, padding: 20, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#6F526C', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg></div>
          <div style={{ fontSize: 16, fontWeight: 500, marginTop: 12 }}>Invite family member</div>
          <div style={{ fontSize: 13, color: '#6F526C', marginTop: 6, lineHeight: 1.4 }}>Share a link or QR code with a family member who can help manage your medicines.</div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <Tap onClick={share} style={{ flex: 1, height: 48, background: '#6F526C', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 500, gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>Share link
            </Tap>
            <Tap onClick={share} style={{ flex: 1, height: 48, background: '#fff', border: '1px solid #D8CEDB', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, gap: 6, color: '#6F526C' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6F526C" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h.01M7 12h.01M7 17h.01M12 7h.01M12 12h.01M12 17h.01M17 7h.01M17 12h.01M17 17h.01" /></svg>QR code
            </Tap>
          </div>
        </div>
        <div className="sep" />
        <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>Linked members</div>
        {family.members.length === 0 && <div style={{ fontSize: 14, color: '#7A6B5D', marginTop: 12, lineHeight: 1.5 }}>No one is linked yet. Share an invitation above.</div>}
        {family.members.map((m, i) => (
          <Tap key={m.id} onClick={() => go('41', m.id)} style={{ marginTop: i === 0 ? 12 : 10, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: i % 2 ? 'linear-gradient(135deg,#F3D6C6,#D98255)' : 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: i % 2 ? '#fff' : '#526D51' }}>{m.name[0]}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{m.name}</div><div style={{ fontSize: 12, color: '#7A6B5D' }}>{m.relation} · {roleLabel[m.role]}</div></div>
            {m.status === 'active'
              ? <div style={{ padding: '4px 10px', background: '#E7EDE2', borderRadius: 999, fontSize: 11, color: '#526D51', fontWeight: 500 }}>Active</div>
              : <div style={{ padding: '4px 10px', border: '1px solid #E8DFD1', borderRadius: 999, fontSize: 11, color: '#7A6B5D' }}>Pending</div>}
          </Tap>
        ))}
        {!backendConfigured() && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#8A7F6A', lineHeight: 1.5 }}>
            Local demo mode: invitations are generated on this device and nothing is sent. A family member can only join once the app is connected to a server.
            {hasPendingInvite && <Tap onClick={() => { simulateInviteAccepted(); toast('Simulated: a family member joined (no real device was contacted).') }} style={{ marginTop: 8, color: '#6F526C', fontWeight: 500 }}>Simulate a member joining (demo)</Tap>}
            {active.length > 0 && <Tap onClick={() => go('42')} style={{ marginTop: 8, color: '#6F526C', fontWeight: 500 }}>Preview a family member's view (demo)</Tap>}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
