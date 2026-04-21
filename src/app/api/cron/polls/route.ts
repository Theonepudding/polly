import { NextResponse } from 'next/server'
import { processDueTemplates } from '@/lib/poll-templates'

// Called by Cloudflare Cron or any external scheduler.
// Protect with CRON_SECRET env var so only authorised callers can trigger it.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await processDueTemplates()
  return NextResponse.json({ ok: true, ...result })
}
