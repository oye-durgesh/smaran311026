import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BellOff, Check, Clock, Heart, Users } from 'lucide-react';
import { useStore } from '../data/store';
import { BottomNav, C, Chev, DemoTag, MedIcon, ModeLine, PillBtn, Screen, SectionLabel } from '../components/ui';
import { DuePill, TakenMark } from '../components/MedicineCards';
import ReminderSheet from '../components/ReminderSheet';
import { eventsFor, fmtTime, missedEvents, nextReminder, markTaken } from '../services/reminderService';
import * as med from '../services/medicineService';
import type { Profile, ReminderEvent } from '../types';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
export const todayLabel = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
export const todayLong = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

export function Avatar({ p, onClick }: { p: Profile; onClick?: () => void }) {
  return (
    <button aria-label={`Switch profile (current: ${p.name})`} data-act="1" onClick={onClick} style={{ width: 44, height: 44, borderRadius: '50%', background: C.card, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <span className="sf" style={{ fontSize: 16, fontWeight: 500 }}>{p.initial}</span>
    </button>
  );
}

export function ProfileSwitcher({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { state, update } = useStore();
  const pick = (p: Profile) => { update((s) => ({ ...s, activeProfileId: p.id })); onClose(); nav(p.id === 'self' ? '/home' : `/parent/${p.id}`); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Switch profile" style={{ position: 'absolute', inset: 0, background: 'rgba(46,36,27,.35)', zIndex: 30 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.paper, borderRadius: '24px 24px 0 0', padding: '12px 24px 32px', boxSizing: 'border-box' }}>
        <div style={{ width: 36, height: 4, background: C.line, borderRadius: 2, margin: '0 auto 16px' }} />
        <div className="sf" style={{ fontSize: 20 }}>Whose health?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {state.profiles.map((p) => {
            const on = p.id === state.activeProfileId;
            return (
              <button key={p.id} data-act="1" aria-pressed={on} onClick={() => pick(p)} className="crd" style={{ display: 'flex', alignItems: 'center', gap: 12, font: 'inherit', textAlign: 'left', cursor: 'pointer', border: on ? `1.5px solid ${C.sage}` : undefined, width: '100%' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="sf">{p.initial}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 12, color: C.muted }}>{p.id === 'self' ? 'Your own health' : `Helping ${p.relation.toLowerCase()}`}</div></div>
                {on && <Check size={18} color={C.sage} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Header({ title, sub, onAvatar }: { title: string; sub: string; onAvatar: () => void }) {
  const { profile } = useStore();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#E7EDE2,#B5C4A0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5" aria-hidden><path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" /></svg>
        </div>
        <div><div className="sf" style={{ fontSize: 20 }}>{title}</div><div style={{ fontSize: 12, color: C.muted }}>{sub}</div></div>
      </div>
      <Avatar p={profile} onClick={onAvatar} />
    </div>
  );
}

export default function Home() {
  const nav = useNavigate();
  const { state, profile, update } = useStore();
  const [sheet, setSheet] = useState<ReminderEvent | null>(null);
  const [switcher, setSwitcher] = useState(false);
  const list = med.activeMedicines(state);
  const isSelf = profile.id === 'self';
  const events = eventsFor(state);
  const missed = missedEvents(state);
  const next = nextReminder(state);
  const confirmed = list.filter((m) => m.status === 'ready').length;
  const status = med.setupStatus(state);
  const mOf = (e: ReminderEvent) => state.medicines.find((m) => m.id === e.medicineId);
  const title = isSelf ? `${greeting()}, ${profile.name}` : `${profile.name}'s day`;
  const taken = events.filter((e) => e.status === 'taken').length;
  const upcoming = events.filter((e) => e.status === 'upcoming' || e.status === 'snoozed').length;

  return (
    <>
      <Screen>
        <Header title={title} sub={todayLabel()} onAvatar={() => setSwitcher(true)} />
        <ModeLine who={profile.id === 'self' ? 'You' : profile.name} />

        {!isSelf && (
          <button data-act="1" onClick={() => nav(`/parent/${profile.id}`)} style={{ marginTop: 14, width: '100%', background: C.lav, border: '1px solid #D8CEDB', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <Users size={18} color={C.plum} /><span style={{ flex: 1, fontSize: 13, color: C.plum }}>You are helping {profile.name}. Open helper view</span><Chev color={C.plum} />
          </button>
        )}

        {!state.settings.notificationsAllowed && (
          <div style={{ marginTop: 16, background: 'rgba(192,133,96,.1)', border: '1px solid rgba(192,133,96,.25)', borderRadius: 14, padding: 14, display: 'flex', gap: 12 }}>
            <BellOff size={22} color={C.terra} strokeWidth={1.5} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Notifications are off</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>Sathi can't remind you about medicines until notifications are allowed.</div>
              <button data-act="1" onClick={() => update((s) => ({ ...s, settings: { ...s.settings, notificationsAllowed: true } }))} style={{ marginTop: 8, padding: '8px 14px', background: C.terra, borderRadius: 999, fontSize: 13, color: '#fff', fontWeight: 500, border: 0, font: 'inherit', cursor: 'pointer' }}>Enable in Settings</button>
            </div>
          </div>
        )}

        {missed.length > 0 && missed.slice(0, 2).map((e) => (
          <div key={e.id} style={{ marginTop: 16, background: 'rgba(183,91,83,.08)', border: '1px solid rgba(183,91,83,.25)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={22} color={C.err} strokeWidth={1.5} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>Missed: {mOf(e)?.name ?? e.title ?? 'Reminder'}, {fmtTime(e.time)}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>This reminder wasn't answered</div></div>
            <button data-act="1" onClick={() => update((s) => markTaken(s, e.id))} style={{ padding: '8px 12px', border: `1px solid ${C.err}`, borderRadius: 999, fontSize: 12, color: C.err, fontWeight: 500, whiteSpace: 'nowrap', background: 'none', font: 'inherit', cursor: 'pointer' }}>Mark taken</button>
          </div>
        ))}

        {list.length === 0 ? (
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <div className="sf" style={{ fontSize: 22 }}>Let's add {isSelf ? 'your' : `${profile.name}'s`} medicines</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>Upload a prescription or add medicines manually so Sathi can remind {isSelf ? 'you' : 'them'}.</div>
            <div style={{ marginTop: 20 }}><PillBtn onClick={() => nav('/medicines/setup')}>Add medicines</PillBtn></div>
          </div>
        ) : (
          <>
            <button data-act="1" onClick={() => nav('/medicines/setup')} style={{ marginTop: 16, width: '100%', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="13" fill="none" stroke={C.line} strokeWidth="2.5" /><circle cx="16" cy="16" r="13" fill="none" stroke={C.sage} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(81.7 * confirmed) / list.length} 81.7`} transform="rotate(-90 16 16)" /></svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{confirmed} of {list.length} medicines confirmed</div>
                <div style={{ fontSize: 12, color: status === 'Ready' ? C.deep : C.terra, marginTop: 2 }}>
                  {status === 'Needs review' ? `${list.filter((m) => m.status === 'needs_review').map((m) => m.name).join(', ')} needs review` : status === 'Paused' ? 'Reminders paused' : '✓ Setup ready'}
                </div>
              </div>
              <Chev />
            </button>

            {next && (
              <button data-act="1" onClick={() => setSheet(next)} style={{ marginTop: 12, width: '100%', background: C.peach, borderRadius: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 14, border: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.orange, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Clock size={24} color="#fff" strokeWidth={1.5} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#8A6B5D', letterSpacing: '.06em' }}>{next.status === 'snoozed' ? 'SNOOZED' : 'NEXT REMINDER'}</div>
                  <div style={{ fontSize: 17, fontWeight: 500, marginTop: 2 }}>{mOf(next) ? med.medicineLabel(mOf(next)!) : (next.title || 'Reminder')}</div>
                  <div style={{ fontSize: 14, color: '#6B4F3D', marginTop: 2 }}>
                    {next.status === 'snoozed' && next.snoozedUntil ? `Again at ${new Date(next.snoozedUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : `Today at ${fmtTime(next.time)}`} · {mOf(next) ? (mOf(next)!.food === 'No instruction' ? 'No food instruction' : mOf(next)!.food) : 'Custom'}
                  </div>
                </div>
              </button>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <span style={{ padding: '5px 12px', background: '#E7EDE2', borderRadius: 999, fontSize: 13, color: C.deep }}>✓ {taken} taken</span>
              {missed.length > 0 && <span style={{ padding: '5px 12px', background: 'rgba(183,91,83,.1)', borderRadius: 999, fontSize: 13, color: C.err }}>! {missed.length} missed</span>}
              <span style={{ padding: '5px 12px', border: `1px solid ${C.line}`, borderRadius: 999, fontSize: 13, color: C.muted }}>{upcoming} upcoming</span>
            </div>

            <SectionLabel>Today's medicines</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {events.length === 0 && <div style={{ fontSize: 14, color: C.muted }}>No reminders are active yet. Confirm your medicines to start them.</div>}
              {events.map((e) => {
                const m = mOf(e);
                const col = e.status === 'taken' ? C.sage : e.status === 'missed' ? C.err : e.status === 'skipped' ? C.faint : C.orange;
                return (
                  <div key={e.id} className="crd" role="button" data-act="1" onClick={() => setSheet(e)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, boxShadow: `inset 3px 0 0 ${col}`, cursor: 'pointer' }}>
                    <MedIcon g={m?.gradient ?? ['#E7EDE2', '#B5C4A0']} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{m ? med.medicineLabel(m) : (e.title || 'Reminder')} {(m?.demo || e.demo) && <DemoTag label="DEMO" />}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{fmtTime(e.time)} · {m ? (m.food === 'No instruction' ? m.timeOfDay : m.food) : 'Custom'}</div>
                    </div>
                    {e.status === 'taken' ? <TakenMark label="Taken" /> : e.status === 'missed' ? <span style={{ fontSize: 12, color: C.err }}>! Missed</span> : e.status === 'skipped' ? <span style={{ fontSize: 12, color: C.faint }}>Skipped</span> : <DuePill>{e.status === 'snoozed' ? 'Snoozed' : fmtTime(e.time).replace(':00', '')}</DuePill>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <button data-act="1" onClick={() => nav('/health/record')} style={{ marginTop: 16, width: '100%', background: C.lav, border: '1px solid #D8CEDB', borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 12, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.plum, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Heart size={20} color="#fff" strokeWidth={1.5} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500 }}>Record a health reading</div><div style={{ fontSize: 12, color: C.plum }}>Sugar, BP, or speak to Sathi</div></div>
          <Chev color={C.plum} />
        </button>
        {events.length > 0 && <button data-act="1" onClick={() => nav('/today')} style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 0, font: 'inherit', fontSize: 14, color: C.sage, cursor: 'pointer', padding: 8 }}>See today's full timeline</button>}
      </Screen>
      <BottomNav />
      {sheet && <ReminderSheet event={state.events.find((e) => e.id === sheet.id) ?? sheet} onClose={() => setSheet(null)} />}
      {switcher && <ProfileSwitcher onClose={() => setSwitcher(false)} />}
    </>
  );
}
