import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTemplates, updateTemplate, deleteTemplate, runTemplate } from '@/lib/poll-templates'

interface Params { params: { guildId: string; id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const patch = await req.json()
  await updateTemplate(params.id, patch)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await deleteTemplate(params.id)
  return NextResponse.json({ ok: true })
}

// POST to run immediately
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await getTemplates(params.guildId)
  const template  = templates.find(t => t.id === params.id)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const poll = await runTemplate(template)
  return NextResponse.json({ poll })
}
