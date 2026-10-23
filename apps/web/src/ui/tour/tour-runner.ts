import Shepherd from 'shepherd.js'
import { trackEvent } from '../../shared/observability'
import type { PlayerWorldKind } from '../../simulation/worldSource'
import { tourWorldCopy } from '../../simulation/playerWorldCopy'
import { t } from '../../i18n'
import { useUIStore } from '../../state/store'
import { isTourSupported, markSeen } from './tour'

interface StepDef {
  selector: string
  title: string
  text: string
  on?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  /** Drawers are closed overlays by default; open this one for the step. */
  drawer?: 'left' | 'right'
}

// Matches the drawer slide in pixel-theme.css.
const DRAWER_SLIDE_MS = 240

function drawerOpen(drawer: 'left' | 'right'): boolean {
  const ui = useUIStore.getState()
  return drawer === 'left' ? ui.leftOpen : ui.panelOpen
}

function setDrawer(drawer: 'left' | 'right', open: boolean) {
  useUIStore.setState(drawer === 'left' ? { leftOpen: open } : { panelOpen: open })
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
      title: t('tour.prayer.title'),
      text: t('tour.prayer.text'),
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

let activeTour: ReturnType<typeof createTour> | null = null

/** Opens a drawer for its step and closes it again if the tour opened it. */
function drawerHooks(drawer: 'left' | 'right') {
  let openedByTour = false
  return {
    beforeShowPromise: () =>
      new Promise<void>((resolve) => {
        openedByTour = !drawerOpen(drawer)
        if (!openedByTour) return resolve()
        setDrawer(drawer, true)
        window.setTimeout(resolve, DRAWER_SLIDE_MS)
      }),
    when: {
      hide: () => {
        if (openedByTour) setDrawer(drawer, false)
        openedByTour = false
      },
    },
  }
}

function createTour() {
  return new Shepherd.Tour({
    defaultStepOptions: {
      classes: 'thb-shepherd',
      scrollTo: { behavior: 'smooth', block: 'center' },
      cancelIcon: { enabled: true },
      modalOverlayOpeningPadding: 6,
      modalOverlayOpeningRadius: 6,
    },
    useModalOverlay: true,
    exitOnEsc: true,
  })
}

function selectorPresent(sel: string): boolean {
  try {
    return !!document.querySelector(sel)
  } catch {
    return false
  }
}

export function runTour(worldKind: PlayerWorldKind = 'local') {
  if (!isTourSupported()) {
    markSeen()
    return null
  }
  trackEvent('tour_start')
  if (activeTour) {
    activeTour.complete()
    activeTour = null
  }
  const liveSteps = tourSteps(worldKind).filter((s) => !s.selector || selectorPresent(s.selector))
  if (liveSteps.length === 0) {
    markSeen()
    return null
  }
  const tour = createTour()

  liveSteps.forEach((step, i) => {
    const isLast = i === liveSteps.length - 1
    const isFirst = i === 0
    const attach =
      step.selector && selectorPresent(step.selector)
        ? { element: step.selector, on: step.on ?? 'auto' }
        : undefined
    tour.addStep({
      id: `step-${i}`,
      title: step.title,
      text: step.text,
      attachTo: attach,
      ...(step.drawer ? drawerHooks(step.drawer) : {}),
      buttons: [
        ...(isFirst
          ? []
          : [
              {
                text: t('tour.back'),
                classes: 'shepherd-button-secondary',
                action: () => tour.back(),
              },
            ]),
        {
          text: isLast ? t('tour.finish') : t('tour.next'),
          action: () => (isLast ? tour.complete() : tour.next()),
        },
      ],
    })
  })

  const cleanup = () => {
    markSeen()
    activeTour = null
  }
  tour.on('complete', cleanup)
  tour.on('cancel', cleanup)

  activeTour = tour
  tour.start()
  return tour
}
