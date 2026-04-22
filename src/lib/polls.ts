import { Poll, Vote, PollsData } from '@/types'
import { getKV } from './kv'
import { getD1 } from './d1'

const KEY            = 'polls'
const POLL_KEY       = (id: string)     => `poll:${id}`
const POLL_VOTES_KEY = (pollId: string) => `pv:${pollId}`

type VoteRow = {
  poll_id: string; user_id: string; option_id: string
  username: string; time_slot: string | null; voted_at: string
}

function rowToVote(r: VoteRow): Vote {
  return {
    pollId:   r.poll_id,
    userId:   r.user_id,
    optionId: r.option_id,
    username: r.username,
    timeSlot: r.time_slot ?? undefined,
    votedAt:  r.voted_at,
  }
}


// ── Polls (read/write polls key only) ─────────────────────────────────────────

async function readPollsFromKV(): Promise<Poll[]> {
  const kv = await getKV()
  if (!kv) return []
  const raw = await kv.get(KEY)
  return raw ? ((JSON.parse(raw) as PollsData).polls ?? []) : []
}

async function writePollsToKV(polls: Poll[]): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  await kv.put(KEY, JSON.stringify({ polls }))
}

// ── Vote reads/writes — D1 primary, KV fallback ───────────────────────────────

async function readPollVotes(pollId: string): Promise<Vote[]> {
  const d1 = await getD1()
  if (d1) {
    const { results } = await d1.prepare('SELECT * FROM votes WHERE poll_id = ?').bind(pollId).all<VoteRow>()
    return results.map(rowToVote)
  }
  // KV fallback when D1 binding is unavailable (local dev, etc.)
  const kv = await getKV()
  if (!kv) return []
  const raw = await kv.get(POLL_VOTES_KEY(pollId))
  if (raw) return (JSON.parse(raw) as { votes: Vote[] }).votes
  // Migration path 1: global votes blob (previous architecture)
  const gRaw = await kv.get('votes')
  if (gRaw) {
    const all = (JSON.parse(gRaw) as { votes: Vote[] }).votes
    const mine = all.filter(v => v.pollId === pollId)
    if (mine.length) return mine
  }
  // Migration path 2: old combined polls+votes blob
  const pRaw = await kv.get(KEY)
  if (pRaw) return ((JSON.parse(pRaw) as PollsData).votes ?? []).filter(v => v.pollId === pollId)
  return []
}

async function writePollVotesKV(pollId: string, votes: Vote[]): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  await kv.put(POLL_VOTES_KEY(pollId), JSON.stringify({ votes }))
}

// ── Public poll API ───────────────────────────────────────────────────────────

export async function getPolls(guildId?: string): Promise<Poll[]> {
  const polls    = await readPollsFromKV()
  const filtered = guildId ? polls.filter(p => p.guildId === guildId) : polls
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getPoll(id: string): Promise<Poll | null> {
  const kv = await getKV()
  if (kv) {
    const raw = await kv.get(POLL_KEY(id))
    if (raw) return JSON.parse(raw) as Poll
  }
  const polls = await readPollsFromKV()
  return polls.find(p => p.id === id) ?? null
}

export async function createPoll(poll: Poll): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  await kv.put(POLL_KEY(poll.id), JSON.stringify(poll))
  const polls = await readPollsFromKV()
  polls.push(poll)
  await writePollsToKV(polls)
}

export async function updatePoll(id: string, patch: Partial<Poll>): Promise<boolean> {
  const polls = await readPollsFromKV()
  const idx   = polls.findIndex(p => p.id === id)
  if (idx === -1) return false
  polls[idx] = { ...polls[idx], ...patch }
  await writePollsToKV(polls)
  const kv = await getKV()
  if (kv) await kv.put(POLL_KEY(id), JSON.stringify(polls[idx]))
  return true
}

export async function deletePoll(id: string): Promise<boolean> {
  const polls    = await readPollsFromKV()
  const len      = polls.length
  const newPolls = polls.filter(p => p.id !== id)
  if (newPolls.length === len) return false
  const [kv, d1] = await Promise.all([getKV(), getD1()])
  await Promise.all([
    writePollsToKV(newPolls),
    kv ? kv.delete(POLL_KEY(id))                                                   : Promise.resolve(),
    kv ? kv.delete(POLL_VOTES_KEY(id))                                             : Promise.resolve(),
    d1 ? d1.prepare('DELETE FROM votes WHERE poll_id = ?').bind(id).run()          : Promise.resolve(),
  ])
  return true
}

export async function deleteGuildPolls(guildId: string): Promise<number> {
  const polls    = await readPollsFromKV()
  const ids      = new Set(polls.filter(p => p.guildId === guildId).map(p => p.id))
  const before   = polls.length
  const newPolls = polls.filter(p => p.guildId !== guildId)
  const [kv, d1] = await Promise.all([getKV(), getD1()])
  await Promise.all([
    writePollsToKV(newPolls),
    kv ? Promise.all([...ids].flatMap(id => [kv.delete(POLL_KEY(id)), kv.delete(POLL_VOTES_KEY(id))])) : Promise.resolve(),
    d1 ? Promise.all([...ids].map(id => d1.prepare('DELETE FROM votes WHERE poll_id = ?').bind(id).run())) : Promise.resolve(),
  ])
  return before - newPolls.length
}

