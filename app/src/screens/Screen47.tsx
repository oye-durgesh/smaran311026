import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { BottomNav } from '../ui/BottomNav'
import { BackBtn, ChevRight, ScrollArea, Tap } from '../ui/kit'
import { startTalk } from '../ui/homeparts'
import { remoteVoiceAvailable } from '../services/ttsRemote'

const TOPICS = [
  { id: 'meds', title: 'How to add medicines', sub: 'Scan a prescription or add manually', bg: '#E7EDE2', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#526D51" strokeWidth="1.5"><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-30 12 12)" /></svg>,
    body: 'Open Medicines and tap +. Scan or upload your prescription, check every medicine Smaran found, fix anything that is wrong, then tap "Confirm & activate reminders". Nothing becomes a reminder until you confirm it.', go: '30', cta: 'Add medicines' },
  { id: 'calls', title: 'How Sathi calls work', sub: "What to expect when it's medicine time", bg: '#ECE4EE', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6F526C" strokeWidth="1.5"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>,
    body: 'When a reminder is due, you get a notification and an incoming-call screen. Tap Answer to talk; say "Ho gaya" if you took it, or "10 minute baad" to be reminded again. Sathi never starts talking until you answer, and an AI voice is always disclosed.', go: '', cta: '' },
  { id: 'health', title: 'Recording health readings', sub: 'Speak or type your sugar or BP', bg: '#F3D6C6', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D98255" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>,
    body: 'Open Health, then speak or type a reading. You always review it before it is saved. Smaran records your numbers; it does not diagnose or change any medicine.', go: '20', cta: 'Record a reading' },
  { id: 'family', title: 'Family linking', sub: 'Let someone help manage your medicines', bg: '#F8F4EC', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" /></svg>,
    body: 'Invite a family member from Family Space. They can only suggest changes; you approve or decline each one. You choose what they can see and can remove them at any time.', go: '24', cta: 'Open Family Space' },
]

/** More guides, in plain words. Each says what Smaran does and does not do. */
const MORE: Array<{ id: string; title: string; body: string; go?: string; cta?: string }> = [
  { id: 'addfam', title: 'Add a family member', body: 'On Home, tap "+ Add a family member" and choose Mummy, Papa or someone else. Each person has their own medicines, reminders and readings. Tap a name to open their page.', go: '49', cta: 'Add a family member' },
  { id: 'upload', title: 'Upload a prescription', body: 'Open the person\'s page, tap "Upload prescription", choose a PDF, PNG or JPG (up to 10 MB), pick the document language and tap "Read prescription". The file is for the person whose page you opened.', go: '08', cta: 'Upload a prescription' },
  { id: 'confirm', title: 'Confirm what was read', body: 'Smaran shows what it read next to the original text. Anything unclear is marked. Check each medicine against the paper, fix mistakes, and ask the pharmacist or doctor if you are not sure. Nothing is switched on until you confirm it.' },
  { id: 'reminder', title: 'Create or edit a reminder', body: 'Say "Remind me to go for a walk at 6 PM" to Sathi, or open a reminder and change its time. After Sathi says it is saved, you can see it in the person\'s Reminders list.', go: '46', cta: "See today's reminders" },
  { id: 'ack', title: 'Answer a medicine reminder', body: 'When a reminder rings, tap Answer and say "Ho gaya" only if the medicine was taken. Tap Snooze for 5, 10 or 15 minutes. A reminder being sent never counts as taken. If a dose was missed, do not take extra: check the prescription or ask the doctor or pharmacist.' },
  { id: 'stock', title: 'Update medicine stock', body: 'On the person\'s page, tap "Update stock" under a medicine. Choose "I bought a refill" and enter how many tablets were added, or count the tablets left. Smaran only keeps a record and warns you; it never orders medicine.' },
  { id: 'reading', title: 'Add a sugar or BP reading', body: 'Open Health, tap Blood Sugar or Blood Pressure, enter the value and say when it was measured. Smaran shows the date and source. It does not diagnose.', go: '20', cta: 'Open Health' },
  { id: 'appt', title: 'Manage appointments', body: 'Open Appointments, add the doctor, date and time, and choose a reminder. Completed or cancelled appointments stay in the history. Smaran does not book appointments.', go: '25', cta: 'Open Appointments' },
  { id: 'voice', title: "Set Sathi's language and voice", body: 'Each person has their own language and speaking speed on their page. Sathi answers in the language you speak. Mom and Dad voices need a configured voice and your voice consent in Privacy & data.', go: '26', cta: 'Open settings' },
  { id: 'invite', title: 'Invite a family member', body: 'Open Family Space and tap Invite. Choose what they can see. They only get access after they accept the invitation themselves. You can remove access at any time.', go: '24', cta: 'Open Family Space' },
  { id: 'privacy', title: 'Access and privacy', body: 'Your health records are private to your account. Family helpers see only what you allow and cannot see documents by default. You can export or delete your data.', go: '44', cta: 'Open Privacy & data' },
  { id: 'trouble', title: 'Something is not working', body: 'Upload failed: check the file is a PDF, PNG or JPG under 10 MB and that you are online, then try again. Reminder did not ring: allow notifications, keep the app installed, and check the time zone on the person\'s page; a phone that is switched off or in battery-saver may delay it. Sathi will not speak: allow the microphone, or type instead. Smaran never makes phone calls.', go: '48', cta: 'Check notifications' },
]

