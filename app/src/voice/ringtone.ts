/** Gentle WebAudio ringtone. Stops on answer / decline / expiry / cancel. May be blocked until the user has interacted. */
let ctx: AudioContext | null = null
let timer: ReturnType<typeof setInterval> | null = null

type AC = typeof AudioContext
const Ctor = (): AC | undefined => (typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext))

function beep(freq: number, dur: number, vol: number) {
  if (!ctx) return
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = 'sine'; o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
  o.connect(g).connect(ctx.destination)
  o.start(); o.stop(ctx.currentTime + dur + 0.05)
}

export const ringing = () => timer !== null

export function startRing(tone: 'gentle' | 'standard'): 'playing' | 'blocked' | 'unsupported' {
  stopRing()
  const C = Ctor()
  if (!C) return 'unsupported'
  try {
    ctx = ctx ?? new C()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { return 'unsupported' }
  if (ctx.state !== 'running') {
    // resume() resolves asynchronously; if it is still blocked we report it honestly.
    setTimeout(() => { if (ctx && ctx.state !== 'running') stopRing() }, 300)
  }
  const vol = tone === 'gentle' ? 0.08 : 0.22
  const pattern = () => { beep(tone === 'gentle' ? 523 : 660, 0.35, vol); setTimeout(() => beep(tone === 'gentle' ? 659 : 880, 0.35, vol), 400) }
  pattern()
  timer = setInterval(pattern, 2200)
  return ctx.state === 'running' ? 'playing' : 'blocked'
}

export function stopRing() {
  if (timer) { clearInterval(timer); timer = null }
}
