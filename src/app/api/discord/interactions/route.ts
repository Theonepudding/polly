import { NextRequest } from 'next/server'
import { readData, writeData, getPoll, getVotes, createPoll, updatePoll } from '@/lib/polls'
import { getGuild, upsertGuild } from '@/lib/guilds'
import {
  buildTimeSlotComponents,
  buildTimeSlotFollowupContent,
  updatePollInDiscord,
  buildDashboardEmbed,
  buildDashboardComponents,
  buildPollEmbed,
  buildPollComponents,
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

// ─── Poll creation helper ─────────────────────────────────────────────────────

async function createAndPostPoll(guildId: string, title: string, optionLines: string[], description: string, durationDays: number, createdBy: string, createdByName: string): Promise<{ poll: Poll; posted: boolean }> {
  const options = optionLines
    .map(l => l.trim()).filter(Boolean)
    .slice(0, 10)
    .map((text, i) => ({ id: `opt-${i}`, text }))

  const closesAt = new Date()
  closesAt.setDate(closesAt.getDate() + durationDays)

  const poll: Poll = {
    id:               `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    guildId,
    title,
    description:      description || undefined,
    options,
    includeTimeSlots: false,
    timeSlots:        [],
    isAnonymous:      false,
    allowMultiple:    false,
    createdBy,
    createdByName,
    createdAt:        new Date().toISOString(),
    closesAt:         closesAt.toISOString(),
    isClosed:         false,
  }
  await createPoll(poll)

  // Try to post to announcement channel
  const guild = await getGuild(guildId)
  let posted = false
  if (guild?.announceChannelId && process.env.DISCORD_BOT_TOKEN) {
    try {
      const res = await fetch(`${DISCORD_API}/channels/${guild.announceChannelId}/messages`, {
        method:  'POST',
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ embeds: [buildPollEmbed(poll, [])], components: buildPollComponents(poll) }),
      })
      if (res.ok) {
        const { id: messageId } = await res.json() as { id: string }
        await updatePoll(poll.id, { discordMessageId: messageId })
        posted = true
      }
    } catch { /* ignore */ }
  }

  return { poll, posted }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Capture Cloudflare waitUntil early so background tasks survive after response
  let cfWaitUntil: ((p: Promise<unknown>) => void) | undefined
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    cfWaitUntil = getCloudflareContext().ctx.waitUntil.bind(getCloudflareContext().ctx)
  } catch { /* dev / non-CF env */ }

  const bg = (p: Promise<void>) => {
    if (cfWaitUntil) cfWaitUntil(p)
    else p.catch(console.error)
  }

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

    // ── PING ────────────────────────────────────────────────────────────────
    if (body.type === 1) return Response.json({ type: 1 })

    const appId   = process.env.DISCORD_CLIENT_ID ?? ''
    const token   = body.token as string
    const guildId = body.guild_id as string | undefined
    const member  = body.member  as Record<string, unknown> | undefined
    const user    = (member?.user ?? body.user) as Record<string, unknown> | undefined
    const userId  = user?.id as string
    const username = (member?.nick ?? user?.username ?? 'Unknown') as string

    // ── SLASH COMMANDS (type 2) ──────────────────────────────────────────────
    if (body.type === 2) {
      const cmd = (body.data as Record<string, unknown>)?.name as string
      log('slash command', { cmd, guildId })

      if (cmd === 'poll') {
        return Response.json({
          type: 9, // MODAL
          data: {
            custom_id: `create_poll:${guildId ?? ''}`,
            title: 'Create a Poll',
            components: [
              { type: 1, components: [{ type: 4, custom_id: 'title',       label: 'Question',                               style: 1, required: true,  max_length: 120, placeholder: 'e.g. Raid night — Friday or Saturday?' }] },
              { type: 1, components: [{ type: 4, custom_id: 'options',     label: 'Options  (one per line, min 2, max 10)', style: 2, required: true,  max_length: 800, placeholder: 'Friday\nSaturday\nSunday' }] },
              { type: 1, components: [{ type: 4, custom_id: 'description', label: 'Description  (optional)',                style: 2, required: false, max_length: 400 }] },
              { type: 1, components: [{ type: 4, custom_id: 'duration',    label: 'Duration in days  (default: 7)',         style: 1, required: false, max_length: 2,   placeholder: '7' }] },
            ],
          },
        })
      }

      if (cmd === 'setup') {
        const siteUrl = process.env.NEXTAUTH_URL ?? ''
        return Response.json({
          type: 4,
          data: {
            flags: 64, // ephemeral
            content: '⚙️ **Polly Setup** — pick your announcement channel:',
            components: [
              {
                type: 1,
                components: [{
                  type: 8, // channel_select
                  custom_id: `setup:announce:${guildId ?? ''}`,
                  placeholder: 'Select announcement channel…',
                  channel_types: [0],
                }],
              },
              {
                type: 1,
                components: [{
                  type: 2, style: 5, label: 'Open Settings',
                  url: `${siteUrl}/dashboard/${guildId}/settings`,
                }],
              },
            ],
          },
        })
      }

      return Response.json({ type: 4, data: { content: '❓ Unknown command.', flags: 64 } })
    }

    // ── MODAL SUBMIT (type 5) ────────────────────────────────────────────────
    if (body.type === 5) {
      const idata    = body.data as Record<string, unknown>
      const customId = idata?.custom_id as string

      if (customId?.startsWith('create_poll:')) {
        const pollGuildId = customId.split(':')[1] || guildId || ''
        if (!pollGuildId) return Response.json({ type: 4, data: { content: '❌ Could not determine server.', flags: 64 } })

        // Parse modal fields
        const rows = (idata.components as { components: { custom_id: string; value: string }[] }[]) ?? []
        const get  = (id: string) => rows.flatMap(r => r.components).find(c => c.custom_id === id)?.value ?? ''

        const title       = get('title').trim()
        const optionLines = get('options').split('\n').map(l => l.trim()).filter(Boolean)
        const description = get('description').trim()
        const durationRaw = parseInt(get('duration') || '7', 10)
        const duration    = isNaN(durationRaw) || durationRaw < 1 ? 7 : Math.min(durationRaw, 365)

        if (!title)                return Response.json({ type: 4, data: { content: '❌ Title is required.', flags: 64 } })
        if (optionLines.length < 2) return Response.json({ type: 4, data: { content: '❌ At least 2 options are required.', flags: 64 } })

        try {
          const { poll, posted } = await createAndPostPoll(pollGuildId, title, optionLines, description, duration, userId, username)
          const siteUrl = process.env.NEXTAUTH_URL ?? ''
          const msg = posted
            ? `✅ **${poll.title}** has been created and posted to the announcement channel!`
            : `✅ **${poll.title}** has been created. [View on website](${siteUrl}/dashboard/${pollGuildId}/polls/${poll.id})\n\n⚠️ No announcement channel configured — set one up in [Settings](${siteUrl}/dashboard/${pollGuildId}/settings).`

          // Auto-dismiss after 8 seconds
          bg((async () => {
            await sleep(8_000)
            await deleteMessage(appId, token)
          })())

          return Response.json({ type: 4, data: { content: msg, flags: 64 } })
        } catch (e) {
          console.error('Modal poll creation error:', e)
          return Response.json({ type: 4, data: { content: '❌ Something went wrong creating the poll.', flags: 64 } })
        }
      }

      return Response.json({ type: 6 })
    }

    // ── COMPONENT INTERACTIONS (type 3) ─────────────────────────────────────
    if (body.type === 3) {
      const idata    = body.data    as Record<string, unknown>
      const customId = (idata?.custom_id as string) ?? ''

      log('component', { customId, userId, guildId })

      // ── Setup: announce channel picker ──────────────────────────────────────
      if (customId.startsWith('setup:announce:')) {
        const setupGuildId = customId.split(':')[2]
        const channelId    = ((idata.values as string[]) ?? [])[0]
        if (setupGuildId && channelId) {
          try {
            const guild = await getGuild(setupGuildId)
            if (guild) {
              await upsertGuild({ ...guild, announceChannelId: channelId, updatedAt: new Date().toISOString() })
            }
          } catch (e) { console.error('Setup channel save error:', e) }
        }
        const siteUrl = process.env.NEXTAUTH_URL ?? ''
        return Response.json({ type: 4, data: {
          content: `✅ Done! Polls will now be posted to <#${channelId}>.\n\nVisit [the dashboard](${siteUrl}/dashboard/${setupGuildId}) to create your first poll, or use \`/poll\` in Discord.`,
          flags: 64,
        }})
      }

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

          // Voter role check
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
          const poll  = savedPoll
          const votes = savedVotes
          bg((async () => {
            updatePollInDiscord(poll, votes).catch(() => {})
            const hasSlots = poll.includeTimeSlots && poll.timeSlots.length > 0
            let followupId: string | null = null
            if (hasSlots) {
              followupId = await sendFollowup(token, appId, {
                content:    buildTimeSlotFollowupContent(poll),
                components: buildTimeSlotComponents(poll, optionId),
                flags: 64,
              })
            }
            await sleep(5_000)
            await deleteMessage(appId, token)
            if (followupId) { await sleep(20_000); await deleteMessage(appId, token, followupId) }
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
          bg((async () => {
            updatePollInDiscord(poll, votes).catch(() => {})
            await patchMessage(appId, token, { content: '✅ Time preference saved!', components: [] })
            await sleep(5_000)
            await deleteMessage(appId, token)
          })())
        }
        return Response.json({ type: 6 })
      }

      // ── Skip time: skip:{pollId} ─────────────────────────────────────────────
      if (customId.startsWith('skip:')) {
        bg((async () => {
          await patchMessage(appId, token, { content: '✅ No time preference noted.', components: [] })
          await sleep(5_000)
          await deleteMessage(appId, token)
        })())
        return Response.json({ type: 6 })
      }

      // ── Close poll: close:{pollId} ───────────────────────────────────────────
      if (customId.startsWith('close:')) {
        const [, pollId] = customId.split(':')
        bg((async () => {
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
        const siteUrl  = process.env.NEXTAUTH_URL ?? ''
        return Response.json({ type: 4, data: {
          content: `**Create a new poll** — use \`/poll\` in any channel, or open the [web dashboard](${siteUrl}/dashboard/${dguildId}).`,
          flags: 64,
        }})
      }

      // ── Dashboard: list polls ────────────────────────────────────────────────
      if (customId.startsWith('dash:list:')) {
        const dguildId = customId.split(':')[2]
        bg((async () => {
          try {
            const guild = await getGuild(dguildId)
            if (!guild) return
            const allData    = await readData()
            const activePolls = allData.polls.filter(p => p.guildId === dguildId && !p.isClosed)
            await sendFollowup(token, appId, {
              embeds:     [buildDashboardEmbed(guild, activePolls)],
              components: buildDashboardComponents(guild),
              flags: 64,
            })
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
