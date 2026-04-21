import { NextRequest } from 'next/server'
import { getVotes } from '@/lib/polls'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const encoder  = new TextEncoder()
  let intervalId: ReturnType<typeof setInterval> | null = null
  let lastHash   = ''

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* closed */ }
      }

      const check = async () => {
        try {
          const votes = await getVotes(id)
          const hash  = `${votes.length}:${votes.map(v => v.votedAt).join(',')}`
          if (hash !== lastHash) {
            lastHash = hash
            enqueue({ votes })
          }
          // keepalive so the connection doesn't time out
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          if (intervalId) clearInterval(intervalId)
          try { controller.close() } catch { /* already closed */ }
        }
      }

      await check()
      intervalId = setInterval(check, 500)

      // Max 5 minutes per connection, then client reconnects automatically
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
