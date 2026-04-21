import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getVotesByPoll } from '@/lib/polls'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ guildId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { guildId } = await params
  const votesByPoll = await getVotesByPoll(guildId)
  return NextResponse.json({ votesByPoll })
}
