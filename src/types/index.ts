// ─── Guild ──────────────────────────────────────────────────────────────────

export interface Guild {
  guildId: string
  guildName: string
  guildIcon?: string       // Discord icon hash
  ownerId: string          // Discord user ID who set up the bot for this server
  adminRoleIds: string[]   // roles that can manage/delete any poll
  creatorRoleIds: string[] // roles that can create polls (empty = same as adminRoleIds logic)
  voterRoleIds: string[]   // roles that can vote (empty = everyone)
  announceChannelId?: string
  pollyChannelId?: string
  guideMessage?: string
  dashboardChannelId?: string
  dashboardMessageId?: string
  auditLogChannelId?: string
  createdAt: string
  updatedAt: string
}

export interface GuildWithMeta extends Guild {
  memberCount?: number
  activePollCount?: number
  userIsAdmin: boolean
}

// ─── Poll ────────────────────────────────────────────────────────────────────

export interface PollOption {
  id: string
  text: string
  buttonNum?: number    // Discord button label number (1-25); defaults to 1-indexed order
  buttonEmoji?: string  // Discord button emoji code e.g. "<:name:id>"; defaults to emoji extracted from text
}

export interface Poll {
  id: string
  guildId: string
  title: string
  description?: string
  options: PollOption[]
  includeTimeSlots: boolean
  timeSlots: string[]       // "HH:MM"
  isAnonymous: boolean
  allowMultiple: boolean
  isGhost: boolean
  createdBy: string         // Discord user ID
  createdByName: string
  createdAt: string         // ISO
  closesAt?: string         // ISO — undefined = manual close only
  isClosed: boolean
  discordMessageId?: string | null
  discordChannelId?: string | null
  pingRoleIds?: string[]
  overrideChannelId?: string
  reminderSent?: boolean
  lastReminderAt?: string  // ISO — manual reminder cooldown
}

export interface Vote {
  pollId: string
  userId: string
  username: string
  optionId: string
  timeSlot?: string
  votedAt: string
}

export interface PollsData {
  polls: Poll[]
  votes: Vote[]
}

// ─── Scheduled Poll ──────────────────────────────────────────────────────────

export interface ScheduledPoll {
  id: string
  guildId: string
  title: string
  description?: string
  options: PollOption[]
  includeTimeSlots: boolean
  timeSlots: string[]
  isAnonymous: boolean
  allowMultiple: boolean
  daysOpen: number
  createdBy: string
  createdByName: string
  createdAt: string
  intervalDays: number
  atHour: number            // UTC 0–23 (legacy; prefer atLocalHHMM + timezone)
  atLocalHHMM?: string      // local time string "HH:MM" — used for DST-correct scheduling
  timezone?: string         // IANA timezone e.g. "Europe/London"
  nextRunAt: string         // ISO
  lastRunAt: string | null
  active: boolean
  postToDiscord: boolean
}

// ─── Bot Admin ───────────────────────────────────────────────────────────────

export interface BotAdmin {
  discordId: string
  addedAt: string
}

// ─── Discord API ─────────────────────────────────────────────────────────────

export interface DiscordUser {
  id: string
  username: string
  discriminator: string
  avatar?: string
  global_name?: string
}

export interface DiscordGuildMember {
  user: DiscordUser
  nick?: string
  roles: string[]
  joined_at: string
}

export interface DiscordGuild {
  id: string
  name: string
  icon?: string
  owner: boolean
  permissions: string
}
