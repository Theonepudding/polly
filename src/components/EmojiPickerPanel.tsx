'use client'
import { EMOJI_CATEGORIES } from '@/lib/emoji-categories'

export interface DiscordEmoji { id: string; name: string; animated: boolean; available?: boolean }

interface Props {
  top: number
  left: number
  tab: string
  emojis: DiscordEmoji[]
  label: string
  onTabChange: (tab: string) => void
  onPickGuild: (emoji: DiscordEmoji) => void
  onPickStd: (em: string) => void
}

export default function EmojiPickerPanel({
  top, left, tab, emojis, label, onTabChange, onPickGuild, onPickStd,
}: Props) {
  return (
    <div
      data-emoji-picker=""
      style={{
        position: 'fixed', top, left, zIndex: 9999,
        background: '#1e1e2e', border: '1px solid #4a4a62',
        borderRadius: '12px', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)', width: '260px',
      }}
    >
      {/* Tab row */}
      <div className="flex items-center overflow-x-auto border-b" style={{ borderColor: '#3a3a52', scrollbarWidth: 'none' }}>
        {emojis.length > 0 && (
          <button
            type="button" data-emoji-picker="" title="Server Emojis"
            onClick={() => onTabChange('server')}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-sm transition-colors"
            style={{
              background: tab === 'server' ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: tab === 'server' ? '#818cf8' : '#8888aa',
              borderBottom: tab === 'server' ? '2px solid #818cf8' : '2px solid transparent',
            }}
          >🖼️</button>
        )}
        {EMOJI_CATEGORIES.map(cat => (
          <button
            key={cat.id} type="button" data-emoji-picker="" title={cat.label}
            onClick={() => onTabChange(cat.id)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-sm transition-colors"
            style={{
              background: tab === cat.id ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: tab === cat.id ? '#818cf8' : '#8888aa',
              borderBottom: tab === cat.id ? '2px solid #818cf8' : '2px solid transparent',
            }}
          >{cat.icon}</button>
        ))}
      </div>

      {/* Category label */}
      <div className="px-3 pt-2 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#7070a0' }}>
          {tab === 'server'
            ? label
            : EMOJI_CATEGORIES.find(c => c.id === tab)?.label ?? ''}
        </p>
      </div>

      {/* Grid */}
      <div className="p-1.5 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4a4a62 transparent' }}>
        {tab === 'server' ? (
          emojis.length === 0 ? (
            <p className="text-sm px-2 py-2 leading-relaxed" style={{ color: '#8888aa' }}>
              No custom emojis in this server.
            </p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5">
              {emojis.map(e => (
                <button
                  key={e.id} type="button" data-emoji-picker="" title={`:${e.name}:`}
                  onClick={() => onPickGuild(e)}
                  className="w-8 h-8 flex items-center justify-center rounded p-0.5"
                  onMouseEnter={ev => (ev.currentTarget.style.background = '#3a3a52')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                >
                  <img
                    src={`https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=32`}
                    alt={e.name} className="w-6 h-6 object-contain"
                  />
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {(EMOJI_CATEGORIES.find(c => c.id === tab)?.emoji ?? []).map((em, idx) => (
              <button
                key={idx} type="button" data-emoji-picker="" title={em}
                onClick={() => onPickStd(em)}
                className="w-8 h-8 flex items-center justify-center rounded text-lg leading-none"
                onMouseEnter={ev => (ev.currentTarget.style.background = '#3a3a52')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
              >{em}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
