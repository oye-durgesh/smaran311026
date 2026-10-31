import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { createInvite, setDefaultPermission, setInvitePermission, setMemberPermission } from '../store/actions'
import { store, useStore } from '../store/store'
import { BackBtn, ScrollArea, Tap, Toggle } from '../ui/kit'
import { QrCode } from '../ui/QrCode'
import { copyText } from '../ui/util'
import type { Permissions } from '../domain/types'
import { backendConfigured } from '../services/backend'
import { ROLE_LABEL, createInvitation, revokeMembership, updateMemberPermission, type CreatedInvitation, type MemberRole } from '../services/familyApi'
import { personLabel } from '../domain/people'
import { Btn, Chip, Err, InputBox, TextInput } from '../ui/kit'
import { pullNow } from '../services/sync'

const PERMS: Array<[keyof Permissions, string]> = [['helpSetup', 'Help set up medicines'], ['viewSchedule', 'View medicine schedule'], ['viewReadings', 'View health readings']]

/** param: undefined → invite (QR + link); "defaults" → default permissions only; <memberId> → that member's permissions. */
export default function Screen41({ param }: { param?: string }) {
  const { back, toast, confirm } = useApp()
  const family = useStore((s) => s.family)
  const [copied, setCopied] = useState(false)
  const member = param && param !== 'defaults' ? family.members.find((m) => m.id === param) : undefined
  const mode: 'invite' | 'defaults' | 'member' = member ? 'member' : param === 'defaults' ? 'defaults' : 'invite'
  const server = backendConfigured()
  const people = useStore((s) => s.people).filter((x) => !x.archived)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('helper')
  const [scope, setScope] = useState<string[] | null>(null)   // null = every profile
  const [created, setCreated] = useState<CreatedInvitation>()
  const [formErr, setFormErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  const invite = mode === 'invite' && !server ? (family.invites.find((i) => i.status === 'pending') ?? createInvite()) : undefined
  const perms: Permissions = mode === 'member' ? member!.permissions : mode === 'invite' ? (invite?.permissions ?? family.defaultPermissions) : family.defaultPermissions
  const setPerm = (k: keyof Permissions, v: boolean) => (mode === 'member' && member!.server ? void updateMemberPermission(member!.id, k, v).then(() => pullNow()).catch((e) => toast(e instanceof Error ? e.message : 'Could not change the permission.', 'error')) : mode === 'member' ? setMemberPermission(member!.id, k, v) : mode === 'invite' && invite ? setInvitePermission(invite.id, k, v) : setDefaultPermission(k, v))

  const makeServerInvite = async () => {
    setBusy(true); setFormErr(undefined)
    try { setCreated(await createInvitation({ email, relation: role === 'read-only' ? 'Family member' : role === 'admin' ? 'Caregiver' : 'Helper', role, personScope: scope, permissions: family.defaultPermissions })) }
    catch (e) { setFormErr(e instanceof Error ? e.message : 'Could not create the invitation.') }
    setBusy(false)
  }
  const copy = async () => {
    const ok = await copyText((created?.url ?? invite!.url))
    setCopied(ok); toast(ok ? 'Invitation link copied.' : 'Could not copy automatically. Select the link and copy it.', ok ? 'success' : 'error')
    if (ok) setTimeout(() => setCopied(false), 2000)
  }
  const removeMember = () => confirm({
    title: `Remove ${member!.name}?`, message: 'They will lose access to your medicines and readings.', confirmLabel: 'Remove', danger: true,
    onConfirm: () => {
      if (member!.server) { void revokeMembership(member!.id).then(() => pullNow()).then(() => { toast('Access removed.'); back() }).catch((e) => toast(e instanceof Error ? e.message : 'Could not remove access.', 'error')); return }
      store.set((s) => ({ ...s, family: { ...s.family, members: s.family.members.filter((m) => m.id !== member!.id) } })); toast('Member removed.'); back()
    },
  })
  return (
    <div className="scr" style={{ padding: '20px 24px', boxSizing: 'border-box', overflow: 'auto', height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>{mode === 'member' ? member!.name : mode === 'defaults' ? 'Family permissions' : 'Invite family'}</div>
        </div>
        {mode === 'invite' && server && (
          <div style={{ marginTop: 20 }}>
            {!created ? (
              <>
                <div style={{ fontSize: 13, color: '#7A6B5D', lineHeight: 1.5 }}>Invitations are secure and expire in 7 days. Nobody gets access until they accept while signed in. Typing a phone number or email gives no access by itself.</div>
                <label className="lbl" htmlFor="inv-email" style={{ display: 'block' }}>THEIR EMAIL (OPTIONAL, RECOMMENDED)</label>
                <InputBox style={{ marginTop: 10 }}><TextInput id="inv-email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></InputBox>
                <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 6, lineHeight: 1.4 }}>If you add an email, only someone signed in with that verified address can accept.</div>
                <div className="lbl">THEIR ROLE</div>
                <div role="radiogroup" aria-label="Role" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {(['admin', 'helper', 'read-only'] as MemberRole[]).map((r) => <Chip key={r} on={role === r} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</Chip>)}
                </div>
                <div className="lbl">WHOSE INFORMATION CAN THEY SEE?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <Chip on={scope === null} onClick={() => setScope(null)}>Everyone</Chip>
                  {people.map((x) => <Chip key={x.id} on={!!scope?.includes(x.id)} onClick={() => setScope((cur) => { const base = cur ?? []; return base.includes(x.id) ? base.filter((i) => i !== x.id) : [...base, x.id] })}>{personLabel(x)}</Chip>)}
                </div>
                <Err>{formErr}</Err>
                <div style={{ marginTop: 16 }}><Btn kind="sg" onClick={() => void makeServerInvite()} disabled={busy}>Create invitation</Btn></div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: '#2E241B', fontWeight: 500 }}>Invitation created</div>
                <div style={{ marginTop: 12, height: 48, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#8A7F6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{created.url.replace(/^https?:\/\//, '')}</span>
                  <Tap onClick={copy} label="Copy link" style={{ padding: '4px 12px', background: '#526D51', borderRadius: 999, fontSize: 13, color: '#fff', fontWeight: 500 }}>{copied ? 'Copied' : 'Copy'}</Tap>
                </div>
                <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 8, lineHeight: 1.5 }}>Valid until {new Date(created.expiresAt).toLocaleDateString()}. Send this link yourself; nothing has been sent automatically. You can remove access any time.</div>
              </>
            )}
          </div>
        )}
        {mode === 'invite' && invite && (
          <>
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 120, height: 120, background: '#ECE4EE', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #D8CEDB' }}><QrCode value={invite.url} /></div>
              <div style={{ fontSize: 14, color: '#6F526C', marginTop: 12, fontWeight: 500 }}>Share this QR code</div>
              <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 4 }}>Ask them to scan it with their phone</div>
            </div>
            <div className="sep" />
            <div style={{ fontSize: 14, color: '#7A6B5D', textAlign: 'center' }}>Or share a link</div>
            <div style={{ marginTop: 12, height: 48, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13, color: '#8A7F6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invite.url.replace(/^https?:\/\//, '')}</span>
              <Tap onClick={copy} label="Copy link" style={{ padding: '4px 12px', background: '#526D51', borderRadius: 999, fontSize: 13, color: '#fff', fontWeight: 500 }}>{copied ? 'Copied' : 'Copy'}</Tap>
            </div>
            <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 8, lineHeight: 1.5 }}>
              Code <b>{invite.code}</b>. {backendConfigured() ? 'Anyone with this link can ask to join; you approve each request.' : 'Generated on this device — nothing has been sent. Share it yourself; joining needs a connected server.'}
            </div>
          </>
        )}
        <div className="sep" />
        <div style={{ fontSize: 12, color: '#7A6B5D', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>{mode === 'member' ? `Permissions for ${member!.name}` : 'Permissions granted'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {PERMS.map(([k, label], i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', ...(i < PERMS.length - 1 ? { borderBottom: '1px solid #F0EBE0' } : {}) }}>
              <span style={{ fontSize: 14 }}>{label}</span><Toggle on={perms[k]} onChange={(v) => setPerm(k, v)} label={label} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 8 }}>You can change these anytime in Settings.</div>
        {mode === 'member' && <Tap onClick={removeMember} style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: '#B75B53', fontWeight: 500 }}>Remove {member!.name}</Tap>}
      </ScrollArea>
    </div>
  )
}
