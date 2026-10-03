import clsx from 'clsx'
import { useUIStore, useViewFlag } from '../stores/store'
import { SHORTCUT_HELP } from '../world/shortcuts'
import { saveMapPicture } from '../lib/mapPicture'
import { useWorldStore } from '../stores/worldStore'
import { Tooltip } from './Tooltip'

export function MoreDropdown() {
  const focus = useUIStore((s) => s.focus)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const setFocus = useUIStore((s) => s.setFocus)
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const openLanguages = useUIStore((s) => s.openLanguages)
  const openFamilyTree = useUIStore((s) => s.openFamilyTree)
  const openNotable = useUIStore((s) => s.openNotable)
  const pauseOnPeril = useUIStore((s) => s.pauseOnPeril)
  const setPauseOnPeril = useUIStore((s) => s.setPauseOnPeril)

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

  const closeMore = () => useUIStore.setState({ showMore: false })

  return (
    <div className="more-dropdown">
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
      <div className="more-dropdown-section">organism decorations</div>
      <div className="more-dropdown-grid">
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
        <Tooltip tip="Frames-per-second and frame timing">
          <button
            className={clsx('lang-btn', fps && 'active')}
            aria-pressed={!!fps}
            onClick={() => setViewFlag('fps', !fps)}
          >
            ⏱ perf
          </button>
        </Tooltip>
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
        <Tooltip tip="Pause the game whenever a tribe newly falls on the brink">
          <button
            className={clsx('lang-btn', pauseOnPeril && 'active')}
            aria-pressed={pauseOnPeril}
            onClick={() => setPauseOnPeril(!pauseOnPeril)}
          >
            ⏸ on brink
          </button>
        </Tooltip>
        <Tooltip
          tip={
            <span className="tip-card">
              <strong>keys</strong>
              {SHORTCUT_HELP.map(([key, what]) => (
                <span key={key}>
                  <b>{key}</b> {what}
                </span>
              ))}
            </span>
          }
        >
          <button className="lang-btn">⌨ keys</button>
        </Tooltip>
        <Tooltip tip="Save a picture of the world as it looks now">
          <button
            className="lang-btn"
            onClick={() => {
              void saveMapPicture(useWorldStore.getState().world?.tick)
              closeMore()
            }}
          >
            ▣ picture
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
    </div>
  )
}
