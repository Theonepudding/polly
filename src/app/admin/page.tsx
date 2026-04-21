import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getBotAdmins } from '@/lib/bot-admin'
import { getAllGuilds } from '@/lib/guilds'
import Link from 'next/link'
import { Shield, Users, Server } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isBotAdmin) redirect('/')

  const [admins, guilds] = await Promise.all([getBotAdmins(), getAllGuilds()])

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
          <div className="card p-6 text-p-muted text-center">No servers have been set up yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {guilds.map(g => (
              <Link key={g.guildId} href={`/dashboard/${g.guildId}`}
                className="card-hover p-4 flex items-center justify-between">
                <div>
                  <p className="text-p-text font-medium">{g.guildName}</p>
                  <p className="text-p-muted text-xs font-mono mt-0.5">{g.guildId}</p>
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
