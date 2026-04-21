'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  guildId: string
  templateId: string
  active: boolean
}

export default function TemplateActions({ guildId, templateId, active }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    await fetch(`/api/guilds/${guildId}/templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    router.refresh()
    setBusy(false)
  }

  async function remove() {
    if (!confirm('Delete this schedule?')) return
    setBusy(true)
    await fetch(`/api/guilds/${guildId}/templates/${templateId}`, { method: 'DELETE' })
    router.refresh()
    setBusy(false)
  }

  return (
    <div className="flex gap-2 shrink-0">
      <button onClick={toggle} disabled={busy} className="btn-secondary text-xs py-1.5">
        {active ? 'Pause' : 'Resume'}
      </button>
      <button onClick={remove} disabled={busy} className="btn-danger text-xs py-1.5">
        Delete
      </button>
    </div>
  )
}
