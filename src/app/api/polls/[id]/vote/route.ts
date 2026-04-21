import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes, castVote } from '@/lib/polls'
import { updatePollInDiscord, refreshDashboard } from '@/lib/discord-bot'
import type { Vote } from '@/types'

type Params = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Params) {
  const { id } = await params
  return NextResponse.json({ votes: await getVotes(id) })
}

export async function POST(req: Request, { params }: Params) {
  const { id }  = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const poll = await getPoll(id)
  if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
  if (poll.isClosed || (poll.closesAt && new Date(poll.closesAt) <= new Date()))
    return NextResponse.json({ error: 'Poll is closed' }, { status: 400 })

  const body    = await req.json()
  const optionIds: string[] = poll.allowMultiple
    ? (Array.isArray(body.optionIds) ? body.optionIds : [body.optionId])
    : [body.optionId ?? body.optionIds?.[0]]

  if (!optionIds.every(id => poll.options.some(o => o.id === id)))
    return NextResponse.json({ error: 'Invalid option' }, { status: 400 })

  const now = new Date().toISOString()
  let votes: Vote[] = []
  for (const optionId of optionIds) {
    const vote: Vote = {
      pollId:   id,
      userId:   session.user.id,
      username: session.user.name ?? 'Unknown',
      optionId,
      timeSlot: poll.includeTimeSlots ? body.timeSlot : undefined,
      votedAt:  now,
    }
    ;({ votes } = await castVote(vote, poll.allowMultiple))
  }
  await updatePollInDiscord(poll, votes).catch(() => {})
  refreshDashboard(poll.guildId).catch(() => {})
  return NextResponse.json({ votes })
}
