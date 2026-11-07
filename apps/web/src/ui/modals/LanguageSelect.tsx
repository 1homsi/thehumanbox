import clsx from 'clsx'
import { useEffect, useId, useRef, useState } from 'react'
import { LOCALES, nativeName } from '../../i18n'

/**
 * A pixel-styled select for the interface language: one closed button showing the current
 * language, a scrolling listbox of every locale. Scales to any number of translations.
 */
export function LanguageSelect({
  value,
  pending,
  label,
  onChoose,
}: {
  value: string
  pending: string | null
  label: string
  onChoose: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const shown = pending ?? value
  const disabled = !!pending

  function openList() {
    if (disabled) return
    setActive(Math.max(0, LOCALES.indexOf(value)))
    setOpen(true)
  }

  function pick(code: string) {
    setOpen(false)
    onChoose(code)
  }

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation() // Keep Escape from closing the whole settings dialog.
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openList()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + LOCALES.length) % LOCALES.length)
    } else if (e.key === 'Home' || e.key === 'End') {
      if (!open) return
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : LOCALES.length - 1)
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      pick(LOCALES[active])
    }
  }

  return (
    <div className="lang-select" ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="lang-btn lang-select-trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        lang={shown}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        <span>{nativeName(shown)}</span>
        <span className="lang-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul id={listId} ref={listRef} className="lang-select-list" role="listbox" aria-label={label}>
          {LOCALES.map((code, i) => (
            <li
              key={code}
              id={`${listId}-${i}`}
              role="option"
              lang={code}
              aria-selected={code === value}
              className={clsx(
                'lang-select-option',
                code === value && 'selected',
                i === active && 'focused',
              )}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(code)}
            >
              {nativeName(code)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
