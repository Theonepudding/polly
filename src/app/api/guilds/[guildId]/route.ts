import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGuild, upsertGuild, deleteGuild, userCanManage, fetchMemberRoles, isMemberOf } from '@/lib/guilds'
import { deleteGuildPolls, getPolls } from '@/lib/polls'
import { deletePollFromDiscord } from '@/lib/discord-bot'

const DISCORD_API = 'https://discord.com/api/v10'

type Params = { params: Promise<{ guildId: string }> }

async function requireManage(guildId: string, session: { user: { id: string; isBotAdmin?: boolean } }, guild: Awaited<ReturnType<typeof getGuild>>) {
  if (!guild) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((session.user as { isBotAdmin?: boolean }).isBotAdmin) return null
  const memberRoles = await fetchMemberRoles(guildId, session.user.id)
  if (!userCanManage(guild, session.user.id, memberRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (!isBotAdmin && !await isMemberOf(guildId, session.user.id))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(guild)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const guild = await getGuild(guildId)
  const denied = await requireManage(guildId, session as { user: { id: string; isBotAdmin?: boolean } }, guild)
  if (denied) return denied

  const body = await req.json()
  function ch(val: string | undefined | null, fallback: string | undefined): string | undefined {
    return val !== undefined ? (val || undefined) : fallback
  }
  const updated = {
    ...guild!,
    announceChannelId:  ch(body.announceChannelId,  guild!.announceChannelId),
    pollyChannelId:     ch(body.pollyChannelId,     guild!.pollyChannelId),
    dashboardChannelId: ch(body.dashboardChannelId, guild!.dashboardChannelId),
    auditLogChannelId:  ch(body.auditLogChannelId,  guild!.auditLogChannelId),
    adminRoleIds:       body.adminRoleIds   ?? guild!.adminRoleIds,
    creatorRoleIds:     body.creatorRoleIds ?? guild!.creatorRoleIds ?? [],
    voterRoleIds:       body.voterRoleIds   ?? guild!.voterRoleIds,
  }
  await upsertGuild(updated)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const guild = await getGuild(guildId)
  const denied = await requireManage(guildId, session as { user: { id: string; isBotAdmin?: boolean } }, guild)
  if (denied) return denied

  let cleanupDiscord = false
  try { const body = await req.json(); cleanupDiscord = !!body.cleanupDiscord } catch { /* no body */ }

  if (cleanupDiscord && process.env.DISCORD_BOT_TOKEN) {
    const polls = await getPolls(guildId)
    await Promise.all(polls.map(p => deletePollFromDiscord(p).catch(() => {})))
    if (guild?.dashboardChannelId && guild.dashboardMessageId) {
      await fetch(`${DISCORD_API}/channels/${guild.dashboardChannelId}/messages/${guild.dashboardMessageId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      }).catch(() => {})
    }
  }

  await deleteGuildPolls(guildId)
  await deleteGuild(guildId)

  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      })
    } catch (e) {
      console.error('Failed to leave Discord server:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
