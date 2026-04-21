'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value: T
  onChange: (v: T) => void
  options: Option<T>[]
  className?: string
  disabled?: boolean
  onOpen?: () => void
}

export default function SelectInput<T extends string>({ value, onChange, options, className, disabled, onOpen }: Props<T>) {
  const [open, setOpen] = useState(false)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})
  const [mounted, setMounted] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return
      setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleToggle() {
    if (disabled) return
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropStyle({ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 })
      onOpen?.()
    }
    setOpen(o => !o)
  }

  const dropdown = (
    <div
      ref={dropRef}
      style={dropStyle}
      className="bg-p-surface-2 border border-p-border rounded-xl overflow-hidden shadow-2xl max-h-72 overflow-y-auto"
    >
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => { onChange(opt.value); setOpen(false) }}
          className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-p-border/40 ${
            opt.value === value ? 'text-p-primary bg-p-primary-b font-semibold' : 'text-p-text'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={`input w-full flex items-center justify-between gap-2 text-left ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown size={14} className={`shrink-0 text-p-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {mounted && open && createPortal(dropdown, document.body)}
    </div>
  )
}
