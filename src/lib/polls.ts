import fs from 'fs/promises'
import path from 'path'
import { Poll, Vote, PollsData } from '@/types'
import { getKV } from './kv'

const FILE = path.join(process.cwd(), 'src', 'data', 'polls.json')
const KEY  = 'polls'

const emptyData = (): PollsData => ({ polls: [], votes: [] })

export async function readData(): Promise<PollsData> {
  const kv = await getKV()
  if (kv) {
    const raw = await kv.get(KEY)
    return raw ? (JSON.parse(raw) as PollsData) : emptyData()
  }
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf-8')) as PollsData
  } catch {
    return emptyData()
  }
}

export async function writeData(data: PollsData): Promise<void> {
  const kv = await getKV()
  if (kv) {
    await kv.put(KEY, JSON.stringify(data))
    return
  }
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), 'utf-8')
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

export async function getVotes(pollId: string): Promise<Vote[]> {
  const data = await readData()
  return data.votes.filter(v => v.pollId === pollId)
}

export async function getUserVotes(pollId: string, userId: string): Promise<Vote[]> {
  const data = await readData()
  return data.votes.filter(v => v.pollId === pollId && v.userId === userId)
}

export async function castVote(vote: Vote, allowMultiple: boolean): Promise<void> {
  const data = await readData()
  if (allowMultiple) {
    // Replace existing vote for same option, or add new
    const idx = data.votes.findIndex(
      v => v.pollId === vote.pollId && v.userId === vote.userId && v.optionId === vote.optionId
    )
    if (idx !== -1) {
      data.votes[idx] = vote
    } else {
      data.votes.push(vote)
    }
  } else {
    // Single choice — replace any existing vote for this poll
    const idx = data.votes.findIndex(v => v.pollId === vote.pollId && v.userId === vote.userId)
    if (idx !== -1) {
      data.votes[idx] = vote
    } else {
      data.votes.push(vote)
    }
  }
  await writeData(data)
}
