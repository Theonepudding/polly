import { getKV } from './kv'
import { ScheduledPoll, Poll } from '@/types'
import { createPoll } from './polls'
import { postPollToDiscord } from './discord-bot'
import { updatePoll } from './polls'

const KEY        = 'scheduled-polls'
const LEGACY_KEY = 'poll-templates'

export async function getScheduledPolls(guildId?: string): Promise<ScheduledPoll[]> {
  try {
    const kv = await getKV()
    if (kv) {
      let raw = await kv.get(KEY)
      if (!raw) {
        // One-time migration from legacy key
        const legacyRaw = await kv.get(LEGACY_KEY)
        if (legacyRaw) {
          await kv.put(KEY, legacyRaw)
          try { await (kv as { delete(k: string): Promise<void> }).delete(LEGACY_KEY) } catch { /* ignore */ }
          raw = legacyRaw
        }
      }
      const all: ScheduledPoll[] = raw ? JSON.parse(raw) : []
      return guildId ? all.filter(t => t.guildId === guildId) : all
    }
  } catch { /* ignore */ }
  return []
}

async function saveScheduledPolls(scheduledPolls: ScheduledPoll[]): Promise<void> {
  const kv = await getKV()
  if (kv) await kv.put(KEY, JSON.stringify(scheduledPolls))
}

export async function getScheduledPoll(id: string): Promise<ScheduledPoll | null> {
  const all = await getScheduledPolls()
  return all.find(t => t.id === id) ?? null
}

export async function createScheduledPoll(scheduledPoll: ScheduledPoll): Promise<void> {
  const all = await getScheduledPolls()
  all.push(scheduledPoll)
  await saveScheduledPolls(all)
}

export async function updateScheduledPoll(id: string, patch: Partial<ScheduledPoll>): Promise<void> {
  const all = await getScheduledPolls()
  const idx = all.findIndex(t => t.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], ...patch }
  await saveScheduledPolls(all)
}

export async function deleteScheduledPoll(id: string): Promise<void> {
  const all = await getScheduledPolls()
  await saveScheduledPolls(all.filter(t => t.id !== id))
}

// Converts a local "YYYY-MM-DD" + "HH:MM" in a given IANA timezone to a UTC Date.
function utcFromLocalTz(dateStr: string, localHHMM: string, timezone: string): Date {
  const initial = new Date(`${dateStr}T${localHHMM}:00Z`)
  const localStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(initial)
  const asUTC = new Date(localStr.replace(' ', 'T') + 'Z')
  const offsetMs = asUTC.getTime() - initial.getTime()
  return new Date(initial.getTime() - offsetMs)
}

export function nextRunAfter(
  base: Date,
  intervalDays: number,
  atHour: number,
  atLocalHHMM?: string,
  timezone?: string,
): Date {
  if (atLocalHHMM && timezone) {
    const nextUTC = new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000)
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(nextUTC)
    return utcFromLocalTz(dateStr, atLocalHHMM, timezone)
  }
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + intervalDays)
  next.setUTCHours(atHour, 0, 0, 0)
  return next
}

export async function runScheduledPoll(scheduledPoll: ScheduledPoll): Promise<Poll> {
  const now      = new Date()
  const closesAt = new Date(now)
  closesAt.setUTCDate(closesAt.getUTCDate() + scheduledPoll.daysOpen)

  const poll: Poll = {
    id:               `poll-${Date.now()}`,
    guildId:          scheduledPoll.guildId,
    title:            scheduledPoll.title,
    description:      scheduledPoll.description,
    options:          scheduledPoll.options,
    includeTimeSlots: scheduledPoll.includeTimeSlots,
    timeSlots:        scheduledPoll.timeSlots,
    isAnonymous:      scheduledPoll.isAnonymous,
    allowMultiple:    scheduledPoll.allowMultiple,
    isGhost:          false,
    createdBy:        scheduledPoll.createdBy,
    createdByName:    scheduledPoll.createdByName,
    createdAt:        now.toISOString(),
    closesAt:         closesAt.toISOString(),
    isClosed:         false,
  }

  await createPoll(poll)

  if (scheduledPoll.postToDiscord) {
    const messageId = await postPollToDiscord(poll).catch(() => null)
    if (messageId) {
      await updatePoll(poll.id, { discordMessageId: messageId })
      poll.discordMessageId = messageId
    }
  }

  const prevRun = new Date(scheduledPoll.nextRunAt)
  const nextRun = nextRunAfter(prevRun, scheduledPoll.intervalDays, scheduledPoll.atHour, scheduledPoll.atLocalHHMM, scheduledPoll.timezone)
  await updateScheduledPoll(scheduledPoll.id, { lastRunAt: now.toISOString(), nextRunAt: nextRun.toISOString() })

  return poll
}

export async function processDueScheduledPolls(): Promise<{ ran: number; pollIds: string[] }> {
  const now  = new Date()
  const all  = await getScheduledPolls()
  const due  = all.filter(t => t.active && new Date(t.nextRunAt) <= now)

  const pollIds: string[] = []
  for (const t of due) {
    try {
      const poll = await runScheduledPoll(t)
      pollIds.push(poll.id)
    } catch (e) {
      console.error(`Failed to run scheduled poll ${t.id}:`, e)
    }
  }

  return { ran: due.length, pollIds }
}