export default function Screen47() {
  const { go, back, toast } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const [voiceHelp, setVoiceHelp] = useState(false)
  // only offered when a real voice backend is reachable (a signed-in server, or the local API with an ElevenLabs key)
  useEffect(() => { void remoteVoiceAvailable().then(setVoiceHelp).catch(() => undefined) }, [])
  const email = import.meta.env.VITE_SUPPORT_EMAIL
  const contact = () => {
    if (!email) { toast('Support email is not configured for this build. Set VITE_SUPPORT_EMAIL (see .env.example).', 'error'); return }
    window.location.href = `mailto:${email}?subject=Smaran%20support`
  }
  return (
    <div className="scr" style={{ height: 'calc(100% - 47px)' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 72px', overflow: 'auto', padding: '20px 24px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BackBtn onClick={back} />
          <div className="sf" style={{ fontSize: 22 }}>Help &amp; Support</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {TOPICS.map((t) => (
            <div key={t.id} className="crd">
              <Tap aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(t.id === 'family' ? { border: '1px solid #E8DFD1' } : {}) }}>{t.icon}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 500 }}>{t.title}</div><div style={{ fontSize: 12, color: '#7A6B5D', marginTop: 2 }}>{t.sub}</div></div>
                <div style={{ transform: open === t.id ? 'rotate(90deg)' : undefined }}><ChevRight /></div>
              </Tap>
              {open === t.id && (
                <div style={{ marginTop: 12, fontSize: 14, color: '#7A6B5D', lineHeight: 1.6 }}>
                  {t.body}
                  {t.go && <Tap onClick={() => go(t.go)} style={{ marginTop: 10, color: '#7B8B5A', fontWeight: 500 }}>{t.cta}</Tap>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="lbl">MORE GUIDES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {MORE.map((t) => (
            <div key={t.id} className="crd">
              <Tap aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{t.title}</div>
                <div style={{ transform: open === t.id ? 'rotate(90deg)' : undefined }}><ChevRight /></div>
              </Tap>
              {open === t.id && (
                <div style={{ marginTop: 12, fontSize: 14, color: '#7A6B5D', lineHeight: 1.6 }}>
                  {t.body}
                  {t.go && <Tap onClick={() => go(t.go!)} style={{ marginTop: 10, color: '#7B8B5A', fontWeight: 500 }}>{t.cta}</Tap>}
                </div>
              )}
            </div>
          ))}
        </div>
        {voiceHelp && <Tap onClick={() => startTalk(go)} style={{ marginTop: 16, height: 48, background: '#ECE4EE', border: '1px solid #D8CEDB', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 500, color: '#6F526C' }}>Talk to Sathi for help</Tap>}
        <div className="sep" />
        <div style={{ fontSize: 14, color: '#7A6B5D', textAlign: 'center' }}>Need more help?</div>
        <Tap onClick={contact} style={{ marginTop: 12, height: 48, background: '#fff', border: '1px solid #E8DFD1', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 500 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>Contact support
        </Tap>
      </ScrollArea>
      <BottomNav active="more" />
    </div>
  )
}
