import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getScheduledPolls, createScheduledPoll } from '@/lib/scheduled-polls'
import { getGuild, userCanCreate, fetchMemberRoles, isMemberOf } from '@/lib/guilds'
import { postAuditLog } from '@/lib/discord-bot'
import type { ScheduledPoll } from '@/types'

type Params = { params: Promise<{ guildId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { guildId } = await params
  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (!isBotAdmin && !await isMemberOf(guildId, session.user.id))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const scheduledPolls = await getScheduledPolls(guildId)
  return NextResponse.json({ scheduledPolls })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params

  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Guild not found' }, { status: 404 })

  const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
  if (!isBotAdmin) {
    const memberRoles = await fetchMemberRoles(guildId, session.user.id)
    if (!userCanCreate(guild, session.user.id, memberRoles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const now  = new Date()

  // Trust the client-computed nextRunAt (it has the correct local→UTC conversion).
  // Only fall back to server-side computation if the client didn't send one.
  let nextRunAt: string
  if (body.nextRunAt) {
    nextRunAt = body.nextRunAt
  } else {
    const nextRun = new Date(now)
    nextRun.setUTCHours(body.atHour ?? 18, 0, 0, 0)
    if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + (body.intervalDays ?? 7))
    nextRunAt = nextRun.toISOString()
  }

  const scheduledPoll: ScheduledPoll = {
    id:               `sched-${Date.now()}`,
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
    ...(body.atLocalHHMM ? { atLocalHHMM: body.atLocalHHMM } : {}),
    ...(body.timezone    ? { timezone:    body.timezone    } : {}),
    nextRunAt,
    lastRunAt:        null,
    active:           true,
    postToDiscord:    body.postToDiscord ?? true,
  }

  await createScheduledPoll(scheduledPoll)
  if (guild) {
    const interval = `every ${scheduledPoll.intervalDays === 1 ? 'day' : `${scheduledPoll.intervalDays} days`}`
    await postAuditLog(
      guild,
      'Schedule created',
      `**${scheduledPoll.title}** — ${interval}, ${scheduledPoll.daysOpen}d open`,
      session.user.name ?? 'Unknown',
    )
  }

  return NextResponse.json({ scheduledPoll }, { status: 201 })
}
