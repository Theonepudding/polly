import { NextRequest, NextResponse } from 'next/server'

type Params = { params: Promise<{ guildId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { guildId } = await params
  if (!process.env.DISCORD_BOT_TOKEN) return NextResponse.json([])
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/emojis`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
