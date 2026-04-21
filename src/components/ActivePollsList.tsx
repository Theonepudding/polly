'use client'
import { useState, useEffect, useCallback } from 'react'
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

  const fetchVotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/guilds/${guildId}/votes`)
      if (!res.ok) return
      const data = (await res.json()) as { votesByPoll: Record<string, Vote[]> }
      setVotesByPoll(data.votesByPoll)
    } catch { /* network hiccup — keep stale data */ }
  }, [guildId])

  useEffect(() => {
    fetchVotes()
    const id = setInterval(fetchVotes, 3000)
    return () => clearInterval(id)
  }, [fetchVotes])

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
