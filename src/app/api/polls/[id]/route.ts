import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, updatePoll, deletePoll, getVotes } from '@/lib/polls'
import { updatePollInDiscord, deletePollFromDiscord } from '@/lib/discord-bot'

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
    const updated = await getPoll(id)
    const votes   = await getVotes(id)
    if (updated) updatePollInDiscord(updated, votes).catch(() => {})
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
  return NextResponse.json({ ok: true })
}
