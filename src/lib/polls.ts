import { Poll, Vote, PollsData } from '@/types'
import { getKV } from './kv'

const KEY       = 'polls'
const VOTES_KEY = 'votes'
const POLL_KEY  = (id: string) => `poll:${id}`

const emptyData = (): PollsData => ({ polls: [], votes: [] })

// ── Internal: polls-only reads/writes ─────────────────────────────────────────

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

// ── Internal: votes-only reads/writes ────────────────────────────────────────
// These NEVER touch the polls key, so castVote can never clobber poll records.

async function readVotesFromKV(): Promise<Vote[]> {
  const kv = await getKV()
  if (!kv) return []
  const raw = await kv.get(VOTES_KEY)
  if (raw) return (JSON.parse(raw) as { votes: Vote[] }).votes
  // Migration: fall back to votes in old combined blob on first deploy
  const oldRaw = await kv.get(KEY)
  if (!oldRaw) return []
  return (JSON.parse(oldRaw) as PollsData).votes ?? []
}

async function writeVotesToKV(votes: Vote[]): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  await kv.put(VOTES_KEY, JSON.stringify({ votes }))
}

// ── Public: combined read (for operations that need both) ─────────────────────

export async function readData(): Promise<PollsData> {
  const kv = await getKV()
  if (!kv) return emptyData()
  const [pollsRaw, votesRaw] = await Promise.all([kv.get(KEY), kv.get(VOTES_KEY)])
  const polls = pollsRaw ? ((JSON.parse(pollsRaw) as PollsData).polls ?? []) : []
  if (votesRaw) {
    return { polls, votes: (JSON.parse(votesRaw) as { votes: Vote[] }).votes }
  }
  // Migration: old combined blob still has votes
  if (pollsRaw) {
    const old = JSON.parse(pollsRaw) as PollsData
    if (old.votes?.length) return { polls, votes: old.votes }
  }
  return { polls, votes: [] }
}

// ── Polls ─────────────────────────────────────────────────────────────────────

export async function getPolls(guildId?: string): Promise<Poll[]> {
  const polls = await readPollsFromKV()
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
  // Individual key first — lets vote/image handlers find the poll immediately,
  // before the blob write propagates to other edges.
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
  const [polls, allVotes, kv] = await Promise.all([
    readPollsFromKV(),
    readVotesFromKV(),
    getKV(),
  ])
  const before = polls.length
  const newPolls = polls.filter(p => p.id !== id)
  if (newPolls.length === before) return false
  const newVotes = allVotes.filter(v => v.pollId !== id)
  await Promise.all([
    writePollsToKV(newPolls),
    writeVotesToKV(newVotes),
    kv ? kv.delete(POLL_KEY(id)) : Promise.resolve(),
  ])
  return true
}

export async function deleteGuildPolls(guildId: string): Promise<number> {
  const [polls, allVotes, kv] = await Promise.all([
    readPollsFromKV(),
    readVotesFromKV(),
    getKV(),
  ])
  const ids     = new Set(polls.filter(p => p.guildId === guildId).map(p => p.id))
  const before  = polls.length
  const newPolls = polls.filter(p => p.guildId !== guildId)
  const newVotes = allVotes.filter(v => !ids.has(v.pollId))
  await Promise.all([
    writePollsToKV(newPolls),
    writeVotesToKV(newVotes),
    kv ? Promise.all([...ids].map(id => kv.delete(POLL_KEY(id)))) : Promise.resolve(),
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

// ── Votes ─────────────────────────────────────────────────────────────────────

export async function getVotes(pollId: string, cachedData?: PollsData): Promise<Vote[]> {
  if (cachedData) return cachedData.votes.filter(v => v.pollId === pollId)
  const allVotes = await readVotesFromKV()
  return allVotes.filter(v => v.pollId === pollId)
}

export async function getUserVotes(pollId: string, userId: string): Promise<Vote[]> {
  const allVotes = await readVotesFromKV()
  return allVotes.filter(v => v.pollId === pollId && v.userId === userId)
}

export async function getPollsAndVotes(guildId: string): Promise<{ polls: Poll[]; votesByPoll: Record<string, Vote[]> }> {
  const [polls, allVotes] = await Promise.all([readPollsFromKV(), readVotesFromKV()])
  const guildPolls = polls
    .filter(p => p.guildId === guildId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const votesByPoll: Record<string, Vote[]> = {}
  for (const p of guildPolls) {
    votesByPoll[p.id] = allVotes.filter(v => v.pollId === p.id)
  }
  return { polls: guildPolls, votesByPoll }
}

export async function getVotesByPoll(guildId: string): Promise<Record<string, Vote[]>> {
  const [polls, allVotes] = await Promise.all([readPollsFromKV(), readVotesFromKV()])
  const ids  = new Set(polls.filter(p => p.guildId === guildId).map(p => p.id))
  const out: Record<string, Vote[]> = {}
  for (const id of ids) {
    out[id] = allVotes.filter(v => v.pollId === id)
  }
  return out
}

// ── castVote: reads/writes ONLY the votes key ─────────────────────────────────
// Completely isolated from polls key — no risk of clobbering poll records
// under concurrent poll creation (KV propagation lag on new polls).

export async function castVote(vote: Vote, allowMultiple: boolean): Promise<{ voteChanged: boolean; votes: Vote[] }> {
  const allVotes = await readVotesFromKV()
  let voteChanged = false

  if (allowMultiple) {
    const idx = allVotes.findIndex(
      v => v.pollId === vote.pollId && v.userId === vote.userId && v.optionId === vote.optionId
    )
    if (idx !== -1) allVotes[idx] = vote
    else allVotes.push(vote)
  } else {
    const idx = allVotes.findIndex(v => v.pollId === vote.pollId && v.userId === vote.userId)
    if (idx !== -1) {
      voteChanged = allVotes[idx].optionId !== vote.optionId
      allVotes[idx] = vote
    } else {
      allVotes.push(vote)
    }
  }

  await writeVotesToKV(allVotes)
  const pollVotes = allVotes.filter(v => v.pollId === vote.pollId)
  return { voteChanged, votes: pollVotes }
}

// ── Legacy export for any external callers ────────────────────────────────────
export async function writeData(data: PollsData): Promise<void> {
  await writePollsToKV(data.polls)
}
