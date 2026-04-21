import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGuild, upsertGuild, deleteGuild } from '@/lib/guilds'
import { deleteGuildPolls } from '@/lib/polls'

const DISCORD_API = 'https://discord.com/api/v10'

type Params = { params: Promise<{ guildId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(guild)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = {
    ...guild,
    announceChannelId:  body.announceChannelId  ?? guild.announceChannelId,
    pollyChannelId:     body.pollyChannelId     ?? guild.pollyChannelId,
    dashboardChannelId: body.dashboardChannelId ?? guild.dashboardChannelId,
    auditLogChannelId:  body.auditLogChannelId  !== undefined ? (body.auditLogChannelId || undefined) : guild.auditLogChannelId,
    adminRoleIds:       body.adminRoleIds        ?? guild.adminRoleIds,
    voterRoleIds:       body.voterRoleIds        ?? guild.voterRoleIds,
  }
  await upsertGuild(updated)
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params

  // Delete all polls + votes for this guild from KV
  await deleteGuildPolls(guildId)

  // Delete guild config from KV
  await deleteGuild(guildId)

  // Make the bot leave the Discord server
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