export async function closeExpiredPolls(): Promise<Poll[]> {
  const kv    = await getKV()
  const polls = await readPollsFromKV()
  const now   = new Date()
  const closed: Poll[] = []
  for (const p of polls) {
    if (!p.isClosed && p.closesAt && new Date(p.closesAt) <= now) {
      p.isClosed = true
      closed.push(p)
    }
  }
  if (closed.length) {
    await writePollsToKV(polls)
    if (kv) await Promise.all(closed.map(p => kv.put(POLL_KEY(p.id), JSON.stringify(p))))
  }
  return closed
}

export async function getPollsNeedingReminder(): Promise<Poll[]> {
  const polls = await readPollsFromKV()
  const now   = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return polls.filter(p =>
    !p.isClosed && !p.reminderSent && p.closesAt &&
    new Date(p.closesAt) <= in24h && new Date(p.closesAt) > now
  )
}

// ── Public vote API ───────────────────────────────────────────────────────────

export async function getVotes(pollId: string, cachedData?: PollsData): Promise<Vote[]> {
  if (cachedData) return cachedData.votes.filter(v => v.pollId === pollId)
  return readPollVotes(pollId)
}

export async function getUserVotes(pollId: string, userId: string): Promise<Vote[]> {
  const d1 = await getD1()
  if (d1) {
    const { results } = await d1.prepare(
      'SELECT * FROM votes WHERE poll_id = ? AND user_id = ?'
    ).bind(pollId, userId).all<VoteRow>()
    return results.map(rowToVote)
  }
  const votes = await readPollVotes(pollId)
  return votes.filter(v => v.userId === userId)
}

export async function getPollsAndVotes(guildId: string): Promise<{ polls: Poll[]; votesByPoll: Record<string, Vote[]> }> {
  const polls      = await readPollsFromKV()
  const guildPolls = polls
    .filter(p => p.guildId === guildId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const votesByPoll: Record<string, Vote[]> = {}
  await Promise.all(guildPolls.map(async p => {
    votesByPoll[p.id] = await readPollVotes(p.id)
  }))
  return { polls: guildPolls, votesByPoll }
}

export async function getVotesByPoll(guildId: string): Promise<Record<string, Vote[]>> {
  const polls = await readPollsFromKV()
  const ids   = polls.filter(p => p.guildId === guildId).map(p => p.id)

  const d1 = await getD1()
  if (d1 && ids.length) {
    const placeholders = ids.map(() => '?').join(', ')
    const { results } = await d1.prepare(
      `SELECT * FROM votes WHERE poll_id IN (${placeholders})`
    ).bind(...ids).all<VoteRow>()
    const out: Record<string, Vote[]> = Object.fromEntries(ids.map(id => [id, []]))
    for (const row of results) {
      out[row.poll_id] ??= []
      out[row.poll_id].push(rowToVote(row))
    }
    return out
  }

  const out: Record<string, Vote[]> = {}
  await Promise.all(ids.map(async id => { out[id] = await readPollVotes(id) }))
  return out
}

// ── castVote — D1 primary, KV fallback ────────────────────────────────────────

export async function castVote(vote: Vote, allowMultiple: boolean): Promise<{ voteChanged: boolean; votes: Vote[] }> {
  const d1 = await getD1()

  if (d1) {
    let voteChanged = false

    if (allowMultiple) {
      await d1.prepare(`
        INSERT INTO votes (poll_id, user_id, option_id, username, time_slot, voted_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(poll_id, user_id, option_id) DO UPDATE SET
          username  = excluded.username,
          time_slot = excluded.time_slot,
          voted_at  = excluded.voted_at
      `).bind(vote.pollId, vote.userId, vote.optionId, vote.username, vote.timeSlot ?? null, vote.votedAt).run()
    } else {
      const existing = await d1.prepare(
        'SELECT option_id FROM votes WHERE poll_id = ? AND user_id = ?'
      ).bind(vote.pollId, vote.userId).first<{ option_id: string }>()

      voteChanged = !!existing && existing.option_id !== vote.optionId

      if (existing) {
        await d1.prepare(
          'UPDATE votes SET option_id = ?, username = ?, time_slot = ?, voted_at = ? WHERE poll_id = ? AND user_id = ?'
        ).bind(vote.optionId, vote.username, vote.timeSlot ?? null, vote.votedAt, vote.pollId, vote.userId).run()
      } else {
        await d1.prepare(
          'INSERT INTO votes (poll_id, user_id, option_id, username, time_slot, voted_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(vote.pollId, vote.userId, vote.optionId, vote.username, vote.timeSlot ?? null, vote.votedAt).run()
      }
    }

    const votes = await readPollVotes(vote.pollId)
    return { voteChanged, votes }
  }

  // KV fallback
  const votes     = await readPollVotes(vote.pollId)
  let voteChanged = false

  if (allowMultiple) {
    const idx = votes.findIndex(
      v => v.pollId === vote.pollId && v.userId === vote.userId && v.optionId === vote.optionId
    )
    if (idx !== -1) votes[idx] = vote
    else votes.push(vote)
  } else {
    const idx = votes.findIndex(v => v.pollId === vote.pollId && v.userId === vote.userId)
    if (idx !== -1) {
      voteChanged = votes[idx].optionId !== vote.optionId
      votes[idx]  = vote
    } else {
      votes.push(vote)
    }
  }

  await writePollVotesKV(vote.pollId, votes)
  return { voteChanged, votes }
}

// ── Compat exports ────────────────────────────────────────────────────────────

export async function readData(): Promise<PollsData> {
  return { polls: await readPollsFromKV(), votes: [] }
}

export async function writeData(data: PollsData): Promise<void> {
  await writePollsToKV(data.polls)
}
