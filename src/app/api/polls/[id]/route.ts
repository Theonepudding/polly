import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, updatePoll, deletePoll, getVotes } from '@/lib/polls'
import { updatePollInDiscord, deletePollFromDiscord, postPollResults, postAuditLog, refreshDashboard } from '@/lib/discord-bot'
import { getGuild } from '@/lib/guilds'

type Params = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Params) {
  const { id } = await params
  const poll   = await getPoll(id)
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const votes = await getVotes(id)
  return NextResponse.json({ poll, votes })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id }  = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const poll = await getPoll(id)
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isCreator  = session.user.id === poll.createdBy
  const isBotAdmin = session.user.isBotAdmin
  if (!isCreator && !isBotAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const patch = await req.json()
  delete patch.id; delete patch.guildId
  await updatePoll(id, patch)

  if (patch.isClosed) {
    const [updated, votes] = await Promise.all([getPoll(id), getVotes(id)])
    if (updated) {
      await updatePollInDiscord({ ...updated, isClosed: true }, votes).catch(() => {})
      const guild = await getGuild(updated.guildId)
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
          refreshDashboard(updated.guildId, { closedPollIds: [id] }),
        ])
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: Params) {
  const { id }  = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const poll = await getPoll(id)
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isCreator  = session.user.id === poll.createdBy
  if (!isCreator && !session.user.isBotAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await deletePollFromDiscord(poll).catch(() => {})
  await deletePoll(id)
  const guild = await getGuild(poll.guildId)
  if (guild) {
    await Promise.allSettled([
      postAuditLog(
        guild,
        'Poll deleted',
        `**${poll.title}**`,
        session.user.name ?? 'Unknown',
      ),
      refreshDashboard(poll.guildId, { deletedPollIds: [poll.id] }),
    ])
  }
  return NextResponse.json({ ok: true })
}
