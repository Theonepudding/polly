import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes, updatePoll } from '@/lib/polls'
import { postPollToDiscord, updatePollInDiscord } from '@/lib/discord-bot'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isBotAdmin)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const poll = await getPoll(id)
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messageId = await postPollToDiscord(poll)
  if (!messageId)
    return NextResponse.json({ error: 'Discord post failed — bot not configured or channel missing' }, { status: 502 })

  await updatePoll(id, { discordMessageId: messageId })
  return NextResponse.json({ ok: true, messageId })
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isBotAdmin)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [poll, votes] = await Promise.all([getPoll(id), getVotes(id)])
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (poll.discordMessageId) {
    const updated = await updatePollInDiscord(poll, votes)
    if (updated) return NextResponse.json({ ok: true, action: 'updated' })
  }

  const messageId = await postPollToDiscord(poll)
  if (!messageId)
    return NextResponse.json({ error: 'Discord post failed — bot not configured or channel missing' }, { status: 502 })

  await updatePoll(id, { discordMessageId: messageId })
  return NextResponse.json({ ok: true, action: 'posted', messageId })
}
