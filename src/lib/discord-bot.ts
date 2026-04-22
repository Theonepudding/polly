import { Poll, Vote, Guild } from '@/types'
import { getGuild, upsertGuild } from './guilds'
import { getPolls, getVotes, updatePoll } from './polls'

const DISCORD_API  = 'https://discord.com/api/v10'
const COLOR_ACTIVE = 0x6366F1
const COLOR_CLOSED = 0x22D3EE
const COLOR_AUDIT  = 0x4B5563
const COLOR_RESULT = 0xF59E0B

function botHeaders() {
  return {
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

function pollImageUrl(pollId: string, page = 0, version = 0, maxH?: number): string {
  const base = `${process.env.NEXTAUTH_URL}/api/poll-image/${pollId}?v=${version}`
  const p = page > 0 ? `&p=${page}` : ''
  const h = maxH ? `&h=${maxH}` : ''
  return `${base}${p}${h}`
}

function pollResultsImageUrl(pollId: string, version = 0): string {
  return `${process.env.NEXTAUTH_URL}/api/poll-image/${pollId}?v=${version}&results=1`
}

// Version key that changes on every vote action, including vote changes.
// votes.length alone stays the same when a user switches options.
function pollVersion(votes: Vote[]): number {
  if (votes.length === 0) return 0
  return Math.max(...votes.map(v => Math.floor(new Date(v.votedAt).getTime() / 1000)))
}

function needsTwoImages(poll: Poll): boolean {
  return poll.options.length > 6
}

// Mirror of the height formula in poll-image/[id]/route.tsx (vote-independent baseline).
// Both page URLs must carry the same ?h= so Discord renders them at the same display size.
function computePollImageH(poll: Poll): number {
  const PAD_V = 26, HEADER_H = 88, FOOTER_H = 50, MIN_H = 460
  const OPT_ROW = 54 // lineH(30) + gap(7) + bar(9) + optGap(8)
  const hasSlots = poll.includeTimeSlots && poll.timeSlots.length > 0
  const slotRows = hasSlots ? Math.ceil(poll.timeSlots.length / 5) : 0
  const tsH = hasSlots ? 26 + slotRows * 30 - 8 : 0
  const sepH = hasSlots ? 16 : 0
  function h(n: number, slots: boolean) {
    return Math.max(MIN_H, PAD_V * 2 + HEADER_H + n * OPT_ROW + (slots ? sepH + tsH : 0) + FOOTER_H)
  }
  if (!needsTwoImages(poll)) return h(poll.options.length, hasSlots)
  return Math.max(h(6, false), h(Math.max(0, poll.options.length - 6), hasSlots))
}

function pollPageUrl(pollId: string): string {
  return `${process.env.NEXTAUTH_URL}/p/${pollId}`
}

const DASHBOARD_PAGE_SIZE = 7

function dashboardImageUrl(guildId: string, activePollIds: string[], page = 0): string {
  const ids   = activePollIds.join(',')
  const token = Date.now().toString(36)
  const p     = page > 0 ? `&p=${page}` : ''
  return `${process.env.NEXTAUTH_URL}/api/dashboard-image/${guildId}/${token}?ids=${encodeURIComponent(ids)}${p}`
}

function shortDate(iso?: string) {
  if (!iso) return 'open'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function discordTimestamp(iso: string): string {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`
}

function utcHHMMtoDiscordTimestamp(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  const d = new Date()
  d.setUTCHours(h, m, 0, 0)
  if (d < new Date()) d.setUTCDate(d.getUTCDate() + 1)
  return `<t:${Math.floor(d.getTime() / 1000)}:t>`
}

function formatSlotForDiscord(slot: string): string {
  return /^\d{2}:\d{2}$/.test(slot) ? utcHHMMtoDiscordTimestamp(slot) : `**${slot}**`
}

// Discord buttons run server-side so we can't convert to a user's local timezone.
// Use UTC labels in buttons; the followup message uses <t:...:t> which Discord
// renders in each viewer's own timezone automatically.
function utcLabel(hhMM: string): string {
  return `${hhMM} UTC`
}

function roleMentions(roleIds?: string[]): string {
  if (!roleIds?.length) return ''
  return roleIds.map(id => `<@&${id}>`).join(' ')
}

// ─── Option emoji helpers ─────────────────────────────────────────────────────

function extractDiscordEmoji(text: string): {
  emoji?: { id: string; name: string; animated: boolean }
  label: string
} {
  const match = text.match(/<(a?):(\w+):(\d+)>/)
  if (match) {
    const label = text.replace(/<a?:\w+:\d+>/g, '').trim().slice(0, 80)
    return {
      emoji: { animated: match[1] === 'a', name: match[2], id: match[3] },
      label,
    }
  }
  return { label: text.slice(0, 80) }
}

function emojiFromCode(code: string): { id: string; name: string; animated: boolean } | undefined {
  const m = code.match(/^<(a?):(\w+):(\d+)>$/)
  if (m) return { animated: m[1] === 'a', name: m[2], id: m[3] }
  return undefined
}

// ─── Embed builders ──────────────────────────────────────────────────────────

function pollFooter(poll: Poll) {
  const flags = [
    poll.isAnonymous   ? '🔒 Anonymous' : null,
    poll.allowMultiple ? '☑️ Multi-choice' : null,
    poll.isGhost       ? '👻 Ghost' : null,
  ].filter(Boolean).join('  ·  ')
  const parts = [
    poll.closesAt ? `Closes ${shortDate(poll.closesAt)}` : 'No end date',
    poll.createdByName,
  ]
  if (flags) parts.push(flags)
  return { text: parts.join('  ·  ') }
}

export function buildPollEmbed(poll: Poll, votes: Vote[], includeFooter = true, maxH?: number) {
  return {
    title:       poll.title,
    url:         pollPageUrl(poll.id),
    description: poll.description
      ? `${poll.description}${poll.closesAt ? `\n\nCloses ${discordTimestamp(poll.closesAt)}` : ''}`
      : poll.closesAt ? `Closes ${discordTimestamp(poll.closesAt)}` : undefined,
    color:       COLOR_ACTIVE,
    image:       { url: pollImageUrl(poll.id, 0, pollVersion(votes), maxH) },
    ...(includeFooter ? { footer: pollFooter(poll), timestamp: new Date().toISOString() } : {}),
  }
}

export function buildPollComponents(poll: Poll) {
  const rows: object[] = []

  // Cap at 12: 3 option rows of 5 + 1 website button row = 4 rows (Discord max is 5)
  const optionButtons = poll.options.slice(0, 12).map((opt, i) => {
    // Only use explicitly set button emoji — never fall back to text emoji
    const emoji = opt.buttonEmoji ? emojiFromCode(opt.buttonEmoji) : undefined
    // Button label: explicit number override > default 1-based index
    const label = String(opt.buttonNum ?? (i + 1))
    return {
      type:      2,
      style:     1,
      label,
      ...(emoji ? { emoji } : {}),
      custom_id: `v:${poll.id}:${opt.id}`,
    }
  })
  for (let i = 0; i < optionButtons.length; i += 5) {
    rows.push({ type: 1, components: optionButtons.slice(i, i + 5) })
  }

  rows.push({
    type: 1,
    components: [{
      type:  2,
      style: 5,
      label: '🗳️ Vote on the website',
      url:   pollPageUrl(poll.id),
    }],
  })

  return rows
}

export function buildTimeSlotComponents(poll: Poll, optionId: string) {
  const timeButtons = poll.timeSlots.slice(0, 5).map((ts, i) => ({
    type:      2,
    style:     2,
    // Clock slots get numbered labels; the follow-up message shows the local-time mapping.
    // Button labels don't support Discord timestamp formatting so numbers are the cleanest option.
    label:     /^\d{2}:\d{2}$/.test(ts) ? String(i + 1) : ts.slice(0, 80),
    custom_id: `t:${poll.id}:${optionId}:${ts}`,
  }))

  return [
    { type: 1, components: timeButtons },
    { type: 1, components: [{ type: 2, style: 2, label: 'No preference', custom_id: `skip:${poll.id}:${optionId}` }] },
  ]
}

export function buildTimeSlotFollowupContent(poll: Poll): string {
  const lines = poll.timeSlots.slice(0, 5).map((ts, i) =>
    /^\d{2}:\d{2}$/.test(ts)
      ? `**${i + 1}** — ${utcHHMMtoDiscordTimestamp(ts)}`
      : `**${ts}**`
  )
  return `🕐 Pick a time preference:\n${lines.join('\n')}`
}

export function buildClosedEmbed(poll: Poll, votes: Vote[], includeFooter = true, maxH?: number) {
  const total  = votes.length
  const winner = total > 0 ? winnerOf(poll, votes) : null
  const slot   = topTimeSlot(poll, votes, winner?.id)

  const lines: string[] = []
  if (winner && total > 0) lines.push(`🏆 **${winner.text}** won with ${votes.filter(v => v.optionId === winner.id).length} vote${votes.filter(v => v.optionId === winner.id).length !== 1 ? 's' : ''}`)
  if (slot) lines.push(`⏰ Preferred: ${formatSlotForDiscord(slot)}`)

  return {
    title:       `${poll.title} — Closed`,
    url:         pollPageUrl(poll.id),
    description: lines.length ? lines.join('\n') : '*No votes were cast.*',
    color:       COLOR_CLOSED,
    image:       { url: pollImageUrl(poll.id, 0, pollVersion(votes), maxH) },
    ...(includeFooter ? { footer: { text: `Poll closed  ·  ${total} vote${total !== 1 ? 's' : ''}  ·  ${poll.createdByName}` }, timestamp: new Date().toISOString() } : {}),
  }
}

export function buildClosedPollComponents(poll: Poll): object[] {
  return [{
    type: 1,
    components: [{
      type:  2,
      style: 5,
      label: 'View full results',
      url:   pollPageUrl(poll.id),
    }],
  }]
}

export function buildPollEmbeds(poll: Poll, votes: Vote[]): object[] {
  if (!needsTwoImages(poll)) return [buildPollEmbed(poll, votes)]
  const maxH = computePollImageH(poll)
  return [
    buildPollEmbed(poll, votes, false, maxH),
    { color: COLOR_ACTIVE, image: { url: pollImageUrl(poll.id, 1, pollVersion(votes), maxH) }, footer: pollFooter(poll), timestamp: new Date().toISOString() },
  ]
}

export function buildClosedEmbeds(poll: Poll, votes: Vote[]): object[] {
  const total = votes.length
  if (!needsTwoImages(poll)) return [buildClosedEmbed(poll, votes)]
  const maxH = computePollImageH(poll)
  return [
    buildClosedEmbed(poll, votes, false, maxH),
    { color: COLOR_CLOSED, image: { url: pollImageUrl(poll.id, 1, pollVersion(votes), maxH) }, footer: { text: `Poll closed  ·  ${total} vote${total !== 1 ? 's' : ''}  ·  ${poll.createdByName}` }, timestamp: new Date().toISOString() },
  ]
}

// ─── Dashboard embed ──────────────────────────────────────────────────────────

export function buildDashboardEmbeds(guild: Guild, activePolls: Poll[]): object[] {
  const baseUrl    = process.env.NEXTAUTH_URL ?? ''
  const allIds     = activePolls.map(p => p.id)
  const totalPages = Math.max(1, Math.ceil(activePolls.length / DASHBOARD_PAGE_SIZE))
  const embeds: object[] = []

  for (let page = 0; page < totalPages; page++) {
    const isFirst    = page === 0
    const isLast     = page === totalPages - 1
    const pagePolls  = activePolls.slice(page * DASHBOARD_PAGE_SIZE, (page + 1) * DASHBOARD_PAGE_SIZE)

    // Each embed gets its own page's poll links — keeps text and image in sync
    let description: string
    if (activePolls.length === 0) {
      description = '*No active polls right now.*'
    } else {
      description = pagePolls.map(p => {
        const closing = p.closesAt ? ` · closes ${discordTimestamp(p.closesAt)}` : ''
        return `**[${p.title}](${baseUrl}/p/${p.id})**${closing}`
      }).join('\n')
    }

    embeds.push({
      ...(isFirst ? { title: `${guild.guildName} — Polls` } : {}),
      description,
      color:     0x6366F1,
      image:     { url: dashboardImageUrl(guild.guildId, allIds, page) },
      ...(isLast ? {
        footer:    { text: `${activePolls.length} active poll${activePolls.length !== 1 ? 's' : ''}  ·  Polly` },
        timestamp: new Date().toISOString(),
      } : {}),
    })
  }

  return embeds
}

export function buildDashboardComponents(guild: Guild) {
  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: '➕ Create Poll', custom_id: `dash:create:${guild.guildId}` },
        { type: 2, style: 2, label: '📋 View All Polls', custom_id: `dash:list:${guild.guildId}` },
        {
          type:  2,
          style: 5,
          label: '⚙️ Open Dashboard',
          url:   `${baseUrl}/dashboard/${guild.guildId}`,
        },
      ],
    },
  ]
}

// ─── API actions ──────────────────────────────────────────────────────────────

async function resolveChannelId(poll: Poll): Promise<string | null> {
  if (poll.overrideChannelId) return poll.overrideChannelId
  const guild = await getGuild(poll.guildId)
  return guild?.announceChannelId ?? null
}

export async function postPollToDiscord(poll: Poll): Promise<string | null> {
  const channelId = await resolveChannelId(poll)
  if (!process.env.DISCORD_BOT_TOKEN || !channelId) return null

  const pingContent = roleMentions(poll.pingRoleIds)

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({
        content:    pingContent || undefined,
        embeds:     buildPollEmbeds(poll, []),
        components: buildPollComponents(poll),
        allowed_mentions: poll.pingRoleIds?.length
          ? { roles: poll.pingRoleIds }
          : { parse: [] },
      }),
    })
    if (!res.ok) { console.error('Discord post failed:', await res.text()); return null }
    const msg = await res.json() as { id: string }
    return msg.id
  } catch (e) {
    console.error('Discord post error:', e)
    return null
  }
}

export async function deletePollFromDiscord(poll: Poll): Promise<void> {
  const channelId = poll.discordChannelId ?? await resolveChannelId(poll)
  if (!process.env.DISCORD_BOT_TOKEN || !channelId || !poll.discordMessageId) return
  try {
    await fetch(`${DISCORD_API}/channels/${channelId}/messages/${poll.discordMessageId}`, {
      method: 'DELETE', headers: botHeaders(),
    })
  } catch (e) { console.error('Discord delete error:', e) }
}

export async function updatePollInDiscord(poll: Poll, votes: Vote[]): Promise<boolean> {
  const channelId = poll.discordChannelId ?? await resolveChannelId(poll)
  if (!process.env.DISCORD_BOT_TOKEN || !channelId || !poll.discordMessageId) return false

  const embeds     = poll.isClosed ? buildClosedEmbeds(poll, votes) : buildPollEmbeds(poll, votes)
  const components = poll.isClosed ? buildClosedPollComponents(poll) : buildPollComponents(poll)

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${poll.discordMessageId}`, {
      method:  'PATCH',
      headers: botHeaders(),
      body:    JSON.stringify({ embeds, components }),
    })
    if (res.status === 404) return false
    return res.ok
  } catch (e) {
    console.error('Discord update error:', e)
    return false
  }
}

export async function postOrUpdateDashboard(guild: Guild, activePolls: Poll[]): Promise<string | null> {
  if (!process.env.DISCORD_BOT_TOKEN || !guild.dashboardChannelId) return null

  const embeds     = buildDashboardEmbeds(guild, activePolls)
  const components = buildDashboardComponents(guild)
  const channelId  = guild.dashboardChannelId

  try {
    if (guild.dashboardMessageId) {
      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${guild.dashboardMessageId}`, {
        method: 'PATCH', headers: botHeaders(),
        body: JSON.stringify({ embeds, components }),
      })
      if (res.ok) return guild.dashboardMessageId
      // On any failure (404, 429, 403, etc.) fall through and post a fresh message
      if (res.status !== 404) {
        // Try to clean up the stale/inaccessible message before reposting
        await fetch(`${DISCORD_API}/channels/${channelId}/messages/${guild.dashboardMessageId}`, {
          method: 'DELETE', headers: botHeaders(),
        }).catch(() => {})
      }
    }

    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST', headers: botHeaders(),
      body: JSON.stringify({ embeds, components }),
    })
    if (!res.ok) return null
    return ((await res.json()) as { id: string }).id
  } catch (e) {
    console.error('Dashboard post error:', e)
    return null
  }
}

// ─── Poll results announcement ────────────────────────────────────────────────
// Deletes the original poll embed, then posts a single results message with the
// poll image (closed state), winner, voter breakdown, and a website link button.

export async function postPollResults(poll: Poll, votes: Vote[], guild: Guild): Promise<string | null> {
  const channelId = poll.discordChannelId ?? poll.overrideChannelId ?? guild.announceChannelId
  if (!process.env.DISCORD_BOT_TOKEN || !channelId) return null

  // Delete the original voting embed — results replace it entirely
  if (poll.discordMessageId) {
    await deletePollFromDiscord(poll).catch(() => {})
  }

  const total  = votes.length
  const winner = total > 0 ? winnerOf(poll, votes) : null
  const slot   = topTimeSlot(poll, votes, winner?.id)

  // Build description: winner + optional voter breakdown
  const lines: string[] = []

  if (total === 0) {
    lines.push('*No votes were cast.*')
  } else {
    if (winner) {
      const winCount = votes.filter(v => v.optionId === winner.id).length
      const winPct   = Math.round((winCount / total) * 100)
      lines.push(`🏆 **${winner.text}** won with **${winCount}** vote${winCount !== 1 ? 's' : ''} (${winPct}%)`)
    }
    if (slot) lines.push(`⏰ Preferred: ${formatSlotForDiscord(slot)}`)

    if (!poll.isAnonymous) {
      // Show who voted for each option
      const optionsWithVotes = poll.options.filter(o => votes.some(v => v.optionId === o.id))
      if (optionsWithVotes.length > 0) {
        lines.push('')
        lines.push('**Who voted:**')
        for (const opt of optionsWithVotes) {
          const voters = votes.filter(v => v.optionId === opt.id).map(v => v.username)
          lines.push(`**${opt.text}** — ${voters.join(', ')}`)
        }
      }
    }
  }

  // Results embed: winner-announcement image (single image, no pagination)
  const embeds = [{
    title:       `Results: ${poll.title}`,
    url:         pollPageUrl(poll.id),
    description: lines.join('\n'),
    color:       COLOR_RESULT,
    image:       { url: pollResultsImageUrl(poll.id, pollVersion(votes)) },
    footer:      { text: `Poll closed  ·  ${total} vote${total !== 1 ? 's' : ''}  ·  ${poll.createdByName}` },
    timestamp:   new Date().toISOString(),
  }]

  const components = [{
    type: 1,
    components: [{
      type:  2,
      style: 5,
      label: '📊 View full results',
      url:   pollPageUrl(poll.id),
    }],
  }]

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({ embeds, components }),
    })
    if (!res.ok) { console.error('Results post failed:', await res.text()); return null }
    const newMsgId = ((await res.json()) as { id: string }).id
    // Save the results message ID so deleting the poll later can also remove this embed
    await updatePoll(poll.id, { discordMessageId: newMsgId, discordChannelId: channelId }).catch(() => {})
    return newMsgId
  } catch (e) {
    console.error('Results post error:', e)
    return null
  }
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export async function postAuditLog(
  guild: Guild,
  action: string,
  detail: string,
  actorName?: string,
): Promise<void> {
  if (!guild.auditLogChannelId || !process.env.DISCORD_BOT_TOKEN) return
  try {
    await fetch(`${DISCORD_API}/channels/${guild.auditLogChannelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({
        embeds: [{
          title:       `📋 ${action}`,
          description: detail,
          color:       COLOR_AUDIT,
          footer:      { text: actorName ? `By ${actorName}  ·  Polly` : 'Polly' },
          timestamp:   new Date().toISOString(),
        }],
      }),
    })
  } catch { /* ignore — audit failures are non-critical */ }
}

// ─── 24h reminder ping ────────────────────────────────────────────────────────

export async function sendReminderPing(poll: Poll, guild: Guild): Promise<void> {
  const channelId = poll.discordChannelId ?? poll.overrideChannelId ?? guild.announceChannelId
  if (!process.env.DISCORD_BOT_TOKEN || !channelId) return

  const [pingContent, votes] = [roleMentions(poll.pingRoleIds), await getVotes(poll.id)]

  // Delete the original voting embed so the reminder replaces it, not duplicates it
  if (poll.discordMessageId) {
    await fetch(`${DISCORD_API}/channels/${channelId}/messages/${poll.discordMessageId}`, {
      method: 'DELETE', headers: botHeaders(),
    }).catch(() => {})
  }

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({
        content: `${pingContent ? pingContent + ' ' : ''}⏰ **Less than 24 hours left to vote!**`,
        embeds:  buildPollEmbeds(poll, votes),
        components: buildPollComponents(poll),
        allowed_mentions: poll.pingRoleIds?.length
          ? { roles: poll.pingRoleIds }
          : { parse: [] },
      }),
    })
    if (res.ok) {
      const { id: newMsgId } = await res.json() as { id: string }
      await updatePoll(poll.id, { discordMessageId: newMsgId, discordChannelId: channelId })
    }
  } catch (e) { console.error('Reminder error:', e) }
}

