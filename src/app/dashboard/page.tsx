import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GuildCard from '@/components/GuildCard'
import type { GuildWithMeta } from '@/types'
import { ExternalLink, Plus } from 'lucide-react'
import Image from 'next/image'
import { getAllGuilds } from '@/lib/guilds'

const BOT_INVITE_URL = process.env.DISCORD_CLIENT_ID
  ? `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=274878024704&scope=bot%20applications.commands`
  : '#'

async function getUserGuilds(accessToken: string): Promise<{ id: string; name: string; icon?: string; owner: boolean; permissions: string }[]> {
  try {
    const res = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache:   'no-store',
    })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

async function getBotGuilds(): Promise<string[]> {
  try {
    const res = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache:   'no-store',
    })
    if (!res.ok) return []
    const guilds: { id: string }[] = await res.json()
    return guilds.map(g => g.id)
  } catch { return [] }
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <Image
          src="/avatar.png"
          alt="Polly"
          width={72}
          height={72}
          className="mx-auto mb-6 rounded-2xl"
        />
        <h1 className="font-display font-bold text-3xl text-p-text mb-3">Polly Dashboard</h1>
        <p className="text-p-muted mb-8">
          Sign in with Discord to manage polls across your servers.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/api/auth/signin?callbackUrl=/dashboard"
            className="btn-primary justify-center">
            Sign in with Discord
          </a>
          <a
            href={BOT_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary justify-center">
            <ExternalLink size={15} />
            Add Polly to a server
          </a>
        </div>
      </div>
    )
  }

  const accessToken = (session.user as { discordAccessToken?: string }).discordAccessToken
  if (!accessToken) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-p-muted mb-6">Your session has expired.</p>
        <a href="/api/auth/signin?callbackUrl=/dashboard" className="btn-primary justify-center inline-flex">
          Sign in again
        </a>
      </div>
    )
  }

  const [userGuilds, botGuildIds, kvGuilds] = await Promise.all([
    getUserGuilds(accessToken),
    getBotGuilds(),
    getAllGuilds(),
  ])

  // Fall back to KV-stored guild list if Discord API returns nothing (rate limit / outage)
  const effectiveBotIds = botGuildIds.length > 0
    ? botGuildIds
    : kvGuilds.map(g => g.guildId)

  const sharedGuilds = userGuilds.filter(g => effectiveBotIds.includes(g.id))

  const guildsWithMeta: GuildWithMeta[] = sharedGuilds.map(g => ({
    guildId:        g.id,
    guildName:      g.name,
    guildIcon:      g.icon ?? undefined,
    ownerId:        '',
    adminRoleIds:   [],
    creatorRoleIds: [],
    voterRoleIds:   [],
    userIsAdmin:    g.owner || !!(parseInt(g.permissions) & 0x20),
    createdAt:      '',
    updatedAt:      '',
  }))

  if (guildsWithMeta.length === 1) redirect(`/dashboard/${guildsWithMeta[0].guildId}`)

  const invitableGuilds = userGuilds.filter(g =>
    !botGuildIds.includes(g.id) && (g.owner || !!(parseInt(g.permissions) & 0x20))
  ).slice(0, 6)

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-10">
        <h1 className="font-display font-bold text-3xl text-p-text mb-2">Your Servers</h1>
        <p className="text-p-muted">Select a server to manage its polls and settings.</p>
      </div>

      {guildsWithMeta.length > 0 ? (
        <div className="flex flex-col gap-3 mb-12">
          {guildsWithMeta.map(guild => (
            <GuildCard key={guild.guildId} guild={guild} />
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center mb-12">
          <p className="text-p-muted mb-4">Polly hasn&apos;t been added to any of your servers yet.</p>
          <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary mx-auto inline-flex">
            <ExternalLink size={15} />
            Add Polly to a server
          </a>
        </div>
      )}

      {invitableGuilds.length > 0 && (
        <div>
          <h2 className="font-display font-semibold text-p-text text-lg mb-4 flex items-center gap-2">
            <Plus size={16} className="text-p-muted" />
            Add Polly to another server
          </h2>
          <div className="flex flex-col gap-2">
            {invitableGuilds.map(g => (
              <div key={g.id} className="card p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {g.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=32`}
                      alt="" className="w-8 h-8 rounded-lg" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-p-surface-2 flex items-center justify-center text-xs font-display font-bold text-p-muted">
                      {g.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-p-text text-sm font-medium">{g.name}</span>
                </div>
                <a
                  href={`${BOT_INVITE_URL}&guild_id=${g.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                  <ExternalLink size={12} />
                  Invite
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
