'use client'
import { useState, useEffect } from 'react'
import ActivePollCard from './ActivePollCard'
import CreatePollModal from './CreatePollModal'
import type { Poll, Vote } from '@/types'

interface Props {
  polls:        Poll[]
  initialVotes: Record<string, Vote[]>
  guildId:      string
  userId:       string
  userName:     string
  canManage:    boolean
}

export default function ActivePollsList({ polls, initialVotes, guildId, userId, userName, canManage }: Props) {
  const [votesByPoll, setVotesByPoll] = useState<Record<string, Vote[]>>(initialVotes)

  useEffect(() => {
    let es: EventSource
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource(`/api/guilds/${guildId}/votes/stream`)

      es.onmessage = (e: MessageEvent) => {
        try {
          const { votesByPoll: fresh } = JSON.parse(e.data) as { votesByPoll: Record<string, Vote[]> }
          if (fresh) setVotesByPoll(fresh)
        } catch { /* ignore malformed */ }
      }

      es.onerror = () => {
        es.close()
        // Back off 3 seconds before reconnecting
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      clearTimeout(retryTimer)
      es?.close()
    }
  }, [guildId])

  if (polls.length === 0) {
    return (
      <div className="card p-8 text-center text-p-muted">
        <p className="mb-4">No active polls. Create one to get started!</p>
        <CreatePollModal guildId={guildId} userId={userId} userName={userName} canManage={canManage} />
      </div>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {polls.map(poll => (
        <ActivePollCard
          key={poll.id}
          poll={poll}
          votes={votesByPoll[poll.id] ?? []}
          guildId={guildId}
        />
      ))}
    </div>
  )
}
