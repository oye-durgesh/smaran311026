import { useApp } from '../app/AppContext'
import type { Tab } from '../app/routes'
import { Tap } from './kit'

const ICONS: Record<Exclude<Tab, null>, (filled: boolean) => JSX.Element> = {
  home: (f) => <svg width="20" height="20" viewBox="0 0 24 24" fill={f ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M3 12l9-9 9 9v8a1 1 0 01-1 1h-4v-5h-4v5H5a1 1 0 01-1-1z" /></svg>,
  medicines: (f) => <svg width="20" height="20" viewBox="0 0 24 24" fill={f ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><rect x="4" y="9" width="16" height="6" rx="3" transform="rotate(-30 12 12)" /></svg>,
  health: (f) => <svg width="20" height="20" viewBox="0 0 24 24" fill={f ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>,
  more: (f) => <svg width="20" height="20" viewBox="0 0 24 24" fill={f ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h16" /></svg>,
}
const LABEL: Record<Exclude<Tab, null>, string> = { home: 'Home', medicines: 'Medicines', health: 'Health', more: 'More' }

export function BottomNav({ active }: { active: Exclude<Tab, null> }) {
  const { go, homeNum } = useApp()
  const dest = (t: Exclude<Tab, null>) => (t === 'home' ? homeNum() : t === 'medicines' ? '15' : t === 'health' ? '20' : '26')
  return (
    <nav className="bn" aria-label="Main">
      {(['home', 'medicines', 'health', 'more'] as const).map((t) => (
        <Tap key={t} className={`bn-i${t === active ? ' on' : ''}`} label={LABEL[t]} onClick={() => go(dest(t), undefined, { replace: false })} aria-current={t === active ? 'page' : undefined}>
          {ICONS[t](t === active)}{LABEL[t]}
        </Tap>
      ))}
    </nav>
  )
}
