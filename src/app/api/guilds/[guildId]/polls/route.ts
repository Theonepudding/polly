import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPolls, createPoll, updatePoll } from '@/lib/polls'
import { getGuild } from '@/lib/guilds'
import { postPollToDiscord, postAuditLog, refreshDashboard } from '@/lib/discord-bot'
import type { Poll } from '@/types'

type Params = { params: Promise<{ guildId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const polls = await getPolls(guildId)
  return NextResponse.json({ polls })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const body = await req.json()

  if (!body.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!Array.isArray(body.options) || body.options.length < 2) {
    return NextResponse.json({ error: 'At least 2 options required' }, { status: 400 })
  }

  const poll: Poll = {
    id:               `poll-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    guildId:          guildId,
    title:            body.title.trim(),
    description:      body.description?.trim() || undefined,
    options:          body.options,
    includeTimeSlots: body.includeTimeSlots ?? false,
    timeSlots:        body.timeSlots ?? [],
    isAnonymous:      body.isAnonymous ?? false,
    allowMultiple:    body.allowMultiple ?? false,
    createdBy:        session.user.id,
    createdByName:    session.user.name ?? body.createdByName ?? 'Unknown',
    createdAt:        new Date().toISOString(),
    closesAt:         body.closesAt,
    isClosed:         false,
    pingRoleIds:      body.pingRoleIds?.length ? body.pingRoleIds : undefined,
    overrideChannelId: body.overrideChannelId || undefined,
  }

  await createPoll(poll)

  const guild = await getGuild(guildId)
  const hasChannel = !!(guild?.announceChannelId || poll.overrideChannelId)
  let posted = false
  if (hasChannel) {
    const messageId = await postPollToDiscord(poll)
    if (messageId) {
      await updatePoll(poll.id, {
        discordMessageId: messageId,
        discordChannelId: poll.overrideChannelId ?? guild?.announceChannelId,
      })
      posted = true
    }
  }

  if (guild) {
    postAuditLog(
      guild,
      'Poll created',
      `**[${poll.title}](${process.env.NEXTAUTH_URL}/p/${poll.id})**\n${poll.options.length} options · ${poll.closesAt ? `closes <t:${Math.floor(new Date(poll.closesAt).getTime() / 1000)}:R>` : 'no close date'}`,
      session.user.name ?? 'Unknown',
    ).catch(() => {})
    refreshDashboard(guildId).catch(() => {})
  }

  return NextResponse.json({ poll, posted, hasChannel }, { status: 201 })
}
