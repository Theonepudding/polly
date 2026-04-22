import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, updatePoll } from '@/lib/polls'
import { getGuild, userCanManage, fetchMemberRoles } from '@/lib/guilds'
import { deletePollFromDiscord, postPollToDiscord } from '@/lib/discord-bot'

type Params = { params: Promise<{ guildId: string; id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const poll = await getPoll(id)
  if (!poll || poll.guildId !== guildId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isCreator  = session.user.id === poll.createdBy
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (!isCreator && !isBotAdmin) {
    const guild       = await getGuild(guildId)
    const memberRoles = guild ? await fetchMemberRoles(guildId, session.user.id) : []
    if (!guild || !userCanManage(guild, session.user.id, memberRoles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Delete the previous Discord message so we don't leave duplicates
  if (poll.discordMessageId) await deletePollFromDiscord(poll)

  const messageId = await postPollToDiscord(poll)
  if (!messageId) return NextResponse.json({ error: 'Failed to post to Discord' }, { status: 502 })

  await updatePoll(id, { discordMessageId: messageId })
  return NextResponse.json({ messageId })
}
