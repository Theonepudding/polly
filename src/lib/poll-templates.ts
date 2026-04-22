import { getKV } from './kv'
import { PollTemplate, Poll } from '@/types'
import { createPoll } from './polls'
import { postPollToDiscord } from './discord-bot'
import { updatePoll } from './polls'

const KEY = 'poll-templates'

export async function getTemplates(guildId?: string): Promise<PollTemplate[]> {
  try {
    const kv = await getKV()
    if (kv) {
      const raw = await kv.get(KEY)
      const all: PollTemplate[] = raw ? JSON.parse(raw) : []
      return guildId ? all.filter(t => t.guildId === guildId) : all
    }
  } catch { /* ignore */ }
  return []
}

async function saveTemplates(templates: PollTemplate[]): Promise<void> {
  const kv = await getKV()
  if (kv) await kv.put(KEY, JSON.stringify(templates))
}

export async function getTemplate(id: string): Promise<PollTemplate | null> {
  const all = await getTemplates()
  return all.find(t => t.id === id) ?? null
}

export async function createTemplate(template: PollTemplate): Promise<void> {
  const all = await getTemplates()
  all.push(template)
  await saveTemplates(all)
}

export async function updateTemplate(id: string, patch: Partial<PollTemplate>): Promise<void> {
  const all = await getTemplates()
  const idx = all.findIndex(t => t.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], ...patch }
  await saveTemplates(all)
}

export async function deleteTemplate(id: string): Promise<void> {
  const all = await getTemplates()
  await saveTemplates(all.filter(t => t.id !== id))
}

// Converts a local "YYYY-MM-DD" + "HH:MM" in a given IANA timezone to a UTC Date.
function utcFromLocalTz(dateStr: string, localHHMM: string, timezone: string): Date {
  // Treat the target local time as if it were UTC, then measure the TZ offset
  // at that instant and subtract it to arrive at the true UTC moment.
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
    // DST-aware: advance by intervalDays (in UTC ms), then get the local date
    // in the user's timezone and recompute the correct UTC time for that local hour.
    const nextUTC = new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000)
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(nextUTC)
    return utcFromLocalTz(dateStr, atLocalHHMM, timezone)
  }
  // Legacy fallback: plain UTC arithmetic (no DST correction)
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + intervalDays)
  next.setUTCHours(atHour, 0, 0, 0)
  return next
}

export async function runTemplate(template: PollTemplate): Promise<Poll> {
  const now      = new Date()
  const closesAt = new Date(now)
  closesAt.setUTCDate(closesAt.getUTCDate() + template.daysOpen)

  const poll: Poll = {
    id:               `poll-${Date.now()}`,
    guildId:          template.guildId,
    title:            template.title,
    description:      template.description,
    options:          template.options,
    includeTimeSlots: template.includeTimeSlots,
    timeSlots:        template.timeSlots,
    isAnonymous:      template.isAnonymous,
    allowMultiple:    template.allowMultiple,
    createdBy:        template.createdBy,
    createdByName:    template.createdByName,
    createdAt:        now.toISOString(),
    closesAt:         closesAt.toISOString(),
    isClosed:         false,
  }

  await createPoll(poll)

  if (template.postToDiscord) {
    const messageId = await postPollToDiscord(poll).catch(() => null)
    if (messageId) {
      await updatePoll(poll.id, { discordMessageId: messageId })
      poll.discordMessageId = messageId
    }
  }

  const prevRun = new Date(template.nextRunAt)
  const nextRun = nextRunAfter(prevRun, template.intervalDays, template.atHour, template.atLocalHHMM, template.timezone)
  await updateTemplate(template.id, { lastRunAt: now.toISOString(), nextRunAt: nextRun.toISOString() })

  return poll
}

export async function processDueTemplates(): Promise<{ ran: number; pollIds: string[] }> {
  const now       = new Date()
  const templates = await getTemplates()
  const due       = templates.filter(t => t.active && new Date(t.nextRunAt) <= now)

  const pollIds: string[] = []
  for (const t of due) {
    try {
      const poll = await runTemplate(t)
      pollIds.push(poll.id)
    } catch (e) {
      console.error(`Failed to run template ${t.id}:`, e)
    }
  }

  return { ran: due.length, pollIds }
}
