'use client'
import { useEffect, useState } from 'react'

interface Props {
  iso: string
  dateStyle?: 'short' | 'medium' | 'long' | 'full'
  timeStyle?: 'short' | 'medium' | 'long' | 'full'
  className?: string
}

// Renders a UTC ISO string in the viewer's local timezone.
// Server renders a UTC-formatted fallback; the client updates to local time after hydration.
export default function LocalTime({ iso, dateStyle, timeStyle, className }: Props) {
  const opts = {
    ...(dateStyle ? { dateStyle } : {}),
    ...(timeStyle ? { timeStyle } : {}),
    ...(timeStyle ? { hourCycle: 'h23' as const } : {}),
  } as Intl.DateTimeFormatOptions

  const [text, setText] = useState(() =>
    new Date(iso).toLocaleString('en-GB', { ...opts, timeZone: 'UTC' })
  )

  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, opts))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso])

  return <span suppressHydrationWarning className={className}>{text}</span>
}
