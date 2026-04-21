interface KVStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

let _kv: KVStore | null | undefined = undefined

export async function getKV(): Promise<KVStore | null> {
  if (_kv !== undefined) return _kv
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const ctx = getCloudflareContext()
    const kv = (ctx.env as Record<string, unknown>).POLLY_KV as KVStore | undefined
    _kv = kv ?? null
  } catch {
    _kv = null
  }
  return _kv
}
