interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ success: boolean; meta: Record<string, unknown> }>
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<{ results: unknown[]; success: boolean }[]>
}

let _d1: D1Database | null = null

export async function getD1(): Promise<D1Database | null> {
  if (_d1) return _d1
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const ctx = getCloudflareContext()
    const d1 = (ctx.env as Record<string, unknown>).POLLY_D1 as D1Database | undefined
    if (d1) _d1 = d1
    return d1 ?? null
  } catch {
    return null
  }
}
