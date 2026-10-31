import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, Copy, Link2, QrCode, Share2, Users, WifiOff } from 'lucide-react';
import { useStore } from '../data/store';
import { Back, BottomNav, C, Chev, Chip, DemoTag, Dialog, Field, Label, MedIcon, ModeLine, PillBtn, Screen, SectionLabel, Status, Toggle, useToast } from '../components/ui';
import { Avatar, ProfileSwitcher } from './Home';
import * as fam from '../services/familyService';
import { eventsFor } from '../services/reminderService';
import { activeMedicines, medicineLabel } from '../services/medicineService';
import { fmtTimeShort } from '../services/reminderService';
import { fmtWhen, readingsFor } from '../services/healthService';
import { readingTitle } from './Health';
import { TakenMark } from '../components/MedicineCards';
import type { ChangeRequest, FamilyMember, ProfileId } from '../types';
import { addParentProfile, isLiveMode, removeParentProfile } from '../services/dataService';

const grads = ['linear-gradient(135deg,#E7EDE2,#B5C4A0)', 'linear-gradient(135deg,#F3D6C6,#D98255)', 'linear-gradient(135deg,#ECE4EE,#C4B0C2)'];

// ---------- Family Space (24) ----------
export function Family() {
  const nav = useNavigate();
  const { state, update } = useStore();
  const [sel, setSel] = useState<FamilyMember | null>(null);
  const [parentWho, setParentWho] = useState<'mother' | 'father' | null>(null);
  const [parentName, setParentName] = useState('');
  const [parentBusy, setParentBusy] = useState(false);
  const [parentErr, setParentErr] = useState('');
  const [removeWho, setRemoveWho] = useState<'mother' | 'father' | null>(null);
  const toast = useToast();
  const cur = sel && state.family.find((f) => f.id === sel.id);
  const mother = state.profiles.find((p) => p.id === 'mother');
  const father = state.profiles.find((p) => p.id === 'father');
  const saveParent = () => {
    if (parentName.trim().length < 2 || !parentWho) return;
    setParentBusy(true); setParentErr('');
    try {
      update((s) => addParentProfile(s, parentWho, parentName));
      toast.show(isLiveMode() ? `${parentName.trim()} saved to your account` : `${parentName.trim()} saved locally (DEMO)`);
      setParentWho(null); setParentName('');
    } catch (e) {
      setParentErr(e instanceof Error ? e.message : 'Could not save');
    } finally { setParentBusy(false); }
  };
  const parentCard = (who: 'mother' | 'father', existing?: typeof mother) => (
    <div className="crd" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: who === 'mother' ? 'linear-gradient(135deg,#F3D6C6,#D98255)' : 'linear-gradient(135deg,#E4EBEF,#8AA4B0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{existing?.initial ?? (who === 'mother' ? 'M' : 'F')}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{existing ? existing.name : who === 'mother' ? 'Mother' : 'Father'}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{existing ? 'Health profile on this family' : 'Not added yet'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <PillBtn tone="sage" onClick={() => { setParentWho(who); setParentName(existing?.name ?? (who === 'mother' ? 'Mummy' : 'Papa')); }}>{existing ? 'Edit' : 'Add'}</PillBtn>
        {existing && <PillBtn tone="light" onClick={() => { update((s) => ({ ...s, activeProfileId: who })); nav(`/parent/${who}`); }}>Open</PillBtn>}
        {existing && <PillBtn tone="danger" onClick={() => setRemoveWho(who)}>Remove</PillBtn>}
      </div>
    </div>
  );
  return (
    <>
      <Screen bg={C.flow} pad="20px 24px 24px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Family Space</div></div>
        <ModeLine who="Your family" />
        <SectionLabel mt={16}>Family health profiles</SectionLabel>
        <div className="crd" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{state.profiles.find((p) => p.id === 'self')?.name ?? 'You'}</div>
          <div style={{ fontSize: 12, color: C.muted }}>You · signed-in account</div>
        </div>
        {parentCard('mother', mother)}
        {parentCard('father', father)}
        <div style={{ fontSize: 13, color: C.faint, marginTop: 16 }}>Invite someone you trust to help set up your medicines and reminders.</div>
        <div style={{ marginTop: 20, background: C.lav, border: '1px solid #D8CEDB', borderRadius: 18, padding: 20, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.plum, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><Users size={26} color="#fff" strokeWidth={1.5} /></div>
          <div style={{ fontSize: 16, fontWeight: 500, marginTop: 12 }}>Invite family member</div>
          <div style={{ fontSize: 13, color: C.plum, marginTop: 6, lineHeight: 1.4 }}>Share a link or QR code with a family member who can help manage your medicines.</div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button data-act="1" onClick={() => nav('/family/invite')} style={{ flex: 1, height: 48, background: C.plum, borderRadius: 999, border: 0, color: '#fff', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, font: 'inherit', cursor: 'pointer' }}><Share2 size={16} />Share link</button>
            <button data-act="1" onClick={() => nav('/family/invite')} style={{ flex: 1, height: 48, background: '#fff', border: '1px solid #D8CEDB', borderRadius: 999, color: C.plum, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, font: 'inherit', cursor: 'pointer' }}><QrCode size={16} />QR code</button>
          </div>
        </div>
        <div className="sep" />
        <div style={{ fontSize: 12, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>Linked members</div>
        {state.family.length === 0 && <div style={{ fontSize: 14, color: C.muted, marginTop: 12 }}>No one is linked yet.</div>}
        {state.family.map((f, i) => (
          <button key={f.id} data-act="1" onClick={() => setSel(f)} style={{ marginTop: i ? 10 : 12, width: '100%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: grads[i % 3], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: C.deep }}>{f.name[0]}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{f.name} {f.demo && <DemoTag />}</div><div style={{ fontSize: 12, color: C.muted }}>{f.relation} · {f.role}</div></div>
            <Status kind={f.status === 'Active' ? 'ok' : 'warn'}>{f.status}</Status>
          </button>
        ))}
      </Screen>
      {cur && (
        <div role="dialog" aria-modal="true" aria-label="Manage member" style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.35)', zIndex: 30 }} onClick={() => setSel(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderRadius: '24px 24px 0 0', padding: '12px 24px 32px', boxSizing: 'border-box' }}>
            <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: '0 auto 16px' }} />
            <div className="sf" style={{ fontSize: 20 }}>{cur.name}</div>
            <div style={{ fontSize: 13, color: C.muted }}>{cur.relation} · {cur.status}</div>
            <Label>Permission</Label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Chip on={cur.role === 'Admin'} onClick={() => update((s) => fam.setRole(s, cur.id, 'Admin'))}>Admin (can propose changes)</Chip>
              <Chip on={cur.role === 'Read-only'} onClick={() => update((s) => fam.setRole(s, cur.id, 'Read-only'))}>Read-only</Chip>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
              {cur.status === 'Pending' && <PillBtn tone="sage" onClick={() => update((s) => fam.acceptInvite(s, cur.id))}>Simulate invitation accepted (demo)</PillBtn>}
              <PillBtn tone="danger" onClick={() => { update((s) => fam.removeMember(s, cur.id)); setSel(null); }}>Remove access</PillBtn>
              <PillBtn tone="light" onClick={() => setSel(null)}>Close</PillBtn>
            </div>
          </div>
        </div>
      )}
      {parentWho && (
        <div role="dialog" aria-modal="true" style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.35)', zIndex: 30 }} onClick={() => setParentWho(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderRadius: '24px 24px 0 0', padding: '12px 24px 32px' }}>
            <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: '0 auto 12px' }} />
            <div className="sf" style={{ fontSize: 20 }}>{state.profiles.some((p) => p.id === parentWho) ? 'Edit' : 'Add'} {parentWho === 'mother' ? 'Mother' : 'Father'}</div>
            <Label>Name</Label>
            <Field value={parentName} onChange={setParentName} placeholder={parentWho === 'mother' ? 'e.g. Mummy' : 'e.g. Papa'} autoFocus />
            {parentErr && <div style={{ fontSize: 13, color: C.err, marginTop: 8 }}>{parentErr}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <PillBtn tone="light" onClick={() => setParentWho(null)}>Cancel</PillBtn>
              <PillBtn tone="sage" disabled={parentName.trim().length < 2 || parentBusy} onClick={saveParent}>{parentBusy ? 'Saving…' : 'Save'}</PillBtn>
            </div>
          </div>
        </div>
      )}
      {removeWho && <Dialog title={`Remove ${removeWho === 'mother' ? 'Mother' : 'Father'}?`} body="Their medicines, readings, appointments and reminders will be removed from this family." confirm="Remove" danger onCancel={() => setRemoveWho(null)} onConfirm={() => { update((s) => removeParentProfile(s, removeWho)); setRemoveWho(null); }} />}
      {toast.node}
    </>
  );
}

// ---------- Invite (41) ----------
const qrCells = (seed: string) => {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const cells: boolean[] = [];
  for (let i = 0; i < 169; i++) { h = Math.imul(h ^ (h >>> 13), 1274126177); cells.push((h & 1) === 1); }
  return cells;
};
export function Invite() {
  const { state, update } = useStore();
  const [name, setName] = useState('');
  const [rel, setRel] = useState('Daughter');
  const [perms, setPerms] = useState({ setup: true, schedule: true, readings: false });
  const toast = useToast();
  const link = 'smaran.app/invite/a8f3k2…';
  const cells = qrCells(name || 'smaran');
  const copy = async () => { try { await navigator.clipboard.writeText('https://smaran.app/invite/a8f3k2'); toast.show('Link copied (demo link)'); } catch { toast.show('Copy not available here'); } };
  const send = () => {
    update((s) => fam.inviteMember(s, name.trim(), rel, perms.setup ? 'Admin' : 'Read-only'));
    toast.show(`Invitation to ${name.trim()} saved (simulated, nothing sent)`);
    setName('');
  };
  const perm = (k: keyof typeof perms, label: string) => (
    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <Check size={16} color={perms[k] ? C.deep : C.faint} /><span style={{ flex: 1, fontSize: 14 }}>{label}</span><Toggle on={perms[k]} label={label} onChange={(v) => setPerms({ ...perms, [k]: v })} />
    </div>
  );
  return (
    <>
      <Screen bg={undefined} pad="20px 24px 24px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Invite family</div></div>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>Share this QR code</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Ask them to scan it with their phone</div>
          <svg width="160" height="160" viewBox="0 0 13 13" style={{ marginTop: 14, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: 10 }} role="img" aria-label="Demo QR code">
            {cells.map((on, i) => on && <rect key={i} x={i % 13} y={Math.floor(i / 13)} width="1" height="1" fill={C.ink} />)}
          </svg>
          <div style={{ marginTop: 6 }}><DemoTag label="DEMO QR" /></div>
        </div>
        <SectionLabel mt={20}>Or share a link</SectionLabel>
        <div className="inp" style={{ marginTop: 10 }}><Link2 size={16} color={C.faint} /><span style={{ flex: 1, fontSize: 14 }}>{link}</span>
          <button data-act="1" onClick={copy} style={{ border: 0, background: C.card, borderRadius: 999, padding: '6px 12px', font: 'inherit', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Copy size={13} />Copy</button></div>
        <SectionLabel mt={20}>Permissions granted</SectionLabel>
        {perm('setup', 'Help set up medicines')}{perm('schedule', 'View medicine schedule')}{perm('readings', 'View health readings')}
        <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>You can change these anytime in Settings.</div>
        <div className="sep" />
        <SectionLabel mt={0}>Invite by name (simulated)</SectionLabel>
        <Field value={name} onChange={setName} placeholder="Family member's name" />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{['Daughter', 'Son', 'Spouse', 'Other'].map((r) => <Chip key={r} on={rel === r} onClick={() => setRel(r)}>{r}</Chip>)}</div>
        <div style={{ marginTop: 14 }}><PillBtn tone="sage" disabled={name.trim().length < 2} onClick={send}>Send invitation</PillBtn></div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 8, textAlign: 'center' }}>{state.family.length} linked or pending · Demo only: no message is sent.</div>
      </Screen>
      {toast.node}
    </>
  );
}

// ---------- Helping a parent (HP1) ----------
export function HelpingParent() {
  const nav = useNavigate();
  const { pid = 'mother' } = useParams();
  const id = pid as ProfileId;
  const { state, update } = useStore();
  const [switcher, setSwitcher] = useState(false);
  const p = state.profiles.find((x) => x.id === id);
  useEffect(() => { if (p && state.activeProfileId !== id) update((s) => ({ ...s, activeProfileId: id })); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const events = eventsFor(state, id);
  const taken = events.filter((e) => e.status === 'taken').length;
  const missed = events.filter((e) => e.status === 'missed').length;
  const calls = state.voiceHistory.filter((v) => v.profileId === id && v.kind === 'reminder-call' && v.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  const readings = readingsFor(state, id).slice(0, 2);
  const pending = fam.pendingConfirmations(state, id).length;
  const onTrack = missed === 0;
  return (
    <>
      <Screen>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Back onClick={() => { update((s) => ({ ...s, activeProfileId: 'self' })); nav('/home'); }} />
            <div><div style={{ fontSize: 13, color: C.plum }}>Helping</div><div className="sf" style={{ fontSize: 22 }}>{p.name}</div></div>
          </div>
          <Avatar p={p} onClick={() => setSwitcher(true)} />
        </div>
        <SectionLabel mt={20}>Today's status</SectionLabel>
        <div className="crd" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: onTrack ? C.deep : C.err }}>{onTrack ? '✓ On track' : '! Needs attention'}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Self-reported by {p.name}</div>
          </div>
          <div style={{ textAlign: 'center' }}><div className="sf" style={{ fontSize: 22 }}>{taken}/{events.length}</div><div style={{ fontSize: 11, color: C.muted }}>Medicines taken</div></div>
          <div style={{ textAlign: 'center' }}><div className="sf" style={{ fontSize: 22 }}>{calls}</div><div style={{ fontSize: 11, color: C.muted }}>Call completed</div></div>
        </div>
        {pending > 0 && (
          <button data-act="1" onClick={() => nav(`/parent/${id}/confirm`)} style={{ marginTop: 12, width: '100%', background: C.lav, border: '1px solid #D8CEDB', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ flex: 1, fontSize: 13, color: C.plum }}>{pending} proposed change{pending > 1 ? 's' : ''} awaiting {p.name}'s confirmation</span><Chev color={C.plum} />
          </button>
        )}
        <SectionLabel>Medicines</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {activeMedicines(state, id).map((m) => {
            const e = events.filter((x) => x.medicineId === m.id);
            const allTaken = e.length > 0 && e.every((x) => x.status === 'taken');
            const next = e.find((x) => x.status !== 'taken');
            return (
              <div key={m.id} className="crd" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
                <MedIcon g={m.gradient} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{medicineLabel(m)}</div><div style={{ fontSize: 12, color: C.muted }}>{m.times.map(fmtTimeShort).join(', ')} · {m.status !== 'ready' ? (m.status === 'paused' ? 'Paused' : 'Needs review') : allTaken ? 'Reported taken' : next?.status === 'missed' ? 'Missed' : 'Upcoming'}</div></div>
                {allTaken ? <TakenMark label="" /> : null}
              </div>
            );
          })}
          {activeMedicines(state, id).length === 0 && <div style={{ fontSize: 14, color: C.muted }}>No medicines set up for {p.name} yet.</div>}
        </div>
        <SectionLabel>Recent health</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {readings.length === 0 && <div style={{ fontSize: 14, color: C.muted }}>No readings yet.</div>}
          {readings.map((r) => (
            <div key={r.id} className="crd" style={{ padding: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{readingTitle(r)}{r.contextLabel ? ` · ${r.contextLabel}` : ''}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtWhen(r.at)} {r.demo && <DemoTag />}</div>
              {r.meal && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Meal: {r.meal}</div>}
            </div>
          ))}
        </div>
        <button data-act="1" onClick={() => nav('/medicines')} className="crd" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, width: '100%', font: 'inherit', textAlign: 'left', cursor: 'pointer', background: C.lav, border: '1px solid #D8CEDB' }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>Edit medicines</div><div style={{ fontSize: 12, color: C.plum }}>Add, pause, or update {p.name}'s medicines</div></div><Chev color={C.plum} />
        </button>
        <button data-act="1" onClick={() => nav(`/parent/${id}/remote`)} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 0, font: 'inherit', fontSize: 14, color: C.plum, cursor: 'pointer', padding: 8 }}>Propose a change for confirmation</button>
        <button data-act="1" onClick={() => nav('/health/record')} style={{ display: 'block', margin: '0 auto', background: 'none', border: 0, font: 'inherit', fontSize: 14, color: C.sage, cursor: 'pointer', padding: 8 }}>Record a reading for {p.name}</button>
      </Screen>
      <BottomNav />
      {switcher && <ProfileSwitcher onClose={() => setSwitcher(false)} />}
    </>
  );
}

