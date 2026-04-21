import { getKV } from './kv'

const KEY = 'bot-admins'

interface BotAdminData {
  authorizedUserIds: string[]
}

function defaultData(): BotAdminData {
  const ids = (process.env.BOT_ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return { authorizedUserIds: ids }
}

export async function getBotAdmins(): Promise<BotAdminData> {
  const kv = await getKV()
  if (kv) {
    const raw = await kv.get(KEY)
    if (raw) return JSON.parse(raw) as BotAdminData
  }
  return defaultData()
}

async function saveBotAdmins(data: BotAdminData): Promise<void> {
  const kv = await getKV()
  if (kv) await kv.put(KEY, JSON.stringify(data))
}

export async function isBotAdmin(userId: string): Promise<boolean> {
  const data = await getBotAdmins()
  return data.authorizedUserIds.includes(userId)
}

export async function addBotAdmin(userId: string): Promise<void> {
  const data = await getBotAdmins()
  if (!data.authorizedUserIds.includes(userId)) {
    data.authorizedUserIds.push(userId)
    await saveBotAdmins(data)
  }
}

export async function removeBotAdmin(userId: string): Promise<void> {
  const data = await getBotAdmins()
  data.authorizedUserIds = data.authorizedUserIds.filter(id => id !== userId)
  await saveBotAdmins(data)
}
