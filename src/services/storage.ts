// Thin persistence layer. Local demo always writes here. If Supabase is configured and the user is signed in,
// a debounced push also runs (demo-flagged rows are skipped — see sync.ts).
import { schedulePush } from './sync'

const KEY = 'smaran.state.v1';

export const storage = {
  load<T>(): T | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  save<T>(state: T): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable: keep running in memory */
    }
    schedulePush();
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
