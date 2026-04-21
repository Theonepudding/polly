import Link from 'next/link'
import { Poll, Vote } from '@/types'
import { Clock, Users, ChevronRight, Lock, EyeOff, CheckSquare } from 'lucide-react'

function timeLeft(iso?: string) {
  if (!iso) return 'No end date'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Closed'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (d > 1) return `${d} days left`
  if (d === 1) return `1d ${h}h left`
  if (h > 0)  return `${h}h ${m}m left`
  if (m > 0)  return `${m}m left`
  return 'closing soon'
}

interface Props {
  poll:     Poll
  votes?:   Vote[]
  guildId?: string
}

export default function PollCard({ poll, votes = [], guildId }: Props) {
  const total      = votes.length
  const closed     = poll.isClosed
  const pollHref   = guildId ? `/dashboard/${guildId}/polls/${poll.id}` : `/p/${poll.id}`
  const voteCounts = poll.options.map(opt => votes.filter(v => v.optionId === opt.id).length)
  const maxVotes   = Math.max(...voteCounts, 1)
  const leadingIdx = voteCounts.indexOf(Math.max(...voteCounts))
  const isTied     = voteCounts.filter(c => c === maxVotes).length > 1 || maxVotes === 0

  return (
    <Link href={pollHref} className="card-hover block p-5 group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {closed ? (
              <span className="badge badge-muted gap-1"><Lock size={9} />Closed</span>
            ) : (
              <span className="badge badge-success">Active</span>
            )}
            {poll.isAnonymous   && <span className="badge badge-muted gap-1"><EyeOff size={9} />Anon</span>}
            {poll.allowMultiple && <span className="badge badge-muted gap-1"><CheckSquare size={9} />Multi</span>}
            {poll.includeTimeSlots && <span className="badge badge-muted">+ Times</span>}
          </div>
          <h3 className="font-display font-semibold text-p-text group-hover:text-p-primary transition-colors leading-snug">
            {poll.title}
          </h3>
          {poll.description && (
            <p className="text-xs text-p-muted mt-1 line-clamp-2">{poll.description}</p>
          )}
        </div>
        <ChevronRight size={16} className="text-p-subtle group-hover:text-p-muted shrink-0 mt-1 transition-colors" />
      </div>

      {/* Mini results bars / empty state */}
      {total === 0 && !closed && (
        <p className="text-xs text-p-subtle mb-3">No votes yet — be the first!</p>
      )}
      {total > 0 && (
        <div className="space-y-2 mb-3">
          {poll.options.slice(0, 4).map((opt, i) => {
            const count = voteCounts[i]
            const pct   = total > 0 ? Math.round((count / total) * 100) : 0
            const isWin = closed && !isTied && i === leadingIdx && count > 0
            return (
              <div key={opt.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={`truncate ${isWin ? 'text-p-accent font-semibold' : 'text-p-muted'}`}>
                    {isWin ? '🏆 ' : ''}{opt.text}
                  </span>
                  <span className="text-p-muted shrink-0 ml-2">{pct}%</span>
                </div>
                <div className="progress-bar h-1.5">
                  <div
                    className={isWin ? 'progress-fill-winner' : 'progress-fill'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          {poll.options.length > 4 && (
            <p className="text-xs text-p-subtle">+{poll.options.length - 4} more options</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-p-muted">
        <span className="flex items-center gap-1"><Users size={11} />{total} vote{total !== 1 ? 's' : ''}</span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {closed ? 'Closed' : timeLeft(poll.closesAt)}
        </span>
        <span className="ml-auto text-p-subtle truncate">by {poll.createdByName}</span>
      </div>
    </Link>
  )
}
