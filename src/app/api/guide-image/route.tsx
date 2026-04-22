import { ImageResponse } from 'next/og'

const W      = 600
const INDIGO = '#818cf8'
const CYAN   = '#22d3ee'
const BG     = '#161630'
const PAD    = 22

function imgHeaders() {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=604800, s-maxage=604800',
  }
}

// ─── Voting explainer ─────────────────────────────────────────────────────────

function renderVoting(): Response {
  const H    = 322
  const opts = [
    { label: 'London', pct: 58, count: 11 },
    { label: 'Berlin', pct: 26, count:  5 },
    { label: 'Online', pct: 16, count:  3 },
  ]

  const img = new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: W, height: H, background: BG, border: `2px solid ${INDIGO}`, padding: `${PAD}px 26px` }}>

        {/* Section label + status pill */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ color: INDIGO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em' }}>HOW TO VOTE</span>
          <div style={{ display: 'flex', background: 'rgba(99,102,241,0.15)', border: `1px solid ${INDIGO}55`, borderRadius: 20, padding: '3px 10px' }}>
            <span style={{ color: INDIGO, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em' }}>OPEN</span>
          </div>
        </div>

        {/* Mock poll question */}
        <span style={{ color: '#e8e8ff', fontSize: 17, fontWeight: 700, marginBottom: 14, lineHeight: 1.2 }}>
          Where should we hold next month's meetup?
        </span>

        {/* Options with live-results bars */}
        {opts.map((opt, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: 'rgba(99,102,241,0.2)', border: '1.5px solid rgba(129,140,248,0.35)', borderRadius: 5 }}>
                  <span style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
                </div>
                <span style={{ color: '#d8d8f8', fontSize: 15, fontWeight: 600 }}>{opt.label}</span>
              </div>
              <span style={{ color: opt.pct > 40 ? INDIGO : '#6068a8', fontSize: 14, fontWeight: 700 }}>
                {opt.pct}% · {opt.count}
              </span>
            </div>
            <div style={{ display: 'flex', height: 7, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ display: 'flex', width: `${opt.pct}%`, background: opt.pct > 40 ? INDIGO : '#4a50a0', borderRadius: 3 }} />
            </div>
          </div>
        ))}

        {/* Discord-style vote buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          {opts.map((opt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(88,101,242,0.22)', border: '1.5px solid rgba(88,101,242,0.5)', borderRadius: 6, padding: '7px 16px' }}>
              <span style={{ color: '#c5c9ff', fontSize: 13, fontWeight: 800 }}>{i + 1}</span>
              <span style={{ color: '#dde0ff', fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
            </div>
          ))}
          <span style={{ color: '#50508a', fontSize: 12, fontWeight: 600, marginLeft: 4 }}>← tap to vote</span>
        </div>

        {/* Footer tip */}
        <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ color: '#50608a', fontSize: 11, fontWeight: 600 }}>
            Results update live · change your vote anytime before the poll closes
          </span>
        </div>

      </div>
    ),
    { width: W, height: H, emoji: 'twemoji' },
  )

  return new Response(img.body, { status: 200, headers: imgHeaders() })
}

// ─── Poll modes explainer ─────────────────────────────────────────────────────

