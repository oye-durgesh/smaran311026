import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDraft, setDraft } from '../store/actions'
import { store } from '../store/store'

/** Form state that survives navigating away and a browser refresh until it is saved or explicitly cancelled. */
export function useDraft<T>(key: string, initial: () => T): [T, (patch: Partial<T> | ((v: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => (store.get().drafts[key] as T | undefined) ?? initial())
  const ref = useRef(value)
  ref.current = value
  useEffect(() => { if (!(key in store.get().drafts)) setDraft(key, ref.current) }, [key])
  const update = useCallback((patch: Partial<T> | ((v: T) => T)) => {
    const next = typeof patch === 'function' ? (patch as (v: T) => T)(ref.current) : { ...ref.current, ...patch }
    ref.current = next
    setValue(next)
    setDraft(key, next)
  }, [key])
  const discard = useCallback(() => clearDraft(key), [key])
  return [value, update, discard]
}
