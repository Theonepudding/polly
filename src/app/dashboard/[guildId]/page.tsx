import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getPollsAndVotes } from '@/lib/polls'
import { getTemplates } from '@/lib/poll-templates'
import { getGuild, upsertGuild, userCanManage } from '@/lib/guilds'
import { sendWelcomeMessage } from '@/lib/discord-bot'
import type { Guild } from '@/types'
import Link from 'next/link'
import { Settings, Clock, BarChart3, CheckCircle2, Circle, AlertTriangle, ExternalLink } from 'lucide-react'
import PollCard from '@/components/PollCard'
import ActivePollCard from '@/components/ActivePollCard'
import CreatePollModal from '@/components/CreatePollModal'
import AutoRefresh from '@/components/AutoRefresh'

export const dynamic = 'force-dynamic'

const BOT_INVITE_URL = process.env.DISCORD_CLIENT_ID
  ? `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=274878024704&scope=bot%20applications.commands`
  : '#'

interface Props { params: Promise<{ guildId: string }> }

async function fetchDiscordGuild(guildId: string): Promise<{ name: string; icon?: string; system_channel_id?: string } | null> {
  if (!process.env.DISCORD_BOT_TOKEN) return null
  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function fetchMemberRoles(guildId: string, userId: string): Promise<string[]> {
  if (!process.env.DISCORD_BOT_TOKEN) return []
  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const member = await res.json()
    return member.roles ?? []
  } catch { return [] }
}

