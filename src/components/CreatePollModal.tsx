'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2, CheckCircle2, AlertCircle, Vote, Settings, Hash, Bell } from 'lucide-react'
import Link from 'next/link'
import SelectInput from './SelectInput'
import { Poll, PollTemplate } from '@/types'

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

interface Channel { id: string; name: string }
interface Role    { id: string; name: string }

interface Props {
  guildId:  string
  userId:   string
  userName: string
}

export default function CreatePollModal({ guildId, userId, userName }: Props) {
  const router = useRouter()
  const [open,            setOpen]            = useState(false)
  const [title,           setTitle]           = useState('')
  const [description,     setDescription]     = useState('')
  const [options,         setOptions]         = useState(['', ''])
  const [useTimes,        setUseTimes]        = useState(false)
  const [times,           setTimes]           = useState<string[]>(DEFAULT_TIMES_UTC.slice(0, 3))
  const [customTime,      setCustomTime]      = useState('')
  const [daysOpen,        setDaysOpen]        = useState(7)
  const [isAnonymous,     setIsAnonymous]     = useState(false)
  const [allowMultiple,   setAllowMultiple]   = useState(false)
  const [isYesNo,         setIsYesNo]         = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [createdPoll,     setCreatedPoll]     = useState<Poll | null>(null)
  const [posted,          setPosted]          = useState(false)
  const [hasChannel,      setHasChannel]      = useState(false)
  // extra features
  const [channels,        setChannels]        = useState<Channel[]>([])
  const [roles,           setRoles]           = useState<Role[]>([])
  const [templates,       setTemplates]       = useState<PollTemplate[]>([])
  const [overrideChannel, setOverrideChannel] = useState('')
  const [pingRoleIds,     setPingRoleIds]     = useState<string[]>([])
  const [showAdvanced,    setShowAdvanced]    = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch(`/api/guilds/${guildId}/channels`).then(r => r.ok ? r.json() : []),
      fetch(`/api/guilds/${guildId}/channels?type=roles`).then(r => r.ok ? r.json() : []),
      fetch(`/api/guilds/${guildId}/templates`).then(r => r.ok ? r.json() : { templates: [] }),
    ]).then(([ch, rl, tmpl]) => {
      setChannels((ch as { id: string; name: string; type: number }[]).filter(c => c.type === 0))
      setRoles((rl as Role[]).filter((r: Role) => r.name !== '@everyone'))
      setTemplates(((tmpl as { templates: PollTemplate[] }).templates ?? []).filter((t: PollTemplate) => t.active))
    }).catch(() => {})
  }, [open, guildId])

  function reset() {
    setTitle(''); setDescription(''); setOptions(['', '']); setUseTimes(false)
    setTimes(DEFAULT_TIMES_UTC.slice(0, 3)); setDaysOpen(7); setIsAnonymous(false)
    setAllowMultiple(false); setIsYesNo(false); setError(''); setCreatedPoll(null)
    setPosted(false); setHasChannel(false); setOverrideChannel(''); setPingRoleIds([])
    setShowAdvanced(false)
  }

  function loadTemplate(t: PollTemplate) {
    setTitle(t.title)
    setDescription(t.description ?? '')
    setOptions(t.options.map(o => o.text))
    setIsAnonymous(t.isAnonymous)
    setAllowMultiple(t.allowMultiple)
    setUseTimes(t.includeTimeSlots)
    if (t.includeTimeSlots) setTimes(t.timeSlots)
    setDaysOpen(t.daysOpen)
    setIsYesNo(false)
  }

  function applyYesNo(on: boolean) {
    setIsYesNo(on)
    if (on) setOptions(['✅ Yes', '❌ No'])
    else    setOptions(['', ''])
  }

  function addOption()  { if (options.length < 10) setOptions(o => [...o, '']) }
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

  function togglePingRole(id: string) {
    setPingRoleIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id])
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
          pingRoleIds:      pingRoleIds.length ? pingRoleIds : undefined,
          overrideChannelId: overrideChannel || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create poll')
      const data = await res.json()
      setCreatedPoll(data.poll)
      setPosted(data.posted ?? false)
      setHasChannel(data.hasChannel ?? false)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setLoading(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        <Vote size={15} />
        Create Poll
      </button>
    )
  }

  // Success screen
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
          <p className="text-p-muted text-sm mb-5">
            <span className="text-p-text font-semibold">{createdPoll.title}</span> is now live.
          </p>

          {posted && (
            <div className="flex items-center gap-2 text-p-success text-sm mb-5">
              <CheckCircle2 size={16} />
              Posted to your Discord announcement channel.
            </div>
          )}

          {!posted && hasChannel && (
            <div className="flex items-center gap-2 text-p-warning text-sm mb-5">
              <AlertCircle size={16} />
              Couldn&apos;t post to Discord — make sure the bot has <strong>Send Messages</strong> and <strong>Embed Links</strong> permission.
            </div>
          )}

          {!hasChannel && (
            <div className="flex items-center gap-2 text-p-muted text-sm mb-5">
              <Settings size={15} className="shrink-0" />
              <span>No announcement channel set. <Link href={`/dashboard/${guildId}/settings`} onClick={() => { setOpen(false); reset() }} className="text-p-primary hover:underline">Open Settings</Link> to pick one.</span>
            </div>
          )}

          <button onClick={() => { setOpen(false); reset() }} className="btn-primary w-full justify-center">Done</button>
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

          {/* Load template */}
          {templates.length > 0 && (
            <div>
              <label className="label">Load from template</label>
              <select className="input" defaultValue=""
                onChange={e => {
                  const t = templates.find(x => x.id === e.target.value)
                  if (t) loadTemplate(t)
                  e.target.value = ''
                }}>
                <option value="">— Select a template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          )}

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

          {/* Quick yes/no toggle */}
          <Toggle
            on={isYesNo}
            onToggle={() => applyYesNo(!isYesNo)}
            label="Quick Yes / No"
            desc='Auto-fills options as "✅ Yes" and "❌ No"'
          />

          {!isYesNo && (
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
          )}

          {/* Toggles */}
          <div className="space-y-2">
            <Toggle on={isAnonymous}   onToggle={() => setIsAnonymous(v => !v)}   label="Anonymous voting"  desc="Voter names are hidden from everyone" />
            <Toggle on={allowMultiple} onToggle={() => setAllowMultiple(v => !v)} label="Multi-choice"      desc="Allow voting for more than one option" />
            <Toggle on={useTimes}      onToggle={() => setUseTimes(v => !v)}      label="Time slot voting"  desc="Voters can pick a preferred time after choosing" />
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

          {/* Advanced options */}
          <div>
            <button type="button" onClick={() => setShowAdvanced(v => !v)}
              className="text-p-muted text-xs hover:text-p-text transition-colors flex items-center gap-1.5">
              <Plus size={12} className={showAdvanced ? 'rotate-45 transition-transform' : 'transition-transform'} />
              {showAdvanced ? 'Hide' : 'Show'} advanced options
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 border-t border-p-border pt-4">

              {/* Ping roles */}
              {roles.length > 0 && (
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Bell size={12} className="text-p-muted" />
                    Notify roles when posting
                  </label>
                  <p className="text-p-muted text-xs mb-2">These roles will be @mentioned when the poll is posted to Discord.</p>
                  <div className="flex flex-wrap gap-2">
                    {roles.map(role => (
                      <button key={role.id} type="button"
                        onClick={() => togglePingRole(role.id)}
                        className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                          pingRoleIds.includes(role.id)
                            ? 'badge-primary'
                            : 'badge-muted hover:border-p-border-2'
                        }`}>
                        {role.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Override channel */}
              {channels.length > 0 && (
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Hash size={12} className="text-p-muted" />
                    Post to specific channel
                  </label>
                  <p className="text-p-muted text-xs mb-2">Override the default announcement channel for this poll only.</p>
                  <select className="input" value={overrideChannel}
                    onChange={e => setOverrideChannel(e.target.value)}>
                    <option value="">— Use default announcement channel —</option>
                    {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

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
