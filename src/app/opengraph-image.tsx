import { ImageResponse } from 'next/og'

export const alt         = 'Polly — Discord Poll Bot'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div style={{
        width: 1200, height: 630,
        background: '#0b0b16',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>

        {/* Background glow */}
        <div style={{
          position: 'absolute', width: 900, height: 900, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 60%)',
          top: -300, left: -100, display: 'flex',
        }} />

        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg, transparent 5%, #6366f1 40%, #22d3ee 60%, transparent 95%)',
          display: 'flex',
        }} />

        {/* Left — branding */}
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '0 60px 0 100px', flex: 1,
        }}>

          {/* Wordmark */}
          <div style={{
            fontSize: 110, fontWeight: 900, color: '#eeeeff',
            letterSpacing: '-4px', lineHeight: 1, display: 'flex', marginBottom: 20,
          }}>
            Polly
          </div>

          {/* Label */}
          <div style={{
            fontSize: 22, fontWeight: 700, color: 'rgba(129,140,248,0.80)',
            letterSpacing: '0.2em', display: 'flex',
          }}>
            DISCORD POLL BOT
          </div>

        </div>

        {/* Right — abstract poll bars */}
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          gap: 22, padding: '0 100px 0 40px', width: 440,
        }}>
          {[
            { pct: 72, alpha: 1.0,  color: '#6366f1' },
            { pct: 52, alpha: 0.75, color: '#6366f1' },
            { pct: 36, alpha: 0.55, color: '#6366f1' },
            { pct: 18, alpha: 0.35, color: '#6366f1' },
          ].map((bar, i) => (
            <div key={i} style={{
              height: 32, borderRadius: 8,
              background: `rgba(99,102,241,${bar.alpha})`,
              width: `${bar.pct}%`,
              display: 'flex',
            }} />
          ))}
        </div>

      </div>
    ),
    { width: 1200, height: 630 },
  )
}
