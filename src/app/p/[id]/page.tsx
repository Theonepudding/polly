import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes } from '@/lib/polls'
import { notFound } from 'next/navigation'
import PollVote from '@/components/PollVote'
import Link from 'next/link'
import { Vote } from 'lucide-react'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const poll = await getPoll(id)
  if (!poll) return { title: 'Poll not found' }
  return {
    title:       poll.title,
    description: poll.description ?? `A poll created with Polly`,
    openGraph:   { title: poll.title, description: poll.description ?? undefined },
  }
}

export default async function PublicPollPage({ params }: Props) {
  const { id } = await params
  const [session, poll] = await Promise.all([
    getServerSession(authOptions),
    getPoll(id),
  ])
  if (!poll) notFound()

  const votes     = await getVotes(id)
  const myVotes   = session?.user?.id
    ? votes.filter(v => v.userId === session.user.id)
    : []

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="flex items-center gap-2 text-p-muted hover:text-p-text transition-colors">
          <div className="w-6 h-6 rounded-lg bg-p-primary-b border border-p-primary/40 flex items-center justify-center">
            <Vote size={12} className="text-p-primary" />
          </div>
          <span className="text-sm font-display font-semibold">Polly</span>
        </Link>
        <span className="text-xs text-p-subtle">Shared poll</span>
      </div>
      <PollVote
        poll={poll}
        votes={votes}
        myVotes={myVotes}
        userId={session?.user?.id}
        userName={session?.user?.name ?? undefined}
      />
    </div>
  )
}
