import type { ReactNode } from 'react'
import { Overlays } from '../ui/Overlays'

interface Props {
  label: string
  lightChrome?: boolean
  children: ReactNode
}

/** 390×844 device surface: status bar, screen area, overlays and home indicator. */
export default function PhoneFrame({ label, lightChrome, children }: Props) {
  const lt = lightChrome ? ' lt' : ''
  return (
    <div className="ph" data-screen-label={label}>
      <div className={`sb${lt}`}>
        <span>9:41</span>
        <span className="bat" />
      </div>
      {children}
      <Overlays />
      <div className={`hi${lt}`} />
    </div>
  )
}
