'use client'
import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Trash2, RefreshCw, ChevronDown, Smile, Clock } from 'lucide-react'
import EmojiPickerPanel, { type DiscordEmoji as DE } from './EmojiPickerPanel'

const INTERVAL_PRESETS = [
  { label: 'Daily',     days: 1  },
  { label: 'Weekly',    days: 7  },
  { label: 'Bi-weekly', days: 14 },
  { label: 'Monthly',   days: 30 },
]

const DEFAULT_TIMES_UTC = ['17:00', '18:00', '19:00', '20:00', '21:00']
const DAYS_OPEN_OPTIONS = [1, 3, 7, 14]

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

type DiscordEmoji = DE
interface Role { id: string; name: string; mentionable?: boolean }

interface Props {
  guildId:  string
  userId:   string
  userName: string
}

function EmojiPreview({ text }: { text: string }) {
  if (!/<a?:\w+:\d+>/.test(text)) return null
  const parts = text.split(/(<a?:\w+:\d+>)/g)
  return (
    <div className="flex items-center flex-wrap gap-1 px-0.5 pt-1.5">
      <span className="text-[10px] text-p-subtle mr-0.5">preview:</span>
      {parts.map((part, i) => {
        const m = part.match(/^<(a?):(\w+):(\d+)>$/)
        if (m) return <img key={i} src={`https://cdn.discordapp.com/emojis/${m[3]}.${m[1]==='a'?'gif':'png'}?size=32`} alt={m[2]} className="w-4 h-4 object-contain inline-block" />
        return part ? <span key={i} className="text-xs text-p-muted">{part}</span> : null
      })}
    </div>
  )
}

