'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, Trash2 } from 'lucide-react'
import ConfirmModal from './ConfirmModal'
import type { Poll, Vote } from '@/types'

interface Props {
  poll:    Poll
  votes:   Vote[]
  guildId: string
}

function renderTitle(title: string) {
  return title.split(/(<a?:\w+:\d+>)/g).map((part, i) => {
    const m = part.match(/^<(a?):(\w+):(\d+)>$/)
    // eslint-disable-next-line @next/next/no-img-element
    if (m) return <img key={i} src={`https://cdn.discordapp.com/emojis/${m[3]}.${m[1]==='a'?'gif':'png'}?size=32`} alt={m[2]} className="inline-block w-4 h-4 align-text-bottom mx-0.5" />
    return part ? <span key={i}>{part}</span> : null
  })
}

export default function ClosedPollCard({ poll, votes, guildId }: Props) {
  const router = useRouter()
  const [menu,          setMenu]          = useState<{ x: number; y: number } | null>(null)
  const [busy,          setBusy]          = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth  - 180)
    const y = Math.min(e.clientY, window.innerHeight - 120)
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

  const handleDelete = async () => {
    setBusy(true)
    try {
      await fetch(`/api/guilds/${guildId}/polls/${poll.id}`, { method: 'DELETE' })
      router.refresh()
    } finally { setBusy(false) }
  }

  const voteCount = votes.length

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
        <Link href={`/dashboard/${guildId}/polls/${poll.id}`}
          className="card-hover p-4 flex items-center justify-between gap-4">
          <div className={busy ? 'opacity-40' : ''}>
            <p className="text-p-text font-medium text-sm">{renderTitle(poll.title)}</p>
            <p className="text-p-muted text-xs mt-0.5">
              Closed {poll.closesAt ? new Date(poll.closesAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
              {' · '}{voteCount} vote{voteCount !== 1 ? 's' : ''}
            </p>
          </div>
          <span className="badge badge-muted shrink-0">Closed</span>
        </Link>

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
              View results
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
