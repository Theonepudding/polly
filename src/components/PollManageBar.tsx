'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle } from 'lucide-react'

interface Props {
  guildId: string
  pollId: string
}

export default function PollManageBar({ guildId, pollId }: Props) {
  const router = useRouter()
  const [closing, setClosing] = useState(false)

  async function closePoll() {
    setClosing(true)
    await fetch(`/api/guilds/${guildId}/polls/${pollId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isClosed: true }),
    })
    router.refresh()
    setClosing(false)
  }

  return (
    <div className="mt-6 p-4 rounded-xl border border-p-border bg-p-surface">
      <p className="text-xs text-p-muted font-semibold uppercase tracking-wider mb-3">Poll Management</p>
      <div className="flex gap-3">
        <button onClick={closePoll} disabled={closing} className="btn-secondary text-sm">
          <XCircle size={14} />
          {closing ? 'Closing…' : 'Close Poll'}
        </button>
      </div>
    </div>
  )
}
