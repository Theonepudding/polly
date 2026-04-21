import { ImageResponse } from 'next/og'
import { getPolls, getVotesByPoll } from '@/lib/polls'
import { getGuild } from '@/lib/guilds'

const W      = 600
const PAD_H  = 26
const PAD_V  = 26
const INDIGO = '#818cf8'

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 3500)
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(tid)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const u8  = new Uint8Array(buf)
    let bin = ''
    for (let i = 0; i < u8.byteLength; i++) bin += String.fromCharCode(u8[i])
    return `data:image/png;base64,${btoa(bin)}`
  } catch { return null }
}

async function buildEmojiMap(texts: string[]): Promise<Map<string, string>> {
  const map  = new Map<string, string>()
  const seen = new Set<string>()
  const jobs: Promise<void>[] = []
  for (const text of texts) {
    for (const m of text.matchAll(/<(a?):(\w+):(\d+)>/g)) {
      if (seen.has(m[3])) continue
      seen.add(m[3])
      const id = m[3]
      jobs.push(
        fetchAsBase64(`https://cdn.discordapp.com/emojis/${id}.png?size=32`)
          .then(uri => { if (uri) map.set(id, uri) })
      )
    }
  }
  await Promise.all(jobs)
  return map
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params
  const [guild, polls, votesByPoll] = await Promise.all([
    getGuild(guildId),
    getPolls(guildId),
    getVotesByPoll(guildId),
  ])

  const activePolls = polls
    .filter(p => !p.isClosed && (!p.closesAt || new Date(p.closesAt) > new Date()))
    .slice(0, 7)

  const guildName = guild?.guildName ?? 'Polls'
  const count     = activePolls.length

  const emojiMap = await buildEmojiMap([guildName, ...activePolls.map(p => p.title)])

  const HEADER_H = 72
  const FOOTER_H = 48
  const ROW_H    = 44
  const EMPTY_H  = 60
  const contentH = count === 0 ? EMPTY_H : count * ROW_H
  const H        = PAD_V * 2 + HEADER_H + 14 + contentH + FOOTER_H

  function shortDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  function SegText({ text, fontSize, fontWeight = 700, color = '#e8e8ff' }: {
    text: string; fontSize: number; fontWeight?: number; color?: string
  }) {
    const segments = text.split(/(<a?:\w+:\d+>)/g)
    return (
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
        {segments.map((seg, i) => {
          const m = seg.match(/^<(a?):(\w+):(\d+)>$/)
          if (m) {
            const uri = emojiMap.get(m[3])
            return uri
              ? <img key={i} src={uri} width={fontSize + 2} height={fontSize + 2} />
              : <span key={i} style={{ color: '#8888bb', fontSize: Math.round(fontSize * 0.75), fontWeight }}>:{m[2]}:</span>
          }
          return seg
            ? <span key={i} style={{ color, fontSize, fontWeight, lineHeight: 1.3 }}>{seg}</span>
            : null
        })}
      </div>
    )
  }

  const img = new ImageResponse(
    (
      <div style={{
        display: 'flex', flexDirection: 'column',
        width: W, height: H,
        background: '#161630',
        border: '2px solid rgba(129,140,248,0.4)',
        padding: `${PAD_V}px ${PAD_H}px`,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
              <div style={{ width: 4, height: 8,  background: INDIGO, borderRadius: 2, opacity: 0.8 }} />
              <div style={{ width: 4, height: 16, background: INDIGO, borderRadius: 2 }} />
              <div style={{ width: 4, height: 11, background: INDIGO, borderRadius: 2, opacity: 0.9 }} />
            </div>
            <SegText text={guildName} fontSize={22} fontWeight={800} color="#ffffff" />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: 'rgba(99,102,241,0.22)',
            border: `1.5px solid ${INDIGO}`,
            borderRadius: 30, padding: '5px 14px', marginLeft: 14,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: INDIGO }} />
            <span style={{ color: INDIGO, fontSize: 12, fontWeight: 700, letterSpacing: '0.07em' }}>
              {count} ACTIVE {count === 1 ? 'POLL' : 'POLLS'}
            </span>
          </div>
        </div>

        <div style={{ height: 1.5, background: 'rgba(129,140,248,0.3)', marginBottom: 14 }} />

        {/* Poll list */}
        {count === 0 ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#6060a0', fontSize: 15, fontStyle: 'italic' }}>No active polls right now</span>
          </div>
        ) : (
          activePolls.map(p => {
            const votes  = votesByPoll[p.id]?.length ?? 0
            const closes = p.closesAt ? shortDate(p.closesAt) : null
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center',
                marginBottom: 8, padding: '8px 14px',
                background: 'rgba(99,102,241,0.1)',
                borderRadius: 8,
                border: '1px solid rgba(129,140,248,0.2)',
                height: ROW_H - 8,
              }}>
                <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
                  <SegText text={p.title} fontSize={15} fontWeight={600} color="#ddddf8" />
                </div>
                <span style={{ color: '#8888cc', fontSize: 13, marginLeft: 12, flexShrink: 0 }}>
                  {votes} {votes === 1 ? 'vote' : 'votes'}{closes ? ` · closes ${closes}` : ''}
                </span>
              </div>
            )
          })
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12, marginTop: 'auto',
          borderTop: '1px solid rgba(255,255,255,0.15)',
        }}>
          <span style={{ color: '#c0c0e8', fontSize: 13 }}>Polly — Discord poll bot</span>
          <span style={{ color: '#7070a8', fontSize: 13 }}>
            Updated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>

      </div>
    ),
    { width: W, height: H },
  )

  return new Response(img.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}