// ─── Polly guide message ─────────────────────────────────────────────────────

export async function postPollyGuide(channelId: string, guildId: string): Promise<string | null> {
  if (!process.env.DISCORD_BOT_TOKEN) return null
  const siteUrl   = process.env.NEXTAUTH_URL ?? ''
  const dashboard = `${siteUrl}/dashboard/${guildId}`
  const gi        = (type: string) => `${siteUrl}/api/guide-image?type=${type}`

  const embeds = [
    {
      title:       '🗳️ Polly — How it Works',
      description: `Polls appear in this channel with live results. Use the buttons on each poll to vote, or open the [web dashboard](${dashboard}) for the full experience.`,
      color:       COLOR_ACTIVE,
      image:       { url: gi('voting') },
    },
    {
      title:       '📋 Poll Modes',
      description: 'Polls can use one or more of these modes — look for the badges on each poll.',
      color:       COLOR_ACTIVE,
      image:       { url: gi('modes') },
    },
    {
      title:       '✏️ Creating Polls',
      description: `Use \`/poll\` in chat, tap the **➕ Create Poll** button on the Polly dashboard message, or open the [web dashboard](${dashboard}) for the full editor with all options.\nYou need the **Poll Creator** role — ask an admin if you can't.`,
      color:       COLOR_ACTIVE,
      image:       { url: gi('create') },
      footer:      { text: 'Polly — polly.pudding.vip' },
    },
  ]

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({ embeds }),
    })
    if (!res.ok) return null
    const msg = await res.json() as { id: string }

    await fetch(`${DISCORD_API}/channels/${channelId}/pins/${msg.id}`, {
      method:  'PUT',
      headers: botHeaders(),
    })

    return msg.id
  } catch (e) {
    console.error('Guide post error:', e)
    return null
  }
}

