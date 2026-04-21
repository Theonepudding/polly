import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getPolls } from '@/lib/polls'
import { getGuild } from '@/lib/guilds'
import Link from 'next/link'
import { Plus, Settings, Clock, BarChart3, CheckCircle2, Circle } from 'lucide-react'
import PollCard from '@/components/PollCard'
import CreatePollModal from '@/components/CreatePollModal'

export const dynamic = 'force-dynamic'

interface Props { params: { guildId: string } }

export default async function GuildDashboardPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')

  const guild = await getGuild(params.guildId)
  if (!guild) notFound()

  const allPolls = await getPolls(params.guildId)
  const active   = allPolls.filter(p => !p.isClosed)
  const closed   = allPolls.filter(p => p.isClosed).slice(0, 5)
  const scheduled = allPolls.filter(p => !p.isClosed && p.closesAt && new Date(p.closesAt) > new Date())

  const userId = session.user?.id ?? ''
  const isBotAdmin = session.user?.isBotAdmin

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
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/${params.guildId}/settings`}
            className="btn-secondary text-sm">
            <Settings size={14} />
            Settings
          </Link>
          <CreatePollModal guildId={params.guildId} userId={userId} userName={session.user?.name ?? ''} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Active Polls',    value: active.length,   icon: Circle,       color: 'text-p-success' },
          { label: 'Total Polls',     value: allPolls.length, icon: BarChart3,    color: 'text-p-primary' },
          { label: 'Closed Polls',    value: closed.length,   icon: CheckCircle2, color: 'text-p-muted'   },
          { label: 'Scheduled',       value: scheduled.length,icon: Clock,        color: 'text-p-warning'  },
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
          <Link href={`/dashboard/${params.guildId}/polls`}
            className="text-sm text-p-muted hover:text-p-text transition-colors">
            View all
          </Link>
        </div>
        {active.length === 0 ? (
          <div className="card p-8 text-center text-p-muted">
            <p className="mb-4">No active polls. Create one to get started!</p>
            <CreatePollModal guildId={params.guildId} userId={userId} userName={session.user?.name ?? ''} />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {active.map(poll => (
              <PollCard key={poll.id} poll={poll} guildId={params.guildId} />
            ))}
          </div>
        )}
      </section>

      {/* Recently closed */}
      {closed.length > 0 && (
        <section>
          <h2 className="font-display font-semibold text-xl text-p-text mb-4">Recently Closed</h2>
          <div className="flex flex-col gap-2">
            {closed.map(poll => (
              <Link key={poll.id} href={`/dashboard/${params.guildId}/polls/${poll.id}`}
                className="card-hover p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-p-text font-medium text-sm">{poll.title}</p>
                  <p className="text-p-muted text-xs mt-0.5">
                    Closed {poll.closesAt ? new Date(poll.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
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
