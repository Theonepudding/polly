import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGuild, userCanManage } from '@/lib/guilds'

type Params = { params: Promise<{ guildId: string }> }

async function fetchMemberRoles(guildId: string, userId: string): Promise<string[]> {
  if (!process.env.DISCORD_BOT_TOKEN) return []
  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const member = await res.json()
    return member.roles ?? []
  } catch { return [] }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const userId = session.user.id

  const [guild, memberRoles] = await Promise.all([
    getGuild(guildId),
    fetchMemberRoles(guildId, userId),
  ])

  if (!guild) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canManage = userCanManage(guild, userId, memberRoles) || !!(session.user as { isBotAdmin?: boolean }).isBotAdmin

  return NextResponse.json({ canManage })
}
