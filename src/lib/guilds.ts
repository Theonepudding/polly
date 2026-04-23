import { getKV } from './kv'
import type { Guild, GuildWithMeta } from '@/types'

export async function getGuild(guildId: string): Promise<Guild | null> {
  const kv = await getKV()
  if (!kv) return null
  const raw = await kv.get(`guild:${guildId}`)
  return raw ? JSON.parse(raw) : null
}

export async function getAllGuilds(): Promise<Guild[]> {
  const kv = await getKV()
  if (!kv) return []
  const raw = await kv.get('guild:index')
  if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => getGuild(id)))
  return results.filter(Boolean) as Guild[]
}

export async function upsertGuild(guild: Guild): Promise<void> {
  const kv = await getKV()
  if (!kv) throw new Error('KV not available')
  guild.updatedAt = new Date().toISOString()
  await kv.put(`guild:${guild.guildId}`, JSON.stringify(guild))
  const raw = await kv.get('guild:index')
  const ids: string[] = raw ? JSON.parse(raw) : []
  if (!ids.includes(guild.guildId)) {
    ids.push(guild.guildId)
    await kv.put('guild:index', JSON.stringify(ids))
  }
}

export async function deleteGuild(guildId: string): Promise<void> {
  const kv = await getKV()
  if (!kv) return
  await kv.delete(`guild:${guildId}`)
  const raw = await kv.get('guild:index')
  const ids: string[] = raw ? JSON.parse(raw) : []
  await kv.put('guild:index', JSON.stringify(ids.filter(id => id !== guildId)))
}

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

export function userCanManage(guild: Guild, userId: string, userRoleIds: string[]): boolean {
  if (guild.ownerId === userId) return true
  if (guild.adminRoleIds.length === 0) return true
  return guild.adminRoleIds.some(r => userRoleIds.includes(r))
}

export function userCanCreate(guild: Guild, userId: string, userRoleIds: string[]): boolean {
  if (userCanManage(guild, userId, userRoleIds)) return true
  if (guild.creatorRoleIds?.length > 0) {
    return guild.creatorRoleIds.some(r => userRoleIds.includes(r))
  }
  return true // no creator roles configured = everyone can create
}

export async function isMemberOf(guildId: string, userId: string): Promise<boolean> {
  if (!process.env.DISCORD_BOT_TOKEN) return true // can't verify without bot token — trust in prod
  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    })
    return res.ok
  } catch { return false }
}

export async function fetchMemberRoles(guildId: string, userId: string): Promise<string[]> {
  if (!process.env.DISCORD_BOT_TOKEN) return []
  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    })
    if (res.ok) return (await res.json()).roles ?? []
  } catch { /* ignore */ }
  return []
}

export async function fetchMemberNick(guildId: string, userId: string, fallback: string): Promise<string> {
  if (!process.env.DISCORD_BOT_TOKEN) return fallback
  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    })
    if (res.ok) {
      const m = await res.json()
      return m.nick ?? m.user?.global_name ?? m.user?.username ?? fallback
    }
  } catch { /* ignore */ }
  return fallback
}

export function userCanVote(guild: Guild, userRoleIds: string[]): boolean {
  if (guild.voterRoleIds.length === 0) return true
  return guild.voterRoleIds.some(r => userRoleIds.includes(r))
}
