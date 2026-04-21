import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes, castVote } from '@/lib/polls'
import { updatePollInDiscord, refreshDashboard } from '@/lib/discord-bot'
import type { Vote } from '@/types'

type Params = { params: Promise<{ guildId: string; id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const poll = await getPoll(id)
  if (!poll || poll.guildId !== guildId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (poll.isClosed) return NextResponse.json({ error: 'Poll is closed' }, { status: 400 })

  const body      = await req.json()
  const optionIds: string[] = poll.allowMultiple
    ? (Array.isArray(body.optionIds) ? body.optionIds : [body.optionId])
    : [body.optionId ?? body.optionIds?.[0]]

  if (!optionIds.every(oid => poll.options.some(o => o.id === oid))) {
    return NextResponse.json({ error: 'Invalid option' }, { status: 400 })
  }

  const now = new Date().toISOString()
  if (poll.allowMultiple) {
    for (const optionId of optionIds) {
      const vote: Vote = {
        pollId:   id,
        userId:   session.user.id,
        username: session.user.name ?? 'Unknown',
        optionId,
        timeSlot: body.timeSlot,
        votedAt:  now,
      }
      await castVote(vote, true)
    }
  } else {
    const vote: Vote = {
      pollId:   id,
      userId:   session.user.id,
      username: session.user.name ?? 'Unknown',
      optionId: optionIds[0],
      timeSlot: body.timeSlot,
      votedAt:  now,
    }
    await castVote(vote, false)
  }

  const votes = await getVotes(id)

  await updatePollInDiscord(poll, votes).catch(() => {})
  refreshDashboard(guildId).catch(() => {})

  return NextResponse.json({ votes })
}
