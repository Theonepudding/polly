import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, updatePoll, deletePoll, getVotes } from '@/lib/polls'
import { updatePollInDiscord, deletePollFromDiscord } from '@/lib/discord-bot'

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

  const body  = await req.json()
  const patch = { ...body }
  delete patch.id
  delete patch.guildId

  await updatePoll(id, patch)
  const updated = await getPoll(id)

  if (patch.isClosed !== undefined && updated) {
    const votes = await getVotes(id)
    await updatePollInDiscord(updated, votes).catch(() => {})
  }

  return NextResponse.json({ poll: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const poll = await getPoll(id)
  if (!poll || poll.guildId !== guildId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await deletePollFromDiscord(poll).catch(() => {})
  await deletePoll(id)
  return NextResponse.json({ ok: true })
}
