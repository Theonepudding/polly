'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, CheckCircle2, Trash2 } from 'lucide-react'
import PollCard from './PollCard'
import type { Poll, Vote } from '@/types'

interface Props {
  poll:    Poll
  votes:   Vote[]
  guildId: string
}

export default function ActivePollCard({ poll, votes, guildId }: Props) {
  const router = useRouter()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState<'close' | 'delete' | null>(null)

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth  - 180)
    const y = Math.min(e.clientY, window.innerHeight - 140)
    setMenu({ x, y })
  }

  useEffect(() => {
    if (!menu) return
    const dismiss = () => setMenu(null)
    const onKey   = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('click',   dismiss)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click',   dismiss)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const handleClose = async () => {
    setMenu(null)
    setBusy('close')
    try {
      await fetch(`/api/guilds/${guildId}/polls/${poll.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isClosed: true }),
      })
      router.refresh()
    } finally { setBusy(null) }
  }

  const handleDelete = async () => {
    setMenu(null)
    if (!confirm(`Delete "${poll.title}"?\nThis cannot be undone.`)) return
    setBusy('delete')
    try {
      await fetch(`/api/guilds/${guildId}/polls/${poll.id}`, { method: 'DELETE' })
      router.refresh()
    } finally { setBusy(null) }
  }

  return (
    <div onContextMenu={openMenu} className="relative">
      <PollCard poll={poll} votes={votes} guildId={guildId} />

      {/* Busy overlay */}
      {busy && (
        <div className="absolute inset-0 rounded-xl bg-p-surface/70 backdrop-blur-sm flex items-center justify-center pointer-events-none z-10">
          <span className="text-xs text-p-muted">{busy === 'close' ? 'Closing…' : 'Deleting…'}</span>
        </div>
      )}

      {/* Context menu */}
      {menu && (
        <div
          className="fixed z-50 min-w-[164px] rounded-xl border border-p-border bg-p-surface shadow-xl py-1.5"
          style={{ left: menu.x, top: menu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { setMenu(null); router.push(`/dashboard/${guildId}/polls/${poll.id}`) }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-p-text hover:bg-p-surface-2 transition-colors text-left"
          >
            <Pencil size={13} className="text-p-muted" />
            Edit poll
          </button>
          <button
            onClick={handleClose}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-p-text hover:bg-p-surface-2 transition-colors text-left"
          >
            <CheckCircle2 size={13} className="text-p-warning" />
            Close poll
          </button>
          <div className="h-px bg-p-border mx-2 my-1" />
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-p-error hover:bg-p-error/10 transition-colors text-left"
          >
            <Trash2 size={13} />
            Delete poll
          </button>
        </div>
      )}
    </div>
  )
}
