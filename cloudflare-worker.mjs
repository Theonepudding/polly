// Wrangler entry point — wraps the OpenNext worker and adds the cron handler
// inside the default export object (required by Cloudflare Workers ES Module format;
// named exports are stripped by the Workers Assets deployment layer).
// Uses env.SELF (service binding) to call /api/cron/polls internally — avoids
// HTTP 522 that occurs when a Worker fetches its own custom domain via the internet.
import worker from './.open-next/worker.js'

export default {
  fetch: (req, env, ctx) => worker.fetch(req, env, ctx),

  async scheduled(event, env, ctx) {
    const baseUrl = (env && env.NEXTAUTH_URL) || 'https://polly.pudding.vip'
    const secret  = (env && env.CRON_SECRET)  || ''
    const headers = { 'Content-Type': 'application/json' }
    if (secret) headers['Authorization'] = `Bearer ${secret}`

    const fetcher = (env && env.SELF) ? env.SELF : globalThis
    ctx.waitUntil(
      fetcher.fetch(new Request(`${baseUrl}/api/cron/polls`, { method: 'POST', headers }))
        .then(r => { if (!r.ok) console.error('[cron] HTTP', r.status) })
        .catch(e => console.error('[cron] Error:', String(e)))
    )
  },
}
