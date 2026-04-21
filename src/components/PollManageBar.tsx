'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, Send, CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react'

interface Props {
  guildId:    string
  pollId:     string
  isClosed?:  boolean
  canManage?: boolean
}

export default function PollManageBar({ guildId, pollId, isClosed = false, canManage = false }: Props) {
  const router = useRouter()
  const [closing,      setClosing]      = useState(false)
  const [resending,    setResending]    = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [deleting,     setDeleting]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  async function deletePoll() {
    setDeleting(true)
    await fetch(`/api/guilds/${guildId}/polls/${pollId}`, { method: 'DELETE' })
    router.push(`/dashboard/${guildId}`)
  }

  return (
    <div className="mt-6 p-4 rounded-xl border border-p-border bg-p-surface">
      <p className="text-xs text-p-muted font-semibold uppercase tracking-wider mb-3">Poll Management</p>
      <div className="flex flex-wrap gap-3 items-center">
        {canManage && !isClosed && (
          <button onClick={closePoll} disabled={closing} className="btn-secondary text-sm">
            <XCircle size={14} />
            {closing ? 'Closing…' : 'Close Poll'}
          </button>
        )}

        {canManage && !isClosed && (
          <button onClick={resendToDiscord} disabled={resending} className="btn-secondary text-sm">
            {resending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {resending ? 'Posting…' : 'Resend to Discord'}
          </button>
        )}

        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="btn-danger text-sm ml-auto">
            <Trash2 size={14} />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-p-warning text-xs">Delete this poll and remove it from Discord?</span>
            <button onClick={deletePoll} disabled={deleting} className="btn-danger text-sm">
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {deleting ? 'Deleting…' : 'Confirm'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost text-sm">Cancel</button>
          </div>
        )}
      </div>

      {resendStatus === 'ok' && (
        <div className="flex items-center gap-1.5 text-p-success text-xs mt-3">
          <CheckCircle2 size={13} /> Posted to Discord!
        </div>
      )}
      {resendStatus === 'fail' && (
        <div className="flex items-center gap-1.5 text-p-warning text-xs mt-3">
          <AlertCircle size={13} /> Couldn&apos;t post — check your announcement channel in Settings.
        </div>
      )}
    </div>
  )
}
