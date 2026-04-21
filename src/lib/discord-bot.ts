import { Poll, Vote, Guild } from '@/types'
import { getGuild } from './guilds'

const DISCORD_API  = 'https://discord.com/api/v10'
const COLOR_ACTIVE = 0x6366F1  // indigo
const COLOR_CLOSED = 0x22D3EE  // cyan

function botHeaders() {
  return {
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

function pollImageUrl(pollId: string): string {
  return `${process.env.NEXTAUTH_URL}/api/poll-image/${pollId}?t=${Date.now()}`
}

function pollPageUrl(pollId: string): string {
  return `${process.env.NEXTAUTH_URL}/p/${pollId}`
}

function shortDate(iso?: string) {
  if (!iso) return 'open'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function utcHHMMtoDiscordTimestamp(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  const d = new Date()
  d.setUTCHours(h, m, 0, 0)
  if (d < new Date()) d.setUTCDate(d.getUTCDate() + 1)
  return `<t:${Math.floor(d.getTime() / 1000)}:t>`
}

function utcToLocal(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  const d = new Date()
  d.setUTCHours(h, m, 0, 0)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

// ─── Embed builders ──────────────────────────────────────────────────────────

export function buildPollEmbed(poll: Poll, votes: Vote[]) {
  const total   = votes.length
  const siteUrl = pollPageUrl(poll.id)
  const flags   = [
    poll.isAnonymous  ? '🔒 Anonymous' : null,
    poll.allowMultiple ? '☑️ Multi-choice' : null,
  ].filter(Boolean).join('  ·  ')

  const footerParts = [
    `${total} vote${total !== 1 ? 's' : ''}`,
    poll.closesAt ? `Closes ${shortDate(poll.closesAt)}` : 'No end date',
    poll.createdByName,
  ]
  if (flags) footerParts.push(flags)

  return {
    title:       poll.title,
    url:         siteUrl,
    description: poll.description ? `${poll.description}` : undefined,
    color:       COLOR_ACTIVE,
    image:       { url: pollImageUrl(poll.id) },
    footer:      { text: footerParts.join('  ·  ') },
    timestamp:   new Date().toISOString(),
  }
}

export function buildPollComponents(poll: Poll) {
  const rows: object[] = []

  // Up to 5 vote option buttons per row — split into rows of 5
  const optionButtons = poll.options.slice(0, 25).map(opt => ({
    type:      2,
    style:     1,
    label:     opt.text.slice(0, 80),
    custom_id: `v:${poll.id}:${opt.id}`,
  }))
  for (let i = 0; i < optionButtons.length; i += 5) {
    rows.push({ type: 1, components: optionButtons.slice(i, i + 5) })
  }

  // Website link button
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
  const timeButtons = poll.timeSlots.slice(0, 5).map(ts => ({
    type:      2,
    style:     2,
    label:     /^\d{2}:\d{2}$/.test(ts) ? utcToLocal(ts) : ts.slice(0, 80),
    custom_id: `t:${poll.id}:${optionId}:${ts}`,
  }))

  return [
    { type: 1, components: timeButtons },
    { type: 1, components: [{ type: 2, style: 2, label: 'No preference', custom_id: `skip:${poll.id}` }] },
  ]
}

export function buildTimeSlotFollowupContent(poll: Poll): string {
  const lines = poll.timeSlots.slice(0, 5).map(ts =>
    /^\d{2}:\d{2}$/.test(ts)
      ? `**${utcToLocal(ts)}** — ${utcHHMMtoDiscordTimestamp(ts)} your time`
      : `**${ts}**`
  )
  return `🕐 Pick a time preference:\n${lines.join('\n')}`
}

export function buildClosedEmbed(poll: Poll, votes: Vote[]) {
  const total   = votes.length
  const siteUrl = pollPageUrl(poll.id)
  const winner  = winnerOf(poll, votes)
  const slot    = topTimeSlot(poll, votes)

  const lines: string[] = []
  if (winner && total > 0) lines.push(`🏆 **${winner.text}** won with ${votes.filter(v => v.optionId === winner.id).length} vote${votes.filter(v => v.optionId === winner.id).length !== 1 ? 's' : ''}`)
  if (slot)               lines.push(`⏰ Most popular time: ${utcHHMMtoDiscordTimestamp(slot)}`)

  return {
    title:       `${poll.title} — Closed`,
    url:         siteUrl,
    description: lines.length ? lines.join('\n') : '*No votes were cast.*',
    color:       COLOR_CLOSED,
    image:       { url: pollImageUrl(poll.id) },
    footer:      { text: `Poll closed  ·  ${total} vote${total !== 1 ? 's' : ''}  ·  ${poll.createdByName}` },
    timestamp:   new Date().toISOString(),
  }
}

export function buildClosedPollComponents(poll: Poll): object[] {
  return [{
    type: 1,
    components: [{
      type:  2,
      style: 5,
      label: '📊 View full results',
      url:   pollPageUrl(poll.id),
    }],
  }]
}

// ─── Dashboard embed ──────────────────────────────────────────────────────────

export function buildDashboardEmbed(guild: Guild, activePolls: Poll[]) {
  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  const lines: string[] = []

  if (activePolls.length === 0) {
    lines.push('*No active polls right now.*')
  } else {
    for (const p of activePolls.slice(0, 8)) {
      const votes = 0 // placeholder — embed won't show counts (ephemeral detail)
      const closing = p.closesAt ? ` · closes <t:${Math.floor(new Date(p.closesAt).getTime() / 1000)}:R>` : ''
      lines.push(`**[${p.title}](${baseUrl}/p/${p.id})**${closing}`)
    }
  }

  return {
    title:       `📊 ${guild.guildName} — Polls`,
    description: lines.join('\n') || '*No polls yet.*',
    color:       0x6366F1,
    footer: {
      text: `${activePolls.length} active poll${activePolls.length !== 1 ? 's' : ''}  ·  Polly`,
    },
    timestamp: new Date().toISOString(),
  }
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

async function getGuildAnnounceChannel(guildId: string): Promise<string | null> {
  const guild = await getGuild(guildId)
  return guild?.announceChannelId ?? null
}

export async function postPollToDiscord(poll: Poll): Promise<string | null> {
  const channelId = await getGuildAnnounceChannel(poll.guildId)
  if (!process.env.DISCORD_BOT_TOKEN || !channelId) return null

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({ embeds: [buildPollEmbed(poll, [])], components: buildPollComponents(poll) }),
    })
    if (!res.ok) { console.error('Discord post failed:', await res.text()); return null }
    return ((await res.json()) as { id: string }).id
  } catch (e) {
    console.error('Discord post error:', e)
    return null
  }
}

export async function deletePollFromDiscord(poll: Poll): Promise<void> {
  const channelId = poll.discordChannelId ?? await getGuildAnnounceChannel(poll.guildId)
  if (!process.env.DISCORD_BOT_TOKEN || !channelId || !poll.discordMessageId) return
  try {
    await fetch(`${DISCORD_API}/channels/${channelId}/messages/${poll.discordMessageId}`, {
      method: 'DELETE', headers: botHeaders(),
    })
  } catch (e) { console.error('Discord delete error:', e) }
}

export async function updatePollInDiscord(poll: Poll, votes: Vote[]): Promise<boolean> {
  const channelId = poll.discordChannelId ?? await getGuildAnnounceChannel(poll.guildId)
  if (!process.env.DISCORD_BOT_TOKEN || !channelId || !poll.discordMessageId) return false

  const embed      = poll.isClosed ? buildClosedEmbed(poll, votes) : buildPollEmbed(poll, votes)
  const components = poll.isClosed ? buildClosedPollComponents(poll) : buildPollComponents(poll)

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${poll.discordMessageId}`, {
      method:  'PATCH',
      headers: botHeaders(),
      body:    JSON.stringify({ embeds: [embed], components }),
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

  const embed      = buildDashboardEmbed(guild, activePolls)
  const components = buildDashboardComponents(guild)
  const channelId  = guild.dashboardChannelId

  try {
    if (guild.dashboardMessageId) {
      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${guild.dashboardMessageId}`, {
        method: 'PATCH', headers: botHeaders(),
        body: JSON.stringify({ embeds: [embed], components }),
      })
      if (res.ok) return guild.dashboardMessageId
      if (res.status !== 404) return null
      // message was deleted — fall through to create
    }

    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST', headers: botHeaders(),
      body: JSON.stringify({ embeds: [embed], components }),
    })
    if (!res.ok) return null
    return ((await res.json()) as { id: string }).id
  } catch (e) {
    console.error('Dashboard post error:', e)
    return null
  }
}

