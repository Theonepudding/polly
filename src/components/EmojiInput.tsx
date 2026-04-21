'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Smile } from 'lucide-react'

export interface EmojiInputHandle {
  insertEmoji(code: string): void
  focus(): void
}

interface Props {
  initialValue?: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  className?: string          // wrapper div (e.g. flex-1)
  inputClass?: string         // extra classes on the editable area
  onEmojiButtonClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  emojiButtonActive?: boolean
}

function discordEmojiToImg(code: string): HTMLImageElement {
  const m = code.match(/^<(a?):(\w+):(\d+)>$/)!
  const img = document.createElement('img')
  img.src = `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] === 'a' ? 'gif' : 'png'}?size=32`
  img.setAttribute('data-emoji', code)
  img.alt = `:${m[2]}:`
  img.style.cssText =
    'display:inline-block;width:20px;height:20px;vertical-align:-4px;margin:0 1px;pointer-events:none;'
  return img
}

function textToHTML(text: string): string {
  return text
    .split(/(<a?:\w+:\d+>)/g)
    .map(seg => {
      const m = seg.match(/^<(a?):(\w+):(\d+)>$/)
      if (m) {
        const ext = m[1] === 'a' ? 'gif' : 'png'
        return `<img src="https://cdn.discordapp.com/emojis/${m[3]}.${ext}?size=32" data-emoji="${seg}" alt=":${m[2]}:" style="display:inline-block;width:20px;height:20px;vertical-align:-4px;margin:0 1px;pointer-events:none;" />`
      }
      return seg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    })
    .join('')
}

function domToText(el: HTMLElement): string {
  let out = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
    } else if ((node as Element).tagName === 'IMG') {
      out += (node as HTMLImageElement).dataset.emoji ?? ''
    } else if ((node as Element).tagName !== 'BR' && node.nodeType === Node.ELEMENT_NODE) {
      out += domToText(node as HTMLElement)
    }
  }
  return out
}

const EmojiInput = forwardRef<EmojiInputHandle, Props>(
  ({ initialValue = '', onChange, placeholder, maxLength, className = '', inputClass = '',
     onEmojiButtonClick, emojiButtonActive }, ref) => {
    const divRef      = useRef<HTMLDivElement>(null)
    const savedRange  = useRef<Range | null>(null)
    const [isEmpty,   setIsEmpty] = useState(!initialValue)

    // Set content once on mount — the DOM is authoritative after that
    useEffect(() => {
      if (divRef.current) {
        divRef.current.innerHTML = textToHTML(initialValue)
        setIsEmpty(!initialValue)
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({
      insertEmoji(code: string) {
        const el = divRef.current
        if (!el) return

        // Discord custom emoji → img node; Unicode emoji → text node
        const node: Node = /^<a?:\w+:\d+>$/.test(code)
          ? discordEmojiToImg(code)
          : document.createTextNode(code)

        const sel = window.getSelection()
        let range: Range

        if (savedRange.current) {
          range = savedRange.current
          savedRange.current = null
        } else if (sel && sel.rangeCount > 0 && el.contains(sel.focusNode)) {
          range = sel.getRangeAt(0)
        } else {
          range = document.createRange()
          range.selectNodeContents(el)
          range.collapse(false)
        }

        range.deleteContents()
        range.insertNode(node)

        const after = range.cloneRange()
        after.setStartAfter(node)
        after.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(after)

        const text = domToText(el)
        setIsEmpty(text.length === 0)
        onChange(text)
        el.focus()
      },
      focus() { divRef.current?.focus() },
    }))

    function handleInput() {
      if (!divRef.current) return
      const text = domToText(divRef.current)
      if (maxLength !== undefined && text.length > maxLength) return
      setIsEmpty(text.length === 0)
      onChange(text)
    }

    function handleBlur() {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        savedRange.current = sel.getRangeAt(0).cloneRange()
      }
    }

    function handlePaste(e: React.ClipboardEvent) {
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      const sel = window.getSelection()
      if (!sel?.rangeCount || !divRef.current) return
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(document.createTextNode(text))
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
      const newText = domToText(divRef.current)
      setIsEmpty(newText.length === 0)
      onChange(newText)
    }

    function handleKeyDown(e: React.KeyboardEvent) {
      if (e.key === 'Enter') e.preventDefault()
    }

    const hasEmojiBtn = !!onEmojiButtonClick

    return (
      <div className={`relative ${className}`}>
        {isEmpty && placeholder && (
          <div className={`absolute inset-0 flex items-center px-3 pointer-events-none select-none ${hasEmojiBtn ? 'pr-9' : ''}`}>
            <span className="text-sm text-p-muted/60 truncate w-full">{placeholder}</span>
          </div>
        )}
        <div
          ref={divRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleBlur}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className={`input outline-none ${hasEmojiBtn ? 'pr-9' : ''} ${inputClass}`}
          style={{ lineHeight: 1.6 }}
        />
        {hasEmojiBtn && (
          <button
            type="button"
            data-emoji-btn=""
            onClick={onEmojiButtonClick}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
              emojiButtonActive
                ? 'text-p-primary'
                : 'text-p-muted hover:text-p-primary'
            }`}
          >
            <Smile size={14} />
          </button>
        )}
      </div>
    )
  }
)

EmojiInput.displayName = 'EmojiInput'
export default EmojiInput
