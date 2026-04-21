import { Poll, Vote, PollsData } from '@/types'
import { getKV } from './kv'

const KEY      = 'polls'
const POLL_KEY = (id: string) => `poll:${id}`
const VOTE_KEY = (pollId: string, userId: string, optionId?: string) =>
  optionId ? `vote:${pollId}:${userId}:${optionId}` : `vote:${pollId}:${userId}`

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
  if (kv) {
    await kv.delete(POLL_KEY(id))
    const voteList = await kv.list({ prefix: `vote:${id}:` })
    await Promise.all(voteList.keys.map(k => kv.delete(k.name)))
  }
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
  const kv   = await getKV()
  const data = cachedData ?? await readData()
  const blobVotes = data.votes.filter(v => v.pollId === pollId)
  if (!kv) return blobVotes
  const list = await kv.list({ prefix: `vote:${pollId}:` })
  if (list.keys.length === 0) return blobVotes
  const raws = await Promise.all(list.keys.map(k => kv.get(k.name)))
  const indivVotes = raws.filter((r): r is string => r !== null).map(r => JSON.parse(r) as Vote)
  // Merge: individual key votes override blob for the same user (migration-safe)
  const migratedUsers = new Set(indivVotes.map(v => v.userId))
  return [...indivVotes, ...blobVotes.filter(v => !migratedUsers.has(v.userId))]
}

export async function getUserVotes(pollId: string, userId: string): Promise<Vote[]> {
  const kv = await getKV()
  if (kv) {
    const list = await kv.list({ prefix: `vote:${pollId}:${userId}:` })
    if (list.keys.length > 0) {
      const raws = await Promise.all(list.keys.map(k => kv.get(k.name)))
      return raws.filter((r): r is string => r !== null).map(r => JSON.parse(r) as Vote)
    }
    const single = await kv.get(VOTE_KEY(pollId, userId))
    if (single) return [JSON.parse(single) as Vote]
  }
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
  if (kv) {
    await Promise.all([...ids].map(id => kv.delete(POLL_KEY(id))))
    await Promise.all([...ids].map(async id => {
      const voteList = await kv.list({ prefix: `vote:${id}:` })
      await Promise.all(voteList.keys.map(k => kv.delete(k.name)))
    }))
  }
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

export async function castVote(vote: Vote, allowMultiple: boolean): Promise<{ voteChanged: boolean }> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  let voteChanged = false
  if (!allowMultiple) {
    const key         = VOTE_KEY(vote.pollId, vote.userId)
    const existingRaw = await kv.get(key)
    if (existingRaw) {
      voteChanged = (JSON.parse(existingRaw) as Vote).optionId !== vote.optionId
    }
    await kv.put(key, JSON.stringify(vote))
  } else {
    await kv.put(VOTE_KEY(vote.pollId, vote.userId, vote.optionId), JSON.stringify(vote))
  }
  return { voteChanged }
}
