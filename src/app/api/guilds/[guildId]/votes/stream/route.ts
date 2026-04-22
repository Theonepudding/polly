import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPolls, getVotes } from '@/lib/polls'
import type { Vote } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ guildId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { guildId } = await params
  const encoder = new TextEncoder()

  let lastPollHash  = ''
  let lastVoteHash  = ''
  let intervalId:   ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* closed */ }
      }

      const check = async () => {
        try {
          // getPolls and getVotes both use cacheTtl: 0 — reads bypass the
          // 60-second Worker instance cache so we always see the latest KV data
          const polls      = await getPolls(guildId)
          const active     = polls.filter(p => !p.isClosed)
          const votesByPoll: Record<string, Vote[]> = {}
          await Promise.all(active.map(async p => {
            votesByPoll[p.id] = await getVotes(p.id)
          }))

          const pollHash = active.map(p => p.id).sort().join(',')
          const voteHash = JSON.stringify(
            Object.entries(votesByPoll)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([id, votes]) => [id, votes.length, votes.map(v => v.votedAt).sort().join(',')])
          )

          const pollsChanged = pollHash !== lastPollHash
          const votesChanged = voteHash !== lastVoteHash

          if (pollsChanged || votesChanged) {
            lastPollHash = pollHash
            lastVoteHash = voteHash
            send({ votesByPoll, pollsChanged })
          }
        } catch {
          if (intervalId) clearInterval(intervalId)
          try { controller.close() } catch { /* already closed */ }
        }
      }

      // Immediate first check so the browser gets fresh data on connect
      await check()
      intervalId = setInterval(check, 1000)

      // Max 5 min per connection — browser auto-reconnects via EventSource
      setTimeout(() => {
        if (intervalId) clearInterval(intervalId)
        try { controller.close() } catch { /* already closed */ }
      }, 5 * 60 * 1000)
    },
    cancel() {
      if (intervalId) clearInterval(intervalId)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
