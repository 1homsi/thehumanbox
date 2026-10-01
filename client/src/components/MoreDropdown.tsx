import clsx from 'clsx'
import { useUIStore, useViewFlag } from '../stores/store'
import { Tooltip } from './Tooltip'

export function MoreDropdown() {
  const overlay = useUIStore((s) => s.overlay)
  const focus = useUIStore((s) => s.focus)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const setOverlay = useUIStore((s) => s.setOverlay)
  const setFocus = useUIStore((s) => s.setFocus)
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const setTerritoryView = useUIStore((s) => s.setTerritoryView)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const openLanguages = useUIStore((s) => s.openLanguages)
  const openFamilyTree = useUIStore((s) => s.openFamilyTree)
  const openNotable = useUIStore((s) => s.openNotable)

  const territory = useViewFlag('territory')
  const names = useViewFlag('names')
  const thoughts = useViewFlag('thoughts')
  const animals = useViewFlag('animals')
  const grid = useViewFlag('grid')
  const lineageDot = useViewFlag('lineageDot')
  const health = useViewFlag('health')
  const age = useViewFlag('age')
  const fear = useViewFlag('fear')
  const partners = useViewFlag('partners')
  const pregnancy = useViewFlag('pregnancy')
  const trails = useViewFlag('trails')
  const structures = useViewFlag('structures')
  const fertility = useViewFlag('fertility')
  const hazard = useViewFlag('hazard')
  const history = useViewFlag('history')
  const fps = useViewFlag('fps')
  const threeD = useViewFlag('threeD')
  const hideUI = useViewFlag('hideUI')
  const orgPov = useViewFlag('orgPov')

  const closeMore = () => useUIStore.setState({ showMore: false })

  return (
    <div className="more-dropdown">
      <div className="more-dropdown-section">overlays</div>
      <div className="more-dropdown-grid">
        <Tooltip tip="Population density heatmap — where organisms cluster">
          <button
            className={clsx('lang-btn', overlay === 'density' && 'active')}
            aria-pressed={!!(overlay === 'density')}
            onClick={() => setOverlay(overlay === 'density' ? null : 'density')}
          >
            👥 crowd
          </button>
        </Tooltip>
        <Tooltip tip="Combat and death hotspots">
          <button
            className={clsx('lang-btn', overlay === 'hazard' && 'active')}
            aria-pressed={!!(overlay === 'hazard')}
            onClick={() => setOverlay(overlay === 'hazard' ? null : 'hazard')}
          >
            ⚠ hazard
          </button>
        </Tooltip>
        <Tooltip tip="Soil fertility — where food grows best">
          <button
            className={clsx('lang-btn', overlay === 'fertility' && 'active')}
            aria-pressed={!!(overlay === 'fertility')}
            onClick={() => setOverlay(overlay === 'fertility' ? null : 'fertility')}
          >
            ✿ fertile
          </button>
        </Tooltip>
        <Tooltip tip="Building density">
          <button
            className={clsx('lang-btn', overlay === 'structures' && 'active')}
            aria-pressed={!!(overlay === 'structures')}
            onClick={() => setOverlay(overlay === 'structures' ? null : 'structures')}
          >
            ⌂ builds
          </button>
        </Tooltip>
        <Tooltip tip="Food / water / path stigmergy blended">
          <button
            className={clsx('lang-btn', overlay === 'trails' && 'active')}
            aria-pressed={!!(overlay === 'trails')}
            onClick={() => setOverlay(overlay === 'trails' ? null : 'trails')}
          >
            ⋯ trails
          </button>
        </Tooltip>
        <Tooltip tip="Per-tile mean age">
          <button
            className={clsx('lang-btn', overlay === 'age' && 'active')}
            aria-pressed={!!(overlay === 'age')}
            onClick={() => setOverlay(overlay === 'age' ? null : 'age')}
          >
            ⏳ age
          </button>
        </Tooltip>
        <Tooltip tip="Where organisms feel fearful">
          <button
            className={clsx('lang-btn', overlay === 'threat' && 'active')}
            aria-pressed={!!(overlay === 'threat')}
            onClick={() => setOverlay(overlay === 'threat' ? null : 'threat')}
          >
            🜸 threat
          </button>
        </Tooltip>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">focus</div>
      <div className="more-dropdown-grid">
        <Tooltip tip="Show every organism (clear the focus filter)">
          <button
            className={clsx('lang-btn', focus === 'all' && 'active')}
            aria-pressed={!!(focus === 'all')}
            onClick={() => setFocus('all')}
          >
            · all
          </button>
        </Tooltip>
        <Tooltip tip="Highlight sick organisms">
          <button
            className={clsx('lang-btn', focus === 'sick' && 'active')}
            aria-pressed={!!(focus === 'sick')}
            onClick={() => setFocus(focus === 'sick' ? 'all' : 'sick')}
          >
            🤒 sick
          </button>
        </Tooltip>
        <Tooltip tip="Highlight starving organisms">
          <button
            className={clsx('lang-btn', focus === 'hungry' && 'active')}
            aria-pressed={!!(focus === 'hungry')}
            onClick={() => setFocus(focus === 'hungry' ? 'all' : 'hungry')}
          >
            😫 hungry
          </button>
        </Tooltip>
        <Tooltip tip="Highlight elders">
          <button
            className={clsx('lang-btn', focus === 'elders' && 'active')}
            aria-pressed={!!(focus === 'elders')}
            onClick={() => setFocus(focus === 'elders' ? 'all' : 'elders')}
          >
            👴 elders
          </button>
        </Tooltip>
        <Tooltip tip="Highlight builders">
          <button
            className={clsx('lang-btn', focus === 'builders' && 'active')}
            aria-pressed={!!(focus === 'builders')}
            onClick={() => setFocus(focus === 'builders' ? 'all' : 'builders')}
          >
            🏗 builders
          </button>
        </Tooltip>
        <Tooltip tip="Highlight thriving organisms">
          <button
            className={clsx('lang-btn', focus === 'thriving' && 'active')}
            aria-pressed={!!(focus === 'thriving')}
            onClick={() => setFocus(focus === 'thriving' ? 'all' : 'thriving')}
          >
            ✦ thriving
          </button>
        </Tooltip>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">view</div>
      <div className="more-dropdown-grid">
        {!threeD && (
          <Tooltip tip="Outline each lineage's claimed territory">
            <button
              className={clsx('lang-btn', territory && 'active')}
              aria-pressed={!!territory}
              onClick={() => setTerritoryView(!territory)}
            >
              ⬡ territory
            </button>
          </Tooltip>
        )}
        <Tooltip tip="Show each organism's name">
          <button
            className={clsx('lang-btn', names && 'active')}
            aria-pressed={!!names}
            onClick={() => setViewFlag('names', !names)}
          >
            Aa names
          </button>
        </Tooltip>
        {!threeD && (
          <Tooltip tip="Show speech bubbles with current thoughts">
            <button
              className={clsx('lang-btn', thoughts && 'active')}
              aria-pressed={!!thoughts}
              onClick={() => setViewFlag('thoughts', !thoughts)}
            >
              💭 thoughts
            </button>
          </Tooltip>
        )}
        <Tooltip tip="Show wild animals roaming the world">
          <button
            className={clsx('lang-btn', animals && 'active')}
            aria-pressed={!!animals}
            onClick={() => setViewFlag('animals', !animals)}
          >
            🦌 animals
          </button>
        </Tooltip>
        {!threeD && (
          <Tooltip tip="Show the tile grid lines">
            <button
              className={clsx('lang-btn', grid && 'active')}
              aria-pressed={!!grid}
              onClick={() => setViewFlag('grid', !grid)}
            >
              ⊞ grid
            </button>
          </Tooltip>
        )}
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">organism decorations</div>
      <div className="more-dropdown-grid">
        {!threeD && (
          <>
            <Tooltip tip="Colored dot per organism showing tribe affiliation">
              <button
                className={clsx('lang-btn', lineageDot && 'active')}
                aria-pressed={!!lineageDot}
                onClick={() => setViewFlag('lineageDot', !lineageDot)}
              >
                ⬤ lineage
              </button>
            </Tooltip>
            <Tooltip tip="Ring tint by health">
              <button
                className={clsx('lang-btn', health && 'active')}
                aria-pressed={!!health}
                onClick={() => setViewFlag('health', !health)}
              >
                ♥ health
              </button>
            </Tooltip>
            <Tooltip tip="Age tint: child / adult / elder">
              <button
                className={clsx('lang-btn', age && 'active')}
                aria-pressed={!!age}
                onClick={() => setViewFlag('age', !age)}
              >
                ⏳ age
              </button>
            </Tooltip>
            <Tooltip tip="Fear halo around frightened organisms">
              <button
                className={clsx('lang-btn', fear && 'active')}
                aria-pressed={!!fear}
                onClick={() => setViewFlag('fear', !fear)}
              >
                ⚠ fear
              </button>
            </Tooltip>
            <Tooltip tip="Bond line between partners">
              <button
                className={clsx('lang-btn', partners && 'active')}
                aria-pressed={!!partners}
                onClick={() => setViewFlag('partners', !partners)}
              >
                ♥♥ pairs
              </button>
            </Tooltip>
            <Tooltip tip="Pregnancy marker">
              <button
                className={clsx('lang-btn', pregnancy && 'active')}
                aria-pressed={!!pregnancy}
                onClick={() => setViewFlag('pregnancy', !pregnancy)}
              >
                ◯ pregnant
              </button>
            </Tooltip>
            <Tooltip tip="Food / water / path stigmergy">
              <button
                className={clsx('lang-btn', trails && 'active')}
                aria-pressed={!!trails}
                onClick={() => setViewFlag('trails', !trails)}
              >
                ⋯ trails
              </button>
            </Tooltip>
            <Tooltip tip="Highlight huts and campfires">
              <button
                className={clsx('lang-btn', structures && 'active')}
                aria-pressed={!!structures}
                onClick={() => setViewFlag('structures', !structures)}
              >
                ⌂ builds
              </button>
            </Tooltip>
            <Tooltip tip="Soil fertility heat">
              <button
                className={clsx('lang-btn', fertility && 'active')}
                aria-pressed={!!fertility}
                onClick={() => setViewFlag('fertility', !fertility)}
              >
                ✿ fertility
              </button>
            </Tooltip>
            <Tooltip tip="Hazard scars — violence and death">
              <button
                className={clsx('lang-btn', hazard && 'active')}
                aria-pressed={!!hazard}
                onClick={() => setViewFlag('hazard', !hazard)}
              >
                ✶ hazard
              </button>
            </Tooltip>
            <Tooltip tip="Per-lineage drift over the last ~60 sim-days">
              <button
                className={clsx('lang-btn', history && 'active')}
                aria-pressed={!!history}
                onClick={() => setViewFlag('history', !history)}
              >
                ↝ history
              </button>
            </Tooltip>
          </>
        )}
        <Tooltip tip="Frames-per-second and frame timing">
          <button
            className={clsx('lang-btn', fps && 'active')}
            aria-pressed={!!fps}
            onClick={() => setViewFlag('fps', !fps)}
          >
            ⏱ perf
          </button>
        </Tooltip>
        {threeD && (
          <Tooltip tip="Territory overlay — lineage claims and contested zones">
            <button
              className={clsx('lang-btn', territory && 'active')}
              aria-pressed={!!territory}
              onClick={() => setTerritoryView(!territory)}
            >
              ⬡ territory
            </button>
          </Tooltip>
        )}
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-grid">
        <Tooltip tip="Browse the languages lineages have invented">
          <button
            className="lang-btn"
            onClick={() => {
              openLanguages()
              closeMore()
            }}
          >
            ⌖ lang
          </button>
        </Tooltip>
        <Tooltip tip="Family tree of bloodlines and descent">
          <button
            className="lang-btn"
            onClick={() => {
              openFamilyTree()
              closeMore()
            }}
          >
            ⬡ tree
          </button>
        </Tooltip>
        <Tooltip tip="Toggle the left world panel (history, lineages, events)">
          <button
            className={clsx('lang-btn', leftOpen && 'active')}
            aria-pressed={!!leftOpen}
            onClick={() => {
              toggleLeft()
              closeMore()
            }}
          >
            ⊞ world
          </button>
        </Tooltip>
        <Tooltip tip="Top organisms by age, family size, friends, wealth, knowledge, joy, grief…">
          <button
            className="lang-btn"
            onClick={() => {
              openNotable()
              closeMore()
            }}
          >
            ✦ notable
          </button>
        </Tooltip>
      </div>

      {threeD && (
        <>
          <div className="more-dropdown-divider" />
          <div className="more-dropdown-section">3d view</div>
          <div className="more-dropdown-grid">
            <Tooltip tip="Hide sidebars in 3D mode for immersion">
              <button
                className={clsx('lang-btn', hideUI && 'active')}
                aria-pressed={!!hideUI}
                onClick={() => setViewFlag('hideUI', !hideUI)}
              >
                ▤ hide ui
              </button>
            </Tooltip>
            <Tooltip tip="First-person camera from the selected person's head">
              <button
                className={clsx('lang-btn', orgPov && 'active')}
                aria-pressed={!!orgPov}
                onClick={() => setViewFlag('orgPov', !orgPov)}
              >
                👁 org POV
              </button>
            </Tooltip>
          </div>
        </>
      )}
      <div className="more-dropdown-divider" />
      <button
        className="lang-btn more-dropdown-settings"
        onClick={() => {
          closeMore()
          useUIStore.getState().openDesktopSettings()
        }}
      >
        ⚙ display, accessibility, performance and help are in settings
      </button>
    </div>
  )
}