const stateKind = (s: ChangeRequest['state']) => (s === 'Synced' || s === 'Confirmed' ? 'ok' : s === 'Declined' ? 'bad' : s === 'Awaiting confirmation' ? 'plum' : 'warn') as 'ok' | 'bad' | 'plum' | 'warn';
const dot = (s: ChangeRequest['state']) => ({ Synced: C.sage, Confirmed: C.sage, Declined: C.err, 'Awaiting confirmation': C.plum, Draft: C.orange, 'Sync pending': C.orange })[s];

// ---------- Remote setup (42) ----------
export function RemoteSetup() {
  const { pid = 'mother' } = useParams();
  const id = pid as ProfileId;
  const { state, update } = useStore();
  const p = state.profiles.find((x) => x.id === id);
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [adding, setAdding] = useState(false);
  const reqs = fam.requestsFor(state, id);
  const drafts = reqs.filter((r) => r.state === 'Draft');
  const offline = !state.settings.deviceOnline;
  useEffect(() => {
    if (!reqs.some((r) => r.state === 'Sync pending')) return;
    const t = setTimeout(() => update(fam.completeSync), 1800); // DEMO: a real backend would confirm this
    return () => clearTimeout(t);
  }, [reqs.map((r) => r.state).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  return (
    <Screen pad="20px 24px 24px">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div><div style={{ fontSize: 13, color: C.plum }}>Managing for</div><div className="sf" style={{ fontSize: 20 }}>{p.name}'s medicines</div></div></div>
      <div style={{ marginTop: 16, background: C.lav, border: '1px solid #D8CEDB', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users size={18} color={C.plum} /><div style={{ fontSize: 13, color: C.plum, lineHeight: 1.4 }}>Changes you make here will be sent to {p.name} for confirmation.</div>
      </div>
      <SectionLabel mt={20}>Proposed changes</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {reqs.length === 0 && <div style={{ fontSize: 14, color: C.muted }}>No proposed changes.</div>}
        {reqs.map((r) => {
          const m = r.medicineId ? state.medicines.find((x) => x.id === r.medicineId) : undefined;
          return (
            <div key={r.id} className="crd" style={{ borderLeft: `3px solid ${dot(r.state)}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{m ? medicineLabel(m) : `${r.newName} ${r.newStrength ?? ''}`}</span>
                <Status kind={stateKind(r.state)}>{r.state === 'Draft' ? 'Draft' : r.state}</Status>
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{r.description} {r.demo && <DemoTag />}</div>
            </div>
          );
        })}
      </div>
      {adding ? (
        <div style={{ marginTop: 12 }}>
          <Field value={name} onChange={setName} placeholder="Medicine name, e.g. Vitamin D3" autoFocus />
          <Field value={strength} onChange={setStrength} placeholder="Strength, e.g. 60000 IU" />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <PillBtn tone="light" onClick={() => setAdding(false)}>Cancel</PillBtn>
            <PillBtn disabled={name.trim().length < 2} onClick={() => { update((s) => fam.proposeNewMedicine(s, id, name.trim(), strength.trim())); setName(''); setStrength(''); setAdding(false); }}>Save draft</PillBtn>
          </div>
        </div>
      ) : (
        <button data-act="1" onClick={() => setAdding(true)} style={{ margin: '12px 0 0', background: 'none', border: 0, font: 'inherit', fontSize: 14, color: C.sage, fontWeight: 500, cursor: 'pointer', padding: 8 }}>+ Propose a new medicine</button>
      )}
      <div style={{ marginTop: 12 }}><PillBtn tone="sage" disabled={drafts.length === 0 || offline} onClick={() => update((s) => fam.sendForConfirmation(s, id))}>Send for confirmation</PillBtn></div>
      {offline && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: C.terra, display: 'flex', gap: 8, alignItems: 'center' }}><WifiOff size={16} />You're offline. Your draft is saved here, but hasn't reached {p.name}'s device yet.</div>}
      <div className="sep" />
      <SectionLabel mt={0}>Sync status <DemoTag label="DEMO SYNC" /></SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, fontSize: 13 }}>
        {reqs.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #F0EBE0' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot(r.state) }} />
            <span style={{ flex: 1, color: C.muted }}>{r.newName ?? medicineLabel(state.medicines.find((m) => m.id === r.medicineId) ?? { name: 'Medicine', strength: '' })}</span>
            <span style={{ color: dot(r.state), fontWeight: 500 }}>{r.state}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ---------- Parent confirms (43) ----------
export function ParentConfirm() {
  const nav = useNavigate();
  const { pid = 'mother' } = useParams();
  const id = pid as ProfileId;
  const { state, update } = useStore();
  const [declineDlg, setDeclineDlg] = useState(false);
  const p = state.profiles.find((x) => x.id === id);
  const list = fam.pendingConfirmations(state, id);
  if (!p) return null;
  return (
    <>
      <Screen pad="20px 24px 100px" footer={list.length > 0 ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><PillBtn tone="light" onClick={() => setDeclineDlg(true)}>Decline</PillBtn></div>
          <div style={{ flex: 2 }}><PillBtn tone="sage" onClick={() => { update((s) => list.reduce((acc, r) => fam.approveRequest(acc, r.id), s)); nav(`/parent/${id}`, { replace: true }); }}>Approve changes</PillBtn></div>
        </div>
      ) : undefined}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Back /><div className="sf" style={{ fontSize: 22 }}>Review changes</div></div>
        {list.length === 0 ? <div style={{ fontSize: 14, color: C.muted, marginTop: 24 }}>No changes are waiting for confirmation.</div> : (
          <>
            <div style={{ marginTop: 16, background: C.lav, border: '1px solid #D8CEDB', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: grads[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: C.deep }}>{(list[0].by[0] ?? 'A')}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>{list[0].by} suggested changes</div><div style={{ fontSize: 12, color: C.plum, marginTop: 2 }}>{list.length} medicine{list.length > 1 ? 's' : ''} updated · nothing changes until you approve</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
              {list.map((r) => {
                const m = r.medicineId ? state.medicines.find((x) => x.id === r.medicineId) : undefined;
                return r.kind === 'change' && m ? (
                  <div key={r.id} className="crd"><div style={{ fontSize: 12, color: C.terra, letterSpacing: '.08em', fontWeight: 500 }}>CHANGED</div><div style={{ fontSize: 16, fontWeight: 500, marginTop: 6 }}>{medicineLabel(m)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}><span style={{ fontSize: 13, color: C.muted, textDecoration: 'line-through' }}>{(r.oldTimes ?? m.times).map(fmtTimeShort).join(', ')}</span><ArrowRight size={14} color={C.faint} /><span style={{ fontSize: 13, color: C.deep, fontWeight: 500 }}>{(r.newTimes ?? []).map(fmtTimeShort).join(', ')}</span></div></div>
                ) : (
                  <div key={r.id} className="crd"><div style={{ fontSize: 12, color: C.deep, letterSpacing: '.08em', fontWeight: 500 }}>NEW MEDICINE</div><div style={{ fontSize: 16, fontWeight: 500, marginTop: 6 }}>{r.newName} {r.newStrength}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{r.description}</div></div>
                );
              })}
            </div>
          </>
        )}
      </Screen>
      {declineDlg && <Dialog title="Decline these changes?" body="Nothing will change on the schedule." confirm="Decline" danger onCancel={() => setDeclineDlg(false)} onConfirm={() => { update((s) => list.reduce((acc, r) => fam.rejectRequest(acc, r.id), s)); nav(`/parent/${id}`, { replace: true }); }} />}
    </>
  );
}
