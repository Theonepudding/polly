import { Poll, Vote, Guild } from '@/types'
import { getGuild } from './guilds'

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

function utcToLocal(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  const d = new Date()
  d.setUTCHours(h, m, 0, 0)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

function roleMentions(roleIds?: string[]): string {
  if (!roleIds?.length) return ''
  return roleIds.map(id => `<@&${id}>`).join(' ')
}

// ─── Embed builders ──────────────────────────────────────────────────────────

export function buildPollEmbed(poll: Poll, votes: Vote[]) {
  const total   = votes.length
  const siteUrl = pollPageUrl(poll.id)
  const flags   = [
    poll.isAnonymous   ? '🔒 Anonymous' : null,
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
    description: poll.description
      ? `${poll.description}${poll.closesAt ? `\n\nCloses ${discordTimestamp(poll.closesAt)}` : ''}`
      : poll.closesAt ? `Closes ${discordTimestamp(poll.closesAt)}` : undefined,
    color:       COLOR_ACTIVE,
    image:       { url: pollImageUrl(poll.id) },
    footer:      { text: footerParts.join('  ·  ') },
    timestamp:   new Date().toISOString(),
  }
}

export function buildPollComponents(poll: Poll) {
  const rows: object[] = []

  const optionButtons = poll.options.slice(0, 25).map(opt => ({
    type:      2,
    style:     1,
    label:     opt.text.slice(0, 80),
    custom_id: `v:${poll.id}:${opt.id}`,
  }))
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
  if (slot) lines.push(`⏰ Most popular time: ${utcHHMMtoDiscordTimestamp(slot)}`)

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
      const closing = p.closesAt ? ` · closes ${discordTimestamp(p.closesAt)}` : ''
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
        embeds:     [buildPollEmbed(poll, [])],
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

// ─── Poll results announcement ────────────────────────────────────────────────

export async function postPollResults(poll: Poll, votes: Vote[], guild: Guild): Promise<string | null> {
  const channelId = poll.overrideChannelId ?? guild.announceChannelId
  if (!process.env.DISCORD_BOT_TOKEN || !channelId) return null

  const total  = votes.length
  const winner = total > 0 ? winnerOf(poll, votes) : null

  const results = poll.options.map(opt => {
    const count = votes.filter(v => v.optionId === opt.id).length
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0
    const bar   = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
    return `${opt.id === winner?.id && total > 0 ? '🏆 ' : ''}**${opt.text}** — ${count} vote${count !== 1 ? 's' : ''} (${pct}%)\n\`${bar}\``
  }).join('\n\n')

  const embed = {
    title:       `📊 Results: ${poll.title}`,
    url:         pollPageUrl(poll.id),
    description: results || '*No votes were cast.*',
    color:       COLOR_RESULT,
    footer:      { text: `${total} total vote${total !== 1 ? 's' : ''}  ·  Created by ${poll.createdByName}  ·  Polly` },
    timestamp:   new Date().toISOString(),
  }

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({ embeds: [embed] }),
    })
    if (!res.ok) return null
    return ((await res.json()) as { id: string }).id
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
  const channelId = poll.overrideChannelId ?? guild.announceChannelId
  if (!process.env.DISCORD_BOT_TOKEN || !channelId) return

  const pingContent = roleMentions(poll.pingRoleIds)

  try {
    await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method:  'POST',
      headers: botHeaders(),
      body:    JSON.stringify({
        content: `${pingContent ? pingContent + ' ' : ''}⏰ **Less than 24 hours left to vote!**`,
        embeds:  [buildPollEmbed(poll, [])],
        components: buildPollComponents(poll),
        allowed_mentions: poll.pingRoleIds?.length
          ? { roles: poll.pingRoleIds }
          : { parse: [] },
      }),
    })
  } catch (e) { console.error('Reminder error:', e) }
}

// ─── Polly guide message ─────────────────────────────────────────────────────

export async function postPollyGuide(channelId: string, guildId: string): Promise<string | null> {
  if (!process.env.DISCORD_BOT_TOKEN) return null
  const siteUrl   = process.env.NEXTAUTH_URL ?? ''
  const dashboard = `${siteUrl}/dashboard/${guildId}`

  const embed = {
    title:       '📋 How Polly works',
    description: 'Polly lets admins create polls that appear right here in Discord. Members vote with the buttons on each poll message.',
    color:       COLOR_ACTIVE,
    fields: [
      {
        name:   '🗳️ Voting',
        value:  'Click the option buttons on a poll message to cast your vote. You can vote or change your vote any time before the poll closes. You can also vote on the website using the **Vote on the website** button.',
        inline: false,
      },
      {
        name:   '➕ Creating polls',
        value:  `Admins can create polls via the [web dashboard](${dashboard}) or with the \`/poll\` command. New polls are automatically posted to this channel.`,
        inline: false,
      },
      {
        name:   '⚙️ Setup',
        value:  `Use \`/setup\` to pick channels, or open [Dashboard Settings](${dashboard}/settings) for full configuration.`,
        inline: false,
      },
      {
        name:   '📊 Results',
        value:  'Results update live on both Discord and the website as votes come in. When a poll closes, results are announced automatically.',
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
