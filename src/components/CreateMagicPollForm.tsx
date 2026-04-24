'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Clock, Lock, Users, Send } from 'lucide-react'

interface Props {
  token:       string
  guildId:     string
  guildName:   string
  username:    string
  defaultType: 'yn' | 'multi' | 'ts'
}

const DURATION_OPTIONS = [
  { label: '1 hour',   hours: 1   },
  { label: '2 hours',  hours: 2   },
  { label: '4 hours',  hours: 4   },
  { label: '12 hours', hours: 12  },
  { label: '1 day',    hours: 24  },
  { label: '2 days',   hours: 48  },
  { label: '3 days',   hours: 72  },
  { label: '7 days',   hours: 168 },
  { label: '14 days',  hours: 336 },
]

export default function CreateMagicPollForm({ token, guildId, guildName, username, defaultType }: Props) {
  const router   = useRouter()
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]   = useState('')
  const [options,       setOptions]       = useState(['', '', ''])
  const [timeSlots,     setTimeSlots]     = useState(['', '', ''])
  const [pollType,      setPollType]      = useState<'yn' | 'multi' | 'ts'>(defaultType)
  const [durationHours, setDurationHours] = useState(168)
  const [isAnonymous,   setIsAnonymous]   = useState(false)
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')

  function updateOption(i: number, val: string) {
    setOptions(o => o.map((v, idx) => idx === i ? val : v))
  }
  function updateTimeSlot(i: number, val: string) {
    setTimeSlots(t => t.map((v, idx) => idx === i ? val : v))
  }
  function addOption()    { if (options.length < 6)    setOptions(o => [...o, ''])   }
  function removeOption(i: number) { if (options.length > 2) setOptions(o => o.filter((_, idx) => idx !== i)) }
  function addTimeSlot()  { if (timeSlots.length < 8)  setTimeSlots(t => [...t, '']) }
  function removeTimeSlot(i: number) { if (timeSlots.length > 1) setTimeSlots(t => t.filter((_, idx) => idx !== i)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const closesAt = new Date(Date.now() + durationHours * 3_600_000).toISOString()

    let pollOptions: { id: string; text: string }[]
    let includeTimeSlots = false
    let finalTimeSlots: string[] = []

    if (pollType === 'yn') {
      pollOptions = [{ id: 'opt-0', text: 'Yes' }, { id: 'opt-1', text: 'No' }]
    } else if (pollType === 'ts') {
      finalTimeSlots = timeSlots.map(t => t.trim()).filter(Boolean)
      if (finalTimeSlots.length < 2) { setError('Add at least 2 time slots.'); return }
      pollOptions = finalTimeSlots.map((t, i) => ({ id: `opt-${i}`, text: t }))
      includeTimeSlots = true
    } else {
      const filled = options.map(o => o.trim()).filter(Boolean)
      if (filled.length < 2) { setError('Add at least 2 options.'); return }
      pollOptions = filled.map((t, i) => ({ id: `opt-${i}`, text: t }))
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/magic-polls', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, title: title.trim(), description: description.trim() || undefined, options: pollOptions, closesAt, isAnonymous, allowMultiple, includeTimeSlots, timeSlots: finalTimeSlots }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return }
      router.push(`/dashboard/${guildId}`)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Poll type */}
      <div>
        <label className="block text-sm font-medium text-p-text mb-2">Poll type</label>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'yn',    label: '✓  Yes / No'        },
            { value: 'multi', label: '📝  Multiple choice' },
            { value: 'ts',    label: '📅  Schedule'        },
          ] as const).map(({ value, label }) => (
            <button key={value} type="button"
              onClick={() => setPollType(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                pollType === value
                  ? 'bg-p-primary text-white border-p-primary'
                  : 'bg-p-surface border-p-border text-p-muted hover:border-p-border-2 hover:text-p-text'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-p-text mb-1">Question <span className="text-p-error">*</span></label>
        <input
          className="input w-full"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={pollType === 'ts' ? 'e.g. When can everyone make it?' : 'e.g. Should we raid tonight?'}
          maxLength={120}
          required
        />
      </div>

      {/* Options (multi) */}
      {pollType === 'multi' && (
        <div>
          <label className="block text-sm font-medium text-p-text mb-2">Options <span className="text-p-error">*</span></label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="input flex-1"
                  value={opt}
                  onChange={e => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={100}
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(i)} className="text-p-muted hover:text-p-error transition-colors p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 6 && (
            <button type="button" onClick={addOption} className="btn-ghost text-sm mt-2">
              <Plus size={14} /> Add option
            </button>
          )}
        </div>
      )}

      {/* Time slots */}
      {pollType === 'ts' && (
        <div>
          <label className="block text-sm font-medium text-p-text mb-1">Time options <span className="text-p-error">*</span></label>
          <p className="text-p-muted text-xs mb-2">Include your timezone so everyone knows what time it is for them — e.g. "Friday 8pm UTC+1"</p>
          <div className="space-y-2">
            {timeSlots.map((ts, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="input flex-1"
                  value={ts}
                  onChange={e => updateTimeSlot(i, e.target.value)}
                  placeholder="e.g. Friday 8pm UTC+1"
                  maxLength={80}
                />
                {timeSlots.length > 1 && (
                  <button type="button" onClick={() => removeTimeSlot(i)} className="text-p-muted hover:text-p-error transition-colors p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {timeSlots.length < 8 && (
            <button type="button" onClick={addTimeSlot} className="btn-ghost text-sm mt-2">
              <Plus size={14} /> Add time slot
            </button>
          )}
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-p-text mb-1">Description <span className="text-p-muted text-xs">(optional)</span></label>
        <textarea
          className="input w-full resize-none"
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Extra context for voters..."
          maxLength={300}
        />
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-p-text mb-1">
          <Clock size={13} className="inline mr-1" />Duration
        </label>
        <select
          className="input w-full"
          value={durationHours}
          onChange={e => setDurationHours(Number(e.target.value))}>
          {DURATION_OPTIONS.map(o => (
            <option key={o.hours} value={o.hours}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Toggles */}
      <div className="flex gap-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button type="button"
            onClick={() => setIsAnonymous(v => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${isAnonymous ? 'bg-p-primary' : 'bg-p-border'}`}>
            <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${isAnonymous ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <Lock size={13} className="text-p-muted" />
          <span className="text-sm text-p-text">Anonymous votes</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button type="button"
            onClick={() => setAllowMultiple(v => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${allowMultiple ? 'bg-p-primary' : 'bg-p-border'}`}>
            <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${allowMultiple ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <Users size={13} className="text-p-muted" />
          <span className="text-sm text-p-text">Allow multiple votes</span>
        </label>
      </div>

      {error && <p className="text-p-error text-sm">{error}</p>}

      <button type="submit" disabled={submitting || !title.trim()} className="btn-primary w-full">
        {submitting ? 'Creating…' : <><Send size={14} /> Post Poll to {guildName}</>}
      </button>
    </form>
  )
}
