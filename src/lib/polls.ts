import { Poll, Vote, PollsData } from '@/types'
import { getKV } from './kv'

const KEY            = 'polls'
const POLL_KEY       = (id: string)     => `poll:${id}`
const POLL_VOTES_KEY = (pollId: string) => `pv:${pollId}`


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

// ── Per-poll vote keys  pv:{pollId} ───────────────────────────────────────────
// Each poll has its own key so concurrent votes on DIFFERENT polls never race.
// Same-poll concurrent votes are still a theoretical race, but extremely rare
// for a Discord poll bot and require Durable Objects to fully prevent.

async function readPollVotes(pollId: string): Promise<Vote[]> {
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

async function writePollVotes(pollId: string, votes: Vote[]): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  await kv.put(POLL_VOTES_KEY(pollId), JSON.stringify({ votes }))
}

// ── Public poll API ───────────────────────────────────────────────────────────

export async function getPolls(guildId?: string): Promise<Poll[]> {
  const polls   = await readPollsFromKV()
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
  // Individual key first — vote/image handlers can find the poll immediately
  // even before the blob propagates to other edges.
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
  const polls = await readPollsFromKV()
  const len   = polls.length
  const newPolls = polls.filter(p => p.id !== id)
  if (newPolls.length === len) return false
  const kv = await getKV()
  await Promise.all([
    writePollsToKV(newPolls),
    kv ? kv.delete(POLL_VOTES_KEY(id)) : Promise.resolve(),
    kv ? kv.delete(POLL_KEY(id))       : Promise.resolve(),
  ])
  return true
}

export async function deleteGuildPolls(guildId: string): Promise<number> {
  const polls  = await readPollsFromKV()
  const ids    = new Set(polls.filter(p => p.guildId === guildId).map(p => p.id))
  const before = polls.length
  const newPolls = polls.filter(p => p.guildId !== guildId)
  const kv = await getKV()
  await Promise.all([
    writePollsToKV(newPolls),
    kv ? Promise.all([...ids].flatMap(id => [
      kv.delete(POLL_VOTES_KEY(id)),
      kv.delete(POLL_KEY(id)),
    ])) : Promise.resolve(),
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
  const out: Record<string, Vote[]> = {}
  await Promise.all(ids.map(async id => { out[id] = await readPollVotes(id) }))
  return out
}

// ── castVote: reads/writes pv:{pollId} only — never touches the polls key ─────

export async function castVote(vote: Vote, allowMultiple: boolean): Promise<{ voteChanged: boolean; votes: Vote[] }> {
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

  await writePollVotes(vote.pollId, votes)
  return { voteChanged, votes }
}

// ── Compat exports ────────────────────────────────────────────────────────────

export async function readData(): Promise<PollsData> {
  return { polls: await readPollsFromKV(), votes: [] }
}

export async function writeData(data: PollsData): Promise<void> {
  await writePollsToKV(data.polls)
}
