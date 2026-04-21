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

export function nextRunAfter(base: Date, intervalDays: number, atHour: number): Date {
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
  const nextRun = nextRunAfter(prevRun, template.intervalDays, template.atHour)
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
