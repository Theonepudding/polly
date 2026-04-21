import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes, updatePoll } from '@/lib/polls'
import { postPollToDiscord } from '@/lib/discord-bot'

type Params = { params: Promise<{ guildId: string; id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const poll = await getPoll(id)
  if (!poll || poll.guildId !== guildId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messageId = await postPollToDiscord(poll)
  if (!messageId) return NextResponse.json({ error: 'Failed to post to Discord' }, { status: 502 })

  await updatePoll(id, { discordMessageId: messageId })
  return NextResponse.json({ messageId })
}
