import { ImageResponse } from 'next/og'
import { getPoll, getVotes } from '@/lib/polls'
import type { Poll, Vote } from '@/types'

const W      = 600
const INDIGO = '#818cf8'
const CYAN   = '#22d3ee'
const GHOST  = '#a855f7'
const PAD_H  = 26
const PAD_V  = 26

// Slots are stored as UTC "HH:MM" or arbitrary text labels — display as-is in the image
// (the image is static for all Discord viewers so there's no single correct local timezone)
function fmtSlot(s: string): string { return s }

function isClockSlot(s: string): boolean { return /^\d{2}:\d{2}$/.test(s) }

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 3500)
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(tid)
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

// ─── Results image (winner announcement style) ───────────────────────────────

async function renderResultsImage(poll: Poll, votes: Vote[]): Promise<Response> {
  const RW   = 600
  const CYAN = '#22d3ee'
  const PAD_H = 26
  const PAD_V = 24

  const totalVotes  = votes.length
  const uniqueVoters = new Set(votes.map(v => v.userId)).size
  const totalForPct  = poll.allowMultiple ? uniqueVoters : totalVotes
  const noVotes      = totalVotes === 0

  const sortedOpts = [...poll.options].sort((a, b) =>
    votes.filter(v => v.optionId === b.id).length - votes.filter(v => v.optionId === a.id).length
  )
  const topCount = noVotes ? 0 : votes.filter(v => v.optionId === sortedOpts[0]?.id).length
  const winners  = topCount > 0
    ? sortedOpts.filter(o => votes.filter(v => v.optionId === o.id).length === topCount)
    : []
  const runnerUps = sortedOpts.filter(o => !winners.some(w => w.id === o.id)).slice(0, 5)
  const hasRunnerUps = runnerUps.length > 0 && !noVotes

  const emojiMap = await buildEmojiMap([...winners.map(o => o.text), ...runnerUps.map(o => o.text)])

  function RSegText({ text, fontSize, fontWeight = 700, color = '#f0f0ff' }: {
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
          return seg ? <span key={i} style={{ color, fontSize, fontWeight, lineHeight: 1.2 }}>{seg}</span> : null
        })}
      </div>
    )
  }

  // Height calculation
  const HEADER_H       = 40 + 14 + 1 + 20   // row + margin + divider + margin
  const WINNER_LABEL_H = 20 + 10
  function winnerCardH(w: Poll['options'][0]): number {
    const voterCount = !poll.isAnonymous ? votes.filter(v => v.optionId === w.id).length : 0
    return 28 + 32 + 10 + 12 + 8 + 18 + (voterCount > 0 ? 18 + 6 : 0) // padding + text + gap + bar + gap + count + optional voters
  }
  const winnersH    = noVotes ? 0 : winners.reduce((s, w, i) => s + winnerCardH(w) + (i > 0 ? 10 : 0), 0)
  const runnerUpsH  = hasRunnerUps ? 18 + 18 + 10 + runnerUps.length * 41 : 0
  const FOOTER_H    = 12 + 20 + PAD_V
  const NO_VOTES_H  = 80
  const contentH    = HEADER_H + (noVotes ? NO_VOTES_H : WINNER_LABEL_H + winnersH + runnerUpsH) + FOOTER_H
  const H           = Math.max(340, 3 + PAD_V + contentH)

  const img = new ImageResponse(
    (
      <div style={{
        display: 'flex', flexDirection: 'column',
        width: RW, height: H,
        background: '#0c0c1e',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Cyan accent bar */}
        <div style={{
          display: 'flex', height: 3,
          background: `linear-gradient(90deg, transparent, ${CYAN}bb, ${CYAN}, ${CYAN}bb, transparent)`,
        }} />

        {/* Top glow */}
        <div style={{
          position: 'absolute', display: 'flex',
          width: RW, height: 260,
          background: `radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.13) 0%, transparent 65%)`,
          top: 0, left: 0,
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: `${PAD_V}px ${PAD_H}px` }}>

          {/* Header: title + CLOSED badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ color: 'rgba(180,180,220,0.5)', fontSize: 14, fontWeight: 600, flex: 1 }}>
              {poll.title.length > 55 ? poll.title.slice(0, 55) + '…' : poll.title}
            </span>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              background: 'rgba(34,211,238,0.09)',
              border: '1px solid rgba(34,211,238,0.3)',
              borderRadius: 20, padding: '4px 12px', marginLeft: 12,
            }}>
              <div style={{ display: 'flex', width: 5, height: 5, borderRadius: '50%', background: CYAN }} />
              <span style={{ color: CYAN, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em' }}>CLOSED</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', height: 1, background: 'rgba(34,211,238,0.18)', marginBottom: 20 }} />

          {noVotes ? (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'rgba(140,140,190,0.5)', fontSize: 18, fontWeight: 600 }}>No votes were cast</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* WINNER label */}
              <span style={{ color: CYAN, fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', marginBottom: 10 }}>
                {winners.length > 1 ? 'TIED WINNERS' : 'WINNER'}
              </span>

              {/* Winner card(s) */}
              {winners.map((winner, i) => {
                const count      = votes.filter(v => v.optionId === winner.id).length
                const pct        = totalForPct > 0 ? Math.round((count / totalForPct) * 100) : 0
                const allVoters  = !poll.isAnonymous ? votes.filter(v => v.optionId === winner.id).map(v => v.username) : []
                const shown      = allVoters.slice(0, 5)
                const extra      = allVoters.length > 5 ? ` +${allVoters.length - 5}` : ''
                const voterStr   = shown.join(' · ') + extra
                return (
                  <div key={winner.id} style={{
                    display: 'flex', flexDirection: 'column',
                    background: 'rgba(34,211,238,0.07)',
                    border: '1.5px solid rgba(34,211,238,0.28)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    marginBottom: i < winners.length - 1 ? 10 : 0,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
                        <RSegText text={winner.text} fontSize={24} />
                      </div>
                      <span style={{ color: CYAN, fontSize: 26, fontWeight: 800, marginLeft: 16, flexShrink: 0, letterSpacing: '-0.5px' }}>
                        {pct}%
                      </span>
                    </div>
                    <div style={{
                      display: 'flex', height: 12,
                      background: 'rgba(34,211,238,0.12)',
                      borderRadius: 6, overflow: 'hidden', marginBottom: 8,
                    }}>
                      <div style={{
                        display: 'flex', width: `${pct}%`,
                        background: `linear-gradient(90deg, rgba(34,211,238,0.65), ${CYAN})`,
                        borderRadius: 6,
                      }} />
                    </div>
                    {shown.length > 0 && (
                      <span style={{ color: 'rgba(140,195,210,0.7)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        {voterStr}
                      </span>
                    )}
                    <span style={{ color: 'rgba(34,211,238,0.5)', fontSize: 12, fontWeight: 700 }}>
                      {count} {count !== 1 ? 'votes' : 'vote'}
                    </span>
                  </div>
                )
              })}

              {/* Runner-ups */}
              {hasRunnerUps && (
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
                  <span style={{ color: 'rgba(120,120,175,0.4)', fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', marginBottom: 10 }}>
                    OTHER RESULTS
                  </span>
                  {runnerUps.map(opt => {
                    const count = votes.filter(v => v.optionId === opt.id).length
                    const pct   = totalForPct > 0 ? Math.round((count / totalForPct) * 100) : 0
                    return (
                      <div key={opt.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <RSegText text={opt.text} fontSize={14} fontWeight={600} color="rgba(160,160,210,0.62)" />
                          <span style={{ color: 'rgba(120,120,175,0.55)', fontSize: 13, fontWeight: 700, marginLeft: 12, flexShrink: 0 }}>
                            {pct}%{count > 0 ? ` · ${count}` : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                          {pct > 0 && <div style={{ display: 'flex', width: `${pct}%`, background: 'rgba(129,140,248,0.4)', borderRadius: 2 }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 12, marginTop: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{ color: 'rgba(100,100,160,0.6)', fontSize: 12, fontWeight: 600 }}>
              {totalVotes} {totalVotes !== 1 ? 'votes' : 'vote'} · Polly
            </span>
            <span style={{ color: 'rgba(34,211,238,0.3)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
              polly.pudding.vip
            </span>
          </div>

        </div>
      </div>
    ),
    { width: RW, height: H, emoji: 'twemoji' },
  )

  return new Response(img.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, s-maxage=300, max-age=300',
    },
  })
}

// ─── Active poll image ────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const urlObj  = new URL(req.url)
  const page    = parseInt(urlObj.searchParams.get('p') ?? '0', 10)
  const forcedH = parseInt(urlObj.searchParams.get('h') ?? '0', 10) || 0

  const [poll, votes] = await Promise.all([getPoll(id), getVotes(id)])
  if (!poll) return new Response('Not found', { status: 404 })

  if (urlObj.searchParams.get('results') === '1') {
    return renderResultsImage(poll, votes)
  }

  const closed     = poll.isClosed || (poll.closesAt ? new Date(poll.closesAt) <= new Date() : false)
  const ghostMode  = !!(poll.isGhost && !closed)
  const accent     = closed ? CYAN : (ghostMode ? GHOST : INDIGO)
  const needsP2    = poll.options.length > 6
  const pageOpts   = needsP2
    ? (page === 0 ? poll.options.slice(0, 6) : poll.options.slice(6))
    : poll.options
  const isLastPage = !needsP2 || page === 1

  const hasTimeSlots = isLastPage && poll.includeTimeSlots && poll.timeSlots.length > 0
  const shownSlots   = hasTimeSlots ? poll.timeSlots : []

  // Include buttonEmoji codes so they get fetched alongside text emojis
  const btnEmojiCodes = pageOpts.map(o => o.buttonEmoji ?? '').filter(Boolean)
  const allTexts = [poll.title, ...pageOpts.map(o => o.text), ...btnEmojiCodes]
  const emojiMap = await buildEmojiMap(allTexts)

  const uniqueVoters = new Set(votes.map(v => v.userId)).size
  const totalForPct  = poll.allowMultiple ? uniqueVoters : votes.length
  const footerTotal  = poll.allowMultiple ? uniqueVoters : votes.length
  const footerLabel  = poll.allowMultiple
    ? (footerTotal !== 1 ? 'voters' : 'voter')
    : (footerTotal !== 1 ? 'votes' : 'vote')

  // Fixed font sizes — same on every page so both embeds look identical in density
  const optFSize = 22
  const stFSize  = 17
  const barH_px  = 9
  const nameFSz  = 13
  const optGap   = 8

  const isAnon  = poll.isAnonymous
  const BADGE_H = 30
  const HEADER_H = 88
  const FOOTER_H = 50
  const MIN_H    = 460

  function optRowH(opt: { id: string }): number {
    const voterCount = isAnon || ghostMode ? 0 : votes.filter(v => v.optionId === opt.id).length
    const lineH = Math.max(optFSize + 4, BADGE_H)
    return lineH + 7 + (ghostMode ? 0 : barH_px) + (voterCount > 0 ? nameFSz + 5 : 0) + optGap
  }

  // Calculate the canvas height for ANY set of options + whether time slots appear.
  // Used for both pages so we can pick the SAME height for the whole poll — otherwise
  // Discord sees different aspect ratios per page and renders them at different widths.
  const allTimeSlots = poll.timeSlots
  function calcH(opts: typeof pageOpts, showTimeSlots: boolean): number {
    const optsH  = opts.reduce((sum, o) => sum + optRowH(o), 0)
    const _rows  = showTimeSlots ? Math.ceil(allTimeSlots.length / 5) : 0
    const _TS_H  = showTimeSlots ? 26 + _rows * 30 - 8 : 0
    const _SEP_H = showTimeSlots ? 16 : 0
    return Math.max(MIN_H, PAD_V * 2 + HEADER_H + optsH + _SEP_H + _TS_H + FOOTER_H)
  }

  // For 2-page polls both pages must have the same H so Discord scales them identically.
  // discord-bot.ts pre-computes the max height and passes it as ?h=NNN so both pages
  // always get the same canvas height even when rendered in separate requests.
  const pollHasTimeSlots = poll.includeTimeSlots && allTimeSlots.length > 0
  const computedH = needsP2
    ? Math.max(
        calcH(poll.options.slice(0, 6), false),
        calcH(poll.options.slice(6),    pollHasTimeSlots),
      )
    : calcH(pageOpts, hasTimeSlots)
  const H = forcedH > 0 ? Math.max(forcedH, MIN_H) : computedH

  const optsAreaH = pageOpts.reduce((sum, opt) => sum + optRowH(opt), 0)
  const slotRows  = hasTimeSlots ? Math.ceil(shownSlots.length / 5) : 0
  const TS_H      = hasTimeSlots ? 26 + slotRows * 30 - 8 : 0
  const TS_SEP_H  = hasTimeSlots ? 16 : 0

  const closesLabel = poll.closesAt
    ? new Date(poll.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : ''

  const maxSlotVoteCount = hasTimeSlots
    ? Math.max(0, ...shownSlots.map(ts => votes.filter(v => v.timeSlot === ts).length))
    : 0
  const hasClockSlots = hasTimeSlots && shownSlots.some(isClockSlot)

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

  const statusLabel = closed ? 'CLOSED' : (ghostMode ? 'GHOST' : 'OPEN')

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
        {pageOpts.map((opt, optIdx) => {
          const count  = votes.filter(v => v.optionId === opt.id).length
          const pct    = totalForPct > 0 ? Math.round((count / totalForPct) * 100) : 0
          const voters = poll.isAnonymous || ghostMode ? [] : votes.filter(v => v.optionId === opt.id).map(v => v.username)
          const names  = voters.slice(0, 4).join(' · ') + (voters.length > 4 ? ` +${voters.length - 4}` : '')

          // Button badge: custom emoji > custom number > default 1-based index
          const btnEmojiCode  = opt.buttonEmoji ?? ''
          const btnEmojiId    = btnEmojiCode.match(/^<a?:\w+:(\d+)>$/)?.[1]
          const btnEmojiUri   = btnEmojiId ? emojiMap.get(btnEmojiId) : null
          const btnLabel      = String(opt.buttonNum ?? (optIdx + 1))

          // Ghost badge colours differ from normal
          const badgeBg      = ghostMode ? 'rgba(168,85,247,0.18)' : 'rgba(99,102,241,0.22)'
          const badgeBorder  = ghostMode ? '1.5px solid rgba(168,85,247,0.4)' : '1.5px solid rgba(129,140,248,0.4)'
          const badgeColor   = ghostMode ? '#d8b4fe' : '#a5b4fc'

          return (
            <div key={opt.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: optGap }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: ghostMode ? 0 : 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  {/* Button number / emoji badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                    minWidth: btnEmojiUri ? 40 : 28, height: 28, borderRadius: 6, flexShrink: 0,
                    padding: '0 6px',
                    background: badgeBg,
                    border: badgeBorder,
                  }}>
                    <span style={{ color: badgeColor, fontSize: 13, fontWeight: 800 }}>{btnLabel}</span>
                    {btnEmojiUri && <img src={btnEmojiUri} width={14} height={14} />}
                  </div>
                  <SegText text={opt.text} fontSize={optFSize} />
                </div>
                {!ghostMode && (
                  <span style={{ color: count > 0 ? accent : '#5555aa', fontSize: stFSize, fontWeight: 800, marginLeft: 12, flexShrink: 0 }}>
                    {pct}%{count > 0 ? ` · ${count}` : ''}
                  </span>
                )}
              </div>
              {!ghostMode && (
                <div style={{
                  display: 'flex', height: barH_px,
                  background: 'rgba(255,255,255,0.18)',
                  borderRadius: 3, overflow: 'hidden',
                  marginBottom: voters.length > 0 ? 5 : 0,
                }}>
                  {pct > 0 && <div style={{ width: `${pct}%`, background: accent, borderRadius: 3 }} />}
                </div>
              )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#9090bb', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em' }}>
                PREFERRED
              </span>
              {hasClockSlots && (
                <span style={{
                  color: '#5a5a7a', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 4, padding: '1px 5px',
                  display: 'flex',
                }}>UTC</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {shownSlots.map(ts => {
                const tsCount  = votes.filter(v => v.timeSlot === ts).length
                const hasVotes = !ghostMode && tsCount > 0
                const isTop    = !ghostMode && maxSlotVoteCount > 0 && tsCount === maxSlotVoteCount
                return (
                  <div key={ts} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: isTop
                      ? 'rgba(34,211,238,0.22)'
                      : hasVotes ? 'rgba(34,211,238,0.11)' : 'rgba(255,255,255,0.08)',
                    border: `${isTop ? '2px' : '1px'} solid ${
                      isTop ? 'rgba(34,211,238,0.85)' : hasVotes ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.22)'
                    }`,
                    borderRadius: 20, padding: isTop ? '3px 11px' : '4px 12px',
                  }}>
                    <span style={{
                      color: isTop ? '#7df9ff' : hasVotes ? '#38e0f5' : '#c0c0de',
                      fontSize: 14, fontWeight: 700,
                    }}>
                      {fmtSlot(ts)}
                    </span>
                    {hasVotes && (
                      <span style={{
                        color: isTop ? 'rgba(125,249,255,0.85)' : 'rgba(180,180,220,0.75)',
                        fontSize: 12, fontWeight: 600,
                      }}>×{tsCount}</span>
                    )}
                  </div>
                )
              })}
              {(() => {
                const noPrefCount = ghostMode ? 0 : votes.filter(v => !v.timeSlot).length
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 20, padding: '4px 12px',
                  }}>
                    <span style={{ color: '#8888b0', fontSize: 14, fontWeight: 700 }}>No preference</span>
                    {noPrefCount > 0 && (
                      <span style={{ color: '#9898b8', fontSize: 12, fontWeight: 600 }}>×{noPrefCount}</span>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12, marginTop: 'auto',
          borderTop: '1px solid rgba(255,255,255,0.15)',
        }}>
          <span style={{ color: ghostMode ? '#c084fc' : '#b8b8e0', fontSize: 14 }}>
            {ghostMode ? 'Results hidden · Polly' : `${footerTotal} ${footerLabel} · Polly`}
          </span>
          {!closed && !ghostMode && closesLabel && (
            <span style={{ color: '#b8b8e0', fontSize: 14 }}>closes {closesLabel}</span>
          )}
          {ghostMode && closesLabel && (
            <span style={{ color: 'rgba(168,85,247,0.55)', fontSize: 14 }}>closes {closesLabel}</span>
          )}
        </div>

      </div>
    ),
    { width: W, height: H, emoji: 'twemoji' },
  )

  return new Response(img.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // URL includes ?v=TIMESTAMP so it changes on every vote action.
      // Short CDN TTL ensures Discord re-fetches the correct version quickly.
      'Cache-Control': 'public, s-maxage=10, max-age=5, stale-while-revalidate=15',
    },
  })
}
