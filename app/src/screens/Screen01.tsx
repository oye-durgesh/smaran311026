import logo from '../assets/samran-logo.png'
import { useApp } from '../app/AppContext'
import { Btn, Tap } from '../ui/kit'
import { store } from '../store/store'
import { backendConfigured } from '../services/backend'

export default function Screen01() {
  const { go, home, toast } = useApp()
  const haveAccount = () => {
    if (backendConfigured()) { go('02', 'signin'); return }          // returning user: sign in with email
    if (store.get().profile.onboarded) { home(); return }
    toast('No saved account on this device yet. Let’s create one.', 'info')
    go('02')
  }
  return (
    <div className="scr">
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 60% at 50% 30%,#D4A57C 0%,rgba(196,184,206,.55) 35%,rgba(245,239,230,0) 70%)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 32px', height: '100%', boxSizing: 'border-box', justifyContent: 'space-between' }}>
        <div />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <img src={logo} alt="Smaran" style={{ width: 180, height: 180, objectFit: 'contain' }} />
          <div className="sf" style={{ fontSize: 26, color: '#2E241B', textAlign: 'center', lineHeight: 1.25 }}>Your health routine,<br />remembered.</div>
          <div style={{ fontSize: 15, color: '#7A6B5D', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>A friendly companion for your medicines, health readings, and daily reminders.</div>
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingBottom: 32 }}>
          <Btn onClick={() => go('02')}>Get Started</Btn>
          <Tap style={{ fontSize: 15, color: '#7B8B5A' }} onClick={haveAccount}>I already have an account</Tap>
        </div>
      </div>
    </div>
  )
}
