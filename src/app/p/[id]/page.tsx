import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPoll, getVotes } from '@/lib/polls'
import { notFound } from 'next/navigation'
import PollVote from '@/components/PollVote'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const poll = await getPoll(params.id)
  if (!poll) return { title: 'Poll not found' }
  return {
    title:       poll.title,
    description: poll.description ?? `A poll created with Polly`,
    openGraph:   { title: poll.title, description: poll.description ?? undefined },
  }
}

export default async function PublicPollPage({ params }: Props) {
  const [session, poll] = await Promise.all([
    getServerSession(authOptions),
    getPoll(params.id),
  ])
  if (!poll) notFound()

  const votes     = await getVotes(params.id)
  const myVotes   = session?.user?.id
    ? votes.filter(v => v.userId === session.user.id)
    : []

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
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
