import { ImageResponse } from 'next/og'

export const alt         = 'Polly — Discord Poll Bot'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div style={{
        width: 1200, height: 630,
        background: 'linear-gradient(135deg, #08080f 0%, #0c0c18 60%, #080810 100%)',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>

        {/* Background glows */}
        <div style={{
          position: 'absolute', width: 800, height: 800, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 65%)',
          top: -300, left: -100, display: 'flex',
        }} />
        <div style={{
          position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 65%)',
          bottom: -200, right: 50, display: 'flex',
        }} />

        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, transparent 5%, #6366f1 35%, #22d3ee 65%, transparent 95%)',
          display: 'flex',
        }} />

        {/* Left panel — branding */}
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '0 40px 0 80px', width: 520, flexShrink: 0,
        }}>

          {/* P logo mark */}
          <div style={{
            width: 80, height: 80, borderRadius: 22,
            background: 'rgba(99,102,241,0.18)',
            border: '2px solid rgba(99,102,241,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 36,
          }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: '#818cf8', lineHeight: 1 }}>P</span>
          </div>

          {/* Wordmark */}
          <div style={{
            fontSize: 86, fontWeight: 800, color: '#eeeeff',
            letterSpacing: '-3px', lineHeight: 1, marginBottom: 18, display: 'flex',
          }}>
            Polly
          </div>

          {/* Label */}
          <div style={{
            fontSize: 18, fontWeight: 700, color: 'rgba(129,140,248,0.75)',
            letterSpacing: '0.18em', marginBottom: 28, display: 'flex',
          }}>
            DISCORD POLL BOT
          </div>

          {/* Tagline */}
          <div style={{
            fontSize: 19, color: 'rgba(255,255,255,0.38)',
            lineHeight: 1.55, display: 'flex',
          }}>
            Create polls, schedule events, and let your community vote — right inside Discord.
          </div>

          {/* Divider + URL */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 44 }}>
            <div style={{ width: 32, height: 1.5, background: 'rgba(34,211,238,0.35)', display: 'flex' }} />
            <span style={{ fontSize: 15, color: 'rgba(34,211,238,0.55)', letterSpacing: '0.05em' }}>polly.pudding.vip</span>
          </div>
        </div>

        {/* Right panel — mock Discord poll */}
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          flex: 1, padding: '0 72px 0 20px', gap: 12,
        }}>

          {/* Primary poll card */}
          <div style={{
            background: '#1e1f22',
            borderRadius: 14,
            display: 'flex', flexDirection: 'column',
            border: '1px solid rgba(255,255,255,0.07)',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', flexDirection: 'row' }}>
              {/* Left accent stripe */}
              <div style={{ width: 4, background: '#6366f1', flexShrink: 0, display: 'flex' }} />

              <div style={{ padding: '18px 18px 18px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Bot row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', background: '#5865f2',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: 'white', fontSize: 11, fontWeight: 800 }}>P</span>
                  </div>
                  <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 14 }}>Polly</span>
                  <div style={{
                    background: '#5865f2', color: 'white', fontSize: 9,
                    padding: '2px 5px', borderRadius: 4, fontWeight: 800, letterSpacing: '0.05em',
                    display: 'flex',
                  }}>APP</div>
                </div>

                {/* Question */}
                <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, marginBottom: 4, display: 'flex' }}>
                  Raid Night: Friday or Saturday?
                </div>
                <div style={{ color: '#878c98', fontSize: 13, marginBottom: 14, display: 'flex' }}>
                  6 votes · closes in 2 days
                </div>

                {/* Bars */}
                {[
                  { label: 'Friday',   pct: 50, votes: 3, active: true  },
                  { label: 'Saturday', pct: 33, votes: 2, active: false },
                  { label: 'Sunday',   pct: 17, votes: 1, active: false },
                ].map(opt => (
                  <div key={opt.label} style={{ marginBottom: 9, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{
                        color: opt.active ? '#818cf8' : '#dbdee1',
                        fontSize: 13, fontWeight: opt.active ? 700 : 400, display: 'flex',
                      }}>{opt.label}</span>
                      <span style={{ color: '#878c98', fontSize: 13, display: 'flex' }}>{opt.votes} · {opt.pct}%</span>
                    </div>
                    <div style={{
                      height: 6, background: '#2f3136', borderRadius: 3,
                      display: 'flex', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${opt.pct}%`, height: '100%',
                        background: opt.active ? '#6366f1' : '#4e5058', borderRadius: 3,
                        display: 'flex',
                      }} />
                    </div>
                  </div>
                ))}

                {/* Vote buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {['Friday', 'Saturday', 'Sunday'].map(label => (
                    <div key={label} style={{
                      background: '#383a40', color: '#dbdee1',
                      padding: '5px 13px', borderRadius: 4, fontSize: 13, display: 'flex',
                    }}>{label}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Secondary card — ghosted */}
          <div style={{
            background: '#1a1b1f',
            borderRadius: 10,
            display: 'flex', flexDirection: 'row',
            border: '1px solid rgba(255,255,255,0.04)',
            overflow: 'hidden',
            opacity: 0.55,
            marginLeft: 16,
          }}>
            <div style={{ width: 4, background: '#22d3ee', flexShrink: 0, display: 'flex' }} />
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#dbdee1', fontSize: 14, fontWeight: 600 }}>Movie Night pick</span>
              <span style={{ color: '#878c98', fontSize: 13 }}>· 9 votes · closes in 5 days</span>
            </div>
          </div>

        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
