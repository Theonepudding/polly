import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPolls, createPoll } from '@/lib/polls'
import type { Poll } from '@/types'

type Params = { params: Promise<{ guildId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const polls = await getPolls(guildId)
  return NextResponse.json({ polls })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const body = await req.json()

  if (!body.title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  if (!Array.isArray(body.options) || body.options.length < 2) {
    return NextResponse.json({ error: 'At least 2 options required' }, { status: 400 })
  }

  const poll: Poll = {
    id:               `poll-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    guildId:          guildId,
    title:            body.title.trim(),
    description:      body.description?.trim() || undefined,
    options:          body.options,
    includeTimeSlots: body.includeTimeSlots ?? false,
    timeSlots:        body.timeSlots ?? [],
    isAnonymous:      body.isAnonymous ?? false,
    allowMultiple:    body.allowMultiple ?? false,
    createdBy:        session.user.id,
    createdByName:    session.user.name ?? body.createdByName ?? 'Unknown',
    createdAt:        new Date().toISOString(),
    closesAt:         body.closesAt,
    isClosed:         false,
  }

  await createPoll(poll)
  return NextResponse.json({ poll }, { status: 201 })
}
