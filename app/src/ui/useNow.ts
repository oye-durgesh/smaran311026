import { useEffect, useState } from 'react'
import { now } from '../store/store'

/** Current app time (respects the test-mode clock); refreshes every 20 s so "next reminder" stays correct. */
export function useNow(intervalMs = 20000): Date {
  const [n, setN] = useState(() => now())
  useEffect(() => { const id = setInterval(() => setN(now()), intervalMs); return () => clearInterval(id) }, [intervalMs])
  return n
}
