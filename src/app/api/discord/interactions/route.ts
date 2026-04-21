import { NextRequest } from 'next/server'
import { createPoll, updatePoll, getPoll, getPolls, castVote, getVotes } from '@/lib/polls'
import { getGuild, upsertGuild, userCanCreate } from '@/lib/guilds'
import { getKV } from '@/lib/kv'
import {
  buildTimeSlotComponents,
  buildTimeSlotFollowupContent,
  updatePollInDiscord,
  buildDashboardEmbed,
  buildDashboardComponents,
  buildPollEmbed,
  buildPollComponents,
  postPollToDiscord,
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

// ─── Poll draft (KV-backed, 30 min TTL) ──────────────────────────────────────

interface PollDraft {
  guildId:       string
  userId:        string
  username:      string
  pollType:      's' | 'yn' | 'ts'   // standard / yes-no / time-slots
  title:         string
  description:   string
  options:       string[]
  timeSlots:     string[]
  isAnonymous:   boolean
  allowMultiple: boolean
  daysOpen:      number
  hoursOpen:     number   // >0 means use hours instead of days
}

async function saveDraft(id: string, draft: PollDraft): Promise<void> {
  const kv = await getKV()
  if (kv) await kv.put(`pdraft:${id}`, JSON.stringify(draft), { expirationTtl: 1800 })
}

async function getDraft(id: string): Promise<PollDraft | null> {
  const kv  = await getKV()
  const raw = kv ? await kv.get(`pdraft:${id}`) : null
  return raw ? JSON.parse(raw) : null
}

async function deleteDraft(id: string): Promise<void> {
  const kv = await getKV()
  if (kv) await kv.delete(`pdraft:${id}`)
}

async function saveTok(key: string, token: string): Promise<void> {
  const kv = await getKV()
  if (kv) await kv.put(key, token, { expirationTtl: 300 })
}

async function getTok(key: string): Promise<string | null> {
  const kv = await getKV()
  return kv ? kv.get(key) : null
}

function draftId(): string { return Math.random().toString(36).slice(2, 8) }

// ─── Guided poll UI builders ──────────────────────────────────────────────────

function buildTypeSelectMessage(gId: string): object {
  return {
    flags: 64,
    embeds: [{
      title:       'Create a Poll',
      description: 'What kind of poll do you want to make? Pick a type below.',
      color:       0x6366F1,
      fields: [
        { name: '📝 Standard',    value: 'Your own question with 2–10 custom options.',     inline: true },
        { name: '✅ Yes / No',    value: 'A quick thumbs-up / thumbs-down question.',       inline: true },
        { name: '🕐 Time Slots',  value: 'Voters pick an option and a preferred time.',     inline: true },
      ],
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: '📝 Standard',   custom_id: `poll:type:s:${gId}`  },
        { type: 2, style: 2, label: '✅ Yes / No',   custom_id: `poll:type:yn:${gId}` },
        { type: 2, style: 2, label: '🕐 Time Slots', custom_id: `poll:type:ts:${gId}` },
      ],
    }],
  }
}

function buildModal(type: 's' | 'yn' | 'ts', customId: string, draft?: PollDraft): object {
  const t  = { type: 1, components: [{ type: 4, custom_id: 't', label: 'Question', style: 1, required: true,  max_length: 120, placeholder: 'e.g. Which day for the raid?',          ...(draft ? { value: draft.title }                        : {}) }] }
  const d  = { type: 1, components: [{ type: 4, custom_id: 'd', label: 'Description  (optional)', style: 2, required: false, max_length: 300, ...(draft?.description ? { value: draft.description } : {}) }] }
  const o  = { type: 1, components: [{ type: 4, custom_id: 'o', label: 'Options  (one per line, 2–6 options)', style: 2, required: true, max_length: 600, placeholder: 'Option 1\nOption 2\nOption 3', ...(draft?.options.length ? { value: draft.options.join('\n') } : {}) }] }
  const ts = { type: 1, components: [{ type: 4, custom_id: 'ts', label: 'Time slots  (HH:MM, comma-separated)', style: 1, required: false, max_length: 120, placeholder: '18:00, 19:00, 20:00, 21:00', ...(draft?.timeSlots.length ? { value: draft.timeSlots.join(', ') } : {}) }] }

  if (type === 'yn')  return { custom_id: customId, title: 'Quick Yes / No Poll',  components: [t, d] }
  if (type === 'ts')  return { custom_id: customId, title: 'Time Slot Poll',        components: [t, o, ts, d] }
  return              { custom_id: customId, title: 'Create a Poll',                components: [t, o, d] }
}