// ─── Welcome / setup (admin-targeted) ────────────────────────────────────────

export async function sendWelcomeMessage(
  guildId: string,
  systemChannelId: string | null,
  ownerId: string,
  guildName: string,
): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return
  const siteUrl  = process.env.NEXTAUTH_URL ?? ''
  const settings = `${siteUrl}/dashboard/${guildId}/settings`

  const setupEmbed = {
    title:       `👋 Polly has joined ${guildName}!`,
    description: `Thanks for adding Polly! Here's a quick setup guide to get polls running in under a minute.`,
    color:       0x6366F1,
    fields: [
      {
        name:  '**Step 1** — Pick an announcement channel',
        value: 'Use the dropdown below to choose which channel polls get posted in automatically.',
      },
      {
        name:  '**Step 2** — (Optional) Restrict who can create polls',
        value: `Open [Settings](${settings}) to configure admin roles and voter roles.`,
      },
      {
        name:  '**Step 3** — Create your first poll!',
        value: `Visit the [dashboard](${siteUrl}/dashboard/${guildId}) or use \`/poll\` in any channel.`,
      },
      {
        name:  '**Step 4** — Register slash commands',
        value: `Go to [Settings](${settings}) → "Register Discord Commands" to enable \`/poll\` and \`/setup\`.`,
      },
    ],
    footer: { text: `This message is visible to the whole server — Polly` },
  }

  // DM the owner
  try {
    const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({ recipient_id: ownerId }),
    })
    if (dmRes.ok) {
      const { id: dmChannelId } = await dmRes.json() as { id: string }
      await fetch(`${DISCORD_API}/channels/${dmChannelId}/messages`, {
        method:  'POST',
        headers: botHeaders(),
        body:    JSON.stringify({ embeds: [setupEmbed] }),
      })
    }
  } catch (e) { console.error('DM welcome error:', e) }

  // Post to system channel with channel_select for instant setup
  if (systemChannelId) {
    try {
      await fetch(`${DISCORD_API}/channels/${systemChannelId}/messages`, {
        method:  'POST',
        headers: botHeaders(),
        body:    JSON.stringify({
          content: `<@${ownerId}> 👋 **Polly** is here! Pick your announcement channel to get started:`,
          embeds:  [setupEmbed],
          components: [
            {
              type: 1,
              components: [{
                type:          8,
                custom_id:     `setup:announce:${guildId}`,
                placeholder:   'Select announcement channel…',
                channel_types: [0],
              }],
            },
            {
              type: 1,
              components: [{
                type:  2,
                style: 5,
                label: '⚙️ Full Settings',
                url:   settings,
              }],
            },
          ],
        }),
      })
    } catch (e) { console.error('System channel welcome error:', e) }
  }
}

