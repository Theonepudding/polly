import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getBotAdmins, addBotAdmin } from '@/lib/bot-admin'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isBotAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await getBotAdmins())
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isBotAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let discordId: string | undefined
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const b = await req.json(); discordId = b.discordId
  } else {
    const f = await req.formData(); discordId = f.get('discordId')?.toString()
  }

  if (!discordId?.trim()) return NextResponse.json({ error: 'discordId required' }, { status: 400 })
  await addBotAdmin(discordId.trim())
  return NextResponse.redirect(new URL('/admin', req.url))
}
