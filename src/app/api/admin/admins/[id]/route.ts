import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { removeBotAdmin } from '@/lib/bot-admin'

interface Params { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isBotAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await removeBotAdmin(params.id)
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, { params }: Params) {
  const action = req.nextUrl.searchParams.get('action')
  if (action === 'remove') {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isBotAdmin) return NextResponse.redirect(new URL('/admin', req.url))
    await removeBotAdmin(params.id)
    return NextResponse.redirect(new URL('/admin', req.url))
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
