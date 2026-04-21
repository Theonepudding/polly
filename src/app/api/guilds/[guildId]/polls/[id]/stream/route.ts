import { NextRequest } from 'next/server'
import { getPoll, getVotes } from '@/lib/polls'


type Params = { params: Promise<{ guildId: string; id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let closed    = false

      const send = async () => {
        try {
          const [poll, votes] = await Promise.all([getPoll(id), getVotes(id)])
          if (!poll) { controller.close(); return }
          const data = JSON.stringify({ votes, isClosed: poll.isClosed })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          if (poll.isClosed) { closed = true; controller.close() }
        } catch { controller.close() }
      }

      await send()
      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        await send()
      }, 1500)

      // Clean up after 5 minutes max
      setTimeout(() => {
        clearInterval(interval)
        try { controller.close() } catch { /* already closed */ }
      }, 5 * 60 * 1000)
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
