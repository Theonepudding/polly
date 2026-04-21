import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTemplates, createTemplate } from '@/lib/poll-templates'
import { getGuild } from '@/lib/guilds'
import { postAuditLog } from '@/lib/discord-bot'
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
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

  const guild = await getGuild(guildId)
  if (guild) {
    const interval = `every ${template.intervalDays === 1 ? 'day' : `${template.intervalDays} days`}`
    await postAuditLog(
      guild,
      'Schedule created',
      `**${template.title}** — ${interval}, ${template.daysOpen}d open`,
      session.user.name ?? 'Unknown',
    )
  }

  return NextResponse.json({ template }, { status: 201 })
}