function buildSettingsMessage(draft: PollDraft, id: string): object {
  const HOURS = [1, 2, 4, 6, 12]
  const DURS  = [1, 3, 7, 14, 30]
  const opts  = draft.options.map((o, i) => `**${i + 1}.** ${o}`).join('\n')
  const tsRow = draft.timeSlots.length ? `\n**Time slots:** ${draft.timeSlots.join(' · ')}` : ''

  const durLabel = draft.hoursOpen > 0
    ? `${draft.hoursOpen}h`
    : `${draft.daysOpen} day${draft.daysOpen !== 1 ? 's' : ''}`

  return {
    flags: 64,
    embeds: [{
      title: 'Review & Settings',
      color: 0x6366F1,
      fields: [
        { name: '❓ Question', value: draft.title, inline: false },
        ...(draft.description ? [{ name: 'ℹ️ Details',  value: draft.description, inline: false }] : []),
        { name: '🗳️ Options', value: opts + tsRow,  inline: false },
        { name: '⏱️ Duration', value: durLabel, inline: true },
        { name: '🔧 Settings', value: `${draft.isAnonymous ? '🔒 Anonymous' : '🔓 Public'}  ·  ${draft.allowMultiple ? '☑️ Multi-choice' : '☐ Single vote'}`, inline: true },
      ],
      footer: { text: 'Adjust duration below — expires if not posted within 30 min' },
    }],
    components: [
      {
        type: 1,
        components: HOURS.map(h => ({
          type: 2, style: draft.hoursOpen === h ? 1 : 2,
          label: `${h}h`,
          custom_id: `poll:durh:${id}:${h}`,
        })),
      },
      {
        type: 1,
        components: DURS.map(d => ({
          type: 2, style: draft.hoursOpen === 0 && d === draft.daysOpen ? 1 : 2,
          label: d === 1 ? '1 day' : `${d} days`,
          custom_id: `poll:dur:${id}:${d}`,
        })),
      },
      {
        type: 1,
        components: [
          { type: 2, style: draft.isAnonymous   ? 1 : 2, label: draft.isAnonymous   ? '🔒 Anonymous: On'    : '🔓 Anonymous: Off',    custom_id: `poll:tog:anon:${id}`  },
          { type: 2, style: draft.allowMultiple ? 1 : 2, label: draft.allowMultiple ? '☑️ Multi-choice: On' : '☐ Multi-choice: Off',  custom_id: `poll:tog:multi:${id}` },
        ],
      },
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: '✏️ Edit',      custom_id: `poll:edit:${id}`   },
          { type: 2, style: 4, label: '✕ Cancel',     custom_id: `poll:cancel:${id}` },
          { type: 2, style: 3, label: '🚀 Post Poll', custom_id: `poll:create:${id}` },
        ],
      },
    ],
  }
}

// ─── Create poll from draft ───────────────────────────────────────────────────

