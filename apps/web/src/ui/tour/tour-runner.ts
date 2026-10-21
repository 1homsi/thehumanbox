// The guided tour. A small spotlight-and-card walkthrough written for this fork
// (upstream used shepherd.js, which is AGPL-3.0). The card keeps shepherd's class
// names so the game's existing tour theme (pixel-theme.css,
// 10-toasts-worlds-tour.css) styles it unchanged; layout lives in styles/fork.css.
import { t } from '../../i18n'
import type { PlayerWorldKind } from '../../simulation/worldSource'
import { tourWorldCopy } from '../../simulation/playerWorldCopy'
import { isTourSupported, markSeen } from './tour'

type Side = 'top' | 'bottom' | 'left' | 'right' | 'auto'

interface StepDef {
  /** Element to point at; empty for a centred card. */
  selector: string
  title: string
  text: string
  on?: Side
}

/** The tour stays at five steps: what to watch, when they need you, your powers, where history lives, done. */
export function tourSteps(worldKind: PlayerWorldKind): StepDef[] {
  const worldCopy = tourWorldCopy(worldKind)
  return [
    {
      selector: '[data-tour="world-canvas"]',
      title: t('tour.world.title'),
      text: t('tour.world.text'),
      on: 'auto',
    },
    {
      // Centred, not pinned to the header chips: they change width every few seconds and the card
      // would jump around with them.
      selector: '',
      title: t('tour.prayers.title'),
      text: t('tour.prayers.text'),
    },
    {
      selector: '.sandbox-bar',
      title: t('tour.powers.title'),
      text: t('tour.powers.text'),
      on: 'top',
    },
    {
      selector: '.header-actions',
      title: t('tour.history.title'),
      text: t('tour.history.text'),
      on: 'bottom',
    },
    {
      selector: '[data-tour="settings-btn"]',
      title: t('tour.done.title'),
      text: worldCopy.closing,
      on: 'bottom',
    },
  ]
}

const MARGIN = 12
const GAP = 14
const SPOT_PAD = 6

