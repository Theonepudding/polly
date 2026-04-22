import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes, castVote } from '@/lib/polls'
import { updatePollInDiscord, refreshDashboard } from '@/lib/discord-bot'
import { fetchMemberNick } from '@/lib/guilds'
import type { Poll, Vote } from '@/types'

type Params = { params: Promise<{ id: string }> }

function bgDiscordUpdate(poll: Poll, votes: Vote[]) {
  const work = (async () => {
    await new Promise(r => setTimeout(r, 500))
    await updatePollInDiscord(poll, votes).catch(() => {})
    refreshDashboard(poll.guildId).catch(() => {})
  })()
  try {
    const { getCloudflareContext } = require('@opennextjs/cloudflare')
    getCloudflareContext().ctx.waitUntil(work)
  } catch { work.catch(() => {}) }
}

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

  const body     = await req.json()
  const optionIds: string[] = poll.allowMultiple
    ? (Array.isArray(body.optionIds) ? body.optionIds : [body.optionId])
    : [body.optionId ?? body.optionIds?.[0]]

  if (!optionIds.every(id => poll.options.some(o => o.id === id)))
    return NextResponse.json({ error: 'Invalid option' }, { status: 400 })

  const now      = new Date().toISOString()
  const username = await fetchMemberNick(poll.guildId, session.user.id, session.user.name ?? 'Unknown')
  let votes: Vote[] = []
  for (const optionId of optionIds) {
    const vote: Vote = {
      pollId:   id,
      userId:   session.user.id,
      username,
      optionId,
      timeSlot: poll.includeTimeSlots ? body.timeSlot : undefined,
      votedAt:  now,
    }
    ;({ votes } = await castVote(vote, poll.allowMultiple))
  }

  bgDiscordUpdate(poll, votes)
  return NextResponse.json({ votes })
}
