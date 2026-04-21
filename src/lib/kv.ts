interface KVListResult {
  keys: { name: string; expiration?: number }[]
  list_complete: boolean
  cursor?: string
}

interface KVStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>
}

let _kv: KVStore | null = null

export async function getKV(): Promise<KVStore | null> {
  if (_kv) return _kv
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const ctx = getCloudflareContext()
    const kv  = (ctx.env as Record<string, unknown>).POLLY_KV as KVStore | undefined
    if (kv) _kv = kv
    return kv ?? null
  } catch {
    return null  // Don't cache failure — retry next call
  }
}
