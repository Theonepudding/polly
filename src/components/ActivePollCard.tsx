'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, CheckCircle2, Trash2, Bell, BellOff } from 'lucide-react'
import PollCard from './PollCard'
import ConfirmModal from './ConfirmModal'
import type { Poll, Vote } from '@/types'

interface Props {
  poll:       Poll
  votes:      Vote[]
  guildId:    string
  userId?:    string
  canManage?: boolean
}

export default function ActivePollCard({ poll, votes, guildId, userId, canManage = false }: Props) {
  const router = useRouter()
  const [menu,          setMenu]          = useState<{ x: number; y: number } | null>(null)
  const [busy,          setBusy]          = useState<'close' | 'delete' | 'remind' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reminderSent,   setReminderSent]   = useState(false)
  const [reminderError,  setReminderError]  = useState('')
  const [localRemindedAt, setLocalRemindedAt] = useState(poll.lastReminderAt ?? null)

  const canRemind = canManage || (!!userId && userId === poll.createdBy)

  function reminderCooldownLabel(): string | null {
    if (!localRemindedAt) return null
    const msLeft = 24 * 60 * 60 * 1000 - (Date.now() - new Date(localRemindedAt).getTime())
    if (msLeft <= 0) return null
    const h = Math.floor(msLeft / 3_600_000)
    const m = Math.floor((msLeft % 3_600_000) / 60_000)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  const cooldown = reminderCooldownLabel()

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
    setBusy('delete')
    try {
      await fetch(`/api/guilds/${guildId}/polls/${poll.id}`, { method: 'DELETE' })
      router.refresh()
    } finally { setBusy(null) }
  }

  const handleRemind = async () => {
    setMenu(null)
    setBusy('remind')
    setReminderError('')
    try {
      const res = await fetch(`/api/guilds/${guildId}/polls/${poll.id}/remind`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; hLeft?: number; mLeft?: number }
        const msg = data.hLeft != null
          ? `Reminder already sent — try again in ${data.hLeft}h ${data.mLeft}m`
          : (data.error ?? 'Failed to post reminder')
        setReminderError(msg)
        setTimeout(() => setReminderError(''), 5000)
      } else {
        const data = await res.json().catch(() => ({})) as { lastReminderAt?: string }
        if (data.lastReminderAt) setLocalRemindedAt(data.lastReminderAt)
        setReminderSent(true)
        setTimeout(() => setReminderSent(false), 4000)
      }
    } finally { setBusy(null) }
  }

  return (
    <>
    {confirmDelete && (
      <ConfirmModal
        title="Delete poll"
        message={`Delete "${poll.title}"? This cannot be undone.`}
        confirm="Delete"
        danger
        onConfirm={() => { setConfirmDelete(false); handleDelete() }}
        onCancel={() => setConfirmDelete(false)}
      />
    )}
    <div onContextMenu={openMenu} className="relative">
      <PollCard poll={poll} votes={votes} guildId={guildId} />

      {/* Busy overlay */}
      {busy && (
        <div className="absolute inset-0 rounded-xl bg-p-surface/70 backdrop-blur-sm flex items-center justify-center pointer-events-none z-10">
          <span className="text-xs text-p-muted">
            {busy === 'close' ? 'Closing…' : busy === 'remind' ? 'Posting reminder…' : 'Deleting…'}
          </span>
        </div>
      )}

      {/* Reminder feedback */}
      {(reminderSent || reminderError) && (
        <div className={`absolute bottom-2 left-2 right-2 rounded-lg px-3 py-2 text-xs flex items-center gap-2 z-10 ${
          reminderSent ? 'bg-p-success/15 border border-p-success/30 text-p-success' : 'bg-p-danger/15 border border-p-danger/30 text-p-danger'
        }`}>
          {reminderSent ? <Bell size={11} /> : <BellOff size={11} />}
          {reminderSent ? 'Reminder posted to Discord' : reminderError}
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
            <Eye size={13} className="text-p-muted" />
            View poll
          </button>
          {canRemind && (
            <button
              onClick={cooldown ? undefined : handleRemind}
              disabled={!!cooldown}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors text-left ${
                cooldown
                  ? 'text-p-muted cursor-default opacity-60'
                  : 'text-p-text hover:bg-p-surface-2 cursor-pointer'
              }`}
            >
              <Bell size={13} className={cooldown ? 'text-p-subtle' : 'text-p-primary'} />
              <span className="flex-1">Post a reminder</span>
              {cooldown && <span className="text-[11px] text-p-subtle">{cooldown}</span>}
            </button>
          )}
          <button
            onClick={handleClose}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-p-text hover:bg-p-surface-2 transition-colors text-left"
          >
            <CheckCircle2 size={13} className="text-p-warning" />
            Close poll
          </button>
          <div className="h-px bg-p-border mx-2 my-1" />
          <button
            onClick={() => { setMenu(null); setConfirmDelete(true) }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-p-error hover:bg-p-error/10 transition-colors text-left"
          >
            <Trash2 size={13} />
            Delete poll
          </button>
        </div>
      )}
    </div>
    </>
  )
}
