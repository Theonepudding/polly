'use client'
import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2, CheckCircle2, AlertCircle, Vote, Settings, Hash, Bell, ChevronDown, Smile } from 'lucide-react'
import Link from 'next/link'
import { Poll, PollTemplate } from '@/types'
import EmojiPickerPanel, { type DiscordEmoji as DE } from './EmojiPickerPanel'
import EmojiInput, { type EmojiInputHandle } from './EmojiInput'

const DEFAULT_TIMES_UTC = ['17:00', '18:00', '19:00', '20:00', '21:00']
const HOUR_OPTIONS  = [1, 2, 4, 6, 12, 24]
const DAY_OPTIONS   = [1, 3, 7, 14, 30]

function nowTimeString() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function utcToLocal(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return hhMM
  const d = new Date()
  d.setUTCHours(h, m, 0, 0)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

interface Channel { id: string; name: string }
interface Role    { id: string; name: string; mentionable?: boolean }
type DiscordEmoji = DE

interface Props {
  guildId:    string
  userId:     string
  userName:   string
  canManage?: boolean
}


export default function CreatePollModal({ guildId, userId, userName, canManage = false }: Props) {
  const router = useRouter()
  const [open,             setOpen]             = useState(false)
  const [title,            setTitle]            = useState('')
  const [description,      setDescription]      = useState('')
  const [options,          setOptions]          = useState(['', ''])
  const [useTimes,         setUseTimes]         = useState(false)
  const [times,            setTimes]            = useState<string[]>(DEFAULT_TIMES_UTC.slice(0, 3))
  const [customTime,       setCustomTime]       = useState('')
  const [durUnit,          setDurUnit]          = useState<'hours' | 'days'>('days')
  const [durationHours,    setDurationHours]    = useState(6)
  const [customHoursInput, setCustomHoursInput] = useState('')
  const [daysOpen,         setDaysOpen]         = useState(7)
  const [closeAtTime,      setCloseAtTime]      = useState(nowTimeString)
  const [isAnonymous,      setIsAnonymous]      = useState(false)
  const [allowMultiple,    setAllowMultiple]    = useState(false)
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState('')
  const [createdPoll,      setCreatedPoll]      = useState<Poll | null>(null)
  const [posted,           setPosted]           = useState(false)
  const [hasChannel,       setHasChannel]       = useState(false)
  const [postedChannelId,  setPostedChannelId]  = useState<string | null>(null)
  const [channels,         setChannels]         = useState<Channel[]>([])
  const [roles,            setRoles]            = useState<Role[]>([])
  const [templates,        setTemplates]        = useState<PollTemplate[]>([])
  const [overrideChannel,  setOverrideChannel]  = useState('')
  const [pingRoleIds,      setPingRoleIds]      = useState<string[]>([])
  const [showAdvanced,     setShowAdvanced]     = useState(false)
  const [emojis,           setEmojis]           = useState<DiscordEmoji[]>([])
  const [emojiPickerFor,   setEmojiPickerFor]   = useState<number | null>(null)
  const [emojiPickerPos,   setEmojiPickerPos]   = useState<{ top: number; left: number } | null>(null)
  const [emojiTab,         setEmojiTab]         = useState<string>('server')
  const [syncKey,          setSyncKey]          = useState(0)
  const [optBtnNums,    setOptBtnNums]    = useState<(number|undefined)[]>([undefined, undefined])
  const [optBtnEmojis,  setOptBtnEmojis]  = useState<string[]>(['', ''])
  const [btnEmojiPickerFor, setBtnEmojiPickerFor] = useState<number | null>(null)
  const [btnEmojiPickerPos, setBtnEmojiPickerPos] = useState<{ top: number; left: number } | null>(null)
  const titleRef      = useRef<EmojiInputHandle>(null)
  const optionRefsMap = useRef<Record<number, EmojiInputHandle | null>>({})

  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch(`/api/guilds/${guildId}/channels`).then(r => r.ok ? r.json() : []),
      fetch(`/api/guilds/${guildId}/channels?type=roles`).then(r => r.ok ? r.json() : []),
      fetch(`/api/guilds/${guildId}/templates`).then(r => r.ok ? r.json() : { templates: [] }),
      fetch(`/api/guilds/${guildId}/emojis`).then(r => r.ok ? r.json() : []),
    ]).then(([ch, rl, tmpl, em]) => {
      setChannels((ch as { id: string; name: string; type: number }[]).filter(c => c.type === 0))
      setRoles((rl as Role[]).filter((r: Role) => r.name !== '@everyone'))
      setTemplates(((tmpl as { templates: PollTemplate[] }).templates ?? []).filter((t: PollTemplate) => t.active))
      const filteredEmojis = (em as DiscordEmoji[]).filter(e => e.available !== false)
      setEmojis(filteredEmojis)
      if (filteredEmojis.length === 0) setEmojiTab('smileys')
    }).catch(() => {})
  }, [open, guildId])

  // Close emoji picker on outside click
  useEffect(() => {
    if (emojiPickerFor === null) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Element
      if (target.closest('[data-emoji-picker]') || target.closest('[data-emoji-btn]')) return
      setEmojiPickerFor(null)
      setEmojiPickerPos(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [emojiPickerFor])

  useEffect(() => {
    if (btnEmojiPickerFor === null) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Element
      if (target.closest('[data-emoji-picker]') || target.closest('[data-btn-emoji-btn]')) return
      setBtnEmojiPickerFor(null)
      setBtnEmojiPickerPos(null)
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
    setTitle(''); setDescription(''); setOptions(['', '']); setUseTimes(false)
    setTimes(DEFAULT_TIMES_UTC.slice(0, 3)); setDurUnit('days'); setDurationHours(6)
    setCustomHoursInput(''); setDaysOpen(7); setCloseAtTime(nowTimeString())
    setIsAnonymous(false); setAllowMultiple(false); setError(''); setCreatedPoll(null)
    setPosted(false); setHasChannel(false); setPostedChannelId(null)
    setOverrideChannel(''); setPingRoleIds([]); setShowAdvanced(false)
    setEmojiPickerFor(null); setEmojiPickerPos(null); setEmojiTab('server')
    setOptBtnNums([undefined, undefined]); setOptBtnEmojis(['', ''])
    setBtnEmojiPickerFor(null); setBtnEmojiPickerPos(null)
    setSyncKey(k => k + 1)
  }

  function loadTemplate(t: PollTemplate) {
    setTitle(t.title)
    setDescription(t.description ?? '')
    setOptions(t.options.map(o => o.text))
    setIsAnonymous(t.isAnonymous)
    setAllowMultiple(t.allowMultiple)
    setUseTimes(t.includeTimeSlots)
    if (t.includeTimeSlots) setTimes(t.timeSlots)
    setDurUnit('days')
    setDaysOpen(t.daysOpen)
    setOptBtnNums(t.options.map(o => o.buttonNum))
    setOptBtnEmojis(t.options.map(o => o.buttonEmoji ?? ''))
    setSyncKey(k => k + 1)
  }

  function addOption() {
    if (options.length < 12) {
      setOptions(o => [...o, ''])
      setOptBtnNums(n => [...n, undefined])
      setOptBtnEmojis(e => [...e, ''])
    }
  }
  function removeOption(i: number) {
    if (options.length > 2) {
      setOptions(o => o.filter((_, idx) => idx !== i))
      setOptBtnNums(n => n.filter((_, idx) => idx !== i))
      setOptBtnEmojis(e => e.filter((_, idx) => idx !== i))
      setSyncKey(k => k + 1)
    }
  }
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

  function openEmojiPicker(i: number, e: { currentTarget: HTMLButtonElement }) {
    if (emojiPickerFor === i) {
      setEmojiPickerFor(null)
      setEmojiPickerPos(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const pickerWidth = 240
    const left = Math.max(8, Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8))
    const top  = Math.min(rect.bottom + 4, window.innerHeight - 220)
    setEmojiPickerFor(i)
    setEmojiPickerPos({ top, left })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cleanOpts = options.filter(o => o.trim())
    if (!title.trim()) return setError('Please add a title.')
    if (cleanOpts.length < 2) return setError('At least 2 options required.')
    setLoading(true); setError('')
    try {
      const closesAt = new Date()
      if (durUnit === 'hours') {
        closesAt.setTime(closesAt.getTime() + durationHours * 60 * 60 * 1000)
      } else {
        const [h, m] = closeAtTime.split(':').map(Number)
        closesAt.setHours(h, m, 0, 0)
        closesAt.setDate(closesAt.getDate() + daysOpen)
      }
      const res = await fetch(`/api/guilds/${guildId}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          options: cleanOpts.map((text, i) => ({
            id: `opt-${i}`,
            text,
            ...(optBtnNums[i] !== undefined ? { buttonNum: optBtnNums[i] } : {}),
            ...(optBtnEmojis[i] ? { buttonEmoji: optBtnEmojis[i] } : {}),
          })),
          includeTimeSlots: useTimes,
          timeSlots: useTimes ? times : [],
          isAnonymous,
          allowMultiple,
          closesAt: closesAt.toISOString(),
          createdBy: userId,
          createdByName: userName,
          pingRoleIds:       pingRoleIds.length ? pingRoleIds : undefined,
          overrideChannelId: overrideChannel || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create poll')
      const data = await res.json()
      setCreatedPoll(data.poll)
      setPosted(data.posted ?? false)
      setHasChannel(data.hasChannel ?? false)
      setPostedChannelId(data.postedChannelId ?? null)
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
              Posted to{' '}
              {postedChannelId && channels.find(c => c.id === postedChannelId)
                ? <><strong>#{channels.find(c => c.id === postedChannelId)!.name}</strong>.</>
                : 'your Discord announcement channel.'
              }
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

          {/* Title */}
          <div>
            <label className="label">Question *</label>
            <div className="flex items-center gap-2 group">
              <EmojiInput
                ref={titleRef}
                key={`title-${syncKey}`}
                initialValue={title}
                onChange={setTitle}
                placeholder="e.g. Raid night: Friday or Saturday?"
                maxLength={120}
                className="flex-1"
                inputClass="py-2"
              />
              <button
                type="button"
                data-emoji-btn=""
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
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Options *</label>
              <span className="text-xs text-p-subtle">{options.filter(o => o.trim()).length} / 12</span>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => {
                const btnEmoji = optBtnEmojis[i] ?? ''
                const btnNum   = optBtnNums[i] ?? (i + 1)
                const btnEmojiMatch = btnEmoji.match(/^<(a?):(\w+):(\d+)>$/)
                return (
                <div key={`${i}-${syncKey}`} className="space-y-1">
                  <div className="flex items-center gap-2 group">
                    {/* Editable Discord button number badge */}
                    <div className="w-6 h-6 rounded-md bg-p-primary-b border border-p-primary/25 flex items-center justify-center shrink-0"
                         title="Discord button number">
                      <input
                        type="number" min={1} max={25}
                        value={btnNum}
                        onChange={e => {
                          const n = parseInt(e.target.value)
                          setOptBtnNums(nums => nums.map((v, idx) => idx === i ? (isNaN(n) ? undefined : Math.min(25, Math.max(1, n))) : v))
                        }}
                        className="w-5 h-5 text-[11px] font-bold text-p-primary bg-transparent text-center border-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <EmojiInput
                      ref={el => { optionRefsMap.current[i] = el }}
                      key={`opt-${i}-${syncKey}`}
                      initialValue={opt}
                      onChange={val => setOption(i, val)}
                      placeholder={i === 0 ? 'First option…' : i === 1 ? 'Second option…' : `Option ${i + 1}…`}
                      maxLength={80}
                      className="flex-1"
                      inputClass="py-2"
                    />
                    {/* Button emoji picker */}
                    <button
                      type="button"
                      data-btn-emoji-btn=""
                      onClick={e => openBtnEmojiPicker(i, e)}
                      title="Discord button emoji"
                      className={`p-1.5 rounded-md transition-all shrink-0 ${
                        btnEmojiPickerFor === i
                          ? 'text-p-accent bg-p-accent/10 opacity-100'
                          : btnEmoji
                            ? 'opacity-100 text-p-accent bg-p-accent/5'
                            : 'text-p-subtle hover:text-p-accent hover:bg-p-accent/10 opacity-0 group-hover:opacity-100'
                      }`}>
                      {btnEmojiMatch
                        ? <img src={`https://cdn.discordapp.com/emojis/${btnEmojiMatch[3]}.${btnEmojiMatch[1]==='a'?'gif':'png'}?size=32`} alt={btnEmojiMatch[2]} className="w-3.5 h-3.5 object-contain" />
                        : btnEmoji
                          ? <span className="text-xs leading-none">{btnEmoji}</span>
                          : <Smile size={14} />
                      }
                    </button>
                    {/* Option text emoji picker */}
                    <button
                      type="button"
                      data-emoji-btn=""
                      onClick={e => openEmojiPicker(i, e)}
                      title="Insert emoji into text"
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
            </div>
          </div>

          {/* Time slot picker */}
          {useTimes && (
            <div className="pl-1">
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

          {/* Duration */}
          <div>
            <label className="label">Poll duration</label>
            <div className="flex gap-1 p-1 bg-p-surface-2 rounded-lg mb-3">
              {(['hours', 'days'] as const).map(unit => (
                <button key={unit} type="button" onClick={() => setDurUnit(unit)}
                  className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-all capitalize ${
                    durUnit === unit
                      ? 'bg-p-surface text-p-text shadow-sm'
                      : 'text-p-muted hover:text-p-text'
                  }`}>
                  {unit}
                </button>
              ))}
            </div>

            {durUnit === 'hours' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {HOUR_OPTIONS.map(h => (
                    <button key={h} type="button"
                      onClick={() => { setDurationHours(h); setCustomHoursInput('') }}
                      className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                        durationHours === h && !customHoursInput ? 'badge-primary' : 'badge-muted hover:border-p-border-2'
                      }`}>
                      {h === 24 ? '24h (1 day)' : `${h}h`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="720"
                    placeholder="Custom…"
                    value={customHoursInput}
                    onChange={e => {
                      setCustomHoursInput(e.target.value)
                      const n = parseInt(e.target.value)
                      if (!isNaN(n) && n >= 1) setDurationHours(Math.min(n, 720))
                    }}
                    className="input w-24 text-sm py-1.5"
                  />
                  <span className="text-p-muted text-xs">hours</span>
                  {customHoursInput && parseInt(customHoursInput) >= 1 && (
                    <span className="text-p-primary text-xs font-medium">
                      {parseInt(customHoursInput)}h selected
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {DAY_OPTIONS.map(d => (
                    <button key={d} type="button" onClick={() => setDaysOpen(d)}
                      className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                        daysOpen === d ? 'badge-primary' : 'badge-muted hover:border-p-border-2'
                      }`}>
                      {d === 1 ? '1 day' : `${d} days`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-p-muted text-xs whitespace-nowrap">Close at</label>
                  <input type="time" value={closeAtTime} onChange={e => setCloseAtTime(e.target.value)}
                    className="input py-1.5 text-sm w-32" />
                  <span className="text-p-muted text-xs">your local time</span>
                </div>
              </div>
            )}
          </div>

          {/* Advanced options toggle */}
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            className="text-p-muted text-xs hover:text-p-text transition-colors flex items-center gap-1.5 w-full py-1">
            <ChevronDown size={13} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {showAdvanced ? 'Hide' : 'More'} options
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-p-border pt-4">

              {/* Description */}
              <div>
                <label className="label">Description <span className="normal-case text-p-muted/50">(optional)</span></label>
                <textarea className="textarea" rows={2} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Any extra context for voters…" maxLength={400} />
              </div>

              {/* Notify roles — only mentionable ones */}
              {roles.some(r => r.mentionable) && (
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Bell size={12} className="text-p-muted" />
                    Notify roles when posting
                  </label>
                  <p className="text-p-muted text-xs mb-2">@mentions sent when the poll is posted. Only roles set as mentionable in Discord are shown.</p>
                  <div className="flex flex-wrap gap-2">
                    {roles.filter(r => r.mentionable).map(role => (
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

              {/* Override channel — admins only */}
              {canManage && channels.length > 0 && (
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

      {/* Emoji picker — fixed position so it escapes the modal's overflow-y-auto */}
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
