import Shepherd from 'shepherd.js'
import 'shepherd.js/dist/css/shepherd.css'
import { trackEvent } from '../../shared/observability'
import type { PlayerWorldKind } from '../../simulation/worldSource'
import { tourWorldCopy } from '../../simulation/playerWorldCopy'
import { useUIStore } from '../../state/store'

const TOUR_KEY = 'thb-tour-completed-v1'

export function isTourSupported(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !window.matchMedia('(max-width: 767px)').matches
  } catch {
    return true
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(TOUR_KEY, '1')
  } catch {
    /* ignore */
  }
}

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

function tourSteps(worldKind: PlayerWorldKind): StepDef[] {
  const worldCopy = tourWorldCopy(worldKind)
  return [
    {
      selector: '.header h1',
      title: 'Welcome to The Human Box',
      text: worldCopy.opening,
      on: 'bottom',
    },
    {
      selector: '.header-badges',
      title: 'World pulse',
      text:
        'How many people are alive, the season, day or night, and the era the world has reached. ' +
        'Hover any of them for more.',
      on: 'bottom',
    },
    {
      selector: '[data-tour="world-canvas"]',
      title: 'The world',
      text:
        'The map itself. Drag to pan, scroll to zoom. Each tiny figure is a real person with ' +
        'a name, family, beliefs, and a life story. Click one to follow them.',
      on: 'auto',
    },
    {
      selector: '.sandbox-bar',
      title: 'Your powers',
      text:
        'The dock holds everything you can do to the world. The tabs on its top edge switch ' +
        'between life, world, powers and maps. Pick a tool, then click the map; Esc puts it ' +
        'down. Pause and speed live on the right.',
      on: 'top',
    },
    {
      selector: '.panel-left, [data-tour="left-panel"]',
      title: 'World drawer',
      text:
        'The world drawer: history, the tribes alive right now, recent events, and the ' +
        'civilisation summary. Open it from the button at the top right.',
      on: 'right',
      drawer: 'left',
    },
    {
      selector: '[data-tour="right-panel"], .panel-right',
      title: 'People drawer',
      text:
        'The people drawer: everyone alive and everyone who has died. Click a name to read ' +
        'their life, see their family and friends, and follow them on the map.',
      on: 'left',
      drawer: 'right',
    },
    {
      selector: '[data-tour="stats-btn"]',
      title: 'Stats',
      text: 'Deep population stats: birth/death rates, trait distributions, age pyramid, discoveries.',
      on: 'bottom',
    },
    {
      selector: '[data-tour="civ-btn"]',
      title: 'Civilization',
      text:
        'Per-lineage civilisation breakdown: era, government, religion, books written, buildings built, ' +
        'and recent headlines.',
      on: 'bottom',
    },
    {
      selector: '[data-tour="search-btn"]',
      title: 'Search',
      text: 'Find any organism by name, lineage, thought, or discovery. Works on both living and dead.',
      on: 'bottom',
    },
    {
      selector: '[data-tour="chronicles-btn"]',
      title: 'Chronicles',
      text:
        'Stories the world has lived through - written by the simulation itself when something ' +
        'meaningful happens. Wars, plagues, foundings, deaths.',
      on: 'bottom',
    },
    {
      selector: '[data-tour="more-btn"]',
      title: 'More',
      text:
        'Map overlays (crowds, hazards, fertility, threats), focus filters that highlight the ' +
        'sick, the hungry or the elders, and what to draw over each person.',
      on: 'bottom',
    },
    {
      selector: '[data-tour="settings-btn"]',
      title: 'Settings',
      text: 'Photo mode, the colourblind palette, low-performance mode, and this tour.',
      on: 'bottom',
    },
    {
      selector: '.header h1',
      title: 'That’s it - have fun',
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

export function startTour(worldKind: PlayerWorldKind = 'local') {
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
                text: 'Back',
                classes: 'shepherd-button-secondary',
                action: () => tour.back(),
              },
            ]),
        {
          text: isLast ? 'Finish' : 'Next',
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
