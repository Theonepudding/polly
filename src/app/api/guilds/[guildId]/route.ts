import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGuild, upsertGuild } from '@/lib/guilds'

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
    dashboardChannelId: body.dashboardChannelId ?? guild.dashboardChannelId,
    adminRoleIds:       body.adminRoleIds        ?? guild.adminRoleIds,
    voterRoleIds:       body.voterRoleIds        ?? guild.voterRoleIds,
  }
  await upsertGuild(updated)
  return NextResponse.json(updated)
}
