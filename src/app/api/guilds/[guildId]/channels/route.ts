import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

interface Params { params: { guildId: string } }

// Returns text channels OR roles depending on ?type=roles
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type')

  if (!process.env.DISCORD_BOT_TOKEN) {
    return NextResponse.json([], { status: 200 })
  }

  const endpoint = type === 'roles'
    ? `https://discord.com/api/guilds/${params.guildId}/roles`
    : `https://discord.com/api/guilds/${params.guildId}/channels`

  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    })
    if (!res.ok) return NextResponse.json([], { status: 200 })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
