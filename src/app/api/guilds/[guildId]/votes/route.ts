import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getVotesByPoll } from '@/lib/polls'
import { isMemberOf } from '@/lib/guilds'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ guildId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { guildId } = await params
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (!isBotAdmin && !await isMemberOf(guildId, session.user.id))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const votesByPoll = await getVotesByPoll(guildId)
  return NextResponse.json({ votesByPoll })
}