// ─── Polly guide message ─────────────────────────────────────────────────────

export async function postPollyGuide(channelId: string, guildId: string): Promise<string | null> {
  if (!process.env.DISCORD_BOT_TOKEN) return null
  const siteUrl   = process.env.NEXTAUTH_URL ?? ''
  const dashboard = `${siteUrl}/dashboard/${guildId}`

  const embed = {
    title:       '📋 How Polly works',
    description: 'Polly lets admins create polls that appear right here in Discord. Members vote with the buttons on each poll message.',
    color:       0x6366F1,
    fields: [
      {
        name:   '🗳️ Voting',
        value:  'Click the option buttons on a poll message to cast your vote. You can also vote on the website using the **Vote on the website** button.',
        inline: false,
      },
      {
        name:   '➕ Creating polls',
        value:  `Admins can create polls from the [web dashboard](${dashboard}). New polls are automatically posted to the announcement channel.`,
        inline: false,
      },
      {
        name:   '📊 Results',
        value:  'Results update live on both Discord and the website as votes come in. The poll closes automatically on the set date, or an admin can close it early.',
        inline: false,
      },
      {
        name:   '⚙️ Settings',
        value:  `Server admins can configure announcement channels, voter roles, and more from the [dashboard settings](${dashboard}/settings).`,
        inline: false,
      },
    ],
    footer: { text: 'Polly — Discord poll bot' },
  }

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({ embeds: [embed] }),
    })
    if (!res.ok) return null
    const msg = await res.json() as { id: string }

    // Pin the guide message
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

