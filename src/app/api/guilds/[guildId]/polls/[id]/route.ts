import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, updatePoll, deletePoll, getVotes } from '@/lib/polls'
import { updatePollInDiscord, deletePollFromDiscord, postPollResults, postAuditLog, refreshDashboard } from '@/lib/discord-bot'
import { getGuild, userCanManage, fetchMemberRoles } from '@/lib/guilds'

type Params = { params: Promise<{ guildId: string; id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { guildId, id } = await params
  const poll = await getPoll(id)
  if (!poll || poll.guildId !== guildId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const votes = await getVotes(id)
  return NextResponse.json({ poll, votes })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const poll = await getPoll(id)
  if (!poll || poll.guildId !== guildId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isCreator  = session.user.id === poll.createdBy
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (!isCreator && !isBotAdmin) {
    const guild      = await getGuild(guildId)
    const memberRoles = guild ? await fetchMemberRoles(guildId, session.user.id) : []
    if (!guild || !userCanManage(guild, session.user.id, memberRoles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body  = await req.json()
  const patch = { ...body }
  delete patch.id
  delete patch.guildId

  const wasClosing = patch.isClosed === true && !poll.isClosed

  await updatePoll(id, patch)
  const updated = await getPoll(id)

  if (updated) {
    const votes = await getVotes(id)

    if (wasClosing) {
      // Force isClosed: true — KV read-after-write can lag, so updated.isClosed may still be false
      await updatePollInDiscord({ ...updated, isClosed: true }, votes).catch(() => {})
      const guild = await getGuild(guildId)
      if (guild) {
        const winner = votes.length > 0
          ? updated.options.reduce((b, o) =>
              votes.filter(v => v.optionId === o.id).length > votes.filter(v => v.optionId === b.id).length ? o : b,
              updated.options[0])
          : null
        await Promise.allSettled([
          postPollResults(updated, votes, guild),
          postAuditLog(
            guild,
            'Poll closed',
            `**[${updated.title}](${process.env.NEXTAUTH_URL}/p/${updated.id})**\n${votes.length} vote${votes.length !== 1 ? 's' : ''}${winner ? ` · winner: **${winner.text}**` : ''}`,
            session.user.name ?? 'Unknown',
          ),
          refreshDashboard(guildId),
        ])
      }
    } else {
      updatePollInDiscord(updated, votes).catch(() => {})
    }
  }

  return NextResponse.json({ poll: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const [poll, guild] = await Promise.all([getPoll(id), getGuild(guildId)])
  if (!poll || poll.guildId !== guildId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isCreator  = session.user.id === poll.createdBy
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (!isCreator && !isBotAdmin) {
    const memberRoles = guild ? await fetchMemberRoles(guildId, session.user.id) : []
    if (!guild || !userCanManage(guild, session.user.id, memberRoles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  await deletePollFromDiscord(poll).catch(() => {})
  await deletePoll(id)

  if (guild) {
    await Promise.allSettled([
      postAuditLog(
        guild,
        'Poll deleted',
        `**${poll.title}**`,
        session.user.name ?? 'Unknown',
      ),
      refreshDashboard(guildId),
    ])
  }

  return NextResponse.json({ ok: true })
}
