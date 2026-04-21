import { ImageResponse } from 'next/og'
import { getPoll, getVotes } from '@/lib/polls'

const W      = 600
const INDIGO = '#818cf8'
const CYAN   = '#22d3ee'
const PAD_H  = 26
const PAD_V  = 26

function fmtTime(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return hhMM
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const buf  = await res.arrayBuffer()
    const u8   = new Uint8Array(buf)
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
      // Always PNG — Satori renders static images only
      jobs.push(
        fetchAsBase64(`https://cdn.discordapp.com/emojis/${id}.png?size=32`)
          .then(uri => { if (uri) map.set(id, uri) })
      )
    }
  }
  await Promise.all(jobs)
  return map
}

function stripLeadingEmoji(s: string): string {
  return s.replace(/^[\u{2000}-\u{27FF}\u{1F000}-\u{1FAFF}]+\s*/u, '').trim() || s
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const page = parseInt(new URL(req.url).searchParams.get('p') ?? '0', 10)

  const [poll, votes] = await Promise.all([getPoll(id), getVotes(id)])
  if (!poll) return new Response('Not found', { status: 404 })

  const closed     = poll.isClosed || (poll.closesAt ? new Date(poll.closesAt) <= new Date() : false)
  const accent     = closed ? CYAN : INDIGO
  const needsP2    = poll.options.length > 6
  const pageOpts   = needsP2
    ? (page === 0 ? poll.options.slice(0, 6) : poll.options.slice(6))
    : poll.options
  const isLastPage = !needsP2 || page === 1

  const hasTimeSlots = isLastPage && poll.includeTimeSlots && poll.timeSlots.length > 0
  const shownSlots   = hasTimeSlots ? poll.timeSlots : []

  const allTexts = [poll.title, ...pageOpts.map(o => o.text)]
  const emojiMap = await buildEmojiMap(allTexts)

  const uniqueVoters = new Set(votes.map(v => v.userId)).size
  const totalForPct  = poll.allowMultiple ? uniqueVoters : votes.length
  const footerTotal  = poll.allowMultiple ? uniqueVoters : votes.length
  const footerLabel  = poll.allowMultiple
    ? (footerTotal !== 1 ? 'voters' : 'voter')
    : (footerTotal !== 1 ? 'votes' : 'vote')

  const n = pageOpts.length

  const perOptH  = n <= 2 ? 96  : n <= 4 ? 82 : 68
  const optFSize = n <= 2 ? 26  : n <= 4 ? 23 : 20
  const stFSize  = n <= 2 ? 21  : n <= 4 ? 18 : 15
  const barH_px  = n <= 2 ? 11  : n <= 4 ? 9  : 8
  const nameFSz  = n <= 2 ? 15  : n <= 4 ? 13 : 12
  const optGap   = n <= 2 ? 10  : n <= 4 ? 8  : 6

  const HEADER_H  = 88
  const FOOTER_H  = 50
  const slotRows  = hasTimeSlots ? Math.ceil(shownSlots.length / 5) : 0
  const TS_H      = hasTimeSlots ? 22 + 10 + slotRows * 36 + 8 : 0
  const TS_SEP_H  = hasTimeSlots ? 16 : 0
  const H = PAD_V * 2 + HEADER_H + perOptH * n + TS_SEP_H + TS_H + FOOTER_H

  const closesLabel = poll.closesAt
    ? new Date(poll.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : ''

  // Render mixed text/emoji as a Satori-compatible flex row
  function SegText({ text, fontSize, fontWeight = 800, color = '#ffffff' }: {
    text: string; fontSize: number; fontWeight?: number; color?: string
  }) {
    const cleaned  = stripLeadingEmoji(text)
    const segments = cleaned.split(/(<a?:\w+:\d+>)/g)
    return (
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
        {segments.map((seg, i) => {
          const m = seg.match(/^<(a?):(\w+):(\d+)>$/)
          if (m) {
            const uri = emojiMap.get(m[3])
            return uri
              ? <img key={i} src={uri} width={fontSize + 4} height={fontSize + 4} />
              : <span key={i} style={{ color: '#8888bb', fontSize: Math.round(fontSize * 0.75), fontWeight }}>:{m[2]}:</span>
          }
          return seg
            ? <span key={i} style={{ color, fontSize, fontWeight, lineHeight: 1.2 }}>{seg}</span>
            : null
        })}
      </div>
    )
  }

  const statusLabel = closed ? 'CLOSED' : needsP2 ? (page === 0 ? 'OPEN 1/2' : 'OPEN 2/2') : 'OPEN'

  const img = new ImageResponse(
    (
      <div style={{
        display: 'flex', flexDirection: 'column',
        width: W, height: H,
        background: '#161630',
        border: `2px solid ${closed ? '#22d3ee' : '#818cf8'}`,
        padding: `${PAD_V}px ${PAD_H}px`,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
              <div style={{ width: 4, height: 8,  background: accent, borderRadius: 2, opacity: 0.8 }} />
              <div style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />
              <div style={{ width: 4, height: 11, background: accent, borderRadius: 2, opacity: 0.9 }} />
            </div>
            <SegText text={poll.title} fontSize={28} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: closed ? 'rgba(34,211,238,0.18)' : 'rgba(99,102,241,0.22)',
            border: `1.5px solid ${accent}`,
            borderRadius: 30, padding: '5px 14px', marginLeft: 12,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
            <span style={{ color: accent, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' }}>
              {statusLabel}
            </span>
          </div>
        </div>

        <div style={{ height: 1.5, background: `${accent}55`, marginBottom: 14 }} />

        {/* Options */}
        {pageOpts.map((opt) => {
          const count  = votes.filter(v => v.optionId === opt.id).length
          const pct    = totalForPct > 0 ? Math.round((count / totalForPct) * 100) : 0
          const voters = poll.isAnonymous ? [] : votes.filter(v => v.optionId === opt.id).map(v => v.username)
          const names  = voters.slice(0, 4).join(' · ') + (voters.length > 4 ? ` +${voters.length - 4}` : '')

          return (
            <div key={opt.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: optGap }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <SegText text={opt.text} fontSize={optFSize} />
                <span style={{ color: count > 0 ? accent : '#5555aa', fontSize: stFSize, fontWeight: 800, marginLeft: 12, flexShrink: 0 }}>
                  {pct}%{count > 0 ? ` · ${count}` : ''}
                </span>
              </div>
              <div style={{
                display: 'flex', height: barH_px,
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 3, overflow: 'hidden',
                marginBottom: voters.length > 0 ? 5 : 0,
              }}>
                {pct > 0 && <div style={{ width: `${pct}%`, background: accent, borderRadius: 3 }} />}
              </div>
              {voters.length > 0 && (
                <span style={{ color: '#a0a0d0', fontSize: nameFSz }}>{names}</span>
              )}
            </div>
          )
        })}

        {/* Time slots — compact chip grid */}
        {hasTimeSlots && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: TS_SEP_H }}>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', marginBottom: 12 }} />
            <span style={{ color: '#8888bb', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 10 }}>
              PREFERRED TIMES
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {shownSlots.map(ts => {
                const tsCount  = votes.filter(v => v.timeSlot === ts).length
                const hasVotes = tsCount > 0
                return (
                  <div key={ts} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: hasVotes ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${hasVotes ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 20, padding: '4px 12px',
                  }}>
                    <span style={{ color: hasVotes ? '#22d3ee' : '#6666aa', fontSize: 14, fontWeight: 700 }}>
                      {fmtTime(ts)}
                    </span>
                    {hasVotes && (
                      <span style={{ color: '#a0a0d0', fontSize: 12, fontWeight: 600 }}>×{tsCount}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12, marginTop: 'auto',
          borderTop: '1px solid rgba(255,255,255,0.15)',
        }}>
          <span style={{ color: '#b8b8e0', fontSize: 14 }}>
            {footerTotal} {footerLabel} · Polly
          </span>
          {!closed && closesLabel && (
            <span style={{ color: '#b8b8e0', fontSize: 14 }}>closes {closesLabel}</span>
          )}
        </div>

      </div>
    ),
    { width: W, height: H },
  )

  return new Response(img.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
    },
  })
}