// ─── Dashboard refresh ────────────────────────────────────────────────────────

interface RefreshHints {
  closedPollIds?:  string[]   // treat these polls as closed regardless of KV state
  deletedPollIds?: string[]   // exclude these polls entirely
  newPoll?:        Poll       // ensure this poll is included if not already present
}

export async function refreshDashboard(guildId: string, hints?: RefreshHints): Promise<void> {
  const guild = await getGuild(guildId)
  if (!guild?.dashboardChannelId) return

  let polls = await getPolls(guildId)

  // Apply hints to compensate for KV eventual consistency
  if (hints?.closedPollIds?.length) {
    const ids = new Set(hints.closedPollIds)
    polls = polls.map(p => ids.has(p.id) ? { ...p, isClosed: true } : p)
  }
  if (hints?.deletedPollIds?.length) {
    const ids = new Set(hints.deletedPollIds)
    polls = polls.filter(p => !ids.has(p.id))
  }
  if (hints?.newPoll && !polls.some(p => p.id === hints.newPoll!.id)) {
    polls = [...polls, hints.newPoll]
  }

  const now         = new Date()
  const activePolls = polls.filter(p => !p.isClosed && (!p.closesAt || new Date(p.closesAt) > now))

  const newMsgId = await postOrUpdateDashboard(guild, activePolls)
  if (newMsgId && newMsgId !== guild.dashboardMessageId) {
    await upsertGuild({ ...guild, dashboardMessageId: newMsgId })
  }
}

