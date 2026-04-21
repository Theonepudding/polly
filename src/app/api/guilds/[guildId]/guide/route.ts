import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGuild, upsertGuild } from '@/lib/guilds'
import { postPollyGuide } from '@/lib/discord-bot'

type Params = { params: Promise<{ guildId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId } = await params
  const guild = await getGuild(guildId)
  if (!guild) return NextResponse.json({ error: 'Guild not found' }, { status: 404 })
  if (!guild.pollyChannelId) return NextResponse.json({ error: 'No Polly channel configured' }, { status: 400 })

  const messageId = await postPollyGuide(guild.pollyChannelId, guildId, guild.guideMessage)
  if (!messageId) return NextResponse.json({ error: 'Failed to post guide' }, { status: 502 })

  // Store the message ID so we could update it later if needed
  await upsertGuild({ ...guild, updatedAt: new Date().toISOString() })

  return NextResponse.json({ ok: true, messageId })
}
