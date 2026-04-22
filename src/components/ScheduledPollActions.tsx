'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import ConfirmModal from './ConfirmModal'
import CreateScheduledPollModal from './CreateScheduledPollModal'
import type { ScheduledPoll } from '@/types'

interface Props {
  guildId:      string
  userId:       string
  userName:     string
  scheduledPoll: ScheduledPoll
}

export default function ScheduledPollActions({ guildId, userId, userName, scheduledPoll }: Props) {
  const router = useRouter()
  const [busy,    setBusy]    = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [runMsg,  setRunMsg]  = useState('')

  async function toggle() {
    setBusy(true)
    await fetch(`/api/guilds/${guildId}/scheduled-polls/${scheduledPoll.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !scheduledPoll.active }),
    })
    router.refresh()
    setBusy(false)
  }

  async function runNow() {
    setBusy(true)
    setRunMsg('')
    try {
      const res = await fetch(`/api/guilds/${guildId}/scheduled-polls/${scheduledPoll.id}`, { method: 'POST' })
      if (res.ok) {
        setRunMsg('Posted!')
        setTimeout(() => setRunMsg(''), 3000)
        router.refresh()
      } else {
        setRunMsg('Failed')
        setTimeout(() => setRunMsg(''), 3000)
      }
    } catch {
      setRunMsg('Error')
      setTimeout(() => setRunMsg(''), 3000)
    } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true)
    await fetch(`/api/guilds/${guildId}/scheduled-polls/${scheduledPoll.id}`, { method: 'DELETE' })
    router.refresh()
    setBusy(false)
  }

  return (
    <>
      {confirm && (
        <ConfirmModal
          title="Delete scheduled poll"
          message="Delete this scheduled poll? This cannot be undone."
          confirm="Delete"
          danger
          onConfirm={() => { setConfirm(false); remove() }}
          onCancel={() => setConfirm(false)}
        />
      )}
      <div className="flex gap-2 shrink-0 items-center flex-wrap justify-end">
        {runMsg && <span className="text-xs text-p-success font-medium">{runMsg}</span>}
        <button onClick={runNow} disabled={busy} className="btn-ghost text-xs py-1.5" title="Post this poll immediately">
          Run now
        </button>
        <CreateScheduledPollModal
          guildId={guildId}
          userId={userId}
          userName={userName}
          initialScheduledPoll={scheduledPoll}
        />
        <button onClick={toggle} disabled={busy} className="btn-secondary text-xs py-1.5">
          {scheduledPoll.active ? 'Pause' : 'Resume'}
        </button>
        <button onClick={() => setConfirm(true)} disabled={busy} className="btn-danger text-xs py-1.5">
          Delete
        </button>
      </div>
    </>
  )
}
