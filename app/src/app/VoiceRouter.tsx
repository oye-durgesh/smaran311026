import { useEffect, useRef } from 'react'
import { useApp } from './AppContext'
import { onReminderFired } from '../store/actions'
import { useVoice, voice } from '../voice/session'

export const CALL_SCREENS = new Set(['17', '18', '34', '35', '36', '37'])

/** Maps the voice session's state onto the approved call screens, and rings incoming reminders. */
export function VoiceRouter() {
  const { route, go } = useApp()
  const v = useVoice()
  const prev = useRef(route.num)

  // Incoming reminder while the app is open → incoming-call screen.
  useEffect(() => onReminderFired((r) => {
    if (voice.get().active) return
    voice.ring(r.id)
    go('17', r.id, { replace: false })
  }), [go])

  // Opened from a notification / deep link: #17/<reminderId>
  useEffect(() => {
    if (route.num === '17' && route.param && !voice.get().active) voice.ring(route.param)
  }, [route.num, route.param])

  // State → screen
  useEffect(() => {
    if (!v.active) return
    let target: string | null = null
    if (v.incoming) target = '17'
    else if (v.state === 'ready') target = '34'
    else if (v.state === 'completed') target = '19'
    else if (v.state === 'connecting') target = '34'
    else if (v.state === 'reconnecting' || v.state === 'error') target = '37'
    else if (v.state === 'speaking') target = '36'
    else if (v.state === 'processing') target = '18'
    else if (v.state === 'listening') target = v.lines.some((l) => l.from === 'user') ? '18' : '35'
    if (target && target !== route.num && (CALL_SCREENS.has(route.num) || route.num === '19')) go(target, undefined, { replace: true })
  }, [v.active, v.incoming, v.state, v.lines, route.num, go])

  // Leaving the call screens ends the call (without marking anything as taken).
  useEffect(() => {
    if (CALL_SCREENS.has(prev.current) && !CALL_SCREENS.has(route.num) && route.num !== '19' && voice.get().active) voice.reset()
    prev.current = route.num
  }, [route.num])

  return null
}
