import { Poll, Vote, PollsData } from '@/types'
import { getKV } from './kv'

const KEY = 'polls'

const emptyData = (): PollsData => ({ polls: [], votes: [] })

export async function readData(): Promise<PollsData> {
  const kv = await getKV()
  if (!kv) return emptyData()
  const raw = await kv.get(KEY)
  return raw ? (JSON.parse(raw) as PollsData) : emptyData()
}

export async function writeData(data: PollsData): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  await kv.put(KEY, JSON.stringify(data))
}

export async function getPolls(guildId?: string): Promise<Poll[]> {
  const data = await readData()
  const polls = guildId ? data.polls.filter(p => p.guildId === guildId) : data.polls
  return polls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getPoll(id: string): Promise<Poll | null> {
  const data = await readData()
  return data.polls.find(p => p.id === id) ?? null
}

export async function createPoll(poll: Poll): Promise<void> {
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
  return true
}

export async function deletePoll(id: string): Promise<boolean> {
  const data = await readData()
  const len  = data.polls.length
  data.polls = data.polls.filter(p => p.id !== id)
  data.votes = data.votes.filter(v => v.pollId !== id)
  if (data.polls.length === len) return false
  await writeData(data)
  return true
}

export async function getPollsAndVotes(guildId: string): Promise<{ polls: Poll[]; votesByPoll: Record<string, Vote[]> }> {
  const data = await readData()
  const polls = data.polls
    .filter(p => p.guildId === guildId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const ids = new Set(polls.map(p => p.id))
  const votesByPoll: Record<string, Vote[]> = {}
  for (const v of data.votes) {
    if (ids.has(v.pollId)) {
      if (!votesByPoll[v.pollId]) votesByPoll[v.pollId] = []
      votesByPoll[v.pollId].push(v)
    }
  }
  return { polls, votesByPoll }
}

export async function getVotesByPoll(guildId: string): Promise<Record<string, Vote[]>> {
  const data = await readData()
  const ids  = new Set(data.polls.filter(p => p.guildId === guildId).map(p => p.id))
  const out: Record<string, Vote[]> = {}
  for (const v of data.votes) {
    if (ids.has(v.pollId)) {
      if (!out[v.pollId]) out[v.pollId] = []
      out[v.pollId].push(v)
    }
  }
  return out
}

export async function getVotes(pollId: string): Promise<Vote[]> {
  const data = await readData()
  return data.votes.filter(v => v.pollId === pollId)
}

export async function getUserVotes(pollId: string, userId: string): Promise<Vote[]> {
  const data = await readData()
  return data.votes.filter(v => v.pollId === pollId && v.userId === userId)
}

export async function deleteGuildPolls(guildId: string): Promise<number> {
  const data = await readData()
  const ids  = new Set(data.polls.filter(p => p.guildId === guildId).map(p => p.id))
  const before = data.polls.length
  data.polls = data.polls.filter(p => p.guildId !== guildId)
  data.votes = data.votes.filter(v => !ids.has(v.pollId))
  await writeData(data)
  return before - data.polls.length
}

export async function closeExpiredPolls(): Promise<Poll[]> {
  const data  = await readData()
  const now   = new Date()
  const closed: Poll[] = []
  for (const p of data.polls) {
    if (!p.isClosed && p.closesAt && new Date(p.closesAt) <= now) {
      p.isClosed = true
      closed.push(p)
    }
  }
  if (closed.length) await writeData(data)
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

export async function castVote(vote: Vote, allowMultiple: boolean): Promise<void> {
  const data = await readData()
  if (allowMultiple) {
    const idx = data.votes.findIndex(
      v => v.pollId === vote.pollId && v.userId === vote.userId && v.optionId === vote.optionId
    )
    if (idx !== -1) data.votes[idx] = vote
    else data.votes.push(vote)
  } else {
    const idx = data.votes.findIndex(v => v.pollId === vote.pollId && v.userId === vote.userId)
    if (idx !== -1) data.votes[idx] = vote
    else data.votes.push(vote)
  }
  await writeData(data)
}
