import { useApp } from '../app/AppContext'
import { updateProfile } from '../store/actions'
import { useStore } from '../store/store'
import { BackBtn, Btn, CheckIcon, ScrollArea, StepRing, Tap } from '../ui/kit'
import { LANGS } from '../ui/options'
import { supportsReplies } from '../voice/messages'

export default function Screen03() {
  const { go, back } = useApp()
  const lang = useStore((s) => s.profile.language)
  return (
    <div className="scr" style={{ background: '#F0EAE0' }}>
      <ScrollArea style={{ position: 'absolute', inset: '0 0 96px', overflow: 'auto', padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackBtn onClick={back} />
          <StepRing step={2} total={5} />
        </div>
        <div className="sf" style={{ fontSize: 24, marginTop: 20, lineHeight: 1.25 }}>Choose your language</div>
        <div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 6 }}>Sathi will speak and show text in this language.</div>
        <div role="radiogroup" aria-label="Language" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {LANGS.map((l) => {
            const on = lang === l.code
            return (
              <Tap key={l.code} role="radio" aria-checked={on} onClick={() => updateProfile({ language: l.code })}
                style={{ background: '#F8F4EC', border: on ? '1.5px solid #7B8B5A' : '1px solid #E8DFD1', borderRadius: 16, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: l.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600 }}>{l.letter}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{l.native}</div><div style={{ fontSize: 13, color: '#8A7F6A', marginTop: 2 }}>{l.sample}</div></div>
                {on
                  ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#7B8B5A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckIcon size={10} color="#fff" w={3} /></span>
                  : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid #8A7F6A' }} />}
              </Tap>
            )
          })}
        </div>
        <div style={{ fontSize: 12, color: '#8A7F6A', marginTop: 12, textAlign: 'center' }}>
          {supportsReplies(lang) ? 'You can change this later in Settings.' : 'Sathi can listen in this language; spoken replies are in Hindi/English for now. You can change this later in Settings.'}
        </div>
      </ScrollArea>
      <div className="ft"><Btn onClick={() => go('04')}>Continue</Btn></div>
    </div>
  )
}
