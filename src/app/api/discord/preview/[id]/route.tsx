import { ImageResponse } from 'next/og'
import { getKV } from '@/lib/kv'

export const runtime = 'edge'

interface PollDraft {
  title: string
  description?: string
  options: string[]
  timeSlots: string[]
  isAnonymous: boolean
  allowMultiple: boolean
  daysOpen: number
  hoursOpen: number
}

async function getDraftForPreview(id: string): Promise<PollDraft | null> {
  try {
    const kv = await getKV()
    if (!kv) return null
    const raw = await kv.get(`pdraft:${id}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const draft = await getDraftForPreview(id)

  const title   = draft?.title   ?? 'Your Poll'
  const desc    = draft?.description ?? ''
  const options = draft?.options?.length ? draft.options : ['Yes', 'No']
  const slots   = draft?.timeSlots ?? []
  const durLabel = draft
    ? draft.hoursOpen > 0
      ? `${draft.hoursOpen}h`
      : `${draft.daysOpen} day${draft.daysOpen !== 1 ? 's' : ''}`
    : '7 days'
  const tags: string[] = []
  if (draft?.isAnonymous)   tags.push('Anonymous')
  if (draft?.allowMultiple) tags.push('Multi-choice')
  if (slots.length > 0)     tags.push('Time slots')

  const shownOptions = options.slice(0, 5)

  return new ImageResponse(
    (
      <div style={{
        width: 860, height: 420,
        background: '#1e1f22',
        display: 'flex',
        flexDirection: 'row',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Left accent stripe */}
        <div style={{ width: 5, background: '#6366f1', flexShrink: 0, display: 'flex' }} />

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '22px 24px' }}>

          {/* Bot header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', background: '#5865f2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 800 }}>P</span>
            </div>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>Polly</span>
            <div style={{
              background: '#5865f2', color: 'white', fontSize: 9,
              padding: '2px 5px', borderRadius: 3, fontWeight: 800, letterSpacing: '0.06em', display: 'flex',
            }}>APP</div>
            {tags.map(t => (
              <div key={t} style={{
                background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 9,
                padding: '2px 7px', borderRadius: 10, fontWeight: 700, display: 'flex',
              }}>{t}</div>
            ))}
          </div>

          {/* Title */}
          <div style={{
            color: '#ffffff', fontWeight: 700, fontSize: 17,
            marginBottom: desc ? 5 : 14, display: 'flex', lineHeight: 1.3,
          }}>
            {title.length > 80 ? title.slice(0, 77) + '…' : title}
          </div>

          {/* Description */}
          {desc && (
            <div style={{ color: '#b5bac1', fontSize: 13, marginBottom: 14, display: 'flex', lineHeight: 1.4 }}>
              {desc.length > 100 ? desc.slice(0, 97) + '…' : desc}
            </div>
          )}

          {/* Options with bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
            {shownOptions.map((opt, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: i === 0 ? '#a5b4fc' : '#dbdee1', fontSize: 13, fontWeight: i === 0 ? 600 : 400, display: 'flex' }}>
                    {opt.length > 40 ? opt.slice(0, 37) + '…' : opt}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 12, display: 'flex' }}>—</span>
                </div>
                <div style={{ height: 6, background: '#2b2d31', borderRadius: 3, display: 'flex', overflow: 'hidden' }}>
                  <div style={{ width: '0%', height: '100%', background: i === 0 ? '#6366f1' : '#4b5563', display: 'flex' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Footer row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            {/* Fake vote buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {shownOptions.slice(0, 4).map((opt, i) => (
                <div key={i} style={{
                  background: '#383a40', color: '#dbdee1',
                  padding: '5px 12px', borderRadius: 4, fontSize: 12, display: 'flex',
                }}>
                  {opt.length > 10 ? opt.slice(0, 8) + '…' : opt}
                </div>
              ))}
            </div>
            <span style={{ color: '#6b7280', fontSize: 12 }}>Closes in {durLabel}</span>
          </div>
        </div>

        {/* PREVIEW badge */}
        <div style={{
          position: 'absolute', top: 14, right: 16,
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.35)',
          color: '#818cf8', fontSize: 10, padding: '3px 9px', borderRadius: 6,
          display: 'flex', fontWeight: 700, letterSpacing: '0.08em',
        }}>PREVIEW</div>
      </div>
    ),
    { width: 860, height: 420 },
  )
}
