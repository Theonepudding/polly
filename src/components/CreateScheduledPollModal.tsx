'use client'
import { useState, useMemo } from 'react'
import { X, Plus, Trash2, Clock, RefreshCw } from 'lucide-react'
import SelectInput from './SelectInput'

const INTERVAL_PRESETS = [
  { label: 'Daily',     days: 1  },
  { label: 'Weekly',    days: 7  },
  { label: 'Bi-weekly', days: 14 },
  { label: 'Monthly',   days: 30 },
]

const DEFAULT_TIMES_UTC = ['17:00', '18:00', '19:00', '20:00', '21:00']

function utcToLocal(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return hhMM
  const d = new Date(); d.setUTCHours(h, m, 0, 0)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function localTimeToUTCHour(localHHMM: string): number {
  const [h, m] = localHHMM.split(':').map(Number)
  const d = new Date(); d.setHours(h, m, 0, 0)
  return d.getUTCHours()
}

function localToUTCHHMM(localHHMM: string): string {
  const [h, m] = localHHMM.split(':').map(Number)
  const d = new Date(); d.setHours(h, m, 0, 0)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function defaultStartDate(intervalDays: number, atHour: number): string {
  const d = new Date(); d.setUTCHours(atHour, 0, 0, 0)
  if (d <= new Date()) d.setDate(d.getDate() + intervalDays)
  return d.toLocaleDateString('en-CA')
}

interface Props {
  guildId:  string
  userId:   string
  userName: string
}

export default function CreateScheduledPollModal({ guildId, userId, userName }: Props) {
  const [open, setOpen] = useState(false)
  const [title,        setTitle]        = useState('')
  const [description,  setDescription]  = useState('')
  const [options,      setOptions]      = useState(['', ''])
  const [intervalDays, setIntervalDays] = useState(7)
  const [customDays,   setCustomDays]   = useState('')
  const [useCustom,    setUseCustom]    = useState(false)
  const [localTime,    setLocalTime]    = useState('18:00')
  const [startDate,    setStartDate]    = useState(() => defaultStartDate(7, 18))
  const [useTimes,     setUseTimes]     = useState(false)
  const [times,        setTimes]        = useState<string[]>(DEFAULT_TIMES_UTC.slice(0, 3))
  const [customTime,   setCustomTime]   = useState('')
  const [daysOpen,     setDaysOpen]     = useState(7)
  const [postDiscord,  setPostDiscord]  = useState(true)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  const atHour = useMemo(() => localTimeToUTCHour(localTime), [localTime])
  const todayLocal = new Date().toLocaleDateString('en-CA')
  const startDayHint = useMemo(() => {
    if (!startDate) return ''
    return new Date(`${startDate}T${localTime}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  }, [startDate, localTime])

  function addOption() { if (options.length < 10) setOptions(o => [...o, '']) }
  function removeOption(i: number) { if (options.length > 2) setOptions(o => o.filter((_, idx) => idx !== i)) }
  function setOption(i: number, val: string) { setOptions(o => o.map((v, idx) => idx === i ? val : v)) }

  function selectPreset(days: number) {
    setIntervalDays(days); setUseCustom(false); setCustomDays('')
    setStartDate(defaultStartDate(days, localTimeToUTCHour(localTime)))
  }

  function applyCustomDays() {
    const n = parseInt(customDays)
    if (n >= 1 && n <= 365) { setIntervalDays(n); setUseCustom(false); setStartDate(defaultStartDate(n, localTimeToUTCHour(localTime))) }
  }

  function toggleSlot(t: string) {
    setTimes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }
  function addCustomSlot() {
    if (!customTime) return
    const utc = localToUTCHHMM(customTime)
    if (!times.includes(utc)) { setTimes(prev => [...prev, utc]); setCustomTime('') }
  }

  function pickPresetTime(utcHHMM: string) {
    const [h, m] = utcHHMM.split(':').map(Number)
    const d = new Date(); d.setUTCHours(h, m, 0, 0)
    const local = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    const [lh, lm] = local.split(':')
    setLocalTime(`${lh.padStart(2, '0')}:${(lm ?? '00').padStart(2, '0')}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleanOpts = options.filter(o => o.trim())
    if (!title.trim()) return setError('Please add a title.')
    if (cleanOpts.length < 2) return setError('At least 2 options required.')
    if (!startDate) return setError('Please pick a start date.')
    const nextRunAt = new Date(`${startDate}T${localTime}:00`).toISOString()
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/guilds/${guildId}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          options: cleanOpts.map((text, i) => ({ id: `opt-${i}`, text })),
          includeTimeSlots: useTimes,
          timeSlots: useTimes ? times : [],
          isAnonymous: false,
          allowMultiple: false,
          daysOpen,
          intervalDays,
          atHour,
          nextRunAt,
          postToDiscord: postDiscord,
          createdBy: userId,
          createdByName: userName,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create schedule')
      setOpen(false)
      window.location.reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setLoading(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        <RefreshCw size={14} />
        New Schedule
      </button>
    )
  }

  function Toggle({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc: string }) {
    return (
      <div className="flex items-center justify-between p-4 rounded-xl border border-p-border bg-p-surface cursor-pointer hover:border-p-border-2 transition-all" onClick={onToggle}>
        <div>
          <p className="text-sm font-semibold text-p-text">{label}</p>
          <p className="text-xs text-p-muted mt-0.5">{desc}</p>
        </div>
        <div className={`w-10 h-6 rounded-full border transition-all ml-4 shrink-0 ${on ? 'bg-p-primary-d border-p-primary/80' : 'bg-p-surface-2 border-p-border'}`}>
          <div className={`w-4 h-4 rounded-full bg-white mt-0.5 ml-0.5 transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg card shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-p-border">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-p-primary" />
            <h2 className="font-display font-bold text-xl text-p-text">New Scheduled Poll</h2>
          </div>
          <button onClick={() => setOpen(false)} className="text-p-muted hover:text-p-text p-1"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="label">Question *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly raid night vote" maxLength={120} />
          </div>

          <div>
            <label className="label">Description <span className="normal-case text-p-muted/50">(optional)</span></label>
            <textarea className="textarea" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Any extra context for voters…" maxLength={400} />
          </div>

          <div>
            <label className="label">Options *</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input flex-1" value={opt} onChange={e => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} maxLength={80} />
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

          <Toggle on={useTimes} onToggle={() => setUseTimes(v => !v)} label="Time slot voting" desc="Voters pick a preferred time" />
          {useTimes && (
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {[...DEFAULT_TIMES_UTC, ...times.filter(t => !DEFAULT_TIMES_UTC.includes(t))].map(t => (
                  <button key={t} type="button" onClick={() => toggleSlot(t)}
                    className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${times.includes(t) ? 'badge-primary' : 'badge-muted'}`}>
                    {utcToLocal(t)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="time" className="input flex-1 text-sm py-2" value={customTime} onChange={e => setCustomTime(e.target.value)} />
                <button type="button" onClick={addCustomSlot} className="btn-secondary text-xs shrink-0"><Plus size={13} />Add</button>
              </div>
            </div>
          )}

          <div>
            <label className="label">Repeat every</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {INTERVAL_PRESETS.map(p => (
                <button key={p.days} type="button" onClick={() => selectPreset(p.days)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${!useCustom && intervalDays === p.days ? 'badge-primary' : 'badge-muted'}`}>
                  {p.label}
                </button>
              ))}
              <button type="button" onClick={() => setUseCustom(u => !u)}
                className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${useCustom ? 'badge-primary' : 'badge-muted'}`}>
                Custom…
              </button>
            </div>
            {useCustom && (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-p-muted shrink-0">Every</span>
                <input type="number" min={1} max={365} className="input w-24 text-sm py-2 text-center" value={customDays} onChange={e => setCustomDays(e.target.value)} placeholder="7" />
                <span className="text-xs text-p-muted shrink-0">days</span>
                <button type="button" onClick={applyCustomDays} className="btn-ghost text-xs ml-auto">Apply</button>
              </div>
            )}
          </div>

          <div>
            <label className="label">First poll on</label>
            <input type="date" className="input text-sm" value={startDate} min={todayLocal} onChange={e => setStartDate(e.target.value)} />
            {startDate && <p className="text-xs text-p-muted mt-1">Starts <span className="text-p-text">{startDayHint}</span></p>}
          </div>

          <div>
            <label className="label flex items-center gap-1.5"><Clock size={13} className="opacity-60" />Post time (your local time)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {DEFAULT_TIMES_UTC.map(utc => (
                <button key={utc} type="button" onClick={() => pickPresetTime(utc)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${utcToLocal(utc) === localTime ? 'badge-primary' : 'badge-muted'}`}>
                  {utcToLocal(utc)}
                </button>
              ))}
            </div>
            <input type="time" className="input text-sm py-2 w-full" value={localTime} onChange={e => { if (e.target.value) setLocalTime(e.target.value) }} />
            <p className="text-[11px] text-p-muted mt-1">UTC {String(atHour).padStart(2, '0')}:00</p>
          </div>

          <div>
            <label className="label">Each poll stays open for</label>
            <SelectInput value={String(daysOpen)} onChange={v => setDaysOpen(Number(v))} options={[
              { value: '1', label: '1 day' }, { value: '3', label: '3 days' },
              { value: '7', label: '7 days' }, { value: '14', label: '14 days' },
            ]} />
          </div>

          <Toggle on={postDiscord} onToggle={() => setPostDiscord(v => !v)} label="Post to Discord automatically" desc="Each new poll will be announced in the channel" />

          {error && <p className="text-p-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Saving…' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
