'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Save, Loader2, Zap, Hash, Users, Shield, BookOpen, CheckCircle2, AlertCircle } from 'lucide-react'

interface Channel { id: string; name: string; type: number }
interface Role    { id: string; name: string; color: number }
interface GuildConfig {
  guildName: string
  announceChannelId?: string
  pollyChannelId?: string
  dashboardChannelId?: string
  adminRoleIds: string[]
  voterRoleIds: string[]
}

export default function SettingsPage() {
  const params = useParams()
  const router = useRouter()
  const guildId = params.guildId as string

  const [config,    setConfig]    = useState<GuildConfig | null>(null)
  const [channels,  setChannels]  = useState<Channel[]>([])
  const [roles,     setRoles]     = useState<Role[]>([])
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(true)
  const [guideStatus, setGuideStatus] = useState<'idle' | 'posting' | 'ok' | 'fail'>('idle')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, chRes, rlRes] = await Promise.all([
        fetch(`/api/guilds/${guildId}`),
        fetch(`/api/guilds/${guildId}/channels`),
        fetch(`/api/guilds/${guildId}/channels?type=roles`),
      ])
      if (cfgRes.ok) setConfig(await cfgRes.json())
      if (chRes.ok)  setChannels((await chRes.json()).filter((c: Channel) => c.type === 0))
      if (rlRes.ok)  setRoles(await rlRes.json())
    } catch { setError('Failed to load settings') }
    setLoading(false)
  }, [guildId])

  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/guilds/${guildId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    else setError('Failed to save settings')
  }

  function toggleRole(key: 'adminRoleIds' | 'voterRoleIds', id: string) {
    if (!config) return
    const curr = config[key]
    setConfig({
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

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-12 flex justify-center">
      <Loader2 className="animate-spin text-p-muted" size={24} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
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
        <form onSubmit={save} className="flex flex-col gap-8">

          {/* Announce channel */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Hash size={16} className="text-p-primary" />
              <h2 className="font-display font-semibold text-p-text">Poll Announcement Channel</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">New polls will be posted to this channel automatically.</p>
            <select
              value={config.announceChannelId ?? ''}
              onChange={e => setConfig({ ...config, announceChannelId: e.target.value || undefined })}
              className="input">
              <option value="">— None —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

          {/* Polly channel */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen size={16} className="text-p-primary" />
              <h2 className="font-display font-semibold text-p-text">Polly Channel</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">
              A dedicated channel where Polly posts a pinned guide explaining how to vote and use polls. Great for a <code className="text-p-muted bg-p-surface-2 px-1 rounded">#polly</code> or <code className="text-p-muted bg-p-surface-2 px-1 rounded">#polls</code> channel.
            </p>
            <select
              value={config.pollyChannelId ?? ''}
              onChange={e => setConfig({ ...config, pollyChannelId: e.target.value || undefined })}
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
                    <AlertCircle size={13} /> Failed — check bot has Send Messages &amp; Manage Messages permission.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Dashboard channel */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-p-accent" />
              <h2 className="font-display font-semibold text-p-text">Dashboard Embed Channel</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">
              Polly will post a persistent dashboard message here — members can see active polls and create new ones.
            </p>
            <select
              value={config.dashboardChannelId ?? ''}
              onChange={e => setConfig({ ...config, dashboardChannelId: e.target.value || undefined })}
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

          {/* Admin roles */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={16} className="text-p-primary" />
              <h2 className="font-display font-semibold text-p-text">Poll Admin Roles</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">Members with these roles can create and manage polls. Leave empty to allow everyone.</p>
            <div className="flex flex-wrap gap-2">
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
          </div>

          {/* Voter roles */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-p-accent" />
              <h2 className="font-display font-semibold text-p-text">Voter Roles</h2>
            </div>
            <p className="text-p-muted text-sm mb-4">Only members with these roles can vote. Leave empty to allow everyone.</p>
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
    </div>
  )
}
