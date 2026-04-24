import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getGuild, getAuditEvents, userCanManage, fetchMemberRoles, isMemberOf } from '@/lib/guilds'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Info } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ guildId: string }> }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const ACTION_COLORS: Record<string, string> = {
  'poll.create':   'text-p-success bg-p-success/10',
  'poll.close':    'text-p-muted   bg-p-surface-2',
  'poll.delete':   'text-p-error   bg-p-error/10',
  'poll.reopen':   'text-p-primary bg-p-primary-b',
  'settings.save': 'text-p-warning bg-p-warning/10',
}

function actionBadge(action: string) {
  const cls = ACTION_COLORS[action] ?? 'text-p-muted bg-p-surface-2'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium ${cls}`}>
      {action}
    </span>
  )
}

export default async function AuditLogPage({ params }: Props) {
  const { guildId } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')

  const isBotAdmin = !!session.user.isBotAdmin
  if (!isBotAdmin && !await isMemberOf(guildId, session.user.id)) notFound()

  const guild = await getGuild(guildId)
  if (!guild) notFound()

  if (!isBotAdmin) {
    const memberRoles = await fetchMemberRoles(guildId, session.user.id)
    if (!userCanManage(guild, session.user.id, memberRoles)) notFound()
  }

  const events = await getAuditEvents(guildId)

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/dashboard/${guildId}`} className="btn-ghost text-sm">
          <ArrowLeft size={14} />
          Back
        </Link>
        <div className="w-px h-4 bg-p-border" />
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-p-primary" />
          <h1 className="font-display font-bold text-xl text-p-text">Audit Log</h1>
        </div>
        <span className="ml-auto text-xs text-p-muted">Last {events.length} events</span>
      </div>

      {events.length === 0 ? (
        <div className="card p-10 flex flex-col items-center gap-3 text-center">
          <Info size={32} className="text-p-muted" />
          <p className="text-p-muted text-sm">No events recorded yet. Actions like creating or closing polls will appear here.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-p-border">
            {events.map(ev => (
              <div key={ev.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-p-surface-2/40 transition-colors">
                <div className="shrink-0 pt-0.5">
                  {actionBadge(ev.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-p-text text-sm leading-snug">{ev.detail}</p>
                  <p className="text-p-muted text-xs mt-0.5">{ev.actorName}</p>
                </div>
                <time
                  dateTime={ev.timestamp}
                  title={new Date(ev.timestamp).toLocaleString()}
                  className="shrink-0 text-xs text-p-muted tabular-nums"
                >
                  {timeAgo(ev.timestamp)}
                </time>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
