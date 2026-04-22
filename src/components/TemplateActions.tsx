'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import ConfirmModal from './ConfirmModal'
import CreateScheduledPollModal from './CreateScheduledPollModal'
import type { PollTemplate } from '@/types'

interface Props {
  guildId:  string
  userId:   string
  userName: string
  template: PollTemplate
}

export default function TemplateActions({ guildId, userId, userName, template }: Props) {
  const router = useRouter()
  const [busy,    setBusy]    = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function toggle() {
    setBusy(true)
    await fetch(`/api/guilds/${guildId}/templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !template.active }),
    })
    router.refresh()
    setBusy(false)
  }

  async function remove() {
    setBusy(true)
    await fetch(`/api/guilds/${guildId}/templates/${template.id}`, { method: 'DELETE' })
    router.refresh()
    setBusy(false)
  }

  return (
    <>
      {confirm && (
        <ConfirmModal
          title="Delete schedule"
          message="Delete this scheduled poll? This cannot be undone."
          confirm="Delete"
          danger
          onConfirm={() => { setConfirm(false); remove() }}
          onCancel={() => setConfirm(false)}
        />
      )}
      <div className="flex gap-2 shrink-0">
        <CreateScheduledPollModal
          guildId={guildId}
          userId={userId}
          userName={userName}
          initialTemplate={template}
        />
        <button onClick={toggle} disabled={busy} className="btn-secondary text-xs py-1.5">
          {template.active ? 'Pause' : 'Resume'}
        </button>
        <button onClick={() => setConfirm(true)} disabled={busy} className="btn-danger text-xs py-1.5">
          Delete
        </button>
      </div>
    </>
  )
}
