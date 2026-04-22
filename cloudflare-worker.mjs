// Wrangler entry point — wraps the OpenNext worker and adds the cron handler
// inside the default export object (required by Cloudflare Workers ES Module format;
// named export `scheduled` is stripped by the Workers Assets deployment layer).
import worker from './.open-next/worker.js'

export default {
  fetch: (req, env, ctx) => worker.fetch(req, env, ctx),

  async scheduled(event, env, ctx) {
    const baseUrl = (env && env.NEXTAUTH_URL) || 'https://polly.pudding.vip'
    const secret  = (env && env.CRON_SECRET)  || ''
    const headers = { 'Content-Type': 'application/json' }
    if (secret) headers['Authorization'] = `Bearer ${secret}`
    ctx.waitUntil(
      fetch(`${baseUrl}/api/cron/polls`, { method: 'POST', headers })
        .then(r => { if (!r.ok) console.error('[cron] HTTP', r.status) })
        .catch(e => console.error('[cron] Error:', String(e)))
    )
  },
}