// ─── Interaction response helpers ────────────────────────────────────────────

export function ephemeralReply(content: string) {
  return Response.json({ type: 4, data: { content, flags: 64 } })
}

export function ackUpdate(content: string) {
  return Response.json({ type: 7, data: { content, embeds: [], components: [] } })
}

export function updateMessage(embeds: object[], components: object[]) {
  return Response.json({ type: 7, data: { embeds, components } })
}

export function followUpEphemeral(content: string, components: object[]) {
  return Response.json({ type: 4, data: { content, components, flags: 64 } })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function winnerOf(poll: Poll, votes: Vote[]) {
  return poll.options.reduce((best, opt) => {
    const c = votes.filter(v => v.optionId === opt.id).length
    return c > votes.filter(v => v.optionId === best.id).length ? opt : best
  }, poll.options[0])
}

function topTimeSlot(poll: Poll, votes: Vote[], winnerOptionId?: string): string | null {
  if (!poll.includeTimeSlots || !poll.timeSlots.length) return null
  const relevant = winnerOptionId ? votes.filter(v => v.optionId === winnerOptionId) : votes
  let best: string | null = null
  let bestCount = 0
  for (const ts of poll.timeSlots) {
    const count = relevant.filter(v => v.timeSlot === ts).length
    if (count > bestCount) { best = ts; bestCount = count }
  }
  return best
}
