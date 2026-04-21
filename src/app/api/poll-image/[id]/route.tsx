import { ImageResponse } from 'next/og'
import { getPoll, getVotes } from '@/lib/polls'

const W      = 600
const INDIGO = '#818cf8'
const CYAN   = '#22d3ee'

function fmtTime(hhMM: string): string {
  const [h, m] = hhMM.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return hhMM
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

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

  // Multi-choice: % out of unique voters
  const uniqueVoters = new Set(votes.map(v => v.userId)).size
  const totalForPct  = poll.allowMultiple ? uniqueVoters : votes.length
  const footerTotal  = poll.allowMultiple ? uniqueVoters : votes.length
  const footerLabel  = poll.allowMultiple
    ? (footerTotal !== 1 ? 'voters' : 'voter')
    : (footerTotal !== 1 ? 'votes' : 'vote')

  // Limit options shown
  const MAX_OPTS   = 6
  const shown      = poll.options.slice(0, MAX_OPTS)
  const extraCount = poll.options.length - shown.length
  const n          = shown.length

  // Time slots
  const hasTimeSlots   = poll.includeTimeSlots && poll.timeSlots.length > 0
  const shownSlots     = hasTimeSlots ? poll.timeSlots.slice(0, 5) : []
  const totalTimeVotes = shownSlots.reduce((s, ts) => s + votes.filter(v => v.timeSlot === ts).length, 0)

  // Adaptive sizing based on option count
  const perOptH  = n <= 2 ? 96  : n <= 4 ? 82 : 68
  const optFSize = n <= 2 ? 26  : n <= 4 ? 23 : 20
  const stFSize  = n <= 2 ? 21  : n <= 4 ? 18 : 15
  const barH_px  = n <= 2 ? 11  : n <= 4 ? 9  : 8
  const nameFSz  = n <= 2 ? 15  : n <= 4 ? 13 : 12
  const optGap   = n <= 2 ? 10  : n <= 4 ? 8  : 6

  // Height — no outer padding, image fills edge to edge
  const PAD_V     = 26   // inner top/bottom padding
  const HEADER_H  = 88
  const FOOTER_H  = 50
  const EXTRA_H   = extraCount > 0 ? 26 : 0
  const TS_H      = hasTimeSlots ? (22 + shownSlots.length * 28) : 0  // label + rows
  const TS_SEP_H  = hasTimeSlots ? 16 : 0
  const H = PAD_V * 2 + HEADER_H + perOptH * n + EXTRA_H + TS_SEP_H + TS_H + FOOTER_H

  const closesLabel = poll.closesAt
    ? new Date(poll.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : ''

  const img = new ImageResponse(
    (
      // Full-bleed card — no outer wrapper, no rounded corners (Discord clips to a rect anyway)
      <div style={{
        display: 'flex', flexDirection: 'column',
        width: W, height: H,
        background: '#161630',
        border: `2px solid ${closed ? '#22d3ee' : '#818cf8'}`,
        padding: `${PAD_V}px 26px`,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
              <div style={{ width: 4, height: 8,  background: accent, borderRadius: 2, opacity: 0.8 }} />
              <div style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />
              <div style={{ width: 4, height: 11, background: accent, borderRadius: 2, opacity: 0.9 }} />
            </div>
            <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>{poll.title}</span>
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
                <span style={{ color: '#ffffff', fontSize: optFSize, fontWeight: 800 }}>{cleanText(opt.text)}</span>
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

        {extraCount > 0 && (
          <div style={{ display: 'flex', marginBottom: 6 }}>
            <span style={{ color: '#6666aa', fontSize: 13, fontStyle: 'italic' }}>
              +{extraCount} more {extraCount === 1 ? 'option' : 'options'}
            </span>
          </div>
        )}

        {/* Time slot section */}
        {hasTimeSlots && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: TS_SEP_H }}>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', marginBottom: 12 }} />
            <span style={{ color: '#8888bb', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 10 }}>
              PREFERRED TIMES
            </span>
            {shownSlots.map(ts => {
              const tsCount = votes.filter(v => v.timeSlot === ts).length
              const tsPct   = totalTimeVotes > 0 ? Math.round((tsCount / totalTimeVotes) * 100) : 0
              return (
                <div key={ts} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <span style={{ color: accent, fontSize: 14, fontWeight: 800, width: 44, flexShrink: 0 }}>
                    {fmtTime(ts)}
                  </span>
                  <div style={{
                    flex: 1, display: 'flex', height: 7,
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: 3, overflow: 'hidden',
                  }}>
                    {tsPct > 0 && <div style={{ width: `${tsPct}%`, background: accent, borderRadius: 3 }} />}
                  </div>
                  <span style={{ color: tsCount > 0 ? '#c8c8ee' : '#4444aa', fontSize: 13, fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0 }}>
                    {tsCount > 0 ? `×${tsCount}` : ''}
                  </span>
                </div>
              )
            })}
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
