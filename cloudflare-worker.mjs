// Wrangler entry point — re-exports the OpenNext worker and adds the Cloudflare
// cron trigger handler. Using a wrapper here instead of post-build patching so
// the scheduled() export survives wrangler's bundling step.
export { default } from './.open-next/worker.js'
export * from './.open-next/worker.js'

export async function scheduled(event, env, ctx) {
  const baseUrl = (env && env.NEXTAUTH_URL) || 'https://polly.pudding.vip'
  const secret  = (env && env.CRON_SECRET)  || ''
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['Authorization'] = `Bearer ${secret}`
  ctx.waitUntil(
    fetch(`${baseUrl}/api/cron/polls`, { method: 'POST', headers })
      .then(r => { if (!r.ok) console.error('[cron] HTTP', r.status) })
      .catch(e => console.error('[cron] Error:', String(e)))
  )
}
