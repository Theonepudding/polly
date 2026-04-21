import { Poll, Vote, PollsData } from '@/types'
import { getKV } from './kv'

const KEY       = 'polls'
const VOTES_KEY = 'votes'
const POLL_KEY  = (id: string) => `poll:${id}`

const emptyData = (): PollsData => ({ polls: [], votes: [] })

// ── Polls blob (polls only, no votes) ────────────────────────────────────────

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

export async function writeData(data: PollsData): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  await Promise.all([
    kv.put(KEY,       JSON.stringify({ polls: data.polls })),
    kv.put(VOTES_KEY, JSON.stringify({ votes: data.votes })),
  ])
}

export async function getPolls(guildId?: string): Promise<Poll[]> {
  const data = await readData()
  const polls = guildId ? data.polls.filter(p => p.guildId === guildId) : data.polls
  return polls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getPoll(id: string): Promise<Poll | null> {
  const kv = await getKV()
  if (kv) {
    const raw = await kv.get(POLL_KEY(id))
    if (raw) return JSON.parse(raw) as Poll
  }
  const data = await readData()
  return data.polls.find(p => p.id === id) ?? null
}

export async function createPoll(poll: Poll): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  // Write individual key FIRST — available to vote/image handlers immediately,
  // before the larger blob write finishes propagating to other edge locations.
  await kv.put(POLL_KEY(poll.id), JSON.stringify(poll))
  const data = await readData()
  data.polls.push(poll)
  await writeData(data)
}

export async function updatePoll(id: string, patch: Partial<Poll>): Promise<boolean> {
  const data = await readData()
  const idx  = data.polls.findIndex(p => p.id === id)
  if (idx === -1) return false
  data.polls[idx] = { ...data.polls[idx], ...patch }
  await writeData(data)
  const kv = await getKV()
  if (kv) await kv.put(POLL_KEY(id), JSON.stringify(data.polls[idx]))
  return true
}

export async function deletePoll(id: string): Promise<boolean> {
  const data = await readData()
  const len  = data.polls.length
  data.polls = data.polls.filter(p => p.id !== id)
  data.votes = data.votes.filter(v => v.pollId !== id)
  if (data.polls.length === len) return false
  await writeData(data)
  const kv = await getKV()
  if (kv) await kv.delete(POLL_KEY(id))
  return true
}

export async function getPollsAndVotes(guildId: string): Promise<{ polls: Poll[]; votesByPoll: Record<string, Vote[]> }> {
  const data = await readData()
  const polls = data.polls
    .filter(p => p.guildId === guildId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const votesByPoll: Record<string, Vote[]> = {}
  await Promise.all(polls.map(async p => { votesByPoll[p.id] = await getVotes(p.id, data) }))
  return { polls, votesByPoll }
}

export async function getVotesByPoll(guildId: string): Promise<Record<string, Vote[]>> {
  const data = await readData()
  const ids  = new Set(data.polls.filter(p => p.guildId === guildId).map(p => p.id))
  const out: Record<string, Vote[]> = {}
  await Promise.all([...ids].map(async id => { out[id] = await getVotes(id, data) }))
  return out
}

export async function getVotes(pollId: string, cachedData?: PollsData): Promise<Vote[]> {
  const data = cachedData ?? await readData()
  return data.votes.filter(v => v.pollId === pollId)
}

export async function getUserVotes(pollId: string, userId: string): Promise<Vote[]> {
  const data = await readData()
  return data.votes.filter(v => v.pollId === pollId && v.userId === userId)
}

export async function deleteGuildPolls(guildId: string): Promise<number> {
  const kv   = await getKV()
  const data = await readData()
  const ids  = new Set(data.polls.filter(p => p.guildId === guildId).map(p => p.id))
  const before = data.polls.length
  data.polls = data.polls.filter(p => p.guildId !== guildId)
  data.votes = data.votes.filter(v => !ids.has(v.pollId))
  await writeData(data)
  if (kv) await Promise.all([...ids].map(id => kv.delete(POLL_KEY(id))))
  return before - data.polls.length
}

export async function closeExpiredPolls(): Promise<Poll[]> {
  const kv   = await getKV()
  const data = await readData()
  const now  = new Date()
  const closed: Poll[] = []
  for (const p of data.polls) {
    if (!p.isClosed && p.closesAt && new Date(p.closesAt) <= now) {
      p.isClosed = true
      closed.push(p)
    }
  }
  if (closed.length) {
    await writeData(data)
    if (kv) await Promise.all(closed.map(p => kv.put(POLL_KEY(p.id), JSON.stringify(p))))
  }
  return closed
}

export async function getPollsNeedingReminder(): Promise<Poll[]> {
  const data   = await readData()
  const now    = new Date()
  const in24h  = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return data.polls.filter(p =>
    !p.isClosed && !p.reminderSent && p.closesAt &&
    new Date(p.closesAt) <= in24h && new Date(p.closesAt) > now
  )
}

// ── castVote: touches ONLY the votes key, never the polls key ────────────────
// This prevents castVote from clobbering poll records when they race with
// createPoll — e.g. when the polls blob hasn't propagated to this edge yet
// but the user already clicked a vote button.
export async function castVote(vote: Vote, allowMultiple: boolean): Promise<{ voteChanged: boolean; votes: Vote[] }> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')

  // Read votes ONLY from the dedicated votes key
  const votesRaw = await kv.get(VOTES_KEY)
  let allVotes: Vote[]
  if (votesRaw) {
    allVotes = (JSON.parse(votesRaw) as { votes: Vote[] }).votes
  } else {
    // Migration: read votes from old combined blob on first deploy
    const oldRaw = await kv.get(KEY)
    const old    = oldRaw ? (JSON.parse(oldRaw) as PollsData) : emptyData()
    allVotes     = old.votes ?? []
  }

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

  // Write ONLY the votes key — polls key is never touched here
  await kv.put(VOTES_KEY, JSON.stringify({ votes: allVotes }))
  const pollVotes = allVotes.filter(v => v.pollId === vote.pollId)
  return { voteChanged, votes: pollVotes }
}
