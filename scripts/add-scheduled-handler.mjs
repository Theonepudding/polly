// Post-build script: appends a `scheduled` export to the opennext worker so
// Cloudflare's cron trigger (wrangler.toml [triggers]) actually fires the
// /api/cron/polls endpoint. Without this, the scheduled event is swallowed.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workerPath = join(__dirname, '../.open-next/worker.js')

if (!existsSync(workerPath)) {
  console.error('❌  .open-next/worker.js not found — run build:cf first.')
  process.exit(1)
}

const MARKER = '/* __polly_cron__ */'
const content = readFileSync(workerPath, 'utf8')

if (content.includes(MARKER)) {
  console.log('⏭  Scheduled handler already present, skipping.')
  process.exit(0)
}

const patch = `

${MARKER}
export async function scheduled(event, env, ctx) {
  const baseUrl = (env && env.NEXTAUTH_URL) || 'https://polly.pudding.vip'
  const secret  = (env && env.CRON_SECRET)  || ''
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['Authorization'] = \`Bearer \${secret}\`
  ctx.waitUntil(
    fetch(\`\${baseUrl}/api/cron/polls\`, { method: 'POST', headers })
      .then(r => { if (!r.ok) console.error('[cron] HTTP', r.status) })
      .catch(e => console.error('[cron] Error:', String(e)))
  )
}
`

writeFileSync(workerPath, content + patch)
console.log('✓  Patched .open-next/worker.js with scheduled cron handler.')
