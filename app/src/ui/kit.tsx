import { forwardRef, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useStore } from '../store/store'
import type { TextSize } from '../domain/types'

/** Clickable div: identical to the design's div, plus keyboard + screen-reader semantics. */
export function Tap({ onClick, disabled, children, style, className, label, ...rest }: Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> & {
  onClick?: (e: React.MouseEvent) => void; disabled?: boolean; label?: string
}) {
  return (
    <div
      {...rest}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      className={className}
      style={{ cursor: disabled ? 'default' : 'pointer', ...style }}
      onClick={(e) => { if (!disabled) onClick?.(e) }}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick?.(e as unknown as React.MouseEvent) } }}
    >
      {children}
    </div>
  )
}

export const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E241B" strokeWidth="1.5"><path d="M15 6l-6 6 6 6" /></svg>
)
export function BackBtn({ onClick }: { onClick: () => void }) {
  return <Tap className="bk" label="Back" onClick={onClick}><BackIcon /></Tap>
}
export const ChevRight = ({ color = '#A89584', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M9 6l6 6-6 6" /></svg>
)
export const ChevDown = ({ color = '#8A7F6A' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M6 9l6 6 6-6" /></svg>
)
export const MicIcon = ({ size = 20, color = '#8A7F6A' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
)
export const PillIcon = ({ size = 18, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-30 12 12)" /></svg>
)
export const CheckIcon = ({ size = 14, color = 'currentColor', w = 2.5 }: { size?: number; color?: string; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w}><path d="M5 12l5 5L20 7" /></svg>
)
export const HeartIcon = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
)
export const PlusIcon = ({ size = 18, color = '#526D51' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>
)
export const WaveIcon = ({ size = 22, color = '#526D51' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" /></svg>
)
export const PhoneDownIcon = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" transform="rotate(135)"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></svg>
)

/** `.inp` container whose focus state matches the design's `inp-f`. */
export function InputBox({ children, style, focused, invalid }: { children: ReactNode; style?: CSSProperties; focused?: boolean; invalid?: boolean }) {
  return <div className={`inp${focused ? ' inp-f' : ''}${invalid ? ' inp-bad' : ''}`} style={style}>{children}</div>
}
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ style, ...p }, ref) {
  return <input ref={ref} className="fi" style={{ flex: 1, ...style }} {...p} />
})
export const NoteArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { h: number; color?: string }>(function NoteArea({ h, color = '#8A7F6A', style, ...p }, ref) {
  return (
    <textarea
      ref={ref} className="fi-area"
      style={{ marginTop: 10, height: h, width: '100%', background: '#F8F4EC', border: '1px solid #E8DFD1', borderRadius: 12, padding: '12px 16px', fontSize: 14, color, resize: 'none', boxSizing: 'border-box', ...style }}
      {...p}
    />
  )
})
export const Err = ({ children }: { children?: ReactNode }) =>
  children ? <div role="alert" className="field-err">{children}</div> : null

export function Chip({ on, children, onClick, style, dashed }: { on: boolean; children: ReactNode; onClick?: () => void; style?: CSSProperties; dashed?: boolean }) {
  return (
    <Tap className={`ch ${on ? 'ch-on' : 'ch-off'}`} style={{ ...(dashed ? { borderStyle: 'dashed' } : {}), ...style }} onClick={onClick} aria-pressed={on} role="button">
      {children}
    </Tap>
  )
}

export function Btn({ kind = 'd', children, onClick, disabled, style }: { kind?: 'd' | 'sg'; children: ReactNode; onClick?: () => void; disabled?: boolean; style?: CSSProperties }) {
  return <Tap className={`bt bt-${kind}`} onClick={onClick} disabled={disabled} style={{ ...(disabled ? { opacity: 0.55 } : {}), ...style }}>{children}</Tap>
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div
      role="switch" aria-checked={on} aria-label={label} tabIndex={0}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!on) } }}
      style={{ width: 40, height: 24, borderRadius: 12, background: on ? '#7B8B5A' : '#E8DFD1', position: 'relative', cursor: 'pointer', flexShrink: 0 }}
    >
      <div style={{ position: 'absolute', [on ? 'right' : 'left']: 2, top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff' }} />
    </div>
  )
}

const SCALE: Record<TextSize, number> = { standard: 0.92, large: 1, extra: 1.14 }
/** Scrollable content area. Applies the user's text-size preference (Large = the approved design size). */
export function ScrollArea({ children, style }: { children: ReactNode; style: CSSProperties }) {
  const size = useStore((s) => s.profile.textSize)
  const z = SCALE[size]
  return (
    <div style={style}>
      {z === 1 ? children : <div style={{ zoom: z }}>{children}</div>}
    </div>
  )
}

/** Medicine bubble gradients from the design, assigned per medicine. */
export const MED_GRADIENTS = [
  'linear-gradient(135deg,#D4A57C,#B87D5A)', 'linear-gradient(135deg,#D4DEE6,#A8BCC8)',
  'linear-gradient(135deg,#F3D6C6,#D98255)', 'linear-gradient(135deg,#ECE4EE,#C4B0C2)',
]
export function medGradient(id: string, index?: number): string {
  if (index != null) return MED_GRADIENTS[index % MED_GRADIENTS.length]
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return MED_GRADIENTS[h % MED_GRADIENTS.length]
}

export function StepRing({ step, total }: { step: number; total: number }) {
  const dash = ((106.8 * step) / total).toFixed(1)
  return (
    <div style={{ width: 40, height: 40, position: 'relative' }}>
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="17" fill="none" stroke="#E8DFD1" strokeWidth="3" />
        <circle cx="20" cy="20" r="17" fill="none" stroke="#7B8B5A" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${dash} 106.8`} transform="rotate(-90 20 20)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500 }}>{step}/{total}</div>
    </div>
  )
}

export function ProgressRing({ frac }: { frac: number }) {
  const dash = (81.7 * Math.max(0, Math.min(1, frac))).toFixed(1)
  return (
    <div style={{ width: 32, height: 32, position: 'relative' }}>
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13" fill="none" stroke="#E8DFD1" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="13" fill="none" stroke="#7B8B5A" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${dash} 81.7`} transform="rotate(-90 16 16)" />
      </svg>
    </div>
  )
}
