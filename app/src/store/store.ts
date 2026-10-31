import { useSyncExternalStore } from 'react'
import type { AppState } from '../domain/types'
import { initialState, STORAGE_KEY } from './defaults'
import { makeSelf, scoped, selfOf, stampPersons, SELF_LOCAL_ID } from '../domain/people'

type Listener = () => void

/** Older saved data has no profiles: create the account holder's own profile and give existing records to it. */
function withPeople(s: AppState): AppState {
  let st = s
  if (!st.people || st.people.length === 0) st = { ...st, people: [makeSelf(st.profile, new Date().toISOString())], activePersonId: SELF_LOCAL_ID }
  else if (!selfOf(st)) st = { ...st, people: [makeSelf(st.profile, new Date().toISOString()), ...st.people] }
  if (!st.activePersonId) st = { ...st, activePersonId: selfOf(st)!.id }
  return stampPersons(st)
}

function load(): AppState {
  const base = withPeople(initialState())
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<AppState>
    if (parsed.version !== 1) return base
    return withPeople({
      ...base, ...parsed,
      profile: { ...base.profile, ...parsed.profile },
      prefs: { ...base.prefs, ...parsed.prefs, quietHours: { ...base.prefs.quietHours, ...parsed.prefs?.quietHours }, permissionAsked: { ...base.prefs.permissionAsked, ...parsed.prefs?.permissionAsked } },
      family: { ...base.family, ...parsed.family },
      setup: { ...base.setup, ...parsed.setup },
      demo: { ...base.demo, ...parsed.demo },
    } as AppState)
  } catch {
    return base
  }
}

let state: AppState = load()
const listeners = new Set<Listener>()
let saveQueued = false
export let lastSaveError: string | null = null

function persist() {
  if (saveQueued) return
  saveQueued = true
  queueMicrotask(() => {
    saveQueued = false
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      lastSaveError = null
    } catch (e) {
      lastSaveError = e instanceof Error ? e.message : 'Could not save'
    }
  })
}

export const store = {
  get: () => state,
  /** Only the active family member's records (what the screens show). */
  view: () => scoped(state),
  set(update: (s: AppState) => AppState) {
    const raw = update(state)
    if (raw === state) return
    const next = stampPersons(raw) // every new record is given its owner here, once
    state = next
    persist()
    listeners.forEach((l) => l())
  },
  replace(next: AppState) { store.set(() => withPeople(next)) },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l) } },
  reset() { store.replace(initialState()) },
  scoped,
}

// Keep other tabs in sync (same-device only).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) { state = load(); listeners.forEach((l) => l()) }
  })
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(scoped(state)))
}

/** Unscoped: every family member's records. Only for screens that deliberately show several people at once. */
export function useRawStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state))
}

/** The app clock. `demo.clockOffsetMs` is only non-zero in deterministic test mode. */
export const now = (): Date => new Date(Date.now() + state.demo.clockOffsetMs)
