import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes } from '@/lib/polls'
import { getGuild, userCanManage } from '@/lib/guilds'
import PollVote from '@/components/PollVote'
import PollManageBar from '@/components/PollManageBar'
import { ArrowLeft, Settings } from 'lucide-react'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ guildId: string; id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const poll = await getPoll(id)
  if (!poll) return { title: 'Poll not found' }
  return { title: poll.title }
}

export default async function PollDetailPage({ params }: Props) {
  const { guildId, id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/api/auth/signin')

  const [poll, guild] = await Promise.all([getPoll(id), getGuild(guildId)])
  if (!poll || poll.guildId !== guildId) notFound()
  if (!guild) notFound()

  const canManage = userCanManage(guild, session.user.id, []) || !!session.user.isBotAdmin
  const votes   = await getVotes(id)
  const myVotes = votes.filter(v => v.userId === session.user.id)

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/dashboard/${guildId}`} className="btn-ghost text-sm">
          <ArrowLeft size={14} />
          Back to {guild.guildName}
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        {guild.guildIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://cdn.discordapp.com/icons/${guild.guildId}/${guild.guildIcon}.png?size=64`}
            alt={guild.guildName}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-p-primary-b border border-p-border flex items-center justify-center text-xs font-bold text-p-primary">
            {guild.guildName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="text-p-muted text-sm">{guild.guildName}</span>
        {canManage && (
          <Link href={`/dashboard/${guildId}/settings`} className="ml-auto btn-ghost text-xs">
            <Settings size={12} />
            Settings
          </Link>
        )}
      </div>

      <PollVote
        poll={poll}
        votes={votes}
        myVotes={myVotes}
        userId={session.user.id}
        userName={session.user.name ?? 'Anonymous'}
      />

      {canManage && !poll.isClosed && (
        <PollManageBar guildId={guildId} pollId={id} />
      )}
    </div>
  )
}
