import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTemplates, createTemplate } from '@/lib/poll-templates'
import type { PollTemplate } from '@/types'

type Params = { params: Promise<{ guildId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { guildId } = await params
  const templates = await getTemplates(guildId)
  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const body = await req.json()
  const now  = new Date()
  const nextRun = new Date(now)
  nextRun.setUTCHours(body.atHour ?? 18, 0, 0, 0)
  if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + (body.intervalDays ?? 7))

  const template: PollTemplate = {
    id:               `tpl-${Date.now()}`,
    guildId:          guildId,
    title:            body.title.trim(),
    description:      body.description?.trim() || undefined,
    options:          body.options,
    includeTimeSlots: body.includeTimeSlots ?? false,
    timeSlots:        body.timeSlots ?? [],
    isAnonymous:      body.isAnonymous ?? false,
    allowMultiple:    body.allowMultiple ?? false,
    daysOpen:         body.daysOpen ?? 7,
    createdBy:        session.user.id,
    createdByName:    session.user.name ?? 'Unknown',
    createdAt:        now.toISOString(),
    intervalDays:     body.intervalDays ?? 7,
    atHour:           body.atHour ?? 18,
    nextRunAt:        nextRun.toISOString(),
    lastRunAt:        null,
    active:           true,
    postToDiscord:    body.postToDiscord ?? true,
  }

  await createTemplate(template)
  return NextResponse.json({ template }, { status: 201 })
}
