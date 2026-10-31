import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

/** Real, scannable QR code for the invitation link. */
export function QrCode({ value, size = 96, color = '#6F526C' }: { value: string; size?: number; color?: string }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { n, d }
  }, [value])
  return (
    <svg role="img" aria-label="QR code for the invitation link" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges">
      <path d={d} fill={color} />
    </svg>
  )
}
