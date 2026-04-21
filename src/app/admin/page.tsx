import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getBotAdmins } from '@/lib/bot-admin'
import Link from 'next/link'
import { Shield, Users, Server } from 'lucide-react'

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
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-p-primary-b border border-p-primary/40 flex items-center justify-center">
          <Shield size={18} className="text-p-primary" />
        </div>
        <div>
          <h1 className="font-display font-bold text-2xl text-p-text">Super Admin</h1>
          <p className="text-p-muted text-sm">Global bot administration</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-p-muted text-xs mb-2"><Shield size={12} />Bot Admins</div>
          <div className="font-display font-bold text-3xl text-p-text">{admins.authorizedUserIds.length}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-p-muted text-xs mb-2"><Server size={12} />Servers</div>
          <div className="font-display font-bold text-3xl text-p-text">{guilds.length}</div>
        </div>
      </div>

      {/* Bot Admins */}
      <section className="mb-10">
        <h2 className="font-display font-semibold text-xl text-p-text mb-4 flex items-center gap-2">
          <Shield size={16} className="text-p-primary" />
          Bot Admins
        </h2>
        <div className="flex flex-col gap-2">
          {admins.authorizedUserIds.map(id => (
            <div key={id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="text-p-text text-sm font-mono">{id}</p>
                {id === session.user?.id && <span className="badge badge-primary text-xs mt-1">You</span>}
              </div>
              {id !== session.user?.id && (
                <form action={`/api/admin/admins/${id}`} method="POST">
                  <button
                    formAction={`/api/admin/admins/${id}?action=remove`}
                    className="btn-danger text-xs py-1.5">
                    Remove
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
        <AdminForm />
      </section>

      {/* Active Guilds */}
      <section>
        <h2 className="font-display font-semibold text-xl text-p-text mb-4 flex items-center gap-2">
          <Server size={16} className="text-p-accent" />
          Active Servers
        </h2>
        {guilds.length === 0 ? (
          <div className="card p-6 text-p-muted text-center">Bot is not in any servers yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {guilds.map(g => (
              <Link key={g.id} href={`/dashboard/${g.id}`}
                className="card-hover p-4 flex items-center gap-3">
                {g.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=32`}
                    alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-p-surface-2 flex items-center justify-center text-xs font-bold text-p-muted">
                    {g.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-p-text font-medium">{g.name}</p>
                  <p className="text-p-muted text-xs font-mono mt-0.5">{g.id}</p>
                </div>
                <Users size={14} className="text-p-muted" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AdminForm() {
  return (
    <form action="/api/admin/admins" method="POST" className="mt-4 flex gap-3">
      <input name="discordId" placeholder="Discord User ID" className="input flex-1" />
      <button type="submit" className="btn-primary shrink-0">Add Admin</button>
    </form>
  )
}
