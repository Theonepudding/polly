'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Save, Loader2, Zap, Hash, Users, Shield, BookOpen, CheckCircle2, AlertCircle, Terminal, Trash2, AlertTriangle, PenLine, RefreshCw } from 'lucide-react'

interface Channel { id: string; name: string; type: number }
interface Role    { id: string; name: string; color: number; permissions?: string }
interface GuildConfig {
  guildName: string
  ownerId: string
  announceChannelId?: string
  pollyChannelId?: string
  guideMessage?: string
  dashboardChannelId?: string
  auditLogChannelId?: string
  adminRoleIds: string[]
  creatorRoleIds: string[]
  voterRoleIds: string[]
}

export default function SettingsPage() {
  const params  = useParams()
  const router  = useRouter()
  const { data: session, status: authStatus } = useSession()
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
  const [detectingAdmins,    setDetectingAdmins]    = useState(false)
  const [discordAdminIds,    setDiscordAdminIds]    = useState<string[]>([])
  const [originalConfig,     setOriginalConfig]     = useState<GuildConfig | null>(null)
  const hasLoaded = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, chRes, rlRes] = await Promise.all([
        fetch(`/api/guilds/${guildId}`),
        fetch(`/api/guilds/${guildId}/channels`),
        fetch(`/api/guilds/${guildId}/channels?type=roles`),
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

  // Admin-only guard: redirect if loaded and not an admin
  useEffect(() => {
    if (!config || authStatus !== 'authenticated' || !session?.user?.id) return
    const isOwner    = config.ownerId === session.user.id
    const noAdmins   = config.adminRoleIds.length === 0
    const isBotAdmin = !!(session.user as { isBotAdmin?: boolean }).isBotAdmin
    if (!isOwner && !noAdmins && !isBotAdmin) {
      router.replace(`/dashboard/${guildId}`)
    }
  }, [config, session, authStatus, guildId, router])

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

  // For creator/voter: empty = everyone allowed → all show as colored.
  // Clicking a colored role when list is empty = revoke it (store all others).
  // Clicking a colored role in a non-empty list = remove it.
  // Clicking a muted role in a non-empty list = add it.
  // If result would include all roles, simplify back to empty.
  function toggleRestrictedRole(key: 'creatorRoleIds' | 'voterRoleIds', id: string) {
    if (!config) return
    const curr = config[key]
    let next: string[]
    if (curr.length === 0) {
      // All currently allowed → revoke this one → allow all others explicitly
      next = allRoleIds.filter(r => r !== id)
    } else if (curr.includes(id)) {
      next = curr.filter(r => r !== id)
    } else {
      const added = [...curr, id]
      next = allRoleIds.every(r => added.includes(r)) ? [] : added
    }
    updateConfig({ ...config, [key]: next })
  }

  function isRestrictedRoleActive(key: 'creatorRoleIds' | 'voterRoleIds', id: string): boolean {
    if (!config) return false
    return config[key].length === 0 || config[key].includes(id)
  }

  function toggleAdminRole(id: string) {
    if (!config) return
    const curr = config.adminRoleIds
    updateConfig({ ...config, adminRoleIds: curr.includes(id) ? curr.filter(r => r !== id) : [...curr, id] })
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
    const res = await fetch(`/api/guilds/${guildId}`, { method: 'DELETE' })
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
            <p className="text-[#c8ccd4] text-sm mb-4">
              When a poll is created, Polly posts it here as a Discord message with voting buttons. Members vote directly from this channel.
            </p>
            <div className="mb-4 rounded-lg overflow-hidden border border-white/10 bg-[#1e1f22] text-xs">
              <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                <div className="w-6 h-6 rounded-full bg-[#5865f2] flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-[9px]">P</span>
                </div>
                <span className="text-white font-semibold">Polly</span>
                <span className="text-[10px] bg-[#5865f2] text-white rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide">APP</span>
              </div>
              <div className="flex gap-0">
                <div className="w-1 bg-[#6366f1] shrink-0 mx-3 my-1 rounded" />
                <div className="flex-1 py-1 pr-3">
                  <div className="text-white font-bold mb-1">Raid Night: Friday or Saturday?</div>
                  <div className="text-[#b5bac1] mb-2">Vote closes in 2 days</div>
                  <div className="space-y-1 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded bg-[#2f3136]"><div className="h-full w-3/5 bg-[#6366f1] rounded" /></div>
                      <span className="text-[#b5bac1] w-8 text-right">60%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded bg-[#2f3136]"><div className="h-full w-2/5 bg-[#6366f1] rounded" /></div>
                      <span className="text-[#b5bac1] w-8 text-right">40%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 px-3 pb-3">
                <div className="rounded px-3 py-1 bg-[#4e5058] text-[#dbdee1]">Friday</div>
                <div className="rounded px-3 py-1 bg-[#4e5058] text-[#dbdee1]">Saturday</div>
                <div className="rounded px-3 py-1 bg-[#4e5058] text-[#dbdee1]">🗳️ Vote on the website</div>
              </div>
            </div>
            <select
              value={config.announceChannelId ?? ''}
              onChange={e => updateConfig({ ...config, announceChannelId: e.target.value || undefined })}
              className="input">
              <option value="">— None —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

          {/* Guide Channel */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen size={16} className="text-p-primary" />
              <h2 className="font-display font-semibold text-p-text">Guide Channel</h2>
            </div>
            <p className="text-[#c8ccd4] text-sm mb-4">
              Polly posts a pinned guide here explaining how to vote and use polls. Good for a dedicated <span className="font-mono text-p-text">#polls</span> or <span className="font-mono text-p-text">#bot-info</span> channel. You can customise the guide message below.
            </p>
            <div className="mb-4 rounded-lg overflow-hidden border border-white/10 bg-[#1e1f22] text-xs">
              <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                <div className="w-6 h-6 rounded-full bg-[#5865f2] flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-[9px]">P</span>
                </div>
                <span className="text-white font-semibold">Polly</span>
                <span className="text-[10px] bg-[#5865f2] text-white rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide">APP</span>
                <span className="text-[10px] text-[#72767d] ml-1">📌 Pinned message</span>
              </div>
              <div className="flex gap-0">
                <div className="w-1 bg-[#6366f1] shrink-0 mx-3 my-1 rounded" />
                <div className="flex-1 py-1 pr-3">
                  <div className="text-white font-bold mb-1">How Polly Works</div>
                  <div className="text-[#b5bac1] mb-1.5">
                    {config.guideMessage ?? 'Polls appear in this channel as Discord messages. Vote with the buttons, or visit the website for a full view with live results.'}
                  </div>
                </div>
              </div>
              <div className="px-3 pb-3 pt-1 text-[#72767d]">Polly — Discord poll bot</div>
            </div>
            <select
              value={config.pollyChannelId ?? ''}
              onChange={e => updateConfig({ ...config, pollyChannelId: e.target.value || undefined })}
              className="input mb-3">
              <option value="">— None —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
            <div className="mb-4">
              <label className="label">Custom guide message <span className="normal-case font-normal text-p-muted/50">(optional — shown in Discord embed)</span></label>
              <textarea
                className="textarea text-sm"
                rows={4}
                placeholder="Leave empty to use the default guide text. Write whatever you'd like your members to see when they first join your polls channel."
                maxLength={2000}
                value={config.guideMessage ?? ''}
                onChange={e => updateConfig({ ...config, guideMessage: e.target.value || undefined })}
              />
              {config.guideMessage && (
                <button type="button" onClick={() => updateConfig({ ...config, guideMessage: undefined })}
                  className="text-xs text-p-muted hover:text-p-danger mt-1">
                  Reset to default
                </button>
              )}
            </div>
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
            <p className="text-[#c8ccd4] text-sm mb-4">
              Polly keeps a single live message here that lists all active polls. Members can see what&apos;s open, create new polls, or open the dashboard — all from one place.
            </p>
            <div className="mb-4 rounded-lg overflow-hidden border border-white/10 bg-[#1e1f22] text-xs">
              <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                <div className="w-6 h-6 rounded-full bg-[#5865f2] flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-[9px]">P</span>
                </div>
                <span className="text-white font-semibold">Polly</span>
                <span className="text-[10px] bg-[#5865f2] text-white rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide">APP</span>
              </div>
              <div className="flex gap-0">
                <div className="w-1 bg-[#6366f1] shrink-0 mx-3 my-1 rounded" />
                <div className="flex-1 py-1 pr-3">
                  <div className="text-white font-bold mb-2">Your Server — Polls</div>
                  <div className="text-[#b5bac1] mb-0.5"><span className="text-[#6366f1] font-semibold">Raid Night: Friday or Saturday?</span> · closes in 2d</div>
                  <div className="text-[#b5bac1] mb-0.5"><span className="text-[#6366f1] font-semibold">Movie Night pick</span> · closes in 5d</div>
                  <div className="text-[#72767d] mt-1.5">2 active polls · Polly</div>
                </div>
              </div>
              <div className="flex gap-2 px-3 pb-3">
                <div className="rounded px-3 py-1 bg-[#5865f2] text-white">➕ Create Poll</div>
                <div className="rounded px-3 py-1 bg-[#4e5058] text-[#dbdee1]">📋 View All Polls</div>
                <div className="rounded px-3 py-1 bg-[#4e5058] text-[#dbdee1]">⚙️ Open Dashboard</div>
              </div>
            </div>
            <select
              value={config.dashboardChannelId ?? ''}
              onChange={e => updateConfig({ ...config, dashboardChannelId: e.target.value || undefined })}
              className="input mb-4">
              <option value="">— None —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
            {config.dashboardChannelId && (
              <button type="button" onClick={setupDashboard} className="btn-accent text-sm" disabled={saving}>
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
            <p className="text-[#c8ccd4] text-sm mb-4">
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
            <p className="text-[#c8ccd4] text-sm mb-4">
              Register <code className="text-[#c8ccd4] bg-p-surface-2 px-1 rounded">/poll</code> and{' '}
              <code className="text-[#c8ccd4] bg-p-surface-2 px-1 rounded">/setup</code> as global slash commands.
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
            <p className="text-[#c8ccd4] text-sm mb-3">
              Members with these roles can create polls, close any poll, resend embeds, and delete any poll. By default, Polly respects Discord&apos;s built-in Administrator roles.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
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
            <p className="text-p-muted text-sm mb-1">
              Members with these roles can create and delete their own polls. Click a role to revoke its access.
            </p>
            <p className="text-p-subtle text-xs mb-4">
              {config.creatorRoleIds.length === 0
                ? 'All roles currently have access. Click a role to restrict it.'
                : `${config.creatorRoleIds.length} role${config.creatorRoleIds.length !== 1 ? 's' : ''} allowed.`}
            </p>
            <div className="flex flex-wrap gap-2">
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
          </div>

          {/* Voter Roles */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-p-accent" />
              <h2 className="font-display font-semibold text-p-text">Voter Roles</h2>
            </div>
            <p className="text-p-muted text-sm mb-1">
              Members with these roles can vote. Click a role to revoke its access.
            </p>
            <p className="text-p-subtle text-xs mb-4">
              {config.voterRoleIds.length === 0
                ? 'All roles currently have access. Click a role to restrict it.'
                : `${config.voterRoleIds.length} role${config.voterRoleIds.length !== 1 ? 's' : ''} allowed.`}
            </p>
            <div className="flex flex-wrap gap-2">
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
          <button type="button" onClick={() => setRemoveConfirm(true)}
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
              <button type="button" onClick={() => setRemoveConfirm(false)} className="btn-secondary text-sm">Cancel</button>
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
