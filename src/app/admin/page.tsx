import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getBotAdmins } from '@/lib/bot-admin'
import Link from 'next/link'
import { Shield, Users, Server, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getBotGuilds(): Promise<{ id: string; name: string; icon?: string }[]> {
  if (!process.env.DISCORD_BOT_TOKEN) return []
  try {
    const res = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isBotAdmin) redirect('/')

  const [admins, guilds] = await Promise.all([getBotAdmins(), getBotGuilds()])

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-p-primary-b border border-p-primary/40 flex items-center justify-center shrink-0">
          <Shield size={18} className="text-p-primary" />
        </div>
        <div>
          <h1 className="font-display font-bold text-2xl text-p-text">Bot Admin</h1>
          <p className="text-p-muted text-sm">Global administration — {admins.authorizedUserIds.length} admin{admins.authorizedUserIds.length !== 1 ? 's' : ''} · {guilds.length} server{guilds.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Bot Admins */}
        <section>
          <h2 className="font-display font-semibold text-base text-p-text mb-3 flex items-center gap-2">
            <Shield size={14} className="text-p-primary" />
            Bot Admins
          </h2>
          <div className="flex flex-col gap-2 mb-3">
            {admins.authorizedUserIds.map(id => (
              <div key={id} className="card p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-p-text text-sm font-mono truncate">{id}</span>
                  {id === session.user?.id && (
                    <span className="badge badge-primary text-[10px] px-1.5 py-0.5 shrink-0">You</span>
                  )}
                </div>
                {id !== session.user?.id && (
                  <form action={`/api/admin/admins/${id}?action=remove`} method="POST" className="shrink-0">
                    <button type="submit" className="btn-ghost text-xs py-1 px-2.5 min-h-0 h-7 text-p-danger hover:bg-p-danger/10">
                      Remove
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
          <form action="/api/admin/admins" method="POST" className="flex gap-2">
            <input name="discordId" placeholder="Discord User ID" className="input flex-1 text-sm py-2" />
            <button type="submit" className="btn-primary shrink-0 text-sm gap-1.5">
              <Plus size={13} />
              Add
            </button>
          </form>
        </section>

        {/* Active Servers */}
        <section>
          <h2 className="font-display font-semibold text-base text-p-text mb-3 flex items-center gap-2">
            <Server size={14} className="text-p-accent" />
            Active Servers
          </h2>
          {guilds.length === 0 ? (
            <div className="card p-6 text-p-muted text-center text-sm">Bot is not in any servers yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {guilds.map(g => (
                <Link key={g.id} href={`/dashboard/${g.id}`}
                  className="card-hover p-3 flex items-center gap-3">
                  {g.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=32`}
                      alt="" className="w-8 h-8 rounded-full shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-p-surface-2 flex items-center justify-center text-xs font-bold text-p-muted shrink-0">
                      {g.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-p-text text-sm font-medium truncate">{g.name}</p>
                    <p className="text-p-subtle text-xs font-mono">{g.id}</p>
                  </div>
                  <Users size={13} className="text-p-muted shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
