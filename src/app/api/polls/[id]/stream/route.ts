import { NextRequest } from 'next/server'
import { getVotes, getPoll, updatePoll } from '@/lib/polls'
import { updatePollInDiscord } from '@/lib/discord-bot'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const encoder  = new TextEncoder()
  let intervalId: ReturnType<typeof setInterval> | null = null
  let lastHash   = ''
  let didClose   = false  // guard: only auto-close once per stream

  // Fetch poll once so we know closesAt without hitting KV every tick
  const poll = await getPoll(id)

  const stream = new ReadableStream({
    async start(controller) {
      if (!poll) {
        try { controller.close() } catch { /* already closed */ }
        return
      }

      const enqueue = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* closed */ }
      }

      let keepaliveTick = 0
      const check = async () => {
        try {
          // Auto-close when closesAt has passed
          if (!didClose && !poll.isClosed && poll.closesAt && new Date(poll.closesAt) <= new Date()) {
            didClose = true
            await updatePoll(id, { isClosed: true })
            const votes = await getVotes(id)
            updatePollInDiscord({ ...poll, isClosed: true }, votes).catch(() => {})
            enqueue({ votes, closed: true })
            if (intervalId) clearInterval(intervalId)
            try { controller.close() } catch { /* already closed */ }
            return
          }

          const votes = await getVotes(id)
          const hash  = `${votes.length}:${votes.map(v => v.votedAt).join(',')}`
          if (hash !== lastHash) {
            lastHash = hash
            enqueue({ votes })
          }
          if (++keepaliveTick % 30 === 0) {
            controller.enqueue(encoder.encode(': keepalive\n\n'))
          }
        } catch {
          if (intervalId) clearInterval(intervalId)
          try { controller.close() } catch { /* already closed */ }
        }
      }

      await check()
      intervalId = setInterval(check, 1000)

      // Max 5 minutes per connection, then client auto-reconnects
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
