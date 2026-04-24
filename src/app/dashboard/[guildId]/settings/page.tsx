'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  Save, Loader2, Zap, Hash, Users, Shield, BookOpen, CheckCircle2,
  AlertCircle, Terminal, Trash2, AlertTriangle, PenLine, RefreshCw, Trophy, Palette,
} from 'lucide-react'

interface Channel { id: string; name: string; type: number }
interface Role    { id: string; name: string; color: number; permissions?: string }
interface GuildConfig {
  guildName: string
  ownerId: string
  announceChannelId?: string | null
  pollyChannelId?: string | null
  dashboardChannelId?: string | null
  auditLogChannelId?: string | null
  adminRoleIds: string[]
  creatorRoleIds: string[]
  voterRoleIds: string[]
  announceWinner?: boolean
  pollColor?: string
}

// Sentinel stored in creatorRoleIds / voterRoleIds to mean "explicitly restricted — nobody can do this"
// (backend: non-empty list that matches no real role → only admins can act)
const NONE = '__none__'

export default function SettingsPage() {
  const params  = useParams()
  const router  = useRouter()
  const { status: authStatus } = useSession()
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
  const [removeConfirm,  setRemoveConfirm]  = useState(false)
  const [removing,       setRemoving]       = useState(false)
  const [cleanupDiscord, setCleanupDiscord] = useState(false)
  const [detectingAdmins, setDetectingAdmins] = useState(false)
  const [discordAdminIds, setDiscordAdminIds] = useState<string[]>([])
  const [originalConfig,  setOriginalConfig]  = useState<GuildConfig | null>(null)
  const hasLoaded = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, chRes, rlRes, meRes] = await Promise.all([
        fetch(`/api/guilds/${guildId}`),
        fetch(`/api/guilds/${guildId}/channels`),
        fetch(`/api/guilds/${guildId}/channels?type=roles`),
        fetch(`/api/guilds/${guildId}/me`),
      ])

      let data: GuildConfig | null = null
      if (cfgRes.ok) data = await cfgRes.json()

      if (chRes.ok) setChannels((await chRes.json()).filter((c: Channel) => c.type === 0))

      if (rlRes.ok) {
        const allRoles: Role[] = await rlRes.json()
        setRoles(allRoles)
        const discordAdmins = allRoles
          .filter(r => r.name !== '@everyone' && r.permissions && (parseInt(r.permissions, 10) & 8) !== 0)
          .map(r => r.id)
        setDiscordAdminIds(discordAdmins)
        if (data && (!data.adminRoleIds || data.adminRoleIds.length === 0) && discordAdmins.length > 0) {
          data = { ...data, adminRoleIds: discordAdmins }
        }
      }

      if (meRes.ok) {
        const { canManage } = await meRes.json()
        if (!canManage) {
          router.replace(`/dashboard/${guildId}`)
          return
        }
      }

      if (data) {
        const normalized = { ...data, creatorRoleIds: data.creatorRoleIds ?? [] }
        setConfig(normalized)
        setOriginalConfig(normalized)
      }
    } catch { setError('Failed to load settings') }
    hasLoaded.current = true
    setIsDirty(false)
    setLoading(false)
  }, [guildId])

  useEffect(() => { load() }, [load])

  function updateConfig(newConfig: GuildConfig) {
    setConfig(newConfig)
    if (hasLoaded.current) setIsDirty(true)
  }

  function discardChanges() {
    if (originalConfig) { setConfig(originalConfig); setIsDirty(false) }
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    if (!config) return
    setSaving(true); setError('')
    const res = await fetch(`/api/guilds/${guildId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true); setIsDirty(false); setOriginalConfig(config)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } else {
      setError('Failed to save settings')
    }
  }

  const nonEveryone = roles.filter(r => r.name !== '@everyone')
  const allRoleIds  = nonEveryone.map(r => r.id)

  // ── Admin role helpers ─────────────────────────────────────────────────────
  function toggleAdminRole(id: string) {
    if (!config) return
    const curr = config.adminRoleIds
    updateConfig({ ...config, adminRoleIds: curr.includes(id) ? curr.filter(r => r !== id) : [...curr, id] })
  }

  // ── Creator / voter role helpers ───────────────────────────────────────────
  // empty list  = everyone allowed
  // [NONE]      = nobody allowed (sentinel; no real role matches it)
  // [id, ...]   = only those roles allowed

  function isRestrictedRoleActive(key: 'creatorRoleIds' | 'voterRoleIds', id: string): boolean {
    if (!config) return false
    const list = config[key]
    if (list.length === 1 && list[0] === NONE) return false
    return list.length === 0 || list.includes(id)
  }

  function toggleRestrictedRole(key: 'creatorRoleIds' | 'voterRoleIds', id: string) {
    if (!config) return
    const curr = config[key].filter(r => r !== NONE)
    let next: string[]
    if (curr.length === 0) {
      next = allRoleIds.filter(r => r !== id)
    } else if (curr.includes(id)) {
      next = curr.filter(r => r !== id)
    } else {
      const added = [...curr, id]
      next = allRoleIds.every(r => added.includes(r)) ? [] : added
    }
    updateConfig({ ...config, [key]: next })
  }

  function restrictedRoleLabel(key: 'creatorRoleIds' | 'voterRoleIds'): string {
    if (!config) return ''
    const list = config[key]
    if (list.length === 0) return 'Everyone'
    if (list.length === 1 && list[0] === NONE) return 'Restricted'
    const count = list.filter(id => id !== NONE).length
    return `${count} role${count !== 1 ? 's' : ''}`
  }

  // ── Guide / dashboard / commands ──────────────────────────────────────────
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
    else setError('Failed to set up Polly Status embed')
  }

  async function detectAdminRoles() {
    if (!config) return
    setDetectingAdmins(true)
    const res = await fetch(`/api/guilds/${guildId}/channels?type=roles`)
    if (res.ok) {
      const allRoles: Role[] = await res.json()
      const adminRoleIds = allRoles
        .filter(r => r.name !== '@everyone' && r.permissions && (parseInt(r.permissions, 10) & 8) !== 0)
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
    const res = await fetch(`/api/guilds/${guildId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cleanupDiscord }),
    })
    setRemoving(false)
    if (res.ok) { router.push('/dashboard') }
    else { setError('Failed to remove bot. Try again or kick it manually from Discord.'); setRemoveConfirm(false) }
  }

  if (loading || authStatus === 'loading') return (
    <div className="max-w-3xl mx-auto px-4 py-12 flex justify-center">
      <Loader2 className="animate-spin text-p-muted" size={24} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 pb-24">

      {/* Breadcrumb + title */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-p-muted text-sm mb-1">
          <Link href="/dashboard" className="hover:text-p-text transition-colors">Dashboard</Link>
          <span>/</span>
          <Link href={`/dashboard/${guildId}`} className="hover:text-p-text transition-colors">{config?.guildName}</Link>
          <span>/</span>
          <span className="text-p-text">Settings</span>
        </div>
        <h1 className="font-display font-bold text-3xl text-p-text">Settings</h1>
        <p className="text-p-muted text-sm mt-1">Configure Polly for <span className="text-p-text">{config?.guildName}</span></p>
      </div>

      {error && (
        <div className="flex items-center gap-2 card p-4 text-p-danger border-p-danger/30 mb-6 text-sm">
          <AlertCircle size={14} className="shrink-0" /> {error}
        </div>
      )}

      {config && (
        <form id="settings-form" onSubmit={save} className="flex flex-col gap-6">

          {/* ── Channels ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mt-2">
            <div className="h-px flex-1 bg-p-border" />
            <span className="text-p-subtle text-xs font-semibold uppercase tracking-widest">Channels</span>
            <div className="h-px flex-1 bg-p-border" />
          </div>

          <div className="card p-5">
            <div className="flex flex-col divide-y divide-p-border/50">

              {/* Announcement Channel */}
              <div className="pb-5">
                <div className="flex items-center gap-2 mb-1">
                  <Hash size={13} className="text-p-primary shrink-0" />
                  <span className="font-semibold text-sm text-p-text">Announcement Channel</span>
                  <span className="text-p-warning text-xs ml-auto">Required</span>
                </div>
                <p className="text-p-muted text-xs mb-2 pl-5">Polls are posted here as Discord messages with voting buttons.</p>
                <select
                  value={config.announceChannelId ?? ''}
                  onChange={e => updateConfig({ ...config, announceChannelId: e.target.value || null })}
                  className="input">
                  <option value="">— None —</option>
                  {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>

              {/* Guide Channel */}
              <div className="py-5">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen size={13} className="text-p-primary shrink-0" />
                  <span className="font-semibold text-sm text-p-text">Guide Channel</span>
                  <span className="text-p-muted text-xs ml-auto">Optional</span>
                </div>
                <p className="text-p-muted text-xs mb-2 pl-5">
                  Polly posts a pinned how-to guide here. Good for a <span className="font-mono text-p-text">#polls</span> or <span className="font-mono text-p-text">#bot-info</span> channel.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={config.pollyChannelId ?? ''}
                    onChange={e => updateConfig({ ...config, pollyChannelId: e.target.value || null })}
                    className="input flex-1 min-w-0">
                    <option value="">— None —</option>
                    {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                  </select>
                  {config.pollyChannelId && (
                    <button type="button" onClick={postGuide} disabled={guideStatus === 'posting'}
                      className="btn-secondary text-sm shrink-0">
                      {guideStatus === 'posting' ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                      Post / Refresh
                    </button>
                  )}
                  {guideStatus === 'ok' && (
                    <span className="flex items-center gap-1.5 text-p-success text-xs w-full pl-5">
                      <CheckCircle2 size={13} /> Posted and pinned!
                    </span>
                  )}
                  {guideStatus === 'fail' && (
                    <span className="flex items-center gap-1.5 text-p-warning text-xs w-full pl-5">
                      <AlertCircle size={13} /> Failed — check bot permissions.
                    </span>
                  )}
                </div>
              </div>

              {/* Polly Status Embed */}
              <div className="py-5">
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={13} className="text-p-accent shrink-0" />
                  <span className="font-semibold text-sm text-p-text">Polly Status Embed</span>
                  <span className="text-p-muted text-xs ml-auto">Optional</span>
                </div>
                <p className="text-p-muted text-xs mb-2 pl-5">
                  A live message listing all active polls with buttons to create polls and open the dashboard.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={config.dashboardChannelId ?? ''}
                    onChange={e => updateConfig({ ...config, dashboardChannelId: e.target.value || null })}
                    className="input flex-1 min-w-0">
                    <option value="">— None —</option>
                    {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                  </select>
                  {config.dashboardChannelId && (
                    <button type="button" onClick={setupDashboard} className="btn-accent text-sm shrink-0" disabled={saving}>
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      Post / Refresh
                    </button>
                  )}
                </div>
              </div>

              {/* Audit Log */}
              <div className="pt-5">
                <div className="flex items-center gap-2 mb-1">
                  <Hash size={13} className="text-p-muted shrink-0" />
                  <span className="font-semibold text-sm text-p-text">Audit Log</span>
                  <span className="text-p-muted text-xs ml-auto">Optional</span>
                </div>
                <p className="text-p-muted text-xs mb-2 pl-5">Poll creation, closing, and deletion are logged here. Leave empty to disable.</p>
                <select
                  value={config.auditLogChannelId ?? ''}
                  onChange={e => updateConfig({ ...config, auditLogChannelId: e.target.value || null })}
                  className="input">
                  <option value="">— None (disabled) —</option>
                  {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>

            </div>
          </div>

          {/* ── Bot ──────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mt-2">
            <div className="h-px flex-1 bg-p-border" />
            <span className="text-p-subtle text-xs font-semibold uppercase tracking-widest">Bot</span>
            <div className="h-px flex-1 bg-p-border" />
          </div>

          {/* Slash Commands */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Terminal size={15} className="text-p-accent" />
              <h2 className="font-display font-semibold text-p-text">Discord Slash Commands</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">
              Register <code className="text-p-text bg-p-surface-2 px-1.5 py-0.5 rounded text-xs">/poll</code> and{' '}
              <code className="text-p-text bg-p-surface-2 px-1.5 py-0.5 rounded text-xs">/setup</code> as global slash commands.
              Run once, or after any command changes. Commands may take up to 1 hour to appear globally.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={registerCommands} disabled={cmdStatus === 'registering'}
                className="btn-secondary text-sm">
                {cmdStatus === 'registering' ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                Register Commands
              </button>
              {cmdStatus === 'ok' && (
                <span className="flex items-center gap-1.5 text-p-success text-xs">
                  <CheckCircle2 size={13} /> Registered!
                </span>
              )}
              {cmdStatus === 'fail' && (
                <span className="flex items-center gap-1.5 text-p-warning text-xs">
                  <AlertCircle size={13} /> Failed — check DISCORD_BOT_TOKEN.
                </span>
              )}
            </div>
          </div>

          {/* ── Behaviour ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mt-2">
            <div className="h-px flex-1 bg-p-border" />
            <span className="text-p-subtle text-xs font-semibold uppercase tracking-widest">Behaviour</span>
            <div className="h-px flex-1 bg-p-border" />
          </div>

          <div className="card p-5">
            <div className="flex flex-col divide-y divide-p-border/50">

              {/* Announce winner */}
              <div className="pb-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Trophy size={13} className="text-p-warning shrink-0" />
                      <span className="font-semibold text-sm text-p-text">Announce Winner</span>
                    </div>
                    <p className="text-p-muted text-xs pl-5">Show the winning option when a poll closes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateConfig({ ...config, announceWinner: !(config.announceWinner ?? true) })}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                      (config.announceWinner ?? true) ? 'bg-p-primary' : 'bg-p-surface-2'
                    }`}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      (config.announceWinner ?? true) ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Poll embed color */}
              <div className="pt-5">
                <div className="flex items-center gap-2 mb-1">
                  <Palette size={13} className="text-p-accent shrink-0" />
                  <span className="font-semibold text-sm text-p-text">Poll Embed Color</span>
                  <span className="text-p-muted text-xs ml-auto">Optional</span>
                </div>
                <p className="text-p-muted text-xs mb-3 pl-5">Accent color for poll embeds in Discord. Leave empty for the default indigo.</p>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={config.pollColor ?? '#6366f1'}
                    onChange={e => updateConfig({ ...config, pollColor: e.target.value })}
                    className="w-10 h-9 rounded cursor-pointer border border-p-border bg-transparent"
                  />
                  <input
                    type="text"
                    value={config.pollColor ?? ''}
                    onChange={e => updateConfig({ ...config, pollColor: e.target.value || undefined })}
                    placeholder="#6366f1"
                    className="input w-32 text-sm font-mono"
                    maxLength={7}
                  />
                  {config.pollColor && (
                    <button type="button" onClick={() => updateConfig({ ...config, pollColor: undefined })}
                      className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7 text-p-muted">
                      Reset
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* ── Permissions ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mt-2">
            <div className="h-px flex-1 bg-p-border" />
            <span className="text-p-subtle text-xs font-semibold uppercase tracking-widest">Permissions</span>
            <div className="h-px flex-1 bg-p-border" />
          </div>

          {/* Admin Roles */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={15} className="text-p-primary" />
              <h2 className="font-display font-semibold text-p-text">Admin Roles</h2>
              {config.adminRoleIds.length > 0 && (
                <span className="badge badge-primary text-[10px] px-2 py-0.5 ml-1">{config.adminRoleIds.length}</span>
              )}
            </div>
            <p className="text-p-muted text-sm mb-4">
              Full access — create polls, close or delete any poll, and change settings. By default, Polly uses Discord&apos;s built-in Administrator roles.
            </p>

            {nonEveryone.length === 0 ? (
              <p className="text-p-subtle text-sm italic">No roles found. Make sure the bot is in the server.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {nonEveryone.map(role => {
                    const isSelected     = config.adminRoleIds.includes(role.id)
                    const isDiscordAdmin = discordAdminIds.includes(role.id)
                    return (
                      <button
                        key={role.id} type="button"
                        onClick={() => toggleAdminRole(role.id)}
                        title={isDiscordAdmin ? 'Has Discord Administrator permission' : undefined}
                        className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all gap-1.5 ${
                          isSelected ? 'badge-primary' : 'badge-muted hover:border-p-border-2'
                        }`}>
                        {isDiscordAdmin && <Shield size={10} className={isSelected ? 'text-p-primary' : 'text-p-muted'} />}
                        {role.name}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-p-border/50">
                  <button type="button"
                    onClick={() => updateConfig({ ...config, adminRoleIds: allRoleIds })}
                    className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7">
                    Mark All
                  </button>
                  <button type="button"
                    onClick={() => updateConfig({ ...config, adminRoleIds: [] })}
                    className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7">
                    Mark None
                  </button>
                  <button type="button" onClick={detectAdminRoles} disabled={detectingAdmins}
                    className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7 ml-auto">
                    {detectingAdmins ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    Auto-detect Discord admins
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Creator Roles */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <PenLine size={15} className="text-p-accent" />
                  <h2 className="font-display font-semibold text-p-text">Creator Roles</h2>
                </div>
                <p className="text-p-muted text-sm">Who can create and manage their own polls.</p>
              </div>
              <span className={`badge text-[10px] px-2 py-1 shrink-0 mt-0.5 ${
                config.creatorRoleIds.length === 0
                  ? 'badge-success'
                  : config.creatorRoleIds[0] === NONE
                    ? 'badge-danger'
                    : 'badge-accent'
              }`}>
                {restrictedRoleLabel('creatorRoleIds')}
              </span>
            </div>

            {nonEveryone.length === 0 ? (
              <p className="text-p-subtle text-sm italic">No roles found.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {nonEveryone.map(role => {
                    const active = isRestrictedRoleActive('creatorRoleIds', role.id)
                    return (
                      <button
                        key={role.id} type="button"
                        onClick={() => toggleRestrictedRole('creatorRoleIds', role.id)}
                        className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                          active ? 'badge-accent' : 'badge-muted hover:border-p-border-2'
                        }`}>
                        {role.name}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-p-border/50">
                  <button type="button"
                    onClick={() => updateConfig({ ...config, creatorRoleIds: [] })}
                    className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7">
                    Allow All
                  </button>
                  <button type="button"
                    onClick={() => updateConfig({ ...config, creatorRoleIds: [NONE] })}
                    className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7">
                    Restrict All
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Voter Roles */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Users size={15} className="text-p-accent" />
                  <h2 className="font-display font-semibold text-p-text">Voter Roles</h2>
                </div>
                <p className="text-p-muted text-sm">Who can cast votes on polls.</p>
              </div>
              <span className={`badge text-[10px] px-2 py-1 shrink-0 mt-0.5 ${
                config.voterRoleIds.length === 0
                  ? 'badge-success'
                  : config.voterRoleIds[0] === NONE
                    ? 'badge-danger'
                    : 'badge-accent'
              }`}>
                {restrictedRoleLabel('voterRoleIds')}
              </span>
            </div>

            {nonEveryone.length === 0 ? (
              <p className="text-p-subtle text-sm italic">No roles found.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {nonEveryone.map(role => {
                    const active = isRestrictedRoleActive('voterRoleIds', role.id)
                    return (
                      <button
                        key={role.id} type="button"
                        onClick={() => toggleRestrictedRole('voterRoleIds', role.id)}
                        className={`badge px-3 py-1.5 text-xs cursor-pointer transition-all ${
                          active ? 'badge-primary' : 'badge-muted hover:border-p-border-2'
                        }`}>
                        {role.name}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-p-border/50">
                  <button type="button"
                    onClick={() => updateConfig({ ...config, voterRoleIds: [] })}
                    className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7">
                    Allow All
                  </button>
                  <button type="button"
                    onClick={() => updateConfig({ ...config, voterRoleIds: [NONE] })}
                    className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7">
                    Restrict All
                  </button>
                </div>
              </>
            )}
          </div>

        </form>
      )}

      {/* Danger zone */}
      <div className="mt-10 card p-6 border-p-danger/20">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={15} className="text-p-danger" />
          <h2 className="font-display font-semibold text-p-danger">Danger Zone</h2>
        </div>
        <p className="text-p-muted text-sm mb-5">
          Permanently removes Polly from this server and deletes all poll data. This cannot be undone.
        </p>
        {!removeConfirm ? (
          <button type="button" onClick={() => { setRemoveConfirm(true); setCleanupDiscord(false) }}
            className="btn-ghost text-sm text-p-danger border-p-danger/30 hover:bg-p-danger/10 hover:border-p-danger/50">
            <Trash2 size={14} />
            Remove Polly from this server
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-p-danger text-sm font-semibold">
              Are you sure? This will delete all polls, votes, and settings for <strong>{config?.guildName}</strong>.
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cleanupDiscord}
                onChange={e => setCleanupDiscord(e.target.checked)}
                className="mt-0.5 accent-p-danger"
              />
              <span className="text-sm text-p-muted">
                Also delete all Discord messages posted by Polly (poll embeds and Polly Status)
              </span>
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => setRemoveConfirm(false)} className="btn-secondary text-sm">Cancel</button>
              <button type="button" onClick={removeBot} disabled={removing}
                className="btn-danger text-sm">
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
            <div className="flex items-center gap-3">
              <button type="button" onClick={discardChanges} className="btn-ghost text-sm text-p-muted">Discard</button>
              <button type="submit" form="settings-form" disabled={saving} className="btn-primary px-6">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saved ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
