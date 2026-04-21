import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { removeBotAdmin } from '@/lib/bot-admin'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isBotAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  await removeBotAdmin(id)
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const action = req.nextUrl.searchParams.get('action')
  if (action === 'remove') {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isBotAdmin) return NextResponse.redirect(new URL('/admin', req.url))
    await removeBotAdmin(id)
    return NextResponse.redirect(new URL('/admin', req.url))
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
