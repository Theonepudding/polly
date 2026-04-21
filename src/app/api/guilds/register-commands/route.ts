import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const DISCORD_API = 'https://discord.com/api/v10'

const COMMANDS = [
  {
    name: 'poll',
    description: 'Create a new poll',
    type: 1,
  },
  {
    name: 'setup',
    description: 'Configure Polly for this server',
    type: 1,
  },
]

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appId = process.env.DISCORD_CLIENT_ID
  const token = process.env.DISCORD_BOT_TOKEN
  if (!appId || !token) {
    return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
  }

  const res = await fetch(`${DISCORD_API}/applications/${appId}/commands`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[register-commands] Discord error:', err)
    return NextResponse.json({ error: 'Discord API error', detail: err }, { status: res.status })
  }

  const registered = await res.json()
  return NextResponse.json({ ok: true, commands: (registered as { name: string }[]).map(c => c.name) })
}
