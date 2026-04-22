'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2, RefreshCw, ChevronDown, Clock, Pencil } from 'lucide-react'
import EmojiPickerPanel, { type DiscordEmoji as DE } from './EmojiPickerPanel'
import EmojiInput, { type EmojiInputHandle } from './EmojiInput'
import type { ScheduledPoll } from '@/types'

const INTERVAL_PRESETS = [
  { label: 'Daily',     days: 1  },
  { label: 'Weekly',    days: 7  },
  { label: 'Bi-weekly', days: 14 },
  { label: 'Monthly',   days: 30 },
]

const DEFAULT_TIMES_UTC = ['17:00', '18:00', '19:00', '20:00', '21:00']

const DAYS_OPEN_PRESETS = [
  { label: '1 day',   days: 1  },
  { label: '2 days',  days: 2  },
  { label: '3 days',  days: 3  },
  { label: '1 week',  days: 7  },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
]

function utcToLocal(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return hhMM
  const d = new Date(); d.setUTCHours(h, m, 0, 0)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function isTimeSlot(s: string): boolean { return /^\d{2}:\d{2}$/.test(s) }
function displaySlot(s: string): string { return isTimeSlot(s) ? utcToLocal(s) : s }

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
  guildId:              string
  userId:               string
  userName:             string
  initialScheduledPoll?: ScheduledPoll
}


