import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTemplates, updateTemplate, deleteTemplate, runTemplate, getTemplate } from '@/lib/poll-templates'
import { getGuild } from '@/lib/guilds'
import { postAuditLog } from '@/lib/discord-bot'

type Params = { params: Promise<{ guildId: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const patch = await req.json()
  await updateTemplate(id, patch)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const template = await getTemplate(id)
  await deleteTemplate(id)

  if (template) {
    const guild = await getGuild(guildId)
    if (guild) {
      postAuditLog(
        guild,
        'Schedule deleted',
        `**${template.title}**`,
        session.user.name ?? 'Unknown',
      ).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}

// POST to run immediately
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { guildId, id } = await params
  const templates = await getTemplates(guildId)
  const template  = templates.find(t => t.id === id)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const poll = await runTemplate(template)
  return NextResponse.json({ poll })
}
