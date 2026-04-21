import { ImageResponse } from 'next/og'
import { getPolls, getVotesByPoll } from '@/lib/polls'
import { getGuild } from '@/lib/guilds'

const W      = 1200
const INDIGO = '#818cf8'

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
  const H         = Math.max(420, 200 + count * 88 + 80)

  function shortDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

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
            border:        '2px solid rgba(129,140,248,0.4)',
            padding:       '44px 52px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                <div style={{ width: 8, height: 14, background: INDIGO, borderRadius: 4, opacity: 0.85 }} />
                <div style={{ width: 8, height: 28, background: INDIGO, borderRadius: 4 }} />
                <div style={{ width: 8, height: 20, background: INDIGO, borderRadius: 4, opacity: 0.9 }} />
              </div>
              <span style={{ color: '#ffffff', fontSize: 40, fontWeight: 700 }}>{guildName}</span>
            </div>
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          10,
                background:   'rgba(99,102,241,0.18)',
                border:       '2px solid rgba(129,140,248,0.6)',
                borderRadius: 60,
                padding:      '8px 24px',
                flexShrink:   0,
                marginLeft:   28,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: INDIGO }} />
              <span style={{ color: INDIGO, fontSize: 20, fontWeight: 700, letterSpacing: '0.08em' }}>
                {count} ACTIVE {count === 1 ? 'POLL' : 'POLLS'}
              </span>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', marginBottom: 28 }} />

          {/* Poll list */}
          {count === 0 ? (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#555577', fontSize: 30, fontStyle: 'italic' }}>No active polls right now</span>
            </div>
          ) : (
            activePolls.map(p => {
              const votes   = votesByPoll[p.id]?.length ?? 0
              const closes  = p.closesAt ? shortDate(p.closesAt) : null

              return (
                <div
                  key={p.id}
                  style={{
                    display:       'flex',
                    alignItems:    'center',
                    marginBottom:  14,
                    padding:       '14px 24px',
                    background:    'rgba(99,102,241,0.08)',
                    borderRadius:  16,
                    border:        '1px solid rgba(129,140,248,0.18)',
                  }}
                >
                  <span style={{ color: '#e0e0ff', fontSize: 26, fontWeight: 600, flex: 1, overflow: 'hidden' }}>{p.title}</span>
                  <span style={{ color: '#7878aa', fontSize: 20, marginLeft: 24, flexShrink: 0 }}>
                    {votes} {votes === 1 ? 'vote' : 'votes'}{closes ? `  ·  closes ${closes}` : ''}
                  </span>
                </div>
              )
            })
          )}

          {/* Footer */}
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              paddingTop:     22,
              marginTop:      'auto',
              borderTop:      '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <span style={{ color: '#bbbbdd', fontSize: 20 }}>Polly — Discord poll bot</span>
            <span style={{ color: '#555577', fontSize: 20 }}>
              Updated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
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
