import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGuild, upsertGuild } from '@/lib/guilds'
import { getPolls } from '@/lib/polls'
import { postOrUpdateDashboard } from '@/lib/discord-bot'

interface Params { params: { guildId: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guild = await getGuild(params.guildId)
  if (!guild) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!guild.dashboardChannelId) {
    return NextResponse.json({ error: 'Dashboard channel not configured' }, { status: 400 })
  }

  const activePolls = (await getPolls(params.guildId)).filter(p => !p.isClosed)
  const messageId   = await postOrUpdateDashboard(guild, activePolls)
  if (!messageId) return NextResponse.json({ error: 'Failed to post dashboard' }, { status: 502 })

  await upsertGuild({ ...guild, dashboardMessageId: messageId })
  return NextResponse.json({ messageId })
}
