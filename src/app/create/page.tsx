import { redirect } from 'next/navigation'
import { getKV } from '@/lib/kv'
import { getGuild } from '@/lib/guilds'
import CreateMagicPollForm from '@/components/CreateMagicPollForm'
import Link from 'next/link'
import { AlertTriangle, Zap } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ token?: string }> }

interface MagicTokenData { userId: string; guildId: string; username: string; pollType?: 'yn' | 'multi' | 'ts' }

export default async function CreatePage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) redirect('/')

  const kv  = await getKV()
  const raw = kv ? await kv.get(`magic:${token}`) : null

  if (!raw) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-p-error/10 flex items-center justify-center mx-auto">
            <AlertTriangle size={22} className="text-p-error" />
          </div>
          <h1 className="font-display font-bold text-xl text-p-text">Link expired</h1>
          <p className="text-p-muted text-sm">This link has either expired or already been used. Go back to Discord and use <code className="text-p-primary">/poll</code> to get a new one.</p>
          <Link href="/" className="btn-secondary text-sm">Go to homepage</Link>
        </div>
      </div>
    )
  }

  const data    = JSON.parse(raw) as MagicTokenData
  const guild   = await getGuild(data.guildId)
  const guildName = guild?.guildName ?? 'your server'

  return (
    <div className="min-h-screen bg-p-bg">
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-p-primary/10 border border-p-primary/20 text-p-primary text-xs font-medium mb-4">
            <Zap size={11} />
            Discord quick-create
          </div>
          <h1 className="font-display font-bold text-2xl text-p-text mb-1">Create a Poll</h1>
          <p className="text-p-muted text-sm">
            Posting to <span className="text-p-text font-medium">{guildName}</span> as <span className="text-p-text font-medium">{data.username}</span>
          </p>
        </div>

        {/* Form card */}
        <div className="card p-6">
          <CreateMagicPollForm
            token={token}
            guildId={data.guildId}
            guildName={guildName}
            username={data.username}
            defaultType={data.pollType ?? 'multi'}
          />
        </div>

        <p className="text-center text-xs text-p-muted mt-6">
          This link was generated from Discord and can only be used once.
        </p>
      </div>
    </div>
  )
}