function find(selector: string): Element | null {
  if (!selector) return null
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** Where the card goes beside the target: the asked-for side, or the roomiest one, kept on screen. */
export function placeCard(
  target: Box | null,
  card: { width: number; height: number },
  side: Side,
  view: { width: number; height: number },
) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)))
  if (!target) {
    return { left: (view.width - card.width) / 2, top: (view.height - card.height) / 2 }
  }
  const room = {
    top: target.top,
    bottom: view.height - (target.top + target.height),
    left: target.left,
    right: view.width - (target.left + target.width),
  }
  const fits = (s: Exclude<Side, 'auto'>) =>
    s === 'top' || s === 'bottom'
      ? room[s] >= card.height + GAP + MARGIN
      : room[s] >= card.width + GAP + MARGIN
  let chosen: Exclude<Side, 'auto'> | 'inside'
  if (side !== 'auto' && fits(side)) chosen = side
  else {
    const order = (['bottom', 'top', 'right', 'left'] as const).filter(fits)
    chosen = order.length ? order.reduce((a, b) => (room[b] > room[a] ? b : a)) : 'inside'
  }
  const centreX = target.left + target.width / 2 - card.width / 2
  const centreY = target.top + target.height / 2 - card.height / 2
  const pos =
    chosen === 'bottom'
      ? { left: centreX, top: target.top + target.height + GAP }
      : chosen === 'top'
        ? { left: centreX, top: target.top - GAP - card.height }
        : chosen === 'right'
          ? { left: target.left + target.width + GAP, top: centreY }
          : chosen === 'left'
            ? { left: target.left - GAP - card.width, top: centreY }
            : // The target fills the screen (the map): float the card over its middle.
              { left: centreX, top: centreY }
  return {
    left: clamp(pos.left, MARGIN, view.width - card.width - MARGIN),
    top: clamp(pos.top, MARGIN, view.height - card.height - MARGIN),
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export interface TourHandle {
  next(): void
  back(): void
  cancel(): void
  complete(): void
}

let activeTour: TourHandle | null = null

export function runTour(worldKind: PlayerWorldKind = 'local'): TourHandle | null {
  if (!isTourSupported()) {
    markSeen()
    return null
  }
  activeTour?.complete()
  const steps = tourSteps(worldKind).filter((s) => !s.selector || find(s.selector))
  if (steps.length === 0) {
    markSeen()
    return null
  }

  const root = el('div', 'thb-tour')
  // The dimmed page with a hole cut over the target (an even-odd path, like shepherd's overlay).
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const overlay = document.createElementNS(SVG_NS, 'svg')
  overlay.setAttribute('class', 'thb-tour-overlay')
  overlay.setAttribute('aria-hidden', 'true')
  const shade = document.createElementNS(SVG_NS, 'path')
  shade.setAttribute('fill-rule', 'evenodd')
  overlay.append(shade)
  const card = el('div', 'shepherd-element thb-shepherd thb-tour-card')
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  card.setAttribute('aria-labelledby', 'thb-tour-title')
  card.setAttribute('aria-describedby', 'thb-tour-text')
  const content = el('div', 'shepherd-content')
  const header = el('header', 'shepherd-header')
  const title = el('h3', 'shepherd-title')
  title.id = 'thb-tour-title'
  const close = el('button', 'shepherd-cancel-icon', '×')
  close.type = 'button'
  close.setAttribute('aria-label', t('tour.close'))
  const text = el('div', 'shepherd-text')
  text.id = 'thb-tour-text'
  const footer = el('footer', 'shepherd-footer')
  header.append(title, close)
  content.append(header, text, footer)
  card.append(content)
  root.append(overlay, card)

  let index = 0
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null

  const layout = () => {
    const step = steps[index]
    const target = find(step.selector)
    const rect = target?.getBoundingClientRect() ?? null
    const view = { width: window.innerWidth, height: window.innerHeight }
    overlay.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`)
    let d = `M0 0H${view.width}V${view.height}H0Z`
    if (rect) {
      const x = Math.round(rect.left - SPOT_PAD)
      const y = Math.round(rect.top - SPOT_PAD)
      const w = Math.round(rect.width + SPOT_PAD * 2)
      const h = Math.round(rect.height + SPOT_PAD * 2)
      d += `M${x} ${y}h${w}v${h}h${-w}Z`
    }
    shade.setAttribute('d', d)
    const size = card.getBoundingClientRect()
    const pos = placeCard(rect, size, step.on ?? 'auto', view)
    card.style.left = `${Math.round(pos.left)}px`
    card.style.top = `${Math.round(pos.top)}px`
  }

  const show = () => {
    const step = steps[index]
    const first = index === 0
    const last = index === steps.length - 1
    title.textContent = step.title
    text.textContent = step.text
    footer.replaceChildren()
    if (!first) {
      const back = el('button', 'shepherd-button shepherd-button-secondary', t('common.back'))
      back.type = 'button'
      back.addEventListener('click', () => handle.back())
      footer.append(back)
    }
    const primary = el('button', 'shepherd-button', last ? t('common.finish') : t('common.next'))
    primary.type = 'button'
    primary.addEventListener('click', () => (last ? handle.complete() : handle.next()))
    footer.append(primary)
    layout()
    primary.focus({ preventScroll: true })
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handle.cancel()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (index < steps.length - 1) handle.next()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      handle.back()
    } else if (e.key === 'Tab') {
      // Keep focus inside the card while the tour is open.
      const buttons = [...card.querySelectorAll<HTMLButtonElement>('button')]
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
      e.preventDefault()
      const nextAt = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length
      buttons[nextAt]?.focus()
    }
  }

  const end = () => {
    window.removeEventListener('resize', layout)
    window.removeEventListener('scroll', layout, true)
    document.removeEventListener('keydown', onKey, true)
    root.remove()
    markSeen()
    if (activeTour === handle) activeTour = null
    previousFocus?.focus({ preventScroll: true })
  }

  const handle: TourHandle = {
    next() {
      if (index < steps.length - 1) {
        index++
        show()
      }
    },
    back() {
      if (index > 0) {
        index--
        show()
      }
    },
    cancel: end,
    complete: end,
  }

  close.addEventListener('click', () => handle.cancel())
  window.addEventListener('resize', layout)
  window.addEventListener('scroll', layout, true)
  document.addEventListener('keydown', onKey, true)
  document.body.append(root)
  activeTour = handle
  show()
  return handle
}
