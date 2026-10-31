import { Suspense, useEffect, useMemo, useState } from 'react'
import PhoneFrame from './components/PhoneFrame'
import { AppProvider, resolveHome, useApp } from './app/AppContext'
import { META, SCREEN_META } from './app/routes'
import { startScheduler, registerServiceWorker } from './app/scheduler'
import { VoiceRouter } from './app/VoiceRouter'
import { DevPanel } from './app/DevPanel'
import { screenComponents } from './screens/registry'
import { store } from './store/store'
import { startSync, stopSync } from './services/sync'
import { backendConfigured, onAuthEvent } from './services/backend'
import { registerPush } from './services/push'

/** The screen list and demo controls are for development/demo; hide them in a production build unless asked for. */
const SHOW_MENU = import.meta.env.DEV || import.meta.env.VITE_SHOW_SCREEN_MENU === 'true' || /[?&]menu\b/.test(window.location.search)

function Shell() {
  const { route, go, closeSheet } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const def = META[route.num]
  const Screen = screenComponents[route.num]

  useEffect(() => startScheduler(), [])
  useEffect(() => { void registerServiceWorker() }, [])
  useEffect(() => { void startSync().then(() => registerPush()) }, [])
  // Email links (verification, password reset) bring the user back with a session. Continue where they were.
  useEffect(() => {
    if (!backendConfigured()) return
    let off: (() => void) | undefined, dead = false
    void onAuthEvent((event) => {
      if (event === 'PASSWORD_RECOVERY') { window.location.hash = '#02/reset'; return }
      if (event === 'SIGNED_IN') {
        void startSync().then(() => {
          const h = window.location.hash
          if (!store.get().profile.onboarded && (h === '' || h === '#01' || h.startsWith('#02'))) window.location.hash = '#03'
        })
      }
      if (event === 'SIGNED_OUT') stopSync()
    }).then((u) => { if (dead) u(); else off = u })
    return () => { dead = true; off?.() }
  }, [])
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open' && typeof e.data.url === 'string') window.location.hash = e.data.url.replace(/^.*#/, '#')
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [])
  useEffect(() => { document.title = `Smaran · ${def.title}` }, [def.title])

  const sections = useMemo(() => {
    const out: { name: string; items: typeof SCREEN_META }[] = []
    for (const s of SCREEN_META) {
      const last = out[out.length - 1]
      if (last && last.name === s.section) last.items.push(s)
      else out.push({ name: s.section, items: [s] })
    }
    return out
  }, [])

  return (
    <div className="app">
      {SHOW_MENU && <button className="menu-fab" aria-label="All screens" onClick={() => setMenuOpen((o) => !o)}>☰</button>}
      {SHOW_MENU && <nav className={`nav${menuOpen ? ' open' : ''}`} aria-label="Screens">
        <h1>Smaran</h1>
        <p className="sub">Voice-first health companion · {SCREEN_META.length} screens</p>
        <DevPanel />
        {sections.map((sec) => (
          <div key={sec.name}>
            <h2>{sec.name}</h2>
            {sec.items.map((s) => (
              <button key={s.num} className={s.num === route.num ? 'on' : ''} onClick={() => { closeSheet(); go(s.num); setMenuOpen(false) }}>
                <span className="n">{s.num}</span>
                {s.title}
              </button>
            ))}
          </div>
        ))}
      </nav>}
      <main className="stage">
        <PhoneFrame label={`${def.num} ${def.title}`} lightChrome={def.lightChrome}>
          <Suspense fallback={<div className="ph-loading">Loading…</div>}>
            <Screen key={`${route.num}/${route.param ?? ''}`} param={route.param} />
          </Suspense>
        </PhoneFrame>
        <div className="stage-label">{def.num} · {def.title}</div>
      </main>
      <VoiceRouter />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider defaultRoute={{ num: store.get().profile.onboarded ? resolveHome() : '01' }}>
      <Shell />
    </AppProvider>
  )
}
