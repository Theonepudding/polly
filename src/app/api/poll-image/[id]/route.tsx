import { ImageResponse } from 'next/og'
import { getPoll, getVotes } from '@/lib/polls'

const W      = 600
const INDIGO = '#818cf8'
const CYAN   = '#22d3ee'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const [poll, votes] = await Promise.all([getPoll(id), getVotes(id)])
  if (!poll) return new Response('Not found', { status: 404 })

  const closed = poll.isClosed || (poll.closesAt ? new Date(poll.closesAt) <= new Date() : false)
  const cleanText = (s: string) => s.replace(/^[\u{2000}-\u{27FF}\u{1F000}-\u{1FAFF}]+\s*/u, '').trim() || s
  const accent = closed ? CYAN : INDIGO

  // For multi-choice, percentages are out of unique voters not raw vote count
  const uniqueVoters = new Set(votes.map(v => v.userId)).size
  const totalForPct  = poll.allowMultiple ? uniqueVoters : votes.length
  const footerTotal  = poll.allowMultiple ? uniqueVoters : votes.length
  const footerLabel  = poll.allowMultiple
    ? (footerTotal !== 1 ? 'voters' : 'voter')
    : (footerTotal !== 1 ? 'votes' : 'vote')

  // Limit to 6 options max
  const MAX_OPTS   = 6
  const shown      = poll.options.slice(0, MAX_OPTS)
  const extraCount = poll.options.length - shown.length
  const n          = shown.length

  // Adaptive sizing based on option count
  const perOptH  = n <= 2 ? 100 : n <= 4 ? 84 : 70
  const optFSize = n <= 2 ? 26  : n <= 4 ? 23 : 20
  const stFSize  = n <= 2 ? 21  : n <= 4 ? 18 : 15
  const barH_px  = n <= 2 ? 11  : n <= 4 ? 9  : 8
  const nameFSz  = n <= 2 ? 16  : n <= 4 ? 14 : 12
  const optGap   = n <= 2 ? 10  : n <= 4 ? 8  : 6

  const OUTER_PAD = 14
  const INNER_V   = 26
  const HEADER_H  = 90
  const FOOTER_H  = 52
  const EXTRA_H   = extraCount > 0 ? 28 : 0
  const H = OUTER_PAD * 2 + INNER_V * 2 + HEADER_H + perOptH * n + EXTRA_H + FOOTER_H

  const closesLabel = poll.closesAt
    ? new Date(poll.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : ''

  const img = new ImageResponse(
    (
      <div style={{
        display: 'flex', width: W, height: H,
        background: 'linear-gradient(145deg, #0a0a16 0%, #13132a 100%)',
        padding: OUTER_PAD,
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          background: 'linear-gradient(180deg, #151535 0%, #1c1c42 100%)',
          borderRadius: 16,
          border: `2px solid ${closed ? 'rgba(34,211,238,0.75)' : 'rgba(129,140,248,0.75)'}`,
          padding: `${INNER_V}px 26px`,
        }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <div style={{ width: 4, height: 8,  background: accent, borderRadius: 2, opacity: 0.8 }} />
                <div style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />
                <div style={{ width: 4, height: 11, background: accent, borderRadius: 2, opacity: 0.9 }} />
              </div>
              <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{poll.title}</span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              background: closed ? 'rgba(34,211,238,0.18)' : 'rgba(99,102,241,0.22)',
              border: `1.5px solid ${accent}`,
              borderRadius: 30, padding: '5px 14px', marginLeft: 12,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
              <span style={{ color: accent, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' }}>
                {closed ? 'CLOSED' : 'OPEN'}
              </span>
            </div>
          </div>

          <div style={{ height: 1.5, background: `${accent}55`, marginBottom: 14 }} />

          {/* Options */}
          {shown.map((opt) => {
            const count  = votes.filter(v => v.optionId === opt.id).length
            const pct    = totalForPct > 0 ? Math.round((count / totalForPct) * 100) : 0
            const voters = poll.isAnonymous ? [] : votes.filter(v => v.optionId === opt.id).map(v => v.username)
            const names  = voters.slice(0, 5).join(' · ') + (voters.length > 5 ? ` +${voters.length - 5}` : '')

            return (
              <div key={opt.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: optGap }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ color: '#ffffff', fontSize: optFSize, fontWeight: 600 }}>{cleanText(opt.text)}</span>
                  <span style={{ color: count > 0 ? accent : '#6666aa', fontSize: stFSize, fontWeight: 700, marginLeft: 12, flexShrink: 0 }}>
                    {pct}%{count > 0 ? ` · ${count}` : ''}
                  </span>
                </div>
                <div style={{
                  display: 'flex', height: barH_px,
                  background: 'rgba(255,255,255,0.18)',
                  borderRadius: 4, overflow: 'hidden',
                  marginBottom: voters.length > 0 ? 5 : 0,
                }}>
                  {pct > 0 && (
                    <div style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${accent}bb, ${accent})`,
                      borderRadius: 4,
                    }} />
                  )}
                </div>
                {voters.length > 0 && (
                  <span style={{ color: '#b0b0e0', fontSize: nameFSz }}>{names}</span>
                )}
              </div>
            )
          })}

          {extraCount > 0 && (
            <div style={{ display: 'flex', marginBottom: 8 }}>
              <span style={{ color: '#7777aa', fontSize: 14, fontStyle: 'italic' }}>
                +{extraCount} more {extraCount === 1 ? 'option' : 'options'}
              </span>
            </div>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 12, marginTop: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.18)',
          }}>
            <span style={{ color: '#c8c8ee', fontSize: 14 }}>
              {footerTotal} {footerLabel} · Polly
            </span>
            {!closed && closesLabel && (
              <span style={{ color: '#c8c8ee', fontSize: 14 }}>closes {closesLabel}</span>
            )}
          </div>

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