// ─── Welcome / setup ─────────────────────────────────────────────────────────

export async function sendWelcomeMessage(
  guildId: string,
  systemChannelId: string | null,
  ownerId: string,
  guildName: string,
): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) return
  const siteUrl  = process.env.NEXTAUTH_URL ?? ''
  const settings = `${siteUrl}/dashboard/${guildId}/settings`

  const embed = {
    title:       `👋 Polly has joined ${guildName}!`,
    description: `Polly is ready to run polls in this server.\n\nAn admin needs to do a one-time setup before polls can be posted automatically.`,
    color:       0x6366F1,
    fields: [
      {
        name:  '⚙️ Setup (takes 30 seconds)',
        value: `[Open Server Settings](${settings})\n• Pick an **announcement channel** — polls will be posted there\n• Optionally restrict who can create polls or vote with **roles**`,
      },
    ],
    footer: { text: 'Only you can see this message — Polly' },
  }

  // DM the owner (only they can see it — fulfils "admin only")
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
        body:    JSON.stringify({ embeds: [embed] }),
      })
    }
  } catch (e) { console.error('DM welcome error:', e) }

  // Also post to the system channel (brief public notice)
  if (systemChannelId) {
    try {
      await fetch(`${DISCORD_API}/channels/${systemChannelId}/messages`, {
        method:  'POST',
        headers: botHeaders(),
        body:    JSON.stringify({
          content: `👋 **Polly** has been added to this server! Check your DMs for setup instructions, or visit [the dashboard](${settings}).`,
        }),
      })
    } catch (e) { console.error('System channel welcome error:', e) }
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

function topTimeSlot(poll: Poll, votes: Vote[]): string | null {
  if (!poll.includeTimeSlots || !poll.timeSlots.length) return null
  return poll.timeSlots.reduce((best, ts) =>
    votes.filter(v => v.timeSlot === ts).length > votes.filter(v => v.timeSlot === best).length ? ts : best,
    poll.timeSlots[0],
  )
}
