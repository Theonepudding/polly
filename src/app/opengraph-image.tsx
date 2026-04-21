import { ImageResponse } from 'next/og'

export const dynamic     = 'force-dynamic'
export const alt         = 'Polly — Discord Poll Bot'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

const INDIGO = '#818cf8'
const CYAN   = '#22d3ee'
const BG     = '#0a0a10'

export default async function OGImage() {
  return new ImageResponse(
    (
      <div style={{
        width: 1200, height: 630,
        background: BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Top glow */}
        <div style={{
          position: 'absolute', width: 900, height: 500, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)`,
          top: -250, left: 150, display: 'flex',
        }} />

        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, transparent, ${INDIGO}80, ${CYAN}80, ${INDIGO}80, transparent)`,
          display: 'flex',
        }} />

        {/* Center content */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          border: '1.5px solid rgba(129,140,248,0.25)', borderRadius: 28,
          padding: '64px 120px',
          background: 'rgba(255,255,255,0.03)',
        }}>
          {/* Logo mark */}
          <div style={{
            width: 72, height: 72, borderRadius: 20, border: '2px solid rgba(129,140,248,0.4)',
            background: 'rgba(99,102,241,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 36,
          }}>
            <div style={{ fontSize: 36, color: INDIGO, display: 'flex' }}>🗳️</div>
          </div>

          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20 }}>
            <span style={{ fontSize: 100, fontWeight: 700, color: '#f0f0ff', letterSpacing: '-2px', lineHeight: 1 }}>
              Polly
            </span>
          </div>

          {/* Subtitle */}
          <div style={{
            color: 'rgba(136,136,170,0.9)',
            fontSize: 24, letterSpacing: '0.15em', fontWeight: 600,
            marginBottom: 16,
          }}>
            DISCORD POLL BOT
          </div>

          {/* Tag line */}
          <div style={{
            color: 'rgba(255,255,255,0.30)', fontSize: 18, letterSpacing: '0.1em',
          }}>
            Create · Schedule · Vote · Repeat
          </div>

          {/* Bottom accent */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 48 }}>
            <div style={{ width: 80, height: 1, background: `rgba(34,211,238,0.3)`, display: 'flex' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: CYAN, opacity: 0.5, display: 'flex' }} />
            <div style={{ width: 80, height: 1, background: `rgba(34,211,238,0.3)`, display: 'flex' }} />
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
