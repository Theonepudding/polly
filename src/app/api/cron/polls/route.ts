import { NextResponse } from 'next/server'
import { processDueScheduledPolls } from '@/lib/scheduled-polls'
import { closeExpiredPolls, getPollsNeedingReminder, getVotes, updatePoll } from '@/lib/polls'
import { getGuild } from '@/lib/guilds'
import { postPollResults, sendReminderPing, postAuditLog, refreshDashboard } from '@/lib/discord-bot'

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // 1. Run scheduled templates
  const templateResult = await processDueScheduledPolls()

  // 2. Close expired polls
  const expiredPolls = await closeExpiredPolls()
  const closedIds: string[] = []
  for (const poll of expiredPolls) {
    try {
      const [votes, guild] = await Promise.all([
        getVotes(poll.id),
        getGuild(poll.guildId),
      ])
      if (guild) {
        await postPollResults(poll, votes, guild).catch(() => {})
        await postAuditLog(guild, 'Poll auto-closed', `**${poll.title}** — ${votes.length} vote${votes.length !== 1 ? 's' : ''}`).catch(() => {})
      }
      closedIds.push(poll.id)
    } catch (e) {
      console.error(`Failed to process expired poll ${poll.id}:`, e)
    }
  }
  // Refresh dashboard for every guild that had polls close, passing IDs so
  // stale KV reads don't resurrect the just-closed polls as still active
  const closedByGuild = new Map<string, string[]>()
  for (const poll of expiredPolls) {
    const arr = closedByGuild.get(poll.guildId) ?? []
    arr.push(poll.id)
    closedByGuild.set(poll.guildId, arr)
  }
  await Promise.allSettled(
    [...closedByGuild.entries()].map(([gid, ids]) => refreshDashboard(gid, { closedPollIds: ids }))
  )

  // 3. Send 24h reminders
  const pollsForReminder = await getPollsNeedingReminder()
  const reminderIds: string[] = []
  for (const poll of pollsForReminder) {
    try {
      const guild = await getGuild(poll.guildId)
      if (guild) {
        await sendReminderPing(poll, guild)
        await updatePoll(poll.id, { reminderSent: true })
        reminderIds.push(poll.id)
      }
    } catch (e) {
      console.error(`Failed to send reminder for poll ${poll.id}:`, e)
    }
  }

  return NextResponse.json({
    ok: true,
    templates: templateResult,
    closed: closedIds.length,
    closedIds,
    reminders: reminderIds.length,
    reminderIds,
  })
}
