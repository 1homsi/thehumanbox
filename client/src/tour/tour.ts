import Shepherd from 'shepherd.js'
import 'shepherd.js/dist/css/shepherd.css'

const TOUR_KEY = 'thb-tour-completed-v1'

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return false
  }
}

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
}

const STEPS: StepDef[] = [
  {
    selector: '.header h1',
    title: 'Welcome to The Human Box',
    text:
      'This is a living simulation. Hundreds of tiny humans are born, learn, build, fight, ' +
      'pray, and die in real time. You’re just watching - no buttons to press.',
    on: 'bottom',
  },
  {
    selector: '.header-badges',
    title: 'World pulse',
    text:
      'These badges show what the world is doing right now: day or night, current season, ' +
      'global era, weather, active fires, and how many humans are sick.',
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
    selector: '.panel-left, [data-tour="left-panel"]',
    title: 'World stats',
    text:
      'On the left: population history, the lineages alive right now, recent events, and ' +
      'the civilisation summary. The "view all" button in the civ panel opens the full breakdown.',
    on: 'right',
  },
  {
    selector: '[data-tour="right-panel"], .panel-right',
    title: 'Organism inspector',
    text:
      'On the right: every living and dead organism. Click any name to read their life log, ' +
      'see who their parents and friends are, and follow them on the map.',
    on: 'left',
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
      'Hidden under here: map overlays (heat, fertility, hazard, density), the experimental 3D ' +
      'world, a focus filter for highlighting sub-groups, photo mode, and this tour.',
    on: 'bottom',
  },
  {
    selector: '.header h1',
    title: 'That’s it - have fun',
    text:
      'The world keeps running on the server even when you close the tab. Come back later and ' +
      'civilisations will have risen and fallen without you.',
    on: 'bottom',
  },
]

let activeTour: ReturnType<typeof createTour> | null = null

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

export function startTour() {
  if (!isTourSupported()) {
    markSeen()
    return null
  }
  import('../lib/observability').then((m) => m.trackEvent('tour_start'))
  if (activeTour) {
    activeTour.complete()
    activeTour = null
  }
  const liveSteps = STEPS.filter((s) => !s.selector || selectorPresent(s.selector))
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