async function createFromDraft(draft: PollDraft): Promise<{ poll: Poll; posted: boolean }> {
  const options  = draft.options.map((text, i) => ({ id: `opt-${i}`, text }))
  const closesAt = new Date()
  if (draft.hoursOpen > 0) {
    closesAt.setTime(closesAt.getTime() + draft.hoursOpen * 60 * 60 * 1000)
  } else {
    closesAt.setDate(closesAt.getDate() + draft.daysOpen)
  }

  const poll: Poll = {
    id:               `poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    guildId:          draft.guildId,
    title:            draft.title,
    description:      draft.description || undefined,
    options,
    includeTimeSlots: draft.timeSlots.length > 0,
    timeSlots:        draft.timeSlots,
    isAnonymous:      draft.isAnonymous,
    allowMultiple:    draft.allowMultiple,
    createdBy:        draft.userId,
    createdByName:    draft.username,
    createdAt:        new Date().toISOString(),
    closesAt:         closesAt.toISOString(),
    isClosed:         false,
  }

  const guild = await getGuild(draft.guildId)
  let posted  = false

  // Write to KV first so the poll exists when Discord delivers the message
  // and users click vote buttons (or the image endpoint is fetched).
  await createPoll(poll)

  if (guild?.announceChannelId) {
    const msgId = await postPollToDiscord(poll).catch(() => null)
    if (msgId) {
      await updatePoll(poll.id, { discordMessageId: msgId, discordChannelId: guild.announceChannelId })
      poll.discordMessageId = msgId
      poll.discordChannelId = guild.announceChannelId
      posted = true
    }
  }

  if (guild) {
    postAuditLog(guild, 'Poll created', `**${poll.title}** (via /poll)`, draft.username).catch(() => {})
    refreshDashboard(draft.guildId).catch(() => {})
  }

  return { poll, posted }
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
    const username           = (member?.nick ?? user?.username ?? 'Unknown') as string
    // Present on component interactions — the message the button lives on
    const interactionMessage   = body.message as Record<string, unknown> | undefined
    const interactionMessageId = interactionMessage?.id as string | undefined
    const interactionChannelId = body.channel_id as string | undefined

    // ── SLASH COMMANDS (type 2) ──────────────────────────────────────────────
    if (body.type === 2) {
      const cmd = (body.data as Record<string, unknown>)?.name as string
      log('slash command', { cmd, guildId })

      if (cmd === 'poll') {
        if (guildId) {
          const guild = await getGuild(guildId)
          const userRoles = (member?.roles as string[]) ?? []
          if (guild && !userCanCreate(guild, userId, userRoles)) {
            return Response.json({ type: 4, data: { content: 'You don\'t have permission to create polls on this server.', flags: 64 } })
          }
        }
        return Response.json({ type: 4, data: buildTypeSelectMessage(guildId ?? '') })
      }

      if (cmd === 'setup') {
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

    // ── MODAL SUBMIT (type 5) ────────────────────────────────────────────────
    if (body.type === 5) {
      const idata    = body.data as Record<string, unknown>
      const customId = idata?.custom_id as string
      const rows     = (idata.components as { components: { custom_id: string; value: string }[] }[]) ?? []
      const get      = (id: string) => rows.flatMap(r => r.components).find(c => c.custom_id === id)?.value ?? ''

      // ── Initial poll modal: poll:modal:{type}:{guildId} ──────────────────
      if (customId.startsWith('poll:modal:')) {
        const parts      = customId.split(':')
        const pType      = parts[2] as 's' | 'yn' | 'ts'
        const pGuildId   = parts[3] || guildId || ''

        const title = get('t').trim()
        if (!title) return Response.json({ type: 4, data: { content: '❌ A question is required.', flags: 64 } })

        let options: string[]
        if (pType === 'yn') {
          options = ['Yes', 'No']
        } else {
          options = get('o').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6)
          if (options.length < 2) return Response.json({ type: 4, data: { content: '❌ At least 2 options required.', flags: 64 } })
        }

        const timeSlots = pType === 'ts'
          ? get('ts').split(',').map(t => t.trim()).filter(t => /^\d{2}:\d{2}$/.test(t))
          : []

        const id    = draftId()
        const draft: PollDraft = {
          guildId: pGuildId, userId, username, pollType: pType,
          title, description: get('d').trim(), options, timeSlots,
          isAnonymous: false, allowMultiple: false, daysOpen: 7, hoursOpen: 0,
        }
        await saveDraft(id, draft)

        // Clean up the type-selector message using the stored button click token
        bg((async () => {
          const tok = await getTok(`ptok:${userId}:${pGuildId}`)
          if (tok) {
            await patchMessage(appId, tok, {
              embeds: [{ title: '✅ Poll type selected', description: 'Continue in the message below.', color: 0x22C55E }],
              components: [],
            })
          }
        })())

        return Response.json({ type: 4, data: buildSettingsMessage(draft, id) })
      }

      // ── Edit modal: poll:redit:{draftId}:{type} ──────────────────────────
      if (customId.startsWith('poll:redit:')) {
        const parts  = customId.split(':')
        const id     = parts[2]
        const pType  = parts[3] as 's' | 'yn' | 'ts'
        const draft  = await getDraft(id)
        if (!draft || draft.userId !== userId) {
          return Response.json({ type: 4, data: { content: '❌ Draft expired — use `/poll` to start again.', flags: 64 } })
        }

        const title = get('t').trim()
        if (!title) return Response.json({ type: 4, data: { content: '❌ A question is required.', flags: 64 } })

        draft.title       = title
        draft.description = get('d').trim()
        if (pType !== 'yn') {
          const opts = get('o').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6)
          if (opts.length >= 2) draft.options = opts
        }
        if (pType === 'ts') {
          draft.timeSlots = get('ts').split(',').map(t => t.trim()).filter(t => /^\d{2}:\d{2}$/.test(t))
        }
        await saveDraft(id, draft)

        // Clean up the old settings message
        bg((async () => {
          const tok = await getTok(`petok:${userId}:${id}`)
          if (tok) {
            await patchMessage(appId, tok, {
              embeds: [{ title: '✏️ Poll updated', description: 'Review your changes in the message below.', color: 0x6366F1 }],
              components: [],
            })
          }
        })())

        return Response.json({ type: 4, data: buildSettingsMessage(draft, id) })
      }

      return Response.json({ type: 6 })
    }

    // ── COMPONENT INTERACTIONS (type 3) ─────────────────────────────────────
    if (body.type === 3) {
      const idata    = body.data    as Record<string, unknown>
      const customId = (idata?.custom_id as string) ?? ''

      log('component', { customId, userId, guildId })

      // ── Poll: type selector buttons ──────────────────────────────────────
      if (customId.startsWith('poll:type:')) {
        const parts  = customId.split(':')
        const pType  = parts[2] as 's' | 'yn' | 'ts'
        const pGId   = parts[3] || guildId || ''
        // Store this interaction's token so we can clean up the type selector later
        await saveTok(`ptok:${userId}:${pGId}`, token)
        return Response.json({ type: 9, data: buildModal(pType, `poll:modal:${pType}:${pGId}`) })
      }

      // ── Poll: duration — hours buttons ───────────────────────────────────
      if (customId.startsWith('poll:durh:')) {
        const parts = customId.split(':')
        const id    = parts[2]
        const hours = parseInt(parts[3])
        const draft = await getDraft(id)
        if (!draft || draft.userId !== userId) return Response.json({ type: 6 })
        draft.hoursOpen = hours
        await saveDraft(id, draft)
        return Response.json({ type: 7, data: buildSettingsMessage(draft, id) })
      }

      // ── Poll: duration — days buttons ─────────────────────────────────────
      if (customId.startsWith('poll:dur:')) {
        const parts = customId.split(':')
        const id    = parts[2]
        const days  = parseInt(parts[3])
        const draft = await getDraft(id)
        if (!draft || draft.userId !== userId) return Response.json({ type: 6 })
        draft.daysOpen  = days
        draft.hoursOpen = 0
        await saveDraft(id, draft)
        return Response.json({ type: 7, data: buildSettingsMessage(draft, id) })
      }

      // ── Poll: toggle anonymous ────────────────────────────────────────────
      if (customId.startsWith('poll:tog:anon:')) {
        const id    = customId.slice('poll:tog:anon:'.length)
        const draft = await getDraft(id)
        if (!draft || draft.userId !== userId) return Response.json({ type: 6 })
        draft.isAnonymous = !draft.isAnonymous
        await saveDraft(id, draft)
        return Response.json({ type: 7, data: buildSettingsMessage(draft, id) })
      }

      // ── Poll: toggle multi-choice ─────────────────────────────────────────
      if (customId.startsWith('poll:tog:multi:')) {
        const id    = customId.slice('poll:tog:multi:'.length)
        const draft = await getDraft(id)
        if (!draft || draft.userId !== userId) return Response.json({ type: 6 })
        draft.allowMultiple = !draft.allowMultiple
        await saveDraft(id, draft)
        return Response.json({ type: 7, data: buildSettingsMessage(draft, id) })
      }

      // ── Poll: edit button → re-open modal ────────────────────────────────
      if (customId.startsWith('poll:edit:')) {
        const id    = customId.slice('poll:edit:'.length)
        const draft = await getDraft(id)
        if (!draft || draft.userId !== userId) return Response.json({ type: 6 })
        // Store token so edit modal submit can clean up this settings message
        await saveTok(`petok:${userId}:${id}`, token)
        return Response.json({ type: 9, data: buildModal(draft.pollType, `poll:redit:${id}:${draft.pollType}`, draft) })
      }

      // ── Poll: cancel ──────────────────────────────────────────────────────
      if (customId.startsWith('poll:cancel:')) {
        const id = customId.slice('poll:cancel:'.length)
        await deleteDraft(id)
        return Response.json({ type: 7, data: {
          embeds: [{ title: '❌ Cancelled', description: 'Poll creation was cancelled. Use `/poll` to start again.', color: 0x6B7280 }],
          components: [],
        }})
      }

      // ── Poll: create ──────────────────────────────────────────────────────
      if (customId.startsWith('poll:create:')) {
        const id    = customId.slice('poll:create:'.length)
        const draft = await getDraft(id)
        if (!draft || draft.userId !== userId) {
          return Response.json({ type: 7, data: {
            embeds: [{ title: '❌ Draft expired', description: 'Use `/poll` to start a new poll.', color: 0xEF4444 }],
            components: [],
          }})
        }

        // Acknowledge immediately with "creating..." state
        const siteUrl = process.env.NEXTAUTH_URL ?? ''
        bg((async () => {
          try {
            const { poll, posted } = await createFromDraft(draft)
            await deleteDraft(id)

            const content = posted
              ? `✅ **${poll.title}** has been posted to the announcement channel!`
              : `✅ **${poll.title}** was created. [View it here](${siteUrl}/p/${poll.id})\n\n⚠️ No announcement channel — set one up in [Settings](${siteUrl}/dashboard/${draft.guildId}/settings).`

            await patchMessage(appId, token, {
              embeds: [{ title: posted ? '✅ Poll Posted!' : '✅ Poll Created', description: content, color: posted ? 0x22C55E : 0xF59E0B }],
              components: [],
            })
            await sleep(8_000)
            await deleteMessage(appId, token)
          } catch (e) {
            console.error('createFromDraft error:', e)
            await patchMessage(appId, token, {
              embeds: [{ title: '❌ Error', description: 'Something went wrong. Please try again.', color: 0xEF4444 }],
              components: [],
            })
          }
        })())

        return Response.json({ type: 7, data: {
          embeds: [{ title: '⏳ Creating your poll…', description: 'This will only take a moment.', color: 0x6366F1 }],
          components: [],
        }})
      }

      // ── Setup: announce channel picker ────────────────────────────────────
      if (customId.startsWith('setup:announce:')) {
        const setupGuildId = customId.split(':')[2]
        const channelId    = ((idata.values as string[]) ?? [])[0]
        if (setupGuildId && channelId) {
          try {
            const guild = await getGuild(setupGuildId)
            if (guild) await upsertGuild({ ...guild, announceChannelId: channelId, updatedAt: new Date().toISOString() })
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
        bg((async () => {
          try {
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
              refreshDashboard(closedPoll.guildId).catch(() => {})
            }
          } catch (e) { console.error('Close poll error:', e) }
        })())
        return Response.json({ type: 6 })
      }

      // ── Dashboard: create poll (open type selector) ───────────────────────
      if (customId.startsWith('dash:create:')) {
        const dgId = customId.split(':')[2]
        return Response.json({ type: 4, data: buildTypeSelectMessage(dgId) })
      }

      // ── Dashboard: list polls ─────────────────────────────────────────────
      if (customId.startsWith('dash:list:')) {
        const dgId = customId.split(':')[2]
        bg((async () => {
          try {
            const guild = await getGuild(dgId)
            if (!guild) return
            const activePolls = (await getPolls(dgId)).filter(p => !p.isClosed)
            await sendFollowup(token, appId, {
              embeds: [buildDashboardEmbed(guild, activePolls)], components: buildDashboardComponents(guild), flags: 64,
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
