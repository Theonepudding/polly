import Link from 'next/link'
import Image from 'next/image'
import { BarChart3, Vote, ChevronRight, Settings } from 'lucide-react'
import type { GuildWithMeta } from '@/types'

function guildIconUrl(guild: GuildWithMeta) {
  if (guild.guildIcon) {
    return `https://cdn.discordapp.com/icons/${guild.guildId}/${guild.guildIcon}.png?size=64`
  }
  return null
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function GuildCard({ guild }: { guild: GuildWithMeta }) {
  const icon = guildIconUrl(guild)
  return (
    <Link href={`/dashboard/${guild.guildId}`} className="card-hover p-5 flex items-center gap-4 group">
      {/* Avatar */}
      <div className="w-12 h-12 rounded-xl overflow-hidden bg-p-surface-2 border border-p-border shrink-0 flex items-center justify-center">
        {icon ? (
          <Image src={icon} alt={guild.guildName} width={48} height={48} className="object-cover" />
        ) : (
          <span className="font-display font-bold text-sm text-p-primary">{initials(guild.guildName)}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-display font-semibold text-p-text truncate">{guild.guildName}</h3>
          {guild.userIsAdmin && (
            <span className="badge badge-primary shrink-0 py-0.5">
              <Settings size={10} className="mr-0.5" />
              Admin
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-p-muted">
          {guild.activePollCount !== undefined && (
            <span className="flex items-center gap-1">
              <Vote size={11} />
              {guild.activePollCount} active poll{guild.activePollCount !== 1 ? 's' : ''}
            </span>
          )}
          {guild.memberCount !== undefined && (
            <span className="flex items-center gap-1">
              <BarChart3 size={11} />
              {guild.memberCount} members
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={16} className="text-p-subtle group-hover:text-p-muted transition-colors shrink-0" />
    </Link>
  )
}
