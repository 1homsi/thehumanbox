import clsx from 'clsx'
import { useUIStore } from '../store'

/**
 * The "··· more" dropdown panel shown from the header.
 *
 * Self-contained: pulls every flag and setter it needs from the
 * zustand store directly, so callers don't have to know about the
 * dozens of toggles it exposes.
 *
 * Close-on-outside-click is wired by the parent (AppHeader) via the
 * `moreRef` ref it places on the wrapping <div className="more-menu">.
 */
export function MoreDropdown() {
  const overlay     = useUIStore(s => s.overlay)
  const focus       = useUIStore(s => s.focus)
  const viewFlags   = useUIStore(s => s.viewFlags)
  const leftOpen    = useUIStore(s => s.leftOpen)
  const setOverlay  = useUIStore(s => s.setOverlay)
  const setFocus    = useUIStore(s => s.setFocus)
  const setViewFlag = useUIStore(s => s.setViewFlag)
  const toggleLeft  = useUIStore(s => s.toggleLeft)
  const openLanguages  = useUIStore(s => s.openLanguages)
  const openFamilyTree = useUIStore(s => s.openFamilyTree)
  const openAbout      = useUIStore(s => s.openAbout)

  const closeMore = () => useUIStore.setState({ showMore: false })

  return (
    <div className="more-dropdown">

      <div className="more-dropdown-section">overlays</div>
      <div className="more-dropdown-grid">
        <button className={clsx('lang-btn', overlay === 'density'    && 'active')} onClick={() => setOverlay(overlay === 'density'    ? null : 'density')}    title="Population density">👥 crowd</button>
        <button className={clsx('lang-btn', overlay === 'hazard'     && 'active')} onClick={() => setOverlay(overlay === 'hazard'     ? null : 'hazard')}     title="Combat / death hotspots">⚠ hazard</button>
        <button className={clsx('lang-btn', overlay === 'fertility'  && 'active')} onClick={() => setOverlay(overlay === 'fertility'  ? null : 'fertility')}  title="Soil fertility">✿ fertile</button>
        <button className={clsx('lang-btn', overlay === 'structures' && 'active')} onClick={() => setOverlay(overlay === 'structures' ? null : 'structures')} title="Building density">⌂ builds</button>
        <button className={clsx('lang-btn', overlay === 'trails'     && 'active')} onClick={() => setOverlay(overlay === 'trails'     ? null : 'trails')}     title="Food / water / path stigmergy blended">⋯ trails</button>
        <button className={clsx('lang-btn', overlay === 'age'        && 'active')} onClick={() => setOverlay(overlay === 'age'        ? null : 'age')}        title="Per-tile mean age">⏳ age</button>
        <button className={clsx('lang-btn', overlay === 'threat'     && 'active')} onClick={() => setOverlay(overlay === 'threat'     ? null : 'threat')}     title="Where organisms feel fearful">🜸 threat</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">focus</div>
      <div className="more-dropdown-grid">
        <button className={clsx('lang-btn', focus === 'all'      && 'active')} onClick={() => setFocus('all')}>· all</button>
        <button className={clsx('lang-btn', focus === 'sick'     && 'active')} onClick={() => setFocus(focus === 'sick' ? 'all' : 'sick')} title="Highlight sick organisms">🤒 sick</button>
        <button className={clsx('lang-btn', focus === 'hungry'   && 'active')} onClick={() => setFocus(focus === 'hungry' ? 'all' : 'hungry')} title="Highlight starving organisms">😫 hungry</button>
        <button className={clsx('lang-btn', focus === 'elders'   && 'active')} onClick={() => setFocus(focus === 'elders' ? 'all' : 'elders')} title="Highlight elders">👴 elders</button>
        <button className={clsx('lang-btn', focus === 'builders' && 'active')} onClick={() => setFocus(focus === 'builders' ? 'all' : 'builders')} title="Highlight builders">🏗 builders</button>
        <button className={clsx('lang-btn', focus === 'thriving' && 'active')} onClick={() => setFocus(focus === 'thriving' ? 'all' : 'thriving')} title="Highlight thriving organisms">✦ thriving</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">view</div>
      <div className="more-dropdown-grid">
        <button className={clsx('lang-btn', viewFlags.territory && 'active')} onClick={() => setViewFlag('territory', !viewFlags.territory)}>⬡ territory</button>
        <button className={clsx('lang-btn', viewFlags.names     && 'active')} onClick={() => setViewFlag('names',     !viewFlags.names)}>Aa names</button>
        <button className={clsx('lang-btn', viewFlags.thoughts  && 'active')} onClick={() => setViewFlag('thoughts',  !viewFlags.thoughts)}>💭 thoughts</button>
        <button className={clsx('lang-btn', viewFlags.animals   && 'active')} onClick={() => setViewFlag('animals',   !viewFlags.animals)}>🦌 animals</button>
        <button className={clsx('lang-btn', viewFlags.grid      && 'active')} onClick={() => setViewFlag('grid',      !viewFlags.grid)}>⊞ grid</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">overlays</div>
      <div className="more-dropdown-grid">
        <button className={clsx('lang-btn', viewFlags.lineageDot && 'active')} onClick={() => setViewFlag('lineageDot', !viewFlags.lineageDot)} title="Colored dot per organism showing tribe affiliation">⬤ lineage</button>
        <button className={clsx('lang-btn', viewFlags.health     && 'active')} onClick={() => setViewFlag('health',     !viewFlags.health)} title="Ring tint by health">♥ health</button>
        <button className={clsx('lang-btn', viewFlags.age        && 'active')} onClick={() => setViewFlag('age',        !viewFlags.age)} title="Age tint: child / adult / elder">⏳ age</button>
        <button className={clsx('lang-btn', viewFlags.fear       && 'active')} onClick={() => setViewFlag('fear',       !viewFlags.fear)} title="Fear halo">⚠ fear</button>
        <button className={clsx('lang-btn', viewFlags.partners   && 'active')} onClick={() => setViewFlag('partners',   !viewFlags.partners)} title="Bond line between partners">♥♥ pairs</button>
        <button className={clsx('lang-btn', viewFlags.pregnancy  && 'active')} onClick={() => setViewFlag('pregnancy',  !viewFlags.pregnancy)} title="Pregnancy marker">◯ pregnant</button>
        <button className={clsx('lang-btn', viewFlags.trails     && 'active')} onClick={() => setViewFlag('trails',     !viewFlags.trails)} title="Food / water / path stigmergy">⋯ trails</button>
        <button className={clsx('lang-btn', viewFlags.structures && 'active')} onClick={() => setViewFlag('structures', !viewFlags.structures)} title="Highlight huts and campfires">⌂ builds</button>
        <button className={clsx('lang-btn', viewFlags.fertility  && 'active')} onClick={() => setViewFlag('fertility',  !viewFlags.fertility)} title="Soil fertility heat">✿ fertility</button>
        <button className={clsx('lang-btn', viewFlags.hazard     && 'active')} onClick={() => setViewFlag('hazard',     !viewFlags.hazard)} title="Hazard scars - violence and death">✶ hazard</button>
        <button className={clsx('lang-btn', viewFlags.history    && 'active')} onClick={() => setViewFlag('history',    !viewFlags.history)} title="Per-lineage drift over the last ~60 sim-days">↝ history</button>
        <button className={clsx('lang-btn', viewFlags.fps        && 'active')} onClick={() => setViewFlag('fps',        !viewFlags.fps)} title="Frames-per-second + frame timing">⏱ perf</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-grid">
        <button className="lang-btn" onClick={() => { openLanguages();  closeMore() }}>⌖ lang</button>
        <button className="lang-btn" onClick={() => { openFamilyTree(); closeMore() }}>⬡ tree</button>
        <button className={clsx('lang-btn', leftOpen && 'active')} onClick={() => { toggleLeft(); closeMore() }}>⊞ world</button>
        <button className="lang-btn" onClick={() => { openAbout(); closeMore() }} title="Build info, versions, and links">ⓘ about</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">experiments</div>
      <div className="more-dropdown-grid">
        <button
          className={clsx('lang-btn', viewFlags.threeD && 'active')}
          onClick={() => setViewFlag('threeD', !viewFlags.threeD)}
          title="Free-fly 3D world. WASD + mouse. Desktop only.">
          ◈ 3d world
        </button>
        {viewFlags.threeD && (
          <button
            className={clsx('lang-btn', viewFlags.hideUI && 'active')}
            onClick={() => setViewFlag('hideUI', !viewFlags.hideUI)}
            title="Hide sidebars in 3D mode for immersion">
            ▤ hide ui
          </button>
        )}
        {viewFlags.threeD && (
          <button
            className={clsx('lang-btn', viewFlags.orgPov && 'active')}
            onClick={() => setViewFlag('orgPov', !viewFlags.orgPov)}
            title="First-person camera from the selected org's head (3D only)">
            👁 org POV
          </button>
        )}
        <button
          className={clsx('lang-btn', viewFlags.photoMode && 'active')}
          onClick={() => setViewFlag('photoMode', !viewFlags.photoMode)}
          title="Hide every panel for clean screenshots. Move mouse to top-left to bring the header back.">
          📷 photo mode
        </button>
        <button
          className={clsx('lang-btn', viewFlags.actionTicker && 'active')}
          onClick={() => setViewFlag('actionTicker', !viewFlags.actionTicker)}
          title="Live ticker at the bottom: what each org is doing right now">
          ⋮⋮⋮ ticker
        </button>
        {!viewFlags.threeD && (
          <button
            className={clsx('lang-btn', viewFlags.miniMap2D && 'active')}
            onClick={() => setViewFlag('miniMap2D', !viewFlags.miniMap2D)}
            title="Top-right mini-globe overview (2D mode)">
            ◔ mini-map
          </button>
        )}
        <button
          className={clsx('lang-btn', viewFlags.randomTour && 'active')}
          onClick={() => setViewFlag('randomTour', !viewFlags.randomTour)}
          title="Auto-cycle the selected org every 8 seconds. Click an org to pause.">
          🎲 tour
        </button>
        <button
          className={clsx('lang-btn', viewFlags.slowMo && 'active')}
          onClick={() => {
            const v = !viewFlags.slowMo
            setViewFlag('slowMo', v)
            if (v) setViewFlag('fastMo', false)
          }}
          title="0.5× client-side motion lerp for cinematic playback">
          ◐ slow-mo
        </button>
        <button
          className={clsx('lang-btn', viewFlags.fastMo && 'active')}
          onClick={() => {
            const v = !viewFlags.fastMo
            setViewFlag('fastMo', v)
            if (v) setViewFlag('slowMo', false)
          }}
          title="2× client-side motion lerp">
          ◑ fast-mo
        </button>
        <button
          className={clsx('lang-btn', viewFlags.colorBlind && 'active')}
          onClick={() => setViewFlag('colorBlind', !viewFlags.colorBlind)}
          title="Deuteranopia-safe lineage palette (red-green swap)">
          ◓ colorblind
        </button>
      </div>
    </div>
  )
}
