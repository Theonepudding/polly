'use client'
import { useState } from 'react'
import { X, Plus, Trash2, Send, CheckCircle2, AlertCircle, Vote } from 'lucide-react'
import SelectInput from './SelectInput'
import { Poll } from '@/types'

const DEFAULT_TIMES_UTC = ['17:00', '18:00', '19:00', '20:00', '21:00']

function utcToLocal(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return hhMM
  const d = new Date()
  d.setUTCHours(h, m, 0, 0)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function Toggle({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc: string }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-p-border bg-p-surface cursor-pointer hover:border-p-border-2 transition-all"
      onClick={onToggle}>
      <div>
        <p className="text-sm font-semibold text-p-text">{label}</p>
        <p className="text-xs text-p-muted mt-0.5">{desc}</p>
      </div>
      <div className={`w-10 h-6 rounded-full border transition-all ml-4 shrink-0 ${
        on ? 'bg-p-primary-d border-p-primary/80' : 'bg-p-surface-2 border-p-border'
      }`}>
        <div className={`w-4 h-4 rounded-full bg-white mt-0.5 ml-0.5 transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
    </div>
  )
}

interface Props {
  guildId:  string
  userId:   string
  userName: string
}

export default function CreatePollModal({ guildId, userId, userName }: Props) {
  const [open,        setOpen]        = useState(false)
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [options,     setOptions]     = useState(['', ''])
  const [useTimes,    setUseTimes]    = useState(false)
  const [times,       setTimes]       = useState<string[]>(DEFAULT_TIMES_UTC.slice(0, 3))
  const [customTime,  setCustomTime]  = useState('')
  const [daysOpen,    setDaysOpen]    = useState(7)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [createdPoll, setCreatedPoll] = useState<Poll | null>(null)
  const [posting,     setPosting]     = useState(false)
  const [postStatus,  setPostStatus]  = useState<'idle' | 'ok' | 'fail'>('idle')

  function reset() {
    setTitle(''); setDescription(''); setOptions(['', '']); setUseTimes(false)
    setTimes(DEFAULT_TIMES_UTC.slice(0, 3)); setDaysOpen(7); setIsAnonymous(false)
    setAllowMultiple(false); setError(''); setCreatedPoll(null); setPostStatus('idle')
  }

  function addOption() { if (options.length < 10) setOptions(o => [...o, '']) }
  function removeOption(i: number) { if (options.length > 2) setOptions(o => o.filter((_, idx) => idx !== i)) }
  function setOption(i: number, val: string) { setOptions(o => o.map((v, idx) => idx === i ? val : v)) }

  function toggleTime(t: string) {
    setTimes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }
  function addCustomTime() {
    if (!customTime) return
    const [h, m] = customTime.split(':').map(Number)
    const d = new Date(); d.setHours(h, m, 0, 0)
    const utc = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    if (!times.includes(utc)) { setTimes(prev => [...prev, utc]); setCustomTime('') }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleanOpts = options.filter(o => o.trim())
    if (!title.trim()) return setError('Please add a title.')
    if (cleanOpts.length < 2) return setError('At least 2 options required.')
    setLoading(true); setError('')
    try {
      const closesAt = new Date()
      closesAt.setDate(closesAt.getDate() + daysOpen)
      const res = await fetch(`/api/guilds/${guildId}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          options: cleanOpts.map((text, i) => ({ id: `opt-${i}`, text })),
          includeTimeSlots: useTimes,
          timeSlots: useTimes ? times : [],
          isAnonymous,
          allowMultiple,
          closesAt: closesAt.toISOString(),
          createdBy: userId,
          createdByName: userName,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create poll')
      const { poll } = await res.json()
      setCreatedPoll(poll)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setLoading(false) }
  }

  async function postToDiscord() {
    if (!createdPoll) return
    setPosting(true)
    try {
      const res = await fetch(`/api/guilds/${guildId}/polls/${createdPoll.id}/discord`, { method: 'POST' })
      setPostStatus(res.ok ? 'ok' : 'fail')
    } catch { setPostStatus('fail') }
    finally { setPosting(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        <Vote size={15} />
        Create Poll
      </button>
    )
  }

  // Step 2 — Discord prompt
  if (createdPoll) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setOpen(false); reset() }} />
        <div className="relative w-full max-w-md card p-6 shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-xl text-p-text">Poll Created!</h2>
            <button onClick={() => { setOpen(false); reset() }} className="text-p-muted hover:text-p-text p-1">
              <X size={18} />
            </button>
          </div>
          <p className="text-p-muted text-sm mb-6">
            <span className="text-p-text font-semibold">{createdPoll.title}</span> is live. Post it to your Discord announcement channel?
          </p>
          {postStatus === 'idle' && (
            <div className="flex gap-3">
              <button onClick={postToDiscord} disabled={posting} className="btn-primary flex-1 justify-center">
                <Send size={14} />{posting ? 'Posting…' : 'Post to Discord'}
              </button>
              <button onClick={() => { setOpen(false); reset() }} className="btn-secondary flex-1 justify-center">Skip</button>
            </div>
          )}
          {postStatus === 'ok' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-p-success text-sm"><CheckCircle2 size={16} />Posted!</div>
              <button onClick={() => { setOpen(false); reset() }} className="btn-primary w-full justify-center">Done</button>
            </div>
          )}
          {postStatus === 'fail' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-p-warning text-sm"><AlertCircle size={16} />Couldn&apos;t post — check your announce channel in Settings.</div>
              <button onClick={() => { setOpen(false); reset() }} className="btn-ghost w-full justify-center">Close</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg card shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-p-border">
          <h2 className="font-display font-bold text-xl text-p-text">Create Poll</h2>
          <button onClick={() => setOpen(false)} className="text-p-muted hover:text-p-text p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="label">Question *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Raid night: Friday or Saturday?" maxLength={120} />
          </div>

          <div>
            <label className="label">Description <span className="normal-case text-p-muted/50">(optional)</span></label>
            <textarea className="textarea" rows={2} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Any extra context for voters…" maxLength={400} />
          </div>

          <div>
            <label className="label">Options *</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input flex-1" value={opt} onChange={e => setOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`} maxLength={80} />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)} className="p-2 text-p-muted hover:text-p-danger transition-colors">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 10 && (
                <button type="button" onClick={addOption} className="btn-ghost text-xs w-full justify-center">
                  <Plus size={13} /> Add option
                </button>
              )}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <Toggle on={isAnonymous}    onToggle={() => setIsAnonymous(v => !v)}    label="Anonymous voting"    desc="Voter names are hidden from everyone" />
            <Toggle on={allowMultiple}  onToggle={() => setAllowMultiple(v => !v)}  label="Multi-choice"        desc="Allow voting for more than one option" />
            <Toggle on={useTimes}       onToggle={() => setUseTimes(v => !v)}       label="Time slot voting"    desc="Voters can pick a preferred time after choosing" />
          </div>

          {useTimes && (
            <div>
              <label className="label">Time presets <span className="normal-case font-normal text-p-muted/50">(your local time)</span></label>
              <div className="flex flex-wrap gap-2 mb-3">
                {[...DEFAULT_TIMES_UTC, ...times.filter(t => !DEFAULT_TIMES_UTC.includes(t))].map(t => (
                  <button key={t} type="button" onClick={() => toggleTime(t)}
                    className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                      times.includes(t) ? 'badge-primary' : 'badge-muted hover:border-p-border-2'
                    }`}>
                    {utcToLocal(t)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="time" className="input flex-1 text-sm py-2"
                  value={customTime} onChange={e => setCustomTime(e.target.value)} />
                <button type="button" onClick={addCustomTime} className="btn-secondary text-xs shrink-0">
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="label">Poll duration</label>
            <SelectInput
              value={String(daysOpen)}
              onChange={v => setDaysOpen(Number(v))}
              options={[
                { value: '1',  label: '1 day'   },
                { value: '3',  label: '3 days'  },
                { value: '7',  label: '7 days'  },
                { value: '14', label: '14 days' },
                { value: '30', label: '30 days' },
              ]}
            />
          </div>

          {error && <p className="text-p-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Creating…' : 'Create Poll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
