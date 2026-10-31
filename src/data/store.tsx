import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, Profile } from '../types';
import { createBlankState, createDemoState } from './demoData';
import { storage } from '../services/storage';
import { tickReminders } from '../services/reminderService';
import { bindSync, liveUserId, startSync, stopSync } from '../services/sync';
import { bindIdentity } from '../services/identityBind';
import { backendConfigured } from '../services/backend';
import { persistFromChange } from '../services/dataService';

type Updater = (s: AppState) => AppState;

interface Store {
  state: AppState;
  profile: Profile;
  update: (fn: Updater) => void;
  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);

const hydrate = (): AppState => {
  const saved = storage.load<AppState>();
  const base = saved && saved.version === 1 ? saved : createBlankState();
  return tickReminders(base);
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(hydrate);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    bindSync(() => stateRef.current, (next) => setState(typeof next === 'function' ? next : () => next));
    bindIdentity(() => stateRef.current);
    if (backendConfigured()) void startSync();
  }, []);
  useEffect(() => storage.save(state), [state]);
  useEffect(() => {
    document.documentElement.dataset.smaranMode = liveUserId() ? 'live' : 'demo';
  }, [state]);
  useEffect(() => {
    const apply = () => setState((s) => {
      const next = tickReminders(s);
      if (next !== s) void persistFromChange(s, next).catch(() => undefined);
      return next;
    });
    apply();
    const onVis = () => { if (document.visibilityState === 'visible') apply(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', apply);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', apply);
    };
  }, []);

  const update = useCallback((fn: Updater) => {
    setState((s) => {
      const next = fn(s);
      if (next !== s) void persistFromChange(s, next).catch(() => undefined);
      return next;
    });
  }, []);
  const resetDemo = useCallback(() => {
    stopSync();
    storage.clear();
    setState(tickReminders(createDemoState()));
  }, []);

  const value = useMemo<Store>(() => {
    const profile = state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0];
    return { state, profile, update, resetDemo };
  }, [state, update, resetDemo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
