import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes, updatePoll } from '@/lib/polls'
import { getGuild, userCanManage } from '@/lib/guilds'
import { buildPollEmbeds, buildPollComponents } from '@/lib/discord-bot'

type Params = { params: Promise<{ guildId: string; id: string }> }

const DISCORD_API = 'https://discord.com/api/v10'

function botHeaders() {
  return {
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params

  const [poll, guild] = await Promise.all([getPoll(id), getGuild(guildId)])
  if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
  if (!guild) return NextResponse.json({ error: 'Guild not found' }, { status: 404 })
  if (poll.isClosed) return NextResponse.json({ error: 'Poll is already closed' }, { status: 400 })

  if (poll.lastReminderAt) {
    const msAgo = Date.now() - new Date(poll.lastReminderAt).getTime()
    const cooldownMs = 24 * 60 * 60 * 1000
    if (msAgo < cooldownMs) {
      const msLeft = cooldownMs - msAgo
      const hLeft  = Math.floor(msLeft / 3_600_000)
      const mLeft  = Math.floor((msLeft % 3_600_000) / 60_000)
      return NextResponse.json(
        { error: `Reminder on cooldown`, cooldownMs, lastReminderAt: poll.lastReminderAt, hLeft, mLeft },
        { status: 429 },
      )
    }
  }

  const userId    = session.user.id
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  const isCreator = userId === poll.createdBy

  if (!isCreator && !isBotAdmin) {
    let memberRoles: string[] = []
    if (process.env.DISCORD_BOT_TOKEN) {
      try {
        const res = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
          cache: 'no-store',
        })
        if (res.ok) memberRoles = (await res.json()).roles ?? []
      } catch { /* ignore */ }
    }
    if (!userCanManage(guild, userId, memberRoles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
  }

  const channelId = poll.discordChannelId ?? poll.overrideChannelId ?? guild.announceChannelId
  if (!channelId) return NextResponse.json({ error: 'No announcement channel configured' }, { status: 400 })

  const votes = await getVotes(id)

  // Delete the existing embed so the reminder isn't a duplicate
  if (poll.discordMessageId) {
    await fetch(`${DISCORD_API}/channels/${channelId}/messages/${poll.discordMessageId}`, {
      method: 'DELETE', headers: botHeaders(),
    }).catch(() => {})
  }

  const pingRoles = poll.pingRoleIds?.length
    ? poll.pingRoleIds.map(r => `<@&${r}>`).join(' ') + ' '
    : ''

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method:  'POST',
    headers: botHeaders(),
    body:    JSON.stringify({
      content:    `${pingRoles}📣 **Reminder — don't forget to vote!**`,
      embeds:     buildPollEmbeds(poll, votes),
      components: buildPollComponents(poll),
      allowed_mentions: poll.pingRoleIds?.length
        ? { roles: poll.pingRoleIds }
        : { parse: [] },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[remind] Discord error:', err)
    return NextResponse.json({ error: 'Failed to post to Discord' }, { status: res.status })
  }

  const { id: newMsgId } = await res.json() as { id: string }
  const now = new Date().toISOString()
  await updatePoll(id, { discordMessageId: newMsgId, discordChannelId: channelId, lastReminderAt: now })

  return NextResponse.json({ ok: true, lastReminderAt: now })
}