async function fetchGuildRoles(guildId: string): Promise<{ id: string; name: string; permissions: string }[]> {
  if (!process.env.DISCORD_BOT_TOKEN) return []
  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

export default async function GuildDashboardPage({ params }: Props) {
  const { guildId } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')

  let guild = await getGuild(guildId)

  // First visit — auto-register guild from Discord API
  if (!guild) {
    const [discordGuild, guildRoles] = await Promise.all([
      fetchDiscordGuild(guildId),
      fetchGuildRoles(guildId),
    ])
    if (!discordGuild) notFound()

    // Pre-populate admin roles with Discord roles that have ADMINISTRATOR permission
    const adminRoleIds = guildRoles
      .filter(r => r.name !== '@everyone' && (parseInt(r.permissions || '0', 10) & 8) !== 0)
      .map(r => r.id)

    const now = new Date().toISOString()
    const newGuild: Guild = {
      guildId,
      guildName:      discordGuild.name,
      guildIcon:      discordGuild.icon ?? undefined,
      ownerId:        session.user.id,
      adminRoleIds,
      creatorRoleIds: [],
      voterRoleIds:   [],
      createdAt:      now,
      updatedAt:      now,
    }
    await upsertGuild(newGuild)
    guild = newGuild
    sendWelcomeMessage(guildId, discordGuild.system_channel_id ?? null, session.user.id, discordGuild.name)
  }

  const userId = session.user?.id ?? ''

  const [{ polls: allPolls, votesByPoll }, templates, memberRoles] = await Promise.all([
    getPollsAndVotes(guildId),
    getTemplates(guildId),
    fetchMemberRoles(guildId, userId),
  ])

  const active        = allPolls.filter(p => !p.isClosed)
  const allClosed     = allPolls.filter(p => p.isClosed)
  const closedPreview = allClosed.slice(0, 8)
  const activeTemplates = templates.filter(t => t.active)

  const canManage = userCanManage(guild, userId, memberRoles) || !!session.user.isBotAdmin

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-p-muted text-sm mb-1">
            <Link href="/dashboard" className="hover:text-p-text transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-p-text">{guild.guildName}</span>
          </div>
          <h1 className="font-display font-bold text-3xl text-p-text">{guild.guildName}</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <a href={`${BOT_INVITE_URL}`} target="_blank" rel="noopener noreferrer"
            className="btn-ghost text-sm">
            <ExternalLink size={14} />
            Add to another server
          </a>
          <Link href={`/dashboard/${guildId}/templates`} className="btn-ghost text-sm">
            <Clock size={14} />
            Scheduled Polls
          </Link>
          {canManage && (
            <Link href={`/dashboard/${guildId}/settings`} className="btn-secondary text-sm">
              <Settings size={14} />
              Settings
            </Link>
          )}
          <CreatePollModal guildId={guildId} userId={userId} userName={session.user?.name ?? ''} canManage={canManage} />
        </div>
      </div>

      {/* Setup banner — only shown to managers who can act on it */}
      {canManage && !guild.announceChannelId && (
        <div className="mb-8 flex items-start gap-3 p-4 rounded-xl border border-p-warning/30 bg-p-warning/5">
          <AlertTriangle size={16} className="text-p-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-p-text text-sm font-semibold">One step left — pick an announcement channel</p>
            <p className="text-p-muted text-sm mt-0.5">
              Set the channel where polls get posted in Discord. Once that&apos;s done, Polly is ready to go. All other settings are optional.
            </p>
          </div>
          <Link href={`/dashboard/${guildId}/settings`} className="btn-primary text-xs shrink-0">
            <Settings size={12} />
            Go to Settings
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Active Polls',  value: active.length,          icon: Circle,       color: 'text-p-success', href: null },
          { label: 'Total Polls',   value: allPolls.length,         icon: BarChart3,    color: 'text-p-primary', href: null },
          { label: 'Closed Polls',  value: allClosed.length,        icon: CheckCircle2, color: 'text-p-muted',   href: null },
          { label: 'Scheduled',     value: activeTemplates.length,  icon: Clock,        color: 'text-p-warning', href: `/dashboard/${guildId}/templates` },
        ].map(({ label, value, icon: Icon, color, href }) => (
          href ? (
            <Link key={label} href={href} className="card p-4 hover:border-p-border-2 transition-colors">
              <div className="flex items-center gap-2 text-p-muted text-xs mb-2">
                <Icon size={13} className={color} />
                {label}
              </div>
              <div className="font-display font-bold text-2xl text-p-text">{value}</div>
            </Link>
          ) : (
            <div key={label} className="card p-4">
              <div className="flex items-center gap-2 text-p-muted text-xs mb-2">
                <Icon size={13} className={color} />
                {label}
              </div>
              <div className="font-display font-bold text-2xl text-p-text">{value}</div>
            </div>
          )
        ))}
      </div>

      <AutoRefresh intervalMs={15000} />

      {/* Active polls */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-xl text-p-text">Active Polls</h2>
          <span className="text-sm text-p-muted">{active.length} poll{active.length !== 1 ? 's' : ''}</span>
        </div>
        {active.length === 0 ? (
          <div className="card p-8 text-center text-p-muted">
            <p className="mb-4">No active polls. Create one to get started!</p>
            <CreatePollModal guildId={guildId} userId={userId} userName={session.user?.name ?? ''} canManage={canManage} />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {active.map(poll => (
              <ActivePollCard key={poll.id} poll={poll} votes={votesByPoll[poll.id] ?? []} guildId={guildId} />
            ))}
          </div>
        )}
      </section>

      {/* Recently closed */}
      {closedPreview.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-xl text-p-text">Recently Closed</h2>
            <span className="text-sm text-p-muted">{allClosed.length} poll{allClosed.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-col gap-2">
            {closedPreview.map(poll => {
              const parts = poll.title.split(/(<a?:\w+:\d+>)/g)
              const titleEl = parts.map((part, i) => {
                const m = part.match(/^<(a?):(\w+):(\d+)>$/)
                // eslint-disable-next-line @next/next/no-img-element
                if (m) return <img key={i} src={`https://cdn.discordapp.com/emojis/${m[3]}.${m[1]==='a'?'gif':'png'}?size=32`} alt={m[2]} className="inline-block w-4 h-4 align-text-bottom mx-0.5" />
                return part ? <span key={i}>{part}</span> : null
              })
              return (
              <Link key={poll.id} href={`/dashboard/${guildId}/polls/${poll.id}`}
                className="card-hover p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-p-text font-medium text-sm">{titleEl}</p>
                  <p className="text-p-muted text-xs mt-0.5">
                    Closed {poll.closesAt ? new Date(poll.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    {' · '}{(votesByPoll[poll.id] ?? []).length} vote{(votesByPoll[poll.id] ?? []).length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="badge badge-muted">Closed</span>
              </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
