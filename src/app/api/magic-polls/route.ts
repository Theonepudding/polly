import { NextRequest, NextResponse } from 'next/server'
import { getKV } from '@/lib/kv'
import { getGuild, userCanCreate } from '@/lib/guilds'
import { createPoll, updatePoll } from '@/lib/polls'
import { postPollToDiscord, postAuditLog, refreshDashboard } from '@/lib/discord-bot'
import type { Poll } from '@/types'

export const dynamic = 'force-dynamic'

interface MagicTokenData {
  userId:   string
  guildId:  string
  username: string
}

async function consumeToken(token: string): Promise<MagicTokenData | null> {
  const kv = await getKV()
  if (!kv) return null
  const raw = await kv.get(`magic:${token}`)
  if (!raw) return null
  await kv.delete(`magic:${token}`)
  return JSON.parse(raw) as MagicTokenData
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { token, title, options, description, closesAt, isAnonymous, allowMultiple, includeTimeSlots, timeSlots } = body

  if (!token || typeof token !== 'string')
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  if (!title?.trim())
    return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!Array.isArray(options) || options.length < 2)
    return NextResponse.json({ error: 'At least 2 options required' }, { status: 400 })

  const data = await consumeToken(token)
  if (!data) return NextResponse.json({ error: 'Link expired or already used' }, { status: 401 })

  const { userId, guildId, username } = data

  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Server not found' }, { status: 404 })

  // Permission check using the Discord bot token (no user OAuth needed)
  let memberRoles: string[] = []
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      const res = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        cache: 'no-store',
      })
      if (res.ok) memberRoles = (await res.json()).roles ?? []
    } catch { /* fall through */ }
  }
  if (!userCanCreate(guild, userId, memberRoles))
    return NextResponse.json({ error: 'You do not have permission to create polls on this server.' }, { status: 403 })

  const poll: Poll = {
    id:               `poll-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    guildId,
    title:            title.trim(),
    description:      description?.trim() || undefined,
    options,
    includeTimeSlots: includeTimeSlots ?? false,
    timeSlots:        timeSlots ?? [],
    isAnonymous:      isAnonymous ?? false,
    allowMultiple:    allowMultiple ?? false,
    isGhost:          false,
    createdBy:        userId,
    createdByName:    username,
    createdAt:        new Date().toISOString(),
    closesAt,
    isClosed:         false,
  }

  await createPoll(poll)

  let posted = false
  if (guild.announceChannelId) {
    const messageId = await postPollToDiscord(poll)
    if (messageId) {
      await updatePoll(poll.id, { discordMessageId: messageId, discordChannelId: guild.announceChannelId })
      poll.discordMessageId = messageId
      poll.discordChannelId = guild.announceChannelId
      posted = true
    }
  }

  await Promise.allSettled([
    postAuditLog(guild, 'Poll created', `**${poll.title}** (via magic link)`, username),
    refreshDashboard(guildId, { newPoll: poll }),
  ])

  return NextResponse.json({ poll, posted }, { status: 201 })
}
