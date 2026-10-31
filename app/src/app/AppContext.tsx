import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { META, parseHash, routeToHash, type Route } from './routes'
import { medicineBuckets } from '../store/actions'
import { now, store } from '../store/store'
import { isToday } from '../domain/reminders'

export interface ConfirmOpts { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void; onCancel?: () => void }
export interface ToastItem { id: number; text: string; kind: 'info' | 'error' | 'success' }

interface Ctx {
  route: Route
  go: (num: string, param?: string, opts?: { replace?: boolean }) => void
  back: () => void
  home: () => void
  homeNum: () => string
  toast: (text: string, kind?: ToastItem['kind']) => void
  toasts: ToastItem[]
  confirm: (o: ConfirmOpts) => void
  confirmState: ConfirmOpts | null
  closeConfirm: () => void
  sheet: ReactNode | null
  openSheet: (n: ReactNode) => void
  closeSheet: () => void
}

const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

const HIST_KEY = 'smaran:nav'
const loadHist = (): string[] => { try { return JSON.parse(sessionStorage.getItem(HIST_KEY) ?? '[]') } catch { return [] } }
const saveHist = (h: string[]) => { try { sessionStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-60))) } catch { /* private mode */ } }

/** Which "home" to show: setup-needed, active, or the missed-dose variant. */
export function resolveHome(): string {
  const s = store.get()
  const b = medicineBuckets(s)
  if (b.active.length === 0) return '13'
  const n = now()
  const missed = s.reminders.some((r) => (r.status === 'missed' || r.status === 'declined') && isToday(r, n, s.profile.timeZone) && r.kind === 'medicine')
  return missed ? '16' : '14'
}

export function AppProvider({ children, defaultRoute }: { children: ReactNode; defaultRoute: Route }) {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash) ?? defaultRoute)
  const hist = useRef<string[]>(loadHist())
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirm] = useState<ConfirmOpts | null>(null)
  const [sheet, setSheet] = useState<ReactNode | null>(null)
  const toastId = useRef(0)
  const current = useRef(route)
  current.current = route

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', routeToHash(route))
    const onHash = () => {
      const r = parseHash(window.location.hash)
      if (window.location.hash === hist.current[hist.current.length - 1]) { hist.current.pop(); saveHist(hist.current) } // browser Back
      if (r) { setRoute(r); setSheet(null); setConfirm(null) }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = useCallback((num: string, param?: string, opts?: { replace?: boolean }) => {
    const target = { num, param }
    const cur = routeToHash(current.current)
    const next = routeToHash(target)
    if (next === cur) return
    if (!opts?.replace) { hist.current.push(cur); saveHist(hist.current) }
    if (opts?.replace) window.history.replaceState(null, '', next)
    else window.location.hash = next
    if (opts?.replace) { setRoute(target); setSheet(null); setConfirm(null) }
  }, [])

  const back = useCallback(() => {
    const prev = hist.current.pop()
    saveHist(hist.current)
    if (prev) { window.location.hash = prev; return }
    const parent = META[current.current.num]?.parent
    window.location.hash = parent ? `#${parent}` : `#${resolveHome()}`
  }, [])

  const home = useCallback(() => { hist.current = []; saveHist([]); window.location.hash = `#${resolveHome()}` }, [])

  const toast = useCallback((text: string, kind: ToastItem['kind'] = 'info') => {
    const id = ++toastId.current
    setToasts((t) => [...t.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5500 : 3200)
  }, [])

  const value = useMemo<Ctx>(() => ({
    route, go, back, home, homeNum: resolveHome, toast, toasts,
    confirm: (o) => setConfirm(o), confirmState, closeConfirm: () => setConfirm(null),
    sheet, openSheet: (n) => setSheet(n), closeSheet: () => setSheet(null),
  }), [route, go, back, home, toast, toasts, confirmState, sheet])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
