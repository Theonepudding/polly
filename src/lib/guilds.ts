import { getKV } from './kv'
import type { Guild, GuildWithMeta } from '@/types'
import fs from 'fs'
import path from 'path'

const DATA_PATH = path.join(process.cwd(), 'src/data/guilds.json')

function readGuildsFile(): Record<string, Guild> {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function writeGuildsFile(data: Record<string, Guild>) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
  } catch {
    // silent on Cloudflare
  }
}

export async function getGuild(guildId: string): Promise<Guild | null> {
  const kv = await getKV()
  if (kv) {
    const raw = await kv.get(`guild:${guildId}`)
    return raw ? JSON.parse(raw) : null
  }
  const guilds = readGuildsFile()
  return guilds[guildId] ?? null
}

export async function getAllGuilds(): Promise<Guild[]> {
  const kv = await getKV()
  if (kv) {
    const raw = await kv.get('guild:index')
    if (!raw) return []
    const ids: string[] = JSON.parse(raw)
    const results = await Promise.all(ids.map(id => getGuild(id)))
    return results.filter(Boolean) as Guild[]
  }
  return Object.values(readGuildsFile())
}

export async function upsertGuild(guild: Guild): Promise<void> {
  const kv = await getKV()
  guild.updatedAt = new Date().toISOString()
  if (kv) {
    await kv.put(`guild:${guild.guildId}`, JSON.stringify(guild))
    const raw = await kv.get('guild:index')
    const ids: string[] = raw ? JSON.parse(raw) : []
    if (!ids.includes(guild.guildId)) {
      ids.push(guild.guildId)
      await kv.put('guild:index', JSON.stringify(ids))
    }
    return
  }
  const guilds = readGuildsFile()
  guilds[guild.guildId] = guild
  writeGuildsFile(guilds)
}

export async function deleteGuild(guildId: string): Promise<void> {
  const kv = await getKV()
  if (kv) {
    await kv.delete(`guild:${guildId}`)
    const raw = await kv.get('guild:index')
    const ids: string[] = raw ? JSON.parse(raw) : []
    await kv.put('guild:index', JSON.stringify(ids.filter(id => id !== guildId)))
    return
  }
  const guilds = readGuildsFile()
  delete guilds[guildId]
  writeGuildsFile(guilds)
}

// Returns the guilds a Discord user is admin for in Polly
export async function getGuildsForUser(
  discordUserId: string,
  userGuildIds: string[]
): Promise<GuildWithMeta[]> {
  const all = await getAllGuilds()
  return all
    .filter(g => userGuildIds.includes(g.guildId))
    .map(g => ({
      ...g,
      userIsAdmin: g.ownerId === discordUserId || g.adminRoleIds.length === 0,
    }))
}

// Check if a user can manage polls in a guild (owner OR has an admin role)
export function userCanManage(guild: Guild, userId: string, userRoleIds: string[]): boolean {
  if (guild.ownerId === userId) return true
  if (guild.adminRoleIds.length === 0) return true // open — anyone
  return guild.adminRoleIds.some(r => userRoleIds.includes(r))
}

// Check if a user can vote in a guild
export function userCanVote(guild: Guild, userRoleIds: string[]): boolean {
  if (guild.voterRoleIds.length === 0) return true // open to everyone
  return guild.voterRoleIds.some(r => userRoleIds.includes(r))
}