function renderModes(): Response {
  const H     = 282
  const modes = [
    { emoji: '👁',  name: 'Anonymous',    color: '#a5b4fc', bg: 'rgba(99,102,241,0.1)',   border: 'rgba(129,140,248,0.22)', desc: 'Hides who voted for what — only totals visible' },
    { emoji: '✅',  name: 'Multi-choice', color: '#6ee7b7', bg: 'rgba(16,185,129,0.09)',  border: 'rgba(52,211,153,0.22)',  desc: 'Members can select more than one option' },
    { emoji: '👻',  name: 'Ghost Mode',   color: '#d8b4fe', bg: 'rgba(168,85,247,0.1)',   border: 'rgba(192,132,252,0.22)', desc: 'Results stay hidden until the poll closes' },
    { emoji: '🕐',  name: 'Time Slots',   color: '#fde68a', bg: 'rgba(245,158,11,0.09)',  border: 'rgba(251,191,36,0.2)',   desc: 'Members also pick a preferred meeting time' },
  ]

  const img = new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: W, height: H, background: BG, border: `2px solid ${INDIGO}`, padding: `${PAD}px 24px` }}>

        <span style={{ color: INDIGO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', marginBottom: 14 }}>POLL MODES</span>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {modes.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', width: 256, background: m.bg, border: `1.5px solid ${m.border}`, borderRadius: 10, padding: '12px 14px', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 15 }}>{m.emoji}</span>
                <span style={{ color: m.color, fontSize: 14, fontWeight: 700 }}>{m.name}</span>
              </div>
              <span style={{ color: 'rgba(168,168,215,0.68)', fontSize: 12, fontWeight: 500 }}>{m.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ color: '#50608a', fontSize: 11, fontWeight: 600 }}>
            Modes can be combined — e.g. anonymous + multi-choice + ghost
          </span>
        </div>

      </div>
    ),
    { width: W, height: H, emoji: 'twemoji' },
  )

  return new Response(img.body, { status: 200, headers: imgHeaders() })
}

// ─── Creating a poll explainer ────────────────────────────────────────────────

function renderCreate(): Response {
  const H = 296

  const img = new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: W, height: H, background: BG, border: `2px solid ${INDIGO}`, padding: `${PAD}px 24px` }}>

        <span style={{ color: INDIGO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', marginBottom: 14 }}>CREATING A POLL</span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

          {/* /poll command */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(99,102,241,0.09)', border: '1.5px solid rgba(129,140,248,0.2)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ display: 'flex', background: 'rgba(99,102,241,0.22)', borderRadius: 6, padding: '4px 10px', flexShrink: 0 }}>
              <span style={{ color: INDIGO, fontSize: 14, fontWeight: 800 }}>/poll</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#a5b4fc', fontSize: 13, fontWeight: 700 }}>Discord command</span>
              <span style={{ color: 'rgba(160,160,210,0.58)', fontSize: 11 }}>Quick polls in any channel — set a title, options, and duration.</span>
            </div>
          </div>

          {/* ➕ Create Poll button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(16,185,129,0.07)', border: '1.5px solid rgba(52,211,153,0.2)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ display: 'flex', background: 'rgba(16,185,129,0.18)', borderRadius: 6, padding: '4px 10px', flexShrink: 0 }}>
              <span style={{ color: '#6ee7b7', fontSize: 14, fontWeight: 800 }}>➕ Create Poll</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#6ee7b7', fontSize: 13, fontWeight: 700 }}>Dashboard channel button</span>
              <span style={{ color: 'rgba(160,160,210,0.58)', fontSize: 11 }}>The button on the Polly dashboard message in Discord.</span>
            </div>
          </div>

          {/* Web dashboard */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(34,211,238,0.05)', border: '1.5px solid rgba(34,211,238,0.17)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ display: 'flex', background: 'rgba(34,211,238,0.1)', borderRadius: 6, padding: '4px 10px', flexShrink: 0 }}>
              <span style={{ color: CYAN, fontSize: 14, fontWeight: 800 }}>Dashboard</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#67e8f9', fontSize: 13, fontWeight: 700 }}>Web editor</span>
              <span style={{ color: 'rgba(160,160,210,0.58)', fontSize: 11 }}>Full options: ghost mode, multi-choice, time slots, role pings.</span>
            </div>
          </div>

        </div>

        <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ color: '#50608a', fontSize: 11, fontWeight: 600 }}>
            You need the Poll Creator role — ask an admin if you cannot create polls
          </span>
        </div>

      </div>
    ),
    { width: W, height: H, emoji: 'twemoji' },
  )

  return new Response(img.body, { status: 200, headers: imgHeaders() })
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const type = new URL(req.url).searchParams.get('type') ?? 'voting'
  if (type === 'modes')  return renderModes()
  if (type === 'create') return renderCreate()
  return renderVoting()
}
