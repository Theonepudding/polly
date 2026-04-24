import { NextRequest } from 'next/server'
import { updatePoll, getPoll, getPolls, castVote, getVotes } from '@/lib/polls'
import { getGuild, upsertGuild, userCanCreate, userCanManage } from '@/lib/guilds'
import { getKV } from '@/lib/kv'
import {
  buildTimeSlotComponents,
  buildTimeSlotFollowupContent,
  updatePollInDiscord,
  postPollResults,
  postAuditLog,
  refreshDashboard,
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


// ─── Guided poll UI builders ──────────────────────────────────────────────────

// Type-picker shown immediately on /poll — no DB calls, instant.
function buildTypePicker(guildId: string): object {
  return {
    flags: 64,
    embeds: [{
      title: '🗳️  Create a Poll',
      description: 'What kind of poll would you like to create?\n\nAll poll types open on the website — **no login needed** ✨\n\n**✓ Yes / No** — simple for/against vote\n**📝 Multiple choice** — up to 6 custom options\n**📅 Schedule** — pick times with full timezone support',
      color: 0x6366F1,
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: '✓  Yes / No',        custom_id: `poll:yn:${guildId}`    },
        { type: 2, style: 2, label: '📝  Multiple choice', custom_id: `poll:multi:${guildId}` },
        { type: 2, style: 2, label: '📅  Schedule',        custom_id: `poll:web:${guildId}`   },
      ],
    }],
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

    const appId    = process.env.DISCORD_CLIENT_ID ?? ''
    const token              = body.token as string
    const guildId            = body.guild_id as string | undefined
    const member             = body.member   as Record<string, unknown> | undefined
    const user               = (member?.user ?? body.user) as Record<string, unknown> | undefined
    const userId             = user?.id as string
    const username           = (member?.nick ?? user?.global_name ?? user?.username ?? 'Unknown') as string
    // Present on component interactions — the message the button lives on
    const interactionMessage   = body.message as Record<string, unknown> | undefined
    const interactionMessageId = interactionMessage?.id as string | undefined
    const interactionChannelId = body.channel_id as string | undefined

    // ── SLASH COMMANDS (type 2) ──────────────────────────────────────────────
    if (body.type === 2) {
      const cmd = (body.data as Record<string, unknown>)?.name as string
      log('slash command', { cmd, guildId })

      if (cmd === 'poll') {
        // Instant type-picker — no DB calls, well within the 3s Discord limit
        bg((async () => { await sleep(60_000); await deleteMessage(appId, token) })())
        return Response.json({ type: 4, data: buildTypePicker(guildId ?? '') })
      }

      if (cmd === 'setup') {
        if (guildId) {
          const guild     = await getGuild(guildId)
          const userRoles = (member?.roles as string[]) ?? []
          if (guild && !userCanManage(guild, userId, userRoles)) {
            return Response.json({
              type: 4,
              data: { content: '❌ You need server admin permissions to use `/setup`.', flags: 64 },
            })
          }
        }
        const siteUrl = process.env.NEXTAUTH_URL ?? ''
        return Response.json({
          type: 4,
          data: {
            flags: 64,
            content: '⚙️ **Polly Setup** — pick your announcement channel:',
            components: [
              { type: 1, components: [{ type: 8, custom_id: `setup:announce:${guildId ?? ''}`, placeholder: 'Select announcement channel…', channel_types: [0] }] },
              { type: 1, components: [{ type: 2, style: 5, label: 'Open Settings', url: `${siteUrl}/dashboard/${guildId}/settings` }] },
            ],
          },
        })
      }

      return Response.json({ type: 4, data: { content: '❓ Unknown command.', flags: 64 } })
    }

    // ── COMPONENT INTERACTIONS (type 3) ─────────────────────────────────────
    if (body.type === 3) {
      const idata    = body.data    as Record<string, unknown>
      const customId = (idata?.custom_id as string) ?? ''

      log('component', { customId, userId, guildId })

      // ── Poll type buttons → generate one-click web link ─────────────────
      if (customId.startsWith('poll:yn:') || customId.startsWith('poll:multi:') || customId.startsWith('poll:web:')) {
        const isYN    = customId.startsWith('poll:yn:')
        const isMulti = customId.startsWith('poll:multi:')
        const prefix  = isYN ? 'poll:yn:' : isMulti ? 'poll:multi:' : 'poll:web:'
        const gId     = customId.slice(prefix.length)
        const pollType = isYN ? 'yn' : isMulti ? 'multi' : 'ts'
        const tok     = crypto.randomUUID()
        const siteUrl = process.env.NEXTAUTH_URL ?? 'https://polly.pudding.vip'
        const kv      = await getKV()
        if (kv) await kv.put(`magic:${tok}`, JSON.stringify({ userId, guildId: gId, username, pollType }), { expirationTtl: 600 })
        const label = isYN ? '✓  Create Yes / No Poll' : isMulti ? '📝  Create Multiple Choice Poll' : '📅  Create Schedule Poll'
        bg((async () => { await sleep(90_000); await deleteMessage(appId, token) })())
        return Response.json({ type: 4, data: {
          flags: 64,
          embeds: [{ description: '✨ Your link is ready — click below to create your poll.\nExpires in **10 minutes** and works once.', color: 0x6366F1 }],
          components: [{ type: 1, components: [{ type: 2, style: 5, label, url: `${siteUrl}/create?token=${tok}` }] }],
        }})
      }

      // ── Setup: announce channel picker ────────────────────────────────────
      if (customId.startsWith('setup:announce:')) {
        const setupGuildId = customId.split(':')[2]
        const channelId    = ((idata.values as string[]) ?? [])[0]
        if (setupGuildId && channelId) {
          try {
            const guild = await getGuild(setupGuildId)
            if (guild) {
              const userRoles = (member?.roles as string[]) ?? []
              if (!userCanManage(guild, userId, userRoles)) {
                return Response.json({ type: 4, data: { content: '❌ You don\'t have permission to change server settings.', flags: 64 } })
              }
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

      // ── Vote: v:{pollId}:{optionId} ───────────────────────────────────────
      if (customId.startsWith('v:')) {
        const [, pollId, optionId] = customId.split(':')
        if (!userId) return Response.json({ type: 4, data: { content: '❌ Could not identify you.', flags: 64 } })

        // Fast individual-key lookup with progressive back-off to absorb KV propagation lag.
        // KV writes from one edge can take 1-5s to reach a different edge location.
        // Total wait budget ~2.1s keeps us safely under Discord's 3s interaction deadline.
        let poll: Poll | null = await getPoll(pollId)
        if (!poll) {
          for (const delay of [500, 500, 500, 600]) {
            await sleep(delay)
            poll = await getPoll(pollId)
            if (poll) break
          }
        }
        if (!poll) return Response.json({ type: 4, data: { content: '❌ Poll not found — it may still be loading. Try again in a moment!', flags: 64 } })
        if (poll.isClosed || (poll.closesAt && new Date(poll.closesAt) <= new Date())) {
          return Response.json({ type: 4, data: { content: '❌ This poll is no longer open.', flags: 64 } })
        }

        if (guildId && poll.guildId === guildId) {
          const guild = await getGuild(guildId)
          if (guild?.voterRoleIds.length) {
            const memberRoles = (member?.roles as string[] | undefined) ?? []
            if (!guild.voterRoleIds.some(r => memberRoles.includes(r))) {
              return Response.json({ type: 4, data: { content: '❌ You do not have permission to vote.', flags: 64 } })
            }
          }
        }

        let savedPoll:  Poll   | null = null
        let savedVotes: Vote[] | null = null
        let voteChanged               = false

        try {
          // If KV hasn't propagated discordMessageId yet, recover it from the interaction body.
          // The interaction always arrives on the message that was clicked, so its ID is authoritative.
          if (!poll.discordMessageId && interactionMessageId) {
            poll = { ...poll, discordMessageId: interactionMessageId, discordChannelId: interactionChannelId }
            bg(updatePoll(pollId, { discordMessageId: interactionMessageId, discordChannelId: interactionChannelId }).then(() => {}))
          }

          // For polls with time slots: show the time picker first — vote is
          // saved only after the user picks a time (or clicks "No preference").
          if (poll.includeTimeSlots && poll.timeSlots.length > 0) {
            savedPoll = poll
          } else {
            const vote: Vote = { pollId, userId, username, optionId, votedAt: new Date().toISOString() }
            const result = await castVote(vote, poll.allowMultiple)
            voteChanged  = result.voteChanged
            savedVotes   = result.votes
            savedPoll    = poll
          }
        } catch (e) { console.error('Vote error:', e) }

        // Poll with time slots: respond with the time picker; vote saved after user picks time
        if (savedPoll && savedPoll.includeTimeSlots && savedPoll.timeSlots.length > 0) {
          bg((async () => {
            await sleep(20_000)
            await deleteMessage(appId, token)
          })())
          return Response.json({ type: 4, data: {
            content: buildTimeSlotFollowupContent(savedPoll),
            components: buildTimeSlotComponents(savedPoll, optionId),
            flags: 64,
          }})
        }

        if (savedPoll && savedVotes) {
          const p = savedPoll; const votes = savedVotes; const changed = voteChanged
          bg((async () => {
            await updatePollInDiscord(p, votes).catch(() => {})
            if (changed) {
              await sleep(5_000)
              await deleteMessage(appId, token)
            }
          })())
        }

        // Only show a message when the vote actually changed; first votes are silent
        if (voteChanged) {
          const optIdx = savedPoll?.options.findIndex(o => o.id === optionId) ?? 0
          const btnNum = savedPoll?.options[optIdx]?.buttonNum ?? (optIdx + 1)
          const optTxt = savedPoll?.options[optIdx]?.text ?? optionId
          return Response.json({ type: 4, data: { content: `🔄 Vote changed to **#${btnNum}** — ${optTxt}!`, flags: 64 } })
        }
        return Response.json({ type: 6 })
      }

      // ── Time slot: t:{pollId}:{optionId}:{ts} ────────────────────────────
      if (customId.startsWith('t:')) {
        const [, pollId, optionId, ...tparts] = customId.split(':')
        const timeSlot = tparts.join(':')
        if (!userId) return Response.json({ type: 6 })

        let savedPoll: Poll | null = null; let savedVotes: Vote[] | null = null
        try {
          const poll = await getPoll(pollId)
          if (!poll || poll.isClosed || (poll.closesAt && new Date(poll.closesAt) <= new Date())) return Response.json({ type: 6 })
          const vote: Vote = { pollId, userId, username, optionId, timeSlot, votedAt: new Date().toISOString() }
          const result = await castVote(vote, poll.allowMultiple)
          savedPoll = poll; savedVotes = result.votes
        } catch (e) { console.error('Time slot error:', e) }

        if (savedPoll && savedVotes) {
          const p = savedPoll; const v = savedVotes
          bg((async () => {
            await updatePollInDiscord(p, v).catch(() => {})
            await patchMessage(appId, token, { content: '✅ Time preference saved!', components: [] })
            await sleep(5_000); await deleteMessage(appId, token)
          })())
        }
        return Response.json({ type: 6 })
      }

      // ── Skip time: skip:{pollId}:{optionId} ──────────────────────────────
      if (customId.startsWith('skip:')) {
        const parts      = customId.split(':')
        const skipPollId = parts[1]
        const skipOptId  = parts[2] // present for new-style buttons; absent for legacy
        if (skipOptId && userId) {
          try {
            const poll = await getPoll(skipPollId)
            if (poll && !poll.isClosed) {
              const vote: Vote = { pollId: skipPollId, userId, username, optionId: skipOptId, votedAt: new Date().toISOString() }
              const result = await castVote(vote, poll.allowMultiple)
              const p = poll; const votes = result.votes
              bg((async () => { updatePollInDiscord(p, votes).catch(() => {}) })())
            }
          } catch (e) { console.error('Skip time vote error:', e) }
        }
        bg((async () => {
          await patchMessage(appId, token, { content: '✅ Voted! (No time preference)', components: [] })
          await sleep(5_000); await deleteMessage(appId, token)
        })())
        return Response.json({ type: 6 })
      }

      // ── Close poll: close:{pollId} ────────────────────────────────────────
      if (customId.startsWith('close:')) {
        const [, pollId] = customId.split(':')

        // Permission check must happen before we return so we can send an error
        const pollForCheck = await getPoll(pollId)
        if (pollForCheck) {
          const isCreator = userId === pollForCheck.createdBy
          if (!isCreator) {
            const guildForCheck = await getGuild(pollForCheck.guildId)
            const userRoles     = (member?.roles as string[]) ?? []
            if (guildForCheck && !userCanManage(guildForCheck, userId, userRoles)) {
              return Response.json({
                type: 4,
                data: { content: '❌ You don\'t have permission to close this poll.', flags: 64 },
              })
            }
          }
        }

        bg((async () => {
          try {
            const poll = await getPoll(pollId)
            if (!poll) return
            const ok = await updatePoll(pollId, { isClosed: true })
            if (!ok) return
            const closedPoll  = await getPoll(pollId)
            if (!closedPoll) return
            const closedVotes = await getVotes(pollId)
            await updatePollInDiscord(closedPoll, closedVotes)
            const guild = await getGuild(closedPoll.guildId)
            if (guild) {
              postPollResults(closedPoll, closedVotes, guild).catch(() => {})
              const winner = closedVotes.length > 0
                ? closedPoll.options.reduce((b, o) =>
                    closedVotes.filter(v => v.optionId === o.id).length > closedVotes.filter(v => v.optionId === b.id).length ? o : b,
                    closedPoll.options[0])
                : null
              postAuditLog(
                guild,
                'Poll closed',
                `**[${closedPoll.title}](${process.env.NEXTAUTH_URL}/p/${closedPoll.id})**\n${closedVotes.length} vote${closedVotes.length !== 1 ? 's' : ''}${winner ? ` · winner: **${winner.text}**` : ''}`,
                username,
              ).catch(() => {})
              refreshDashboard(closedPoll.guildId, { closedPollIds: [closedPoll.id] }).catch(() => {})
            }
          } catch (e) { console.error('Close poll error:', e) }
        })())
        return Response.json({ type: 6 })
      }

      // ── Dashboard: create poll (open type selector) ───────────────────────
      if (customId.startsWith('dash:create:')) {
        const dgId = customId.split(':')[2]
        const guild = await getGuild(dgId)
        const userRoles = (member?.roles as string[]) ?? []
        if (guild && !userCanCreate(guild, userId, userRoles)) {
          return Response.json({ type: 4, data: { content: '❌ You don\'t have permission to create polls on this server.', flags: 64 } })
        }
        bg((async () => { await sleep(60_000); await deleteMessage(appId, token) })())
        return Response.json({ type: 4, data: buildTypePicker(dgId) })
      }

      // ── Dashboard: list polls ─────────────────────────────────────────────
      if (customId.startsWith('dash:list:')) {
        const dgId = customId.split(':')[2]
        bg((async () => {
          try {
            const activePolls = (await getPolls(dgId)).filter(p => !p.isClosed)
            const siteUrl = process.env.NEXTAUTH_URL ?? ''
            const embed = activePolls.length === 0
              ? { title: 'Active Polls', description: 'No active polls right now.', color: 0x6B7280 }
              : {
                  title: `Active Polls (${activePolls.length})`,
                  color: 0x6366F1,
                  description: activePolls.map(p => {
                    const closeStr = p.closesAt
                      ? `closes <t:${Math.floor(new Date(p.closesAt).getTime() / 1000)}:R>`
                      : 'no close date'
                    return `**[${p.title}](${siteUrl}/p/${p.id})**\n${p.options.length} options · ${closeStr}`
                  }).join('\n\n'),
                }
            await sendFollowup(token, appId, { embeds: [embed], flags: 64 })
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
