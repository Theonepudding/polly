import { NextRequest } from 'next/server'
import { readData, writeData, getPoll, getVotes } from '@/lib/polls'
import { getGuild } from '@/lib/guilds'
import {
  buildTimeSlotComponents,
  buildTimeSlotFollowupContent,
  updatePollInDiscord,
  buildDashboardEmbed,
  buildDashboardComponents,
} from '@/lib/discord-bot'
import { Poll, Vote } from '@/types'

const DISCORD_API = 'https://discord.com/api/v10'

function log(msg: string, extra?: unknown) {
  if (extra !== undefined) console.log('[interactions]', msg, extra)
  else                     console.log('[interactions]', msg)
}

async function sendFollowup(token: string, appId: string, body: object): Promise<string | null> {
  try {
    const res = await fetch(`${DISCORD_API}/webhooks/${appId}/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) return ((await res.json()) as { id?: string }).id ?? null
  } catch { /* ignore */ }
  return null
}

async function deleteMessage(appId: string, token: string, messageId = '@original') {
  try {
    await fetch(`${DISCORD_API}/webhooks/${appId}/${token}/messages/${messageId}`, { method: 'DELETE' })
  } catch { /* ignore */ }
}

async function patchMessage(appId: string, token: string, body: object, messageId = '@original') {
  await fetch(`${DISCORD_API}/webhooks/${appId}/${token}/messages/${messageId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function bgRun(p: Promise<void>) {
  import('@opennextjs/cloudflare')
    .then(({ getCloudflareContext }) => {
      try { getCloudflareContext().ctx.waitUntil(p) } catch { p.catch(() => {}) }
    })
    .catch(() => p.catch(() => {}))
}

// ─── Ed25519 verification ─────────────────────────────────────────────────────

function hexToBytes(hex: string): ArrayBuffer {
  const pairs = hex.match(/[0-9a-f]{2}/gi) ?? []
  const buf   = new ArrayBuffer(pairs.length)
  new Uint8Array(buf).forEach((_, i, a) => { a[i] = parseInt(pairs[i], 16) })
  return buf
}

async function verifySignature(pubKey: string, sig: string, ts: string, raw: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(pubKey), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, hexToBytes(sig), new TextEncoder().encode(ts + raw))
  } catch { return false }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const publicKey = process.env.DISCORD_PUBLIC_KEY
    if (!publicKey) return new Response('DISCORD_PUBLIC_KEY not set', { status: 500 })

    const sig  = req.headers.get('x-signature-ed25519') ?? ''
    const ts   = req.headers.get('x-signature-timestamp') ?? ''
    const raw  = await req.text()

    if (!sig || !ts || !raw) return new Response('Bad request', { status: 400 })

    if (!await verifySignature(publicKey, sig, ts, raw)) return new Response('Invalid signature', { status: 401 })

    let body: Record<string, unknown>
    try { body = JSON.parse(raw) } catch { return new Response('Bad request', { status: 400 }) }

    log('interaction', { type: body.type })

    if (body.type === 1) return Response.json({ type: 1 })

    if (body.type === 3) {
      const idata    = body.data    as Record<string, unknown>
      const customId = (idata?.custom_id as string) ?? ''
      const member   = body.member  as Record<string, unknown> | undefined
      const user     = (member?.user ?? body.user) as Record<string, unknown> | undefined
      const userId   = user?.id   as string
      const username = (member?.nick ?? user?.username ?? 'Unknown') as string
      const token    = body.token as string
      const appId    = process.env.DISCORD_CLIENT_ID ?? ''
      const guildId  = body.guild_id as string | undefined

      log('component', { customId, userId, guildId })

      // ── Vote: v:{pollId}:{optionId} ─────────────────────────────────────────
      if (customId.startsWith('v:')) {
        const [, pollId, optionId] = customId.split(':')
        if (!userId) return Response.json({ type: 4, data: { content: '❌ Could not identify you.', flags: 64 } })

        let savedVotes: Vote[] | null = null
        let savedPoll:  Poll  | null = null

        try {
          const data = await readData()
          const poll = data.polls.find(p => p.id === pollId)
          if (!poll) {
            return Response.json({ type: 4, data: { content: '❌ Poll not found.', flags: 64 } })
          }
          if (poll.isClosed || (poll.closesAt && new Date(poll.closesAt) <= new Date())) {
            return Response.json({ type: 4, data: { content: '❌ This poll is no longer open.', flags: 64 } })
          }

          // Check voter role restrictions
          if (guildId && poll.guildId === guildId) {
            const guild = await getGuild(guildId)
            if (guild && guild.voterRoleIds.length > 0) {
              const memberRoles = (member?.roles as string[] | undefined) ?? []
              if (!guild.voterRoleIds.some(r => memberRoles.includes(r))) {
                return Response.json({ type: 4, data: { content: '❌ You do not have permission to vote in this poll.', flags: 64 } })
              }
            }
          }

          const vote: Vote = { pollId, userId, username, optionId, votedAt: new Date().toISOString() }
          if (!poll.allowMultiple) {
            const vIdx = data.votes.findIndex(v => v.pollId === pollId && v.userId === userId)
            if (vIdx !== -1) data.votes[vIdx] = vote
            else             data.votes.push(vote)
          } else {
            const vIdx = data.votes.findIndex(v => v.pollId === pollId && v.userId === userId && v.optionId === optionId)
            if (vIdx !== -1) data.votes[vIdx] = vote
            else             data.votes.push(vote)
          }
          await writeData(data)
          savedVotes = data.votes.filter(v => v.pollId === pollId)
          savedPoll  = poll
        } catch (e) { console.error('Vote handler error:', e) }

        if (savedPoll && savedVotes) {
          const poll     = savedPoll
          const votes    = savedVotes
          const hasSlots = poll.includeTimeSlots && poll.timeSlots.length > 0
          bgRun((async () => {
            updatePollInDiscord(poll, votes).catch(() => {})
            let followupId: string | null = null
            if (hasSlots) {
              followupId = await sendFollowup(token, appId, {
                content: buildTimeSlotFollowupContent(poll),
                components: buildTimeSlotComponents(poll, optionId),
                flags: 64,
              })
            }
            await sleep(6_000)
            await deleteMessage(appId, token)
            if (followupId) { await sleep(24_000); await deleteMessage(appId, token, followupId) }
          })())
        }

        return Response.json({ type: 4, data: { content: '✅ Vote registered!', flags: 64 } })
      }

      // ── Time slot: t:{pollId}:{optionId}:{timeSlot} ─────────────────────────
      if (customId.startsWith('t:')) {
        const [, pollId, optionId, ...timeParts] = customId.split(':')
        const timeSlot = timeParts.join(':')
        if (!userId) return Response.json({ type: 6 })

        let savedVotes: Vote[] | null = null
        let savedPoll: Poll | null = null
        try {
          const data = await readData()
          const poll = data.polls.find(p => p.id === pollId)
          if (!poll || poll.isClosed || (poll.closesAt && new Date(poll.closesAt) <= new Date())) return Response.json({ type: 6 })
          const vote: Vote = { pollId, userId, username, optionId, timeSlot, votedAt: new Date().toISOString() }
          const vIdx = data.votes.findIndex(v => v.pollId === pollId && v.userId === userId)
          if (vIdx !== -1) data.votes[vIdx] = vote
          else             data.votes.push(vote)
          await writeData(data)
          savedVotes = data.votes.filter(v => v.pollId === pollId)
          savedPoll  = poll
        } catch (e) { console.error('Time slot error:', e) }

        if (savedPoll && savedVotes) {
          const poll = savedPoll; const votes = savedVotes
          bgRun((async () => {
            updatePollInDiscord(poll, votes).catch(() => {})
            await patchMessage(appId, token, { content: '✅ Time preference saved!', components: [] })
            await sleep(5_000); await deleteMessage(appId, token)
          })())
        }
        return Response.json({ type: 6 })
      }

      // ── Skip time: skip:{pollId} ─────────────────────────────────────────────
      if (customId.startsWith('skip:')) {
        bgRun((async () => {
          await patchMessage(appId, token, { content: '✅ No time preference noted.', components: [] })
          await sleep(5_000); await deleteMessage(appId, token)
        })())
        return Response.json({ type: 6 })
      }

      // ── Close poll: close:{pollId} ───────────────────────────────────────────
      if (customId.startsWith('close:')) {
        const [, pollId] = customId.split(':')
        bgRun((async () => {
          try {
            const data    = await readData()
            const pollIdx = data.polls.findIndex(p => p.id === pollId)
            if (pollIdx === -1) return
            data.polls[pollIdx] = { ...data.polls[pollIdx], isClosed: true }
            await writeData(data)
            await updatePollInDiscord(data.polls[pollIdx], data.votes.filter(v => v.pollId === pollId))
          } catch (e) { console.error('Close poll error:', e) }
        })())
        return Response.json({ type: 6 })
      }

      // ── Dashboard: create poll prompt ────────────────────────────────────────
      if (customId.startsWith('dash:create:')) {
        const dguildId = customId.split(':')[2]
        const baseUrl  = process.env.NEXTAUTH_URL ?? ''
        return Response.json({
          type: 4,
          data: {
            content: `**Create a new poll** — open the dashboard to get started:\n${baseUrl}/dashboard/${dguildId}`,
            flags: 64,
          },
        })
      }

      // ── Dashboard: list polls ────────────────────────────────────────────────
      if (customId.startsWith('dash:list:')) {
        const dguildId = customId.split(':')[2]
        bgRun((async () => {
          try {
            const guild = await getGuild(dguildId)
            if (!guild) return
            const allPolls   = await getPoll(dguildId).then(() => readData()).catch(() => ({ polls: [], votes: [] }))
            const activePolls = allPolls.polls.filter(p => p.guildId === dguildId && !p.isClosed)
            const embed  = buildDashboardEmbed(guild, activePolls)
            const comps  = buildDashboardComponents(guild)
            await sendFollowup(token, appId, { embeds: [embed], components: comps, flags: 64 })
          } catch (e) { console.error('Dashboard list error:', e) }
        })())
        return Response.json({ type: 6 })
      }

      log('unhandled customId', { customId })
      return Response.json({ type: 6 })
    }

    log('unhandled type', { type: body.type })
    return Response.json({ type: 1 })
  } catch (e) {
    console.error('[interactions] unhandled exception', e)
    return new Response('Internal server error', { status: 500 })
  }
}
