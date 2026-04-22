import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, castVote } from '@/lib/polls'
import { getGuild, userCanVote, fetchMemberRoles, fetchMemberNick } from '@/lib/guilds'
import { updatePollInDiscord, refreshDashboard } from '@/lib/discord-bot'
import type { Poll, Vote } from '@/types'

type Params = { params: Promise<{ guildId: string; id: string }> }

function bgDiscordUpdate(poll: Poll, votes: Vote[], guildId: string) {
  const work = (async () => {
    await new Promise(r => setTimeout(r, 500))
    await updatePollInDiscord(poll, votes).catch(() => {})
    refreshDashboard(guildId).catch(() => {})
  })()
  try {
    const { getCloudflareContext } = require('@opennextjs/cloudflare')
    getCloudflareContext().ctx.waitUntil(work)
  } catch { work.catch(() => {}) }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const poll = await getPoll(id)
  if (!poll || poll.guildId !== guildId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (poll.isClosed || (poll.closesAt && new Date(poll.closesAt) <= new Date()))
    return NextResponse.json({ error: 'Poll is closed' }, { status: 400 })

  // Enforce voter role restrictions
  const guild = await getGuild(guildId)
  if (guild?.voterRoleIds?.length) {
    const memberRoles = await fetchMemberRoles(guildId, session.user.id)
    if (!userCanVote(guild, memberRoles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body     = await req.json()
  const optionIds: string[] = poll.allowMultiple
    ? (Array.isArray(body.optionIds) ? body.optionIds : [body.optionId])
    : [body.optionId ?? body.optionIds?.[0]]

  if (!optionIds.every(oid => poll.options.some(o => o.id === oid)))
    return NextResponse.json({ error: 'Invalid option' }, { status: 400 })

  const now      = new Date().toISOString()
  const username = await fetchMemberNick(guildId, session.user.id, session.user.name ?? 'Unknown')
  let votes: Vote[] = []
  if (poll.allowMultiple) {
    for (const optionId of optionIds) {
      const vote: Vote = { pollId: id, userId: session.user.id, username, optionId, timeSlot: body.timeSlot, votedAt: now }
      ;({ votes } = await castVote(vote, true))
    }
  } else {
    const vote: Vote = { pollId: id, userId: session.user.id, username, optionId: optionIds[0], timeSlot: body.timeSlot, votedAt: now }
    ;({ votes } = await castVote(vote, false))
  }

  bgDiscordUpdate(poll, votes, guildId)
  return NextResponse.json({ votes })
}
