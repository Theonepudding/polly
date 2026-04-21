'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface Props {
  guildId: string
  pollId: string
}

export default function PollManageBar({ guildId, pollId }: Props) {
  const router = useRouter()
  const [closing,    setClosing]    = useState(false)
  const [resending,  setResending]  = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'ok' | 'fail'>('idle')

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

  async function resendToDiscord() {
    setResending(true)
    setResendStatus('idle')
    try {
      const res = await fetch(`/api/guilds/${guildId}/polls/${pollId}/discord`, { method: 'POST' })
      setResendStatus(res.ok ? 'ok' : 'fail')
    } catch {
      setResendStatus('fail')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="mt-6 p-4 rounded-xl border border-p-border bg-p-surface">
      <p className="text-xs text-p-muted font-semibold uppercase tracking-wider mb-3">Poll Management</p>
      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={closePoll} disabled={closing} className="btn-secondary text-sm">
          <XCircle size={14} />
          {closing ? 'Closing…' : 'Close Poll'}
        </button>

        <button onClick={resendToDiscord} disabled={resending} className="btn-secondary text-sm">
          {resending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {resending ? 'Posting…' : 'Resend to Discord'}
        </button>

        {resendStatus === 'ok' && (
          <span className="flex items-center gap-1.5 text-p-success text-xs">
            <CheckCircle2 size={13} /> Posted!
          </span>
        )}
        {resendStatus === 'fail' && (
          <span className="flex items-center gap-1.5 text-p-warning text-xs">
            <AlertCircle size={13} /> Couldn&apos;t post — check your announcement channel in Settings.
          </span>
        )}
      </div>
    </div>
  )
}
