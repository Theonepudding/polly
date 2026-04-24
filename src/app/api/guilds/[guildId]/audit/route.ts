import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGuild, getAuditEvents, userCanManage, fetchMemberRoles, isMemberOf } from '@/lib/guilds'

type Params = { params: Promise<{ guildId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin

  if (!isBotAdmin && !await isMemberOf(guildId, session.user.id))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!isBotAdmin) {
    const memberRoles = await fetchMemberRoles(guildId, session.user.id)
    if (!userCanManage(guild, session.user.id, memberRoles))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const events = await getAuditEvents(guildId)
  return NextResponse.json(events)
}
