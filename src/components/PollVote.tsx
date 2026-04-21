'use client'
import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Poll, Vote } from '@/types'
import { Check, Clock, LogIn, Users, ChevronDown, EyeOff, CheckSquare, Lock } from 'lucide-react'
import clsx from 'clsx'

function utcToLocal(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return hhMM
  const d = new Date()
  d.setUTCHours(h, m, 0, 0)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

interface Props {
  poll:     Poll
  votes:    Vote[]
  myVotes:  Vote[]
  userId?:  string
  userName?: string
}

export default function PollVote({ poll, votes: initialVotes, myVotes: initMyVotes, userId, userName }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const [votes,     setVotes]     = useState<Vote[]>(initialVotes)
  const [myVotes,   setMyVotes]   = useState<Vote[]>(initMyVotes)
  const [step,      setStep]      = useState<'vote' | 'time' | 'done'>(initMyVotes.length > 0 ? 'done' : 'vote')
  const [selected,  setSelected]  = useState<string[]>(initMyVotes.map(v => v.optionId))
  const [timeSlot,  setTimeSlot]  = useState(initMyVotes[0]?.timeSlot ?? '')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [live,      setLive]      = useState(false)
  const effectiveUserId = userId ?? session?.user?.id

  const total    = poll.allowMultiple
    ? [...new Set(votes.map(v => v.userId))].length
    : votes.length
  const isClosed = poll.isClosed

  useEffect(() => {
    if (isClosed) return
    let es: EventSource
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource(`/api/polls/${poll.id}/stream`)
      es.onopen = () => setLive(true)
      es.onerror = () => {
        setLive(false)
        es.close()
        retryTimer = setTimeout(connect, 5000)
      }
      es.onmessage = (e: MessageEvent) => {
        try {
          const { votes: fresh, closed } = JSON.parse(e.data) as { votes: Vote[]; closed?: boolean }
          setVotes(fresh)
          if (effectiveUserId) {
            setMyVotes(fresh.filter(v => v.userId === effectiveUserId))
          }
          if (closed) router.refresh()
        } catch { /* ignore */ }
      }
    }

    connect()
    return () => {
      clearTimeout(retryTimer)
      es?.close()
      setLive(false)
    }
  }, [isClosed, poll.id, effectiveUserId])

  // When SSE delivers votes that include ours (e.g. voted via Discord), auto-advance to done
  useEffect(() => {
    if (myVotes.length > 0 && step === 'vote' && selected.length === 0) {
      setSelected(myVotes.map(v => v.optionId))
      setStep('done')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVotes.length])

  async function submitVote(finalTimeSlot?: string) {
    if (!effectiveUserId || !userName || selected.length === 0) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: selected, timeSlot: finalTimeSlot }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to submit')
      const { votes: newVotes } = await res.json()
      setVotes(newVotes)
      setMyVotes(newVotes.filter((v: Vote) => v.userId === effectiveUserId))
      setStep('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function toggleOption(optId: string) {
    if (poll.allowMultiple) {
      setSelected(prev =>
        prev.includes(optId) ? prev.filter(id => id !== optId) : [...prev, optId]
      )
    } else {
      setSelected([optId])
    }
  }

  function handleVoteSubmit() {
    if (poll.includeTimeSlots && poll.timeSlots.length > 0) {
      setStep('time')
    } else {
      submitVote()
    }
  }

  const maxCount  = Math.max(...poll.options.map(o => votes.filter(v => v.optionId === o.id).length), 1)

  function closesIn(iso?: string): string | null {
    if (!iso) return null
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return null
    const d = Math.floor(ms / 86_400_000)
    const h = Math.floor((ms % 86_400_000) / 3_600_000)
    const m = Math.floor((ms % 3_600_000) / 60_000)
    if (d > 0) return `${d}d ${h}h left`
    if (h > 0) return `${h}h ${m}m left`
    if (m > 0) return `${m}m left`
    return 'closing soon'
  }

  function Results({ compact = false }: { compact?: boolean }) {
    return (
      <div className="space-y-3">
        {poll.options.map(opt => {
          const optVotes = votes.filter(v => v.optionId === opt.id)
          const count    = optVotes.length
          const pct      = votes.length > 0 ? Math.round((count / votes.length) * 100) : 0
          const isMyVote = myVotes.some(v => v.optionId === opt.id)
          const isWin    = isClosed && count === maxCount && count > 0
          const isOpen   = expanded === opt.id

          return (
            <div key={opt.id} className={clsx(
              'rounded-xl border overflow-hidden transition-all',
              isWin   ? 'border-p-accent/50 bg-p-accent-b'
              : isMyVote ? 'border-p-primary/40 bg-p-primary-b'
              : 'border-p-border bg-p-surface'
            )}>
              <button
                type="button"
                className="w-full text-left p-4"
                onClick={() => !poll.isAnonymous && count > 0 && setExpanded(isOpen ? null : opt.id)}>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className={clsx('text-sm font-semibold truncate',
                    isWin ? 'text-p-accent' : isMyVote ? 'text-p-primary' : 'text-p-text')}>
                    {isWin ? '🏆 ' : ''}{opt.text}
                  </span>
                  <span className="text-xs shrink-0 flex items-center gap-2">
                    {isMyVote && <Check size={12} className="text-p-primary" />}
                    <span className={clsx('font-bold text-sm',
                      isWin ? 'text-p-accent' : isMyVote ? 'text-p-primary' : 'text-p-text')}>
                      {pct}%
                    </span>
                    <span className="text-p-muted">({count})</span>
                    {!poll.isAnonymous && count > 0 && (
                      <ChevronDown size={12} className={clsx('text-p-muted transition-transform', isOpen && 'rotate-180')} />
                    )}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className={isWin ? 'progress-fill-winner' : 'progress-fill'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
              {isOpen && !poll.isAnonymous && (
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {optVotes.map((v, i) => (
                    <span key={i} className="badge badge-muted text-[11px]">{v.username}</span>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {poll.includeTimeSlots && votes.some(v => v.timeSlot) && (
          <div className="mt-4 pt-4 border-t border-p-border">
            <p className="text-xs font-semibold text-p-muted mb-3 flex items-center gap-1.5">
              <Clock size={11} /> Preferred times
            </p>
            <div className="flex flex-wrap gap-2">
              {poll.timeSlots.map(ts => {
                const count = votes.filter(v => v.timeSlot === ts).length
                return (
                  <span key={ts} className={clsx(
                    'badge text-xs',
                    count > 0 ? 'badge-primary' : 'badge-muted text-p-subtle'
                  )}>
                    {utcToLocal(ts)}{count > 0 ? ` ×${count}` : ''}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-p-muted flex items-center gap-1.5 mt-1">
          <Users size={11} /> {total} {poll.allowMultiple ? 'participant' : 'vote'}{total !== 1 ? 's' : ''}
          {poll.isAnonymous && <span className="flex items-center gap-1 ml-2"><EyeOff size={10} />Anonymous</span>}
        </p>
      </div>
    )
  }

  // Header info
  function PollHeader() {
    const timeRemaining = closesIn(poll.closesAt)
    return (
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {isClosed ? (
            <span className="badge badge-muted gap-1"><Lock size={9} />Closed</span>
          ) : (
            <span className="badge badge-success gap-1.5">
              {live && <span className="w-1.5 h-1.5 rounded-full bg-p-success animate-pulse shrink-0" />}
              Active
            </span>
          )}
          {poll.isAnonymous   && <span className="badge badge-muted gap-1"><EyeOff size={9} />Anonymous</span>}
          {poll.allowMultiple && <span className="badge badge-muted gap-1"><CheckSquare size={9} />Multi-choice</span>}
          {!isClosed && timeRemaining && (
            <span className="badge badge-muted gap-1 ml-auto">
              <Clock size={9} />{timeRemaining}
            </span>
          )}
        </div>
        <h1 className="font-display font-bold text-2xl text-p-text mb-2">{poll.title}</h1>
        {poll.description && <p className="text-p-muted">{poll.description}</p>}
        <p className="text-xs text-p-muted mt-2">by {poll.createdByName}</p>
      </div>
    )
  }

  if (!effectiveUserId) {
    return (
      <div className="card p-6">
        <PollHeader />
        <div className="text-center py-6 border-t border-p-border">
          <p className="text-p-muted text-sm mb-4">Sign in with Discord to cast your vote.</p>
          <button onClick={() => signIn('discord')} className="btn-discord mx-auto">
            <LogIn size={14} /> Sign in with Discord
          </button>
        </div>
        {total > 0 && (
          <div className="mt-6 pt-6 border-t border-p-border">
            <p className="text-xs text-p-muted mb-3">Current results:</p>
            <Results />
          </div>
        )}
      </div>
    )
  }

  if (isClosed) {
    return (
      <div className="card p-6">
        <PollHeader />
        <div className="flex items-center gap-2 mb-5 text-sm text-p-muted bg-p-surface-2 border border-p-border rounded-lg px-3 py-2.5">
          <Lock size={14} /> This poll is closed.
        </div>
        <Results />
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="card p-6">
        <PollHeader />
        <div className="flex items-center gap-2 mb-5 text-sm text-p-success bg-p-success/10 border border-p-success/25 rounded-lg px-3 py-2.5">
          <Check size={14} /> Your vote is recorded.
          {myVotes[0]?.timeSlot && <span className="text-p-muted ml-1">({utcToLocal(myVotes[0].timeSlot)})</span>}
        </div>
        <Results />
        <button onClick={() => { setStep('vote'); setSelected(myVotes.map(v => v.optionId)); setTimeSlot('') }}
          className="btn-ghost text-xs mt-4">
          Change my vote
        </button>
      </div>
    )
  }

  if (step === 'vote') {
    return (
      <div className="card p-6">
        <PollHeader />
        <div className="space-y-3 mb-4">
          <p className="text-sm text-p-muted">
            {poll.allowMultiple ? 'Select all that apply:' : 'Choose one:'}
          </p>
          {poll.options.map(opt => (
            <button
              key={opt.id}
              disabled={loading}
              onClick={() => toggleOption(opt.id)}
              className={clsx(
                'w-full text-left px-4 py-3.5 rounded-xl border text-sm font-semibold transition-all duration-200',
                selected.includes(opt.id)
                  ? 'border-p-primary/60 bg-p-primary-b text-p-primary'
                  : 'border-p-border bg-p-surface text-p-text hover:border-p-border-2 hover:bg-p-surface-2'
              )}>
              <span className="flex items-center gap-2">
                {poll.allowMultiple && (
                  <span className={clsx(
                    'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center',
                    selected.includes(opt.id) ? 'border-p-primary bg-p-primary' : 'border-p-border'
                  )}>
                    {selected.includes(opt.id) && <Check size={10} className="text-white" />}
                  </span>
                )}
                {opt.text}
              </span>
            </button>
          ))}
        </div>
        {error && <p className="text-p-danger text-xs mb-3">{error}</p>}
        <button
          onClick={handleVoteSubmit}
          disabled={loading || selected.length === 0}
          className="btn-primary w-full justify-center">
          {loading ? 'Submitting…' : poll.allowMultiple ? `Vote (${selected.length} selected)` : 'Submit Vote'}
        </button>
      </div>
    )
  }

  // Time slot step
  return (
    <div className="card p-6">
      <PollHeader />
      <button onClick={() => setStep('vote')} className="text-xs text-p-muted hover:text-p-text mb-4 flex items-center gap-1">
        ← Back
      </button>
      <p className="text-sm text-p-muted mb-4">Pick your preferred time:</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {poll.timeSlots.map(ts => (
          <button
            key={ts}
            disabled={loading}
            onClick={() => { setTimeSlot(ts); submitVote(ts) }}
            className={clsx(
              'px-3 py-3 rounded-xl border text-sm font-display font-semibold transition-all',
              timeSlot === ts
                ? 'border-p-accent/60 bg-p-accent-b text-p-accent'
                : 'border-p-border bg-p-surface text-p-text hover:border-p-border-2 hover:bg-p-surface-2'
            )}>
            {utcToLocal(ts)}
          </button>
        ))}
      </div>
      <button
        onClick={() => submitVote(undefined)}
        disabled={loading}
        className="btn-ghost text-sm w-full justify-center">
        No preference
      </button>
      {error && <p className="text-p-danger text-xs mt-3">{error}</p>}
    </div>
  )
}
