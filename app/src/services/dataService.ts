/**
 * Data service switch: local demo storage vs Supabase.
 *
 * Screens never talk to this file. They keep using the existing store/actions.
 *  - No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY → demo/local mode (localStorage).
 *  - Credentials present and the user signed in → sync.ts reads/writes the seven Supabase tables.
 * Demo family data is never uploaded (see sync.ts `sampleData` guard).
 */
import { backendConfigured } from './backend'
import { startSync, stopSync, syncStatus } from './sync'

export type DataMode = 'demo' | 'supabase'

export function dataMode(): DataMode {
  return backendConfigured() ? 'supabase' : 'demo'
}

export function isDemoMode(): boolean {
  return dataMode() === 'demo'
}

export { startSync, stopSync, syncStatus }
