import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getPollsAndVotes } from '@/lib/polls'
import { getTemplates } from '@/lib/poll-templates'
import { getGuild, upsertGuild } from '@/lib/guilds'
import { sendWelcomeMessage } from '@/lib/discord-bot'
import type { Guild } from '@/types'
import Link from 'next/link'
import { Settings, Clock, BarChart3, CheckCircle2, Circle, AlertTriangle, ExternalLink } from 'lucide-react'
import PollCard from '@/components/PollCard'
import CreatePollModal from '@/components/CreatePollModal'

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

export default async function GuildDashboardPage({ params }: Props) {
  const { guildId } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')

  let guild = await getGuild(guildId)

  // First visit — auto-register guild from Discord API
  if (!guild) {
    const discordGuild = await fetchDiscordGuild(guildId)
    if (!discordGuild) notFound()
    const now = new Date().toISOString()
    const newGuild: Guild = {
      guildId,
      guildName:     discordGuild.name,
      guildIcon:     discordGuild.icon ?? undefined,
      ownerId:       session.user.id,
      adminRoleIds:  [],
      voterRoleIds:  [],
      createdAt:     now,
      updatedAt:     now,
    }
    await upsertGuild(newGuild)
    guild = newGuild
    sendWelcomeMessage(guildId, discordGuild.system_channel_id ?? null, session.user.id, discordGuild.name)
  }

  // Single KV read for both polls and votes
  const [{ polls: allPolls, votesByPoll }, templates] = await Promise.all([
    getPollsAndVotes(guildId),
    getTemplates(guildId),
  ])

  const active        = allPolls.filter(p => !p.isClosed)
  const allClosed     = allPolls.filter(p => p.isClosed)
  const closedPreview = allClosed.slice(0, 5)
  const activeTemplates = templates.filter(t => t.active)

  const userId = session.user?.id ?? ''

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
          <Link href={`/dashboard/${guildId}/settings`} className="btn-secondary text-sm">
            <Settings size={14} />
            Settings
          </Link>
          <CreatePollModal guildId={guildId} userId={userId} userName={session.user?.name ?? ''} />
        </div>
      </div>

      {/* Setup banner */}
      {!guild.announceChannelId && (
        <div className="mb-8 flex items-start gap-3 p-4 rounded-xl border border-p-warning/30 bg-p-warning/5">
          <AlertTriangle size={16} className="text-p-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-p-text text-sm font-semibold">Polly needs a quick setup</p>
            <p className="text-p-muted text-sm mt-0.5">
              Set an announcement channel so polls are posted to Discord automatically, and optionally configure which roles can create polls or vote.
            </p>
          </div>
          <Link href={`/dashboard/${guildId}/settings`} className="btn-primary text-xs shrink-0">
            <Settings size={12} />
            Set up now
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Active Polls',  value: active.length,          icon: Circle,       color: 'text-p-success' },
          { label: 'Total Polls',   value: allPolls.length,         icon: BarChart3,    color: 'text-p-primary' },
          { label: 'Closed Polls',  value: allClosed.length,        icon: CheckCircle2, color: 'text-p-muted'   },
          { label: 'Templates',     value: activeTemplates.length,  icon: Clock,        color: 'text-p-warning' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 text-p-muted text-xs mb-2">
              <Icon size={13} className={color} />
              {label}
            </div>
            <div className="font-display font-bold text-2xl text-p-text">{value}</div>
          </div>
        ))}
      </div>

      {/* Active polls */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-xl text-p-text">Active Polls</h2>
          <Link href={`/dashboard/${guildId}/polls`}
            className="text-sm text-p-muted hover:text-p-text transition-colors">
            View all
          </Link>
        </div>
        {active.length === 0 ? (
          <div className="card p-8 text-center text-p-muted">
            <p className="mb-4">No active polls. Create one to get started!</p>
            <CreatePollModal guildId={guildId} userId={userId} userName={session.user?.name ?? ''} />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {active.map(poll => (
              <PollCard key={poll.id} poll={poll} votes={votesByPoll[poll.id] ?? []} guildId={guildId} />
            ))}
          </div>
        )}
      </section>

      {/* Recently closed */}
      {closedPreview.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-xl text-p-text">Recently Closed</h2>
            {allClosed.length > 5 && (
              <Link href={`/dashboard/${guildId}/polls`}
                className="text-sm text-p-muted hover:text-p-text transition-colors">
                View all {allClosed.length}
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {closedPreview.map(poll => (
              <Link key={poll.id} href={`/dashboard/${guildId}/polls/${poll.id}`}
                className="card-hover p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-p-text font-medium text-sm">{poll.title}</p>
                  <p className="text-p-muted text-xs mt-0.5">
                    Closed {poll.closesAt ? new Date(poll.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    {' · '}{(votesByPoll[poll.id] ?? []).length} vote{(votesByPoll[poll.id] ?? []).length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="badge badge-muted">Closed</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