export default function CreateScheduledPollModal({ guildId, userId, userName, initialScheduledPoll }: Props) {
  const isEdit = !!initialScheduledPoll
  const router = useRouter()
  const [open,          setOpen]          = useState(false)
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]   = useState('')
  const [options,       setOptions]       = useState(['', ''])
  const [isAnonymous,   setIsAnonymous]   = useState(false)
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [useTimes,      setUseTimes]      = useState(false)
  const [times,         setTimes]         = useState<string[]>([])
  const [customTime,    setCustomTime]    = useState('')
  const [customSlotText,setCustomSlotText]= useState('')
  const [intervalDays,  setIntervalDays]  = useState(7)
  const [customDays,    setCustomDays]    = useState('')
  const [useCustom,     setUseCustom]     = useState(false)
  const [localTime,     setLocalTime]     = useState('18:00')
  const [startDate,     setStartDate]     = useState(() => defaultStartDate(7, 18))
  const [daysOpen,        setDaysOpen]        = useState(7)
  const [customDaysOpen,  setCustomDaysOpen]  = useState('')
  const [showCustomDays,  setShowCustomDays]  = useState(false)
  const [postDiscord,     setPostDiscord]     = useState(true)
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const [showAdvanced,  setShowAdvanced]  = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [emojis,        setEmojis]        = useState<DiscordEmoji[]>([])
  const [roles,         setRoles]         = useState<Role[]>([])
  const [emojiPickerFor,    setEmojiPickerFor]    = useState<number | null>(null)
  const [emojiPickerPos,    setEmojiPickerPos]    = useState<{ top: number; left: number } | null>(null)
  const [emojiTab,          setEmojiTab]          = useState<string>('server')
  const [syncKey,           setSyncKey]           = useState(0)
  const [optBtnEmojis,      setOptBtnEmojis]      = useState<string[]>(['', ''])
  const [btnEmojiPickerFor, setBtnEmojiPickerFor] = useState<number | null>(null)
  const [btnEmojiPickerPos, setBtnEmojiPickerPos] = useState<{ top: number; left: number } | null>(null)
  const titleRef      = useRef<EmojiInputHandle>(null)
  const optionRefsMap = useRef<Record<number, EmojiInputHandle | null>>({})

  const atHour    = useMemo(() => localTimeToUTCHour(localTime), [localTime])
  const utcHint   = useMemo(() => {
    const [h, m] = localTime.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return ''
    const d = new Date(); d.setHours(h, m, 0, 0)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }, [localTime])
  const todayLocal = new Date().toLocaleDateString('en-CA')
  const startDayHint = useMemo(() => {
    if (!startDate) return ''
    return new Date(`${startDate}T${localTime}:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  }, [startDate, localTime])

  // Pre-populate state from template when opening in edit mode
  useEffect(() => {
    if (!open || !initialScheduledPoll) return
    const t = initialScheduledPoll
    setTitle(t.title)
    setDescription(t.description ?? '')
    setOptions(t.options.map(o => o.text))
    setIsAnonymous(t.isAnonymous)
    setAllowMultiple(t.allowMultiple)
    setUseTimes(t.includeTimeSlots)
    if (t.includeTimeSlots) setTimes(t.timeSlots)
    const presetMatch = INTERVAL_PRESETS.find(p => p.days === t.intervalDays)
    if (presetMatch) { setIntervalDays(t.intervalDays); setUseCustom(false); setCustomDays('') }
    else { setIntervalDays(t.intervalDays); setUseCustom(true); setCustomDays(String(t.intervalDays)) }
    const d = new Date(); d.setUTCHours(t.atHour, 0, 0, 0)
    setLocalTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setStartDate(new Date(t.nextRunAt).toLocaleDateString('en-CA'))
    const dayPreset = DAYS_OPEN_PRESETS.find(p => p.days === t.daysOpen)
    if (dayPreset) { setDaysOpen(t.daysOpen); setShowCustomDays(false); setCustomDaysOpen('') }
    else { setDaysOpen(t.daysOpen); setShowCustomDays(true); setCustomDaysOpen(String(t.daysOpen)) }
    setPostDiscord(t.postToDiscord)
    setOptBtnEmojis(t.options.map(o => o.buttonEmoji ?? ''))
    setSyncKey(k => k + 1)
  }, [open, initialScheduledPoll])

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

  useEffect(() => {
    if (btnEmojiPickerFor === null) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Element
      if (target.closest('[data-emoji-picker]') || target.closest('[data-btn-emoji-btn]')) return
      setBtnEmojiPickerFor(null); setBtnEmojiPickerPos(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [btnEmojiPickerFor])

  function openBtnEmojiPicker(i: number, e: { currentTarget: HTMLButtonElement }) {
    if (btnEmojiPickerFor === i) { setBtnEmojiPickerFor(null); setBtnEmojiPickerPos(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const pickerWidth = 240
    const left = Math.max(8, Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8))
    const top  = Math.min(rect.bottom + 4, window.innerHeight - 220)
    setBtnEmojiPickerFor(i); setBtnEmojiPickerPos({ top, left })
  }

  function reset() {
    setTitle(''); setDescription(''); setOptions(['', ''])
    setIsAnonymous(false); setAllowMultiple(false); setUseTimes(false)
    setTimes([]); setCustomTime(''); setCustomSlotText('')
    setIntervalDays(7); setCustomDays(''); setUseCustom(false)
    setLocalTime('18:00'); setStartDate(defaultStartDate(7, 18))
    setDaysOpen(7); setCustomDaysOpen(''); setShowCustomDays(false)
    setPostDiscord(true); setShowAdvanced(false)
    setError(''); setEmojiPickerFor(null); setEmojiPickerPos(null); setEmojiTab('server')
    setOptBtnEmojis(['', ''])
    setBtnEmojiPickerFor(null); setBtnEmojiPickerPos(null)
    setSyncKey(k => k + 1)
  }

  function addOption() {
    if (options.length < 12) {
      setOptions(o => [...o, ''])
      setOptBtnEmojis(e => [...e, ''])
    }
  }
  function removeOption(i: number) {
    if (options.length > 2) {
      setOptions(o => o.filter((_, idx) => idx !== i))
      setOptBtnEmojis(e => e.filter((_, idx) => idx !== i))
      setSyncKey(k => k + 1)
    }
  }
  function setOption(i: number, val: string) { setOptions(o => o.map((v, idx) => idx === i ? val : v)) }

  function selectPreset(days: number) {
    setIntervalDays(days); setUseCustom(false); setCustomDays('')
    setStartDate(defaultStartDate(days, localTimeToUTCHour(localTime)))
  }

  function applyCustomDays() {
    const n = parseInt(customDays)
    if (n >= 1 && n <= 365) { setIntervalDays(n); setUseCustom(false); setStartDate(defaultStartDate(n, localTimeToUTCHour(localTime))) }
  }

  function addCustomTime() {
    if (!customTime) return
    const utc = localToUTCHHMM(customTime)
    if (!times.includes(utc)) { setTimes(prev => [...prev, utc]); setCustomTime('') }
  }
  function addCustomSlotLabel() {
    const text = customSlotText.trim()
    if (!text || times.includes(text)) return
    setTimes(prev => [...prev, text]); setCustomSlotText('')
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
    if (useTimes && times.length === 0) return setError('Add at least one availability slot.')
    if (!startDate) return setError('Please pick a start date.')
    const nextRunAt = new Date(`${startDate}T${localTime}:00`).toISOString()
    setLoading(true); setError('')
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        options: cleanOpts.map((text, i) => ({
          id: `opt-${i}`,
          text,
          ...(optBtnEmojis[i] ? { buttonEmoji: optBtnEmojis[i] } : {}),
        })),
        includeTimeSlots: useTimes,
        timeSlots: useTimes ? times : [],
        isAnonymous,
        allowMultiple,
        daysOpen,
        intervalDays,
        atHour,
        atLocalHHMM: localTime,
        timezone,
        nextRunAt,
        postToDiscord: postDiscord,
      }
      const url = isEdit
        ? `/api/guilds/${guildId}/scheduled-polls/${initialScheduledPoll!.id}`
        : `/api/guilds/${guildId}/scheduled-polls`
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? payload : { ...payload, createdBy: userId, createdByName: userName }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? (isEdit ? 'Failed to save changes' : 'Failed to create schedule'))
      setOpen(false); reset()
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setLoading(false) }
  }

  if (!open) {
    if (isEdit) {
      return (
        <button onClick={() => setOpen(true)} className="btn-secondary text-xs py-1.5">
          <Pencil size={13} />
          Edit
        </button>
      )
    }
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
            {isEdit ? <Pencil size={16} className="text-p-primary" /> : <RefreshCw size={16} className="text-p-primary" />}
            <h2 className="font-display font-bold text-xl text-p-text">{isEdit ? 'Edit Schedule' : 'New Scheduled Poll'}</h2>
          </div>
          <button onClick={() => { setOpen(false); reset() }} className="text-p-muted hover:text-p-text p-1"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">

          {/* Question */}
          <div>
            <label className="label">Question *</label>
            <EmojiInput
              ref={titleRef}
              key={`title-${syncKey}`}
              initialValue={title}
              onChange={setTitle}
              placeholder="e.g. Weekly raid night vote"
              maxLength={120}
              onEmojiButtonClick={e => openEmojiPicker(-1, e)}
              emojiButtonActive={emojiPickerFor === -1}
              inputClass="py-2"
            />
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Options *</label>
              <span className="text-xs text-p-subtle">{options.filter(o => o.trim()).length} / 12</span>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => {
                const btnEmoji      = optBtnEmojis[i] ?? ''
                const btnEmojiMatch = btnEmoji.match(/^<(a?):(\w+):(\d+)>$/)
                return (
                <div key={`${i}-${syncKey}`} className="flex items-center gap-2">
                  {/* Left: static number + optional emoji — click to set button emoji */}
                  <button
                    type="button"
                    data-btn-emoji-btn=""
                    onClick={e => openBtnEmojiPicker(i, e)}
                    title="Set emoji for this Discord vote button"
                    className={`h-8 min-w-[2.75rem] px-2 rounded-md flex items-center justify-center gap-1 shrink-0 border transition-colors ${
                      btnEmojiPickerFor === i
                        ? 'bg-p-accent/20 border-p-accent/50 text-p-primary'
                        : btnEmoji
                          ? 'bg-p-surface-2 border-p-border text-p-primary'
                          : 'bg-p-surface-2 border-p-border text-p-muted hover:border-p-primary/50 hover:text-p-primary'
                    }`}
                  >
                    <span className="text-[12px] font-bold leading-none">{i + 1}</span>
                    {btnEmojiMatch
                      ? <img src={`https://cdn.discordapp.com/emojis/${btnEmojiMatch[3]}.${btnEmojiMatch[1]==='a'?'gif':'png'}?size=32`} alt={btnEmojiMatch[2]} className="w-4 h-4 object-contain" />
                      : btnEmoji
                        ? <span className="text-sm leading-none">{btnEmoji}</span>
                        : null
                    }
                  </button>
                  <EmojiInput
                    ref={el => { optionRefsMap.current[i] = el }}
                    key={`opt-${i}-${syncKey}`}
                    initialValue={opt}
                    onChange={val => setOption(i, val)}
                    placeholder={i === 0 ? 'First option…' : i === 1 ? 'Second option…' : `Option ${i + 1}…`}
                    maxLength={80}
                    className="flex-1"
                    inputClass="py-2"
                    onEmojiButtonClick={e => openEmojiPicker(i, e)}
                    emojiButtonActive={emojiPickerFor === i}
                  />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)}
                      className="p-1.5 text-p-muted hover:text-p-danger hover:bg-p-danger/10 rounded-md transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                )
              })}
              {options.length < 12 && (
                <button type="button" onClick={addOption}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-p-border text-p-muted text-xs hover:border-p-primary/40 hover:text-p-primary hover:bg-p-primary-b transition-all">
                  <Plus size={13} /> Add option {options.length + 1}
                </button>
              )}
            </div>
          </div>

          {/* Settings */}
          <div>
            <label className="label mb-2">Settings</label>
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
                Availability slots
              </button>
              <button type="button" onClick={() => setPostDiscord(v => !v)}
                className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${postDiscord ? 'badge-primary' : 'badge-muted hover:border-p-border-2'}`}>
                Post to Discord
              </button>
            </div>
          </div>

          {/* Availability slots picker */}
          {useTimes && (
            <div className="bg-p-surface-2 rounded-xl p-4 space-y-3">
              <div>
                <label className="label mb-0.5 flex items-center gap-2">
                  Availability slots
                  {times.length === 0 && (
                    <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5 normal-case tracking-normal">Required</span>
                  )}
                </label>
                <p className="text-xs text-p-muted">Add times or custom labels — voters pick which they&apos;re available for.</p>
              </div>

              {/* Quick-add unselected default times */}
              {DEFAULT_TIMES_UTC.some(t => !times.includes(t)) && (
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_TIMES_UTC.filter(t => !times.includes(t)).map(t => (
                    <button key={t} type="button" onClick={() => setTimes(p => [...p, t])}
                      className="badge badge-muted text-xs cursor-pointer hover:border-p-primary/50 hover:text-p-primary transition-colors">
                      + {utcToLocal(t)}
                    </button>
                  ))}
                </div>
              )}

              {/* Active slots as removable chips */}
              {times.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {times.map(t => (
                    <span key={t} className="badge badge-primary text-xs flex items-center gap-1.5 pr-1.5">
                      {displaySlot(t)}
                      <button type="button"
                        onClick={() => setTimes(p => p.filter(x => x !== t))}
                        className="opacity-60 hover:opacity-100 transition-opacity flex items-center">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add a clock time */}
              <div className="flex gap-2">
                <input type="time" className="input flex-1 text-sm py-1.5"
                  value={customTime} onChange={e => setCustomTime(e.target.value)} />
                <button type="button" onClick={addCustomTime} className="btn-secondary text-xs shrink-0 py-1.5">
                  Add time
                </button>
              </div>

              {/* Add a custom text label */}
              <div className="flex gap-2">
                <input type="text" className="input flex-1 text-sm py-1.5"
                  placeholder="e.g. Saturday, Morning, Any evening…"
                  value={customSlotText}
                  onChange={e => setCustomSlotText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSlotLabel() } }}
                />
                <button type="button" onClick={addCustomSlotLabel} className="btn-secondary text-xs shrink-0 py-1.5">
                  Add label
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
              Post time
              <span className="ml-auto text-[10px] font-normal text-p-muted normal-case tracking-normal">{timezone}</span>
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
            {utcHint && <p className="text-[11px] text-p-muted mt-1">UTC {utcHint}</p>}
          </div>

          {/* Days open */}
          <div>
            <label className="label">Each poll stays open for</label>
            <div className="bg-p-surface-2 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OPEN_PRESETS.map(p => (
                  <button key={p.days} type="button"
                    onClick={() => { setDaysOpen(p.days); setCustomDaysOpen(''); setShowCustomDays(false) }}
                    className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                      daysOpen === p.days && !showCustomDays ? 'badge-primary' : 'badge-muted hover:border-p-border-2'
                    }`}>
                    {p.label}
                  </button>
                ))}
                <button type="button"
                  onClick={() => setShowCustomDays(v => !v)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                    showCustomDays ? 'badge-primary' : 'badge-muted hover:border-p-border-2'
                  }`}>
                  Custom
                </button>
              </div>
              {showCustomDays && (
                <div className="flex items-center gap-2 pt-0.5">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    placeholder="e.g. 5"
                    value={customDaysOpen}
                    onChange={e => {
                      setCustomDaysOpen(e.target.value)
                      const n = parseInt(e.target.value)
                      if (!isNaN(n) && n >= 1) setDaysOpen(n)
                    }}
                    className="input w-24 text-sm py-1.5 text-center"
                  />
                  <span className="text-p-muted text-xs">days</span>
                  {customDaysOpen && parseInt(customDaysOpen) >= 1 && (
                    <span className="text-p-primary text-xs font-medium ml-auto">{parseInt(customDaysOpen)} day{parseInt(customDaysOpen) !== 1 ? 's' : ''}</span>
                  )}
                </div>
              )}
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
              {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Schedule'}
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
            if (emojiPickerFor === -1) titleRef.current?.insertEmoji(s)
            else optionRefsMap.current[emojiPickerFor]?.insertEmoji(s)
            setEmojiPickerFor(null); setEmojiPickerPos(null)
          }}
          onPickStd={em => {
            if (emojiPickerFor === -1) titleRef.current?.insertEmoji(em)
            else optionRefsMap.current[emojiPickerFor]?.insertEmoji(em)
            setEmojiPickerFor(null); setEmojiPickerPos(null)
          }}
        />
      )}

      {/* Button emoji picker — sets the Discord button emoji for an option */}
      {btnEmojiPickerFor !== null && btnEmojiPickerPos && (
        <EmojiPickerPanel
          top={btnEmojiPickerPos.top}
          left={btnEmojiPickerPos.left}
          tab={emojiTab}
          emojis={emojis}
          label={`Button emoji — option ${btnEmojiPickerFor + 1}`}
          onTabChange={setEmojiTab}
          onPickGuild={e => {
            const s = `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`
            setOptBtnEmojis(prev => prev.map((v, idx) => idx === btnEmojiPickerFor ? s : v))
            setBtnEmojiPickerFor(null); setBtnEmojiPickerPos(null)
          }}
          onPickStd={em => {
            setOptBtnEmojis(prev => prev.map((v, idx) => idx === btnEmojiPickerFor ? em : v))
            setBtnEmojiPickerFor(null); setBtnEmojiPickerPos(null)
          }}
        />
      )}
    </div>
  )
}
