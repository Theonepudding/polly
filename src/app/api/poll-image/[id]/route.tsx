import { ImageResponse } from 'next/og'
import { getPoll, getVotes } from '@/lib/polls'

const W      = 1200
const INDIGO = '#818cf8'
const CYAN   = '#22d3ee'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const [poll, votes] = await Promise.all([getPoll(id), getVotes(id)])
  if (!poll) return new Response('Not found', { status: 404 })

  const total  = votes.length
  const closed = poll.isClosed || (poll.closesAt ? new Date(poll.closesAt) <= new Date() : false)

  // Strip leading emoji from option text (handles old polls that stored "✅ Yes" / "❌ No")
  const cleanText = (s: string) => s.replace(/^[\u{2000}-\u{27FF}\u{1F000}-\u{1FAFF}]+\s*/u, '').trim() || s
  const accent = closed ? CYAN : INDIGO
  const H      = Math.max(560, 160 + poll.options.length * 168 + 100)

  const closesLabel = poll.closesAt
    ? new Date(poll.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : ''

  const img = new ImageResponse(
    (
      <div
        style={{
          display:    'flex',
          width:      W,
          height:     H,
          background: 'linear-gradient(145deg, #0d0d18 0%, #161625 100%)',
          padding:    28,
        }}
      >
        <div
          style={{
            display:       'flex',
            flexDirection: 'column',
            flex:          1,
            background:    'linear-gradient(180deg, #161625 0%, #1e1e30 100%)',
            borderRadius:  28,
            border:        `2px solid ${closed ? 'rgba(34,211,238,0.4)' : 'rgba(129,140,248,0.4)'}`,
            padding:       '44px 52px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                <div style={{ width: 8, height: 14, background: accent, borderRadius: 4, opacity: 0.85 }} />
                <div style={{ width: 8, height: 28, background: accent, borderRadius: 4 }} />
                <div style={{ width: 8, height: 20, background: accent, borderRadius: 4, opacity: 0.9 }} />
              </div>
              <span style={{ color: '#ffffff', fontSize: 40, fontWeight: 700 }}>{poll.title}</span>
            </div>
            <div style={{
              display:      'flex',
              alignItems:   'center',
              gap:          10,
              flexShrink:   0,
              background:   closed ? 'rgba(34,211,238,0.15)' : 'rgba(99,102,241,0.18)',
              border:       `2px solid ${accent}99`,
              borderRadius: 60,
              padding:      '8px 24px',
              marginLeft:   28,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} />
              <span style={{ color: accent, fontSize: 20, fontWeight: 700, letterSpacing: '0.08em' }}>
                {closed ? 'CLOSED' : 'OPEN'}
              </span>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', marginBottom: 32 }} />

          {/* Options */}
          {poll.options.map((opt) => {
            const count  = votes.filter(v => v.optionId === opt.id).length
            const pct    = total > 0 ? Math.round((count / total) * 100) : 0
            const voters = poll.isAnonymous ? [] : votes.filter(v => v.optionId === opt.id).map(v => v.username)
            const names  = voters.slice(0, 6).join(' · ') + (voters.length > 6 ? ` +${voters.length - 6}` : '')

            return (
              <div key={opt.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ color: '#f0f0ff', fontSize: 29, fontWeight: 600 }}>{cleanText(opt.text)}</span>
                  <span style={{ color: count > 0 ? accent : '#9999bb', fontSize: 25, fontWeight: 700 }}>
                    {pct}% · {count} {count === 1 ? 'vote' : 'votes'}
                  </span>
                </div>
                <div style={{
                  display:      'flex',
                  height:       16,
                  background:   'rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  overflow:     'hidden',
                  marginBottom: voters.length > 0 ? 10 : 0,
                }}>
                  {pct > 0 && (
                    <div style={{
                      width:        `${pct}%`,
                      background:   `linear-gradient(90deg, ${accent}cc, ${accent})`,
                      borderRadius: 8,
                    }} />
                  )}
                </div>
                {voters.length > 0 && (
                  <span style={{ color: '#aaaacc', fontSize: 20 }}>{names}</span>
                )}
              </div>
            )
          })}

          {/* Footer */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            paddingTop:     22,
            marginTop:      'auto',
            borderTop:      '1px solid rgba(255,255,255,0.12)',
          }}>
            <span style={{ color: '#bbbbdd', fontSize: 22 }}>
              {total} {total === 1 ? 'vote' : 'votes'} · Polly
            </span>
            {!closed && closesLabel && (
              <span style={{ color: '#bbbbdd', fontSize: 22 }}>closes {closesLabel}</span>
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