export default function CreateScheduledPollModal({ guildId, userId, userName }: Props) {
  const [open,          setOpen]          = useState(false)
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]   = useState('')
  const [options,       setOptions]       = useState(['', ''])
  const [isAnonymous,   setIsAnonymous]   = useState(false)
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [useTimes,      setUseTimes]      = useState(false)
  const [times,         setTimes]         = useState<string[]>(DEFAULT_TIMES_UTC.slice(0, 3))
  const [customTime,    setCustomTime]    = useState('')
  const [intervalDays,  setIntervalDays]  = useState(7)
  const [customDays,    setCustomDays]    = useState('')
  const [useCustom,     setUseCustom]     = useState(false)
  const [localTime,     setLocalTime]     = useState('18:00')
  const [startDate,     setStartDate]     = useState(() => defaultStartDate(7, 18))
  const [daysOpen,      setDaysOpen]      = useState(7)
  const [postDiscord,   setPostDiscord]   = useState(true)
  const [showAdvanced,  setShowAdvanced]  = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [emojis,        setEmojis]        = useState<DiscordEmoji[]>([])
  const [roles,         setRoles]         = useState<Role[]>([])
  const [emojiPickerFor,  setEmojiPickerFor]  = useState<number | null>(null)
  const [emojiPickerPos,  setEmojiPickerPos]  = useState<{ top: number; left: number } | null>(null)
  const [emojiTab,        setEmojiTab]        = useState<string>('server')

  const atHour = useMemo(() => localTimeToUTCHour(localTime), [localTime])
  const todayLocal = new Date().toLocaleDateString('en-CA')
  const startDayHint = useMemo(() => {
    if (!startDate) return ''
    return new Date(`${startDate}T${localTime}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  }, [startDate, localTime])

  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch(`/api/guilds/${guildId}/channels?type=roles`).then(r => r.ok ? r.json() : []),
      fetch(`/api/guilds/${guildId}/emojis`).then(r => r.ok ? r.json() : []),
    ]).then(([rl, em]) => {
      setRoles((rl as Role[]).filter((r: Role) => r.name !== '@everyone'))
      const filtered = (em as DiscordEmoji[]).filter(e => e.available !== false)
      setEmojis(filtered)
      if (filtered.length === 0) setEmojiTab('smileys')
    }).catch(() => {})
  }, [open, guildId])

  useEffect(() => {
    if (emojiPickerFor === null) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Element
      if (target.closest('[data-emoji-picker]') || target.closest('[data-emoji-btn]')) return
      setEmojiPickerFor(null); setEmojiPickerPos(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [emojiPickerFor])

  function reset() {
    setTitle(''); setDescription(''); setOptions(['', ''])
    setIsAnonymous(false); setAllowMultiple(false); setUseTimes(false)
    setTimes(DEFAULT_TIMES_UTC.slice(0, 3)); setCustomTime('')
    setIntervalDays(7); setCustomDays(''); setUseCustom(false)
    setLocalTime('18:00'); setStartDate(defaultStartDate(7, 18))
    setDaysOpen(7); setPostDiscord(true); setShowAdvanced(false)
    setError(''); setEmojiPickerFor(null); setEmojiPickerPos(null); setEmojiTab('server')
  }

  function addOption() { if (options.length < 12) setOptions(o => [...o, '']) }
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

  function openEmojiPicker(i: number, e: { currentTarget: HTMLButtonElement }) {
    if (emojiPickerFor === i) { setEmojiPickerFor(null); setEmojiPickerPos(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const pickerWidth = 260
    const left = Math.max(8, Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8))
    const top  = Math.min(rect.bottom + 4, window.innerHeight - 220)
    setEmojiPickerFor(i); setEmojiPickerPos({ top, left })
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
          isAnonymous,
          allowMultiple,
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
      setOpen(false); reset()
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setOpen(false); reset() }} />
      <div className="relative w-full max-w-lg card shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-p-border">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-p-primary" />
            <h2 className="font-display font-bold text-xl text-p-text">New Scheduled Poll</h2>
          </div>
          <button onClick={() => { setOpen(false); reset() }} className="text-p-muted hover:text-p-text p-1"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">

          {/* Question */}
          <div>
            <label className="label">Question *</label>
            <div className="flex items-center gap-2 group">
              <input className="input flex-1" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Weekly raid night vote" maxLength={120} />
              <button
                type="button" data-emoji-btn=""
                onClick={e => openEmojiPicker(-1, e)}
                title="Insert emoji"
                className={`p-1.5 rounded-md transition-all shrink-0 ${
                  emojiPickerFor === -1
                    ? 'text-p-primary bg-p-primary-b opacity-100'
                    : 'text-p-subtle hover:text-p-primary hover:bg-p-primary-b opacity-0 group-hover:opacity-100'
                }`}>
                <Smile size={14} />
              </button>
            </div>
            <EmojiPreview text={title} />
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Options *</label>
              <span className="text-xs text-p-subtle">{options.filter(o => o.trim()).length} / 12</span>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 group">
                    <span className="w-6 h-6 rounded-md bg-p-primary-b border border-p-primary/25 flex items-center justify-center text-[11px] font-bold text-p-primary shrink-0">
                      {i + 1}
                    </span>
                    <input className="input flex-1 py-2" value={opt} onChange={e => setOption(i, e.target.value)}
                      placeholder={i === 0 ? 'First option…' : i === 1 ? 'Second option…' : `Option ${i + 1}…`}
                      maxLength={80} />
                    <button
                      type="button" data-emoji-btn=""
                      onClick={e => openEmojiPicker(i, e)}
                      title="Insert emoji"
                      className={`p-1.5 rounded-md transition-all shrink-0 ${
                        emojiPickerFor === i
                          ? 'text-p-primary bg-p-primary-b opacity-100'
                          : 'text-p-subtle hover:text-p-primary hover:bg-p-primary-b opacity-0 group-hover:opacity-100'
                      }`}>
                      <Smile size={14} />
                    </button>
                    {options.length > 2 && (
                      <button type="button" onClick={() => removeOption(i)}
                        className="p-1.5 text-p-subtle hover:text-p-danger hover:bg-p-danger/10 rounded-md transition-all opacity-0 group-hover:opacity-100 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <EmojiPreview text={opt} />
                </div>
              ))}
              {options.length < 12 && (
                <button type="button" onClick={addOption}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-p-border text-p-muted text-xs hover:border-p-primary/40 hover:text-p-primary hover:bg-p-primary-b transition-all">
                  <Plus size={13} /> Add option {options.length + 1}
                </button>
              )}
            </div>
          </div>

          {/* Compact voting options */}
          <div>
            <label className="label mb-2">Voting options</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIsAnonymous(v => !v)}
                className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${isAnonymous ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                Anonymous
              </button>
              <button type="button" onClick={() => setAllowMultiple(v => !v)}
                className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${allowMultiple ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                Multi-choice
              </button>
              <button type="button" onClick={() => setUseTimes(v => !v)}
                className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${useTimes ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                Time slots
              </button>
              <button type="button" onClick={() => setPostDiscord(v => !v)}
                className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${postDiscord ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                Post to Discord
              </button>
            </div>
          </div>

          {/* Time slot picker */}
          {useTimes && (
            <div className="pl-1">
              <label className="label">Time presets <span className="normal-case font-normal text-p-muted/50">(your local time)</span></label>
              <div className="flex flex-wrap gap-2 mb-3">
                {[...DEFAULT_TIMES_UTC, ...times.filter(t => !DEFAULT_TIMES_UTC.includes(t))].map(t => (
                  <button key={t} type="button" onClick={() => toggleSlot(t)}
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
                <button type="button" onClick={addCustomSlot} className="btn-secondary text-xs shrink-0">
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          )}

          {/* Repeat interval */}
          <div>
            <label className="label">Repeat every</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {INTERVAL_PRESETS.map(p => (
                <button key={p.days} type="button" onClick={() => selectPreset(p.days)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${!useCustom && intervalDays === p.days ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                  {p.label}
                </button>
              ))}
              <button type="button" onClick={() => setUseCustom(u => !u)}
                className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${useCustom ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                Custom…
              </button>
            </div>
            {useCustom && (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-p-muted shrink-0">Every</span>
                <input type="number" min={1} max={365} className="input w-24 text-sm py-2 text-center"
                  value={customDays} onChange={e => setCustomDays(e.target.value)} placeholder="7" />
                <span className="text-xs text-p-muted shrink-0">days</span>
                <button type="button" onClick={applyCustomDays} className="btn-ghost text-xs ml-auto">Apply</button>
              </div>
            )}
          </div>

          {/* First poll date */}
          <div>
            <label className="label">First poll on</label>
            <input type="date" className="input text-sm" value={startDate} min={todayLocal}
              onChange={e => setStartDate(e.target.value)} />
            {startDate && <p className="text-xs text-p-muted mt-1">Starts <span className="text-p-text">{startDayHint}</span></p>}
          </div>

          {/* Post time */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Clock size={13} className="opacity-60" />
              Post time (your local time)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {DEFAULT_TIMES_UTC.map(utc => (
                <button key={utc} type="button" onClick={() => pickPresetTime(utc)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${utcToLocal(utc) === localTime ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                  {utcToLocal(utc)}
                </button>
              ))}
            </div>
            <input type="time" className="input text-sm py-2 w-full"
              value={localTime} onChange={e => { if (e.target.value) setLocalTime(e.target.value) }} />
            <p className="text-[11px] text-p-muted mt-1">UTC {String(atHour).padStart(2, '0')}:00</p>
          </div>

          {/* Days open */}
          <div>
            <label className="label">Each poll stays open for</label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OPEN_OPTIONS.map(d => (
                <button key={d} type="button" onClick={() => setDaysOpen(d)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${daysOpen === d ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                  {d === 1 ? '1 day' : `${d} days`}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced options */}
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            className="text-p-muted text-xs hover:text-p-text transition-colors flex items-center gap-1.5 w-full py-1">
            <ChevronDown size={13} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {showAdvanced ? 'Hide' : 'More'} options
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-p-border pt-4">
              <div>
                <label className="label">Description <span className="normal-case text-p-muted/50">(optional)</span></label>
                <textarea className="textarea" rows={2} value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Any extra context for voters…" maxLength={400} />
              </div>

              {roles.some(r => r.mentionable) && (
                <div>
                  <label className="label">Notify roles when posting</label>
                  <p className="text-p-muted text-xs mb-2">Only mentionable roles are shown. These will be @mentioned each time a new poll is posted.</p>
                  <div className="flex flex-wrap gap-2">
                    {roles.filter(r => r.mentionable).map(role => (
                      <span key={role.id} className="badge badge-muted text-xs px-3 py-1.5 opacity-50 cursor-not-allowed" title="Per-schedule ping roles coming soon">
                        {role.name}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-p-muted mt-1.5">Role pings for scheduled polls are configured at the server level.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-p-danger text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setOpen(false); reset() }} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Saving…' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>

      {/* Emoji picker — fixed position outside modal overflow */}
      {emojiPickerFor !== null && emojiPickerPos && (
        <EmojiPickerPanel
          top={emojiPickerPos.top}
          left={emojiPickerPos.left}
          tab={emojiTab}
          emojis={emojis}
          label={`Server emojis — ${emojiPickerFor === -1 ? 'title' : `option ${emojiPickerFor + 1}`}`}
          onTabChange={setEmojiTab}
          onPickGuild={e => {
            const s = `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`
            if (emojiPickerFor === -1) setTitle(prev => prev + s)
            else setOption(emojiPickerFor, options[emojiPickerFor] + s)
            setEmojiPickerFor(null); setEmojiPickerPos(null)
          }}
          onPickStd={em => {
            if (emojiPickerFor === -1) setTitle(prev => prev + em)
            else setOption(emojiPickerFor, options[emojiPickerFor] + em)
            setEmojiPickerFor(null); setEmojiPickerPos(null)
          }}
        />
      )}
    </div>
  )
}
