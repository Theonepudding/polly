import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPolls, createPoll, updatePoll } from '@/lib/polls'
import { getGuild, userCanCreate } from '@/lib/guilds'
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

  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Guild not found' }, { status: 404 })

  // Enforce creator role restrictions
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (!isBotAdmin) {
    let memberRoles: string[] = []
    if (process.env.DISCORD_BOT_TOKEN) {
      try {
        const res = await fetch(`https://discord.com/api/guilds/${guildId}/members/${session.user.id}`, {
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
          cache: 'no-store',
        })
        if (res.ok) memberRoles = (await res.json()).roles ?? []
      } catch { /* ignore — fall through to role check with empty roles */ }
    }
    if (!userCanCreate(guild, session.user.id, memberRoles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
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

  // Write to KV before posting to Discord so the poll exists when Discord
  // delivers the message and users click vote buttons or the image is fetched.
  await createPoll(poll)

  const hasChannel = !!(guild.announceChannelId || poll.overrideChannelId)
  let posted = false
  if (hasChannel) {
    const messageId = await postPollToDiscord(poll)
    if (messageId) {
      const channelId = poll.overrideChannelId ?? guild.announceChannelId
      await updatePoll(poll.id, { discordMessageId: messageId, discordChannelId: channelId })
      poll.discordMessageId = messageId
      poll.discordChannelId = channelId
      posted = true
    }
  }

  await Promise.allSettled([
    postAuditLog(
      guild,
      'Poll created',
      `**[${poll.title}](${process.env.NEXTAUTH_URL}/p/${poll.id})**\n${poll.options.length} options · ${poll.closesAt ? `closes <t:${Math.floor(new Date(poll.closesAt).getTime() / 1000)}:R>` : 'no close date'}`,
      session.user.name ?? 'Unknown',
    ),
    refreshDashboard(guildId),
  ])

  const postedChannelId = posted ? (poll.overrideChannelId ?? guild.announceChannelId ?? null) : null
  return NextResponse.json({ poll, posted, hasChannel, postedChannelId }, { status: 201 })
}
