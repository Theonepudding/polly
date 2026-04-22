import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getScheduledPolls, updateScheduledPoll, deleteScheduledPoll, runScheduledPoll, getScheduledPoll } from '@/lib/scheduled-polls'
import { getGuild, userCanManage, fetchMemberRoles } from '@/lib/guilds'
import { postAuditLog } from '@/lib/discord-bot'

type Params = { params: Promise<{ guildId: string; id: string }> }

async function requireManageSP(guildId: string, session: { user: { id: string } }) {
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (isBotAdmin) return null
  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Guild not found' }, { status: 404 })
  const memberRoles = await fetchMemberRoles(guildId, session.user.id)
  if (!userCanManage(guild, session.user.id, memberRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const denied = await requireManageSP(guildId, session as { user: { id: string } })
  if (denied) return denied

  const patch = await req.json()
  await updateScheduledPoll(id, patch)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const denied = await requireManageSP(guildId, session as { user: { id: string } })
  if (denied) return denied

  const scheduledPoll = await getScheduledPoll(id)
  await deleteScheduledPoll(id)

  if (scheduledPoll) {
    const guild = await getGuild(guildId)
    if (guild) {
      await postAuditLog(
        guild,
        'Schedule deleted',
        `**${scheduledPoll.title}**`,
        session.user.name ?? 'Unknown',
      )
    }
  }

  return NextResponse.json({ ok: true })
}

// POST to run immediately
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const denied = await requireManageSP(guildId, session as { user: { id: string } })
  if (denied) return denied
  const all         = await getScheduledPolls(guildId)
  const scheduledPoll = all.find(t => t.id === id)
  if (!scheduledPoll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const poll = await runScheduledPoll(scheduledPoll)
  return NextResponse.json({ poll })
}
