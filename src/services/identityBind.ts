/** Tiny bind so identity.ts does not import the React store. */
import type { AppState } from '../types'

type Getter = () => AppState
let getState: Getter | null = null
export function bindIdentity(get: Getter) { getState = get }
export function bindGetState(): Getter | null { return getState }
