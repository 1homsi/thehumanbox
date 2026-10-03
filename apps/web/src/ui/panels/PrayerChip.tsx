import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PrayerInfo, WorldState } from '../../shared/types'
import { prayerRows, prayerRowText, prayerTimeLeft, PRAYER_KINDS } from '../../game/model/prayers'
import { ToolSprite } from '../toolbar/ToolSprite'
import { Tooltip } from '../toolbar/Tooltip'

interface Props {
  world: WorldState
  onAnswer: (prayer: PrayerInfo) => void
}

/**
 * The player's to-do list: a header chip that only appears while someone
 * is praying. Opening it lists the prayers, most urgent first; picking one
 * takes you to the tribe with the right power in hand.
 */
export function PrayerChip({ world, onAnswer }: Props) {
  const prayers = world.prayers ?? []
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (prayers.length === 0) setOpen(false)
  }, [prayers.length])

  if (prayers.length === 0) return null
  const rows = prayerRows(prayers, world.tick)
  const urgent = prayers.some((p) => prayerTimeLeft(p, world.tick) < 0.25)

  return (
    <div className="prayer-chip-wrap" ref={ref}>
      <Tooltip
        tip={
          <span className="tip-card">
            <strong>prayers</strong>
            <span>
              {prayers.length === 1 ? 'A tribe is' : `${prayers.length} tribes are`} asking for your help.
              Answer before they lose faith.
            </span>
          </span>
        }
      >
        <button
          className={clsx('hdr-chip', 'prayer-chip', urgent && 'urgent', open && 'active')}
          onClick={(e) => {
            // The header row clips overflow, so the list floats in a portal
            // anchored under the chip.
            const rect = e.currentTarget.getBoundingClientRect()
            setAnchor({
              top: rect.bottom + 6,
              left: Math.max(16, Math.min(rect.left, window.innerWidth - 356)),
            })
            setOpen((v) => !v)
          }}
          aria-expanded={open}
          aria-label={`${prayers.length} prayers`}
        >
          <ToolSprite icon="🙏" size={16} />
          {prayers.length}
        </button>
      </Tooltip>
      {open &&
        anchor &&
        createPortal(
          <div
            className="prayer-list"
            role="menu"
            ref={listRef}
            style={{ top: anchor.top, left: anchor.left }}
          >
            {rows.map((row) => {
              const p = row.prayer
              const left = prayerTimeLeft(p, world.tick)
              return (
                <button
                  key={p.id}
                  role="menuitem"
                  className="prayer-row"
                  onClick={() => {
                    setOpen(false)
                    onAnswer(p)
                  }}
                >
                  <ToolSprite icon={PRAYER_KINDS[p.kind]?.icon ?? '🙏'} size={16} />
                  <span className="prayer-text">{prayerRowText(row)}</span>
                  <span className={clsx('prayer-time', left < 0.25 && 'low')}>
                    <span style={{ width: `${Math.round(left * 100)}%` }} />
                  </span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
