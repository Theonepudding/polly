'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save, Loader2, Zap, Hash, Users, Shield, BookOpen, CheckCircle2, AlertCircle, Terminal, Trash2, AlertTriangle, PenLine, RefreshCw } from 'lucide-react'

interface Channel { id: string; name: string; type: number }
interface Role    { id: string; name: string; color: number; permissions?: string }
interface GuildConfig {
  guildName: string
  announceChannelId?: string
  pollyChannelId?: string
  dashboardChannelId?: string
  auditLogChannelId?: string
  adminRoleIds: string[]
  creatorRoleIds: string[]
  voterRoleIds: string[]
}

export default function SettingsPage() {
  const params = useParams()
  const router = useRouter()
  const guildId = params.guildId as string

  const [config,    setConfig]    = useState<GuildConfig | null>(null)
  const [channels,  setChannels]  = useState<Channel[]>([])
  const [roles,     setRoles]     = useState<Role[]>([])
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [error,          setError]          = useState('')
  const [loading,        setLoading]        = useState(true)
  const [isDirty,        setIsDirty]        = useState(false)
  const [guideStatus,    setGuideStatus]    = useState<'idle' | 'posting' | 'ok' | 'fail'>('idle')
  const [cmdStatus,      setCmdStatus]      = useState<'idle' | 'registering' | 'ok' | 'fail'>('idle')
  const [removeConfirm,    setRemoveConfirm]    = useState(false)
  const [removing,         setRemoving]         = useState(false)
  const [detectingAdmins,  setDetectingAdmins]  = useState(false)
  const hasLoaded = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, chRes, rlRes] = await Promise.all([
        fetch(`/api/guilds/${guildId}`),
        fetch(`/api/guilds/${guildId}/channels`),
        fetch(`/api/guilds/${guildId}/channels?type=roles`),
      ])
      if (cfgRes.ok) {
        const data = await cfgRes.json()
        setConfig({ ...data, creatorRoleIds: data.creatorRoleIds ?? [] })
      }
      if (chRes.ok)  setChannels((await chRes.json()).filter((c: Channel) => c.type === 0))
      if (rlRes.ok)  setRoles(await rlRes.json())
    } catch { setError('Failed to load settings') }
    hasLoaded.current = true
    setIsDirty(false)
    setLoading(false)
  }, [guildId])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  function updateConfig(newConfig: GuildConfig) {
    setConfig(newConfig)
    if (hasLoaded.current) setIsDirty(true)
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    if (!config) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/guilds/${guildId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setIsDirty(false)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError('Failed to save settings')
    }
  }

  function toggleRole(key: 'adminRoleIds' | 'creatorRoleIds' | 'voterRoleIds', id: string) {
    if (!config) return
    const curr = config[key]
    updateConfig({
      ...config,
      [key]: curr.includes(id) ? curr.filter(r => r !== id) : [...curr, id],
    })
  }

  async function postGuide() {
    setGuideStatus('posting')
    const res = await fetch(`/api/guilds/${guildId}/guide`, { method: 'POST' })
    setGuideStatus(res.ok ? 'ok' : 'fail')
  }

  async function setupDashboard() {
    if (!config?.dashboardChannelId) return
    setSaving(true)
    const res = await fetch(`/api/guilds/${guildId}/dashboard`, { method: 'POST' })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    else setError('Failed to set up dashboard embed')
  }

  async function detectAdminRoles() {
    if (!config) return
    setDetectingAdmins(true)
    const res = await fetch(`/api/guilds/${guildId}/channels?type=roles`)
    if (res.ok) {
      const allRoles: Role[] = await res.json()
      const adminRoleIds = allRoles
        .filter(r => r.name !== '@everyone' && r.permissions && (BigInt(r.permissions) & 8n) !== 0n)
        .map(r => r.id)
      updateConfig({ ...config, adminRoleIds })
    }
    setDetectingAdmins(false)
  }

  async function registerCommands() {
    setCmdStatus('registering')
    const res = await fetch('/api/guilds/register-commands', { method: 'POST' })
    setCmdStatus(res.ok ? 'ok' : 'fail')
  }

  async function removeBot() {
    setRemoving(true)
    const res = await fetch(`/api/guilds/${guildId}`, { method: 'DELETE' })
    setRemoving(false)
    if (res.ok) {
      router.push('/dashboard')
    } else {
      setError('Failed to remove bot. Try again or kick it manually from Discord.')
      setRemoveConfirm(false)
    }
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-12 flex justify-center">
      <Loader2 className="animate-spin text-p-muted" size={24} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 pb-24">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-p-muted text-sm mb-1">
          <Link href="/dashboard" className="hover:text-p-text transition-colors">Dashboard</Link>
          <span>/</span>
          <Link href={`/dashboard/${guildId}`} className="hover:text-p-text transition-colors">{config?.guildName}</Link>
          <span>/</span>
          <span className="text-p-text">Settings</span>
        </div>
        <h1 className="font-display font-bold text-3xl text-p-text">Settings</h1>
      </div>

      {error && <div className="card p-4 text-p-danger border-p-danger/30 mb-6 text-sm">{error}</div>}

      {config && (
        <form id="settings-form" onSubmit={save} className="flex flex-col gap-8">

          {/* Poll Announcement Channel */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Hash size={16} className="text-p-primary" />
              <h2 className="font-display font-semibold text-p-text">Poll Announcement Channel</h2>
            </div>
            <p className="text-p-muted text-sm mb-3">
              When a poll is created, Polly posts it here as a Discord message with voting buttons. Members vote directly from this channel.
            </p>
            <div className="mb-4 p-3 rounded-lg bg-p-surface-2 border border-p-border text-xs text-p-muted font-mono leading-relaxed">
              <span className="text-p-primary font-semibold">Polly</span>
              {'  '}
              <span className="text-p-subtle">— new poll message with vote buttons appears here</span>
              <br />
              <span className="text-p-subtle italic">e.g. #announcements, #polls</span>
            </div>
            <select
              value={config.announceChannelId ?? ''}
              onChange={e => updateConfig({ ...config, announceChannelId: e.target.value || undefined })}
              className="input">
              <option value="">— None —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

          {/* Polly Channel */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen size={16} className="text-p-primary" />
              <h2 className="font-display font-semibold text-p-text">Polly Channel</h2>
            </div>
            <p className="text-p-muted text-sm mb-3">
              Polly posts a pinned guide here explaining how to vote and use polls. Good for a dedicated <span className="font-mono text-p-text">#polls</span> or <span className="font-mono text-p-text">#bot-info</span> channel that members can refer to.
            </p>
            <div className="mb-4 p-3 rounded-lg bg-p-surface-2 border border-p-border text-xs text-p-muted font-mono leading-relaxed">
              <span className="text-p-primary font-semibold">Polly</span>
              {'  '}
              <span className="text-p-subtle">📌 pinned — "How Polly Works" guide embed</span>
              <br />
              <span className="text-p-subtle italic">e.g. #polls, #bot-info, #how-to-vote</span>
            </div>
            <select
              value={config.pollyChannelId ?? ''}
              onChange={e => updateConfig({ ...config, pollyChannelId: e.target.value || undefined })}
              className="input mb-4">
              <option value="">— None —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
            {config.pollyChannelId && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={postGuide} disabled={guideStatus === 'posting'}
                  className="btn-secondary text-sm">
                  {guideStatus === 'posting' ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                  Post / Refresh Guide
                </button>
                {guideStatus === 'ok' && (
                  <span className="flex items-center gap-1.5 text-p-success text-xs">
                    <CheckCircle2 size={13} /> Guide posted and pinned!
                  </span>
                )}
                {guideStatus === 'fail' && (
                  <span className="flex items-center gap-1.5 text-p-warning text-xs">
                    <AlertCircle size={13} /> Failed — check bot permissions.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Dashboard Embed Channel */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-p-accent" />
              <h2 className="font-display font-semibold text-p-text">Dashboard Embed Channel</h2>
            </div>
            <p className="text-p-muted text-sm mb-3">
              Polly keeps a single live message here that lists all active polls. Members can see what&apos;s open, create new polls, or open the dashboard — all from one place. Works best in a read-only or low-traffic channel.
            </p>
            <div className="mb-4 p-3 rounded-lg bg-p-surface-2 border border-p-border text-xs text-p-muted font-mono leading-relaxed">
              <span className="text-p-primary font-semibold">Polly</span>
              {'  '}
              <span className="text-p-subtle">— live embed: active polls + [Create Poll] [View All] buttons</span>
              <br />
              <span className="text-p-subtle italic">e.g. #polls, #vote-here — updates automatically</span>
            </div>
            <select
              value={config.dashboardChannelId ?? ''}
              onChange={e => updateConfig({ ...config, dashboardChannelId: e.target.value || undefined })}
              className="input mb-4">
              <option value="">— None —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
            {config.dashboardChannelId && (
              <button type="button" onClick={setupDashboard}
                className="btn-accent text-sm" disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Post / Refresh Dashboard Embed
              </button>
            )}
          </div>

          {/* Audit Log Channel */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Hash size={16} className="text-p-muted" />
              <h2 className="font-display font-semibold text-p-text">Audit Log Channel <span className="text-p-subtle text-xs font-normal ml-1">(optional)</span></h2>
            </div>
            <p className="text-p-muted text-sm mb-4">
              Polly posts a log entry here when polls are created, closed, or deleted. Leave empty to disable logging.
            </p>
            <select
              value={config.auditLogChannelId ?? ''}
              onChange={e => updateConfig({ ...config, auditLogChannelId: e.target.value || undefined })}
              className="input">
              <option value="">— None (disabled) —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

          {/* Discord slash commands */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Terminal size={16} className="text-p-accent" />
              <h2 className="font-display font-semibold text-p-text">Discord Slash Commands</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">
              Register <code className="text-p-muted bg-p-surface-2 px-1 rounded">/poll</code> and{' '}
              <code className="text-p-muted bg-p-surface-2 px-1 rounded">/setup</code> as global slash commands.
              Run this once (or after any command changes).
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={registerCommands} disabled={cmdStatus === 'registering'}
                className="btn-secondary text-sm">
                {cmdStatus === 'registering' ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                Register Commands
              </button>
              {cmdStatus === 'ok' && (
                <span className="flex items-center gap-1.5 text-p-success text-xs">
                  <CheckCircle2 size={13} /> Registered! May take up to 1 hour to appear globally.
                </span>
              )}
              {cmdStatus === 'fail' && (
                <span className="flex items-center gap-1.5 text-p-warning text-xs">
                  <AlertCircle size={13} /> Failed — check DISCORD_BOT_TOKEN.
                </span>
              )}
            </div>
          </div>

          {/* Poll Admin Roles */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={16} className="text-p-primary" />
              <h2 className="font-display font-semibold text-p-text">Poll Admin Roles</h2>
            </div>
            <p className="text-p-muted text-sm mb-3">
              Members with these roles can create polls, close any poll, resend embeds, and delete any poll. By default, Polly respects Discord&apos;s built-in Administrator roles — use the button below to detect them automatically.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {roles.filter(r => r.name !== '@everyone').map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole('adminRoleIds', role.id)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                    config.adminRoleIds.includes(role.id)
                      ? 'badge-primary'
                      : 'badge-muted hover:border-p-border-2'
                  }`}>
                  {role.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={detectAdminRoles} disabled={detectingAdmins}
              className="btn-secondary text-xs">
              {detectingAdmins ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Detect Discord admin roles
            </button>
          </div>

          {/* Poll Creator Roles */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <PenLine size={16} className="text-p-accent" />
              <h2 className="font-display font-semibold text-p-text">Poll Creator Roles</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">
              Members with these roles can create polls and delete their own polls, but cannot close or manage polls created by others. Leave empty to make creation follow the admin role rules above.
            </p>
            <div className="flex flex-wrap gap-2">
              {roles.filter(r => r.name !== '@everyone').map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole('creatorRoleIds', role.id)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                    config.creatorRoleIds.includes(role.id)
                      ? 'badge-accent'
                      : 'badge-muted hover:border-p-border-2'
                  }`}>
                  {role.name}
                </button>
              ))}
            </div>
          </div>

          {/* Voter Roles */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-p-accent" />
              <h2 className="font-display font-semibold text-p-text">Voter Roles</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">Only members with these roles can vote. Leave empty to allow everyone to vote.</p>
            <div className="flex flex-wrap gap-2">
              {roles.filter(r => r.name !== '@everyone').map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole('voterRoleIds', role.id)}
                  className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                    config.voterRoleIds.includes(role.id)
                      ? 'badge-primary'
                      : 'badge-muted hover:border-p-border-2'
                  }`}>
                  {role.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary px-6">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}

      {/* Danger zone */}
      <div className="mt-12 card p-6 border-p-danger/30">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-p-danger" />
          <h2 className="font-display font-semibold text-p-danger">Danger Zone</h2>
        </div>
        <p className="text-p-muted text-sm mb-5">
          Permanently removes Polly from this server and deletes all poll data. This cannot be undone.
        </p>

        {!removeConfirm ? (
          <button
            type="button"
            onClick={() => setRemoveConfirm(true)}
            className="btn-secondary text-sm border-p-danger/40 text-p-danger hover:bg-p-danger/10">
            <Trash2 size={14} />
            Remove Polly from this server
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-p-danger text-sm font-semibold">
              Are you sure? This will delete all polls, votes, and settings for <strong>{config?.guildName}</strong> and kick Polly from the server.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setRemoveConfirm(false)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button type="button" onClick={removeBot} disabled={removing}
                className="btn-primary text-sm bg-p-danger border-p-danger hover:bg-p-danger/80">
                {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Yes, remove Polly
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-p-border bg-p-surface/95 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-p-muted text-sm">You have unsaved changes</span>
            <button
              type="submit"
              form="settings-form"
              disabled={saving}
              className="btn-primary px-6">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
