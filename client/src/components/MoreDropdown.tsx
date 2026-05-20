import clsx from 'clsx'
import { useUIStore } from '../stores/store'

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
        <button className={clsx('lang-btn', overlay === 'density' && 'active')} aria-pressed={!!( overlay === 'density' )} onClick={() => setOverlay(overlay === 'density'    ? null : 'density')}    title="Population density">👥 crowd</button>
        <button className={clsx('lang-btn', overlay === 'hazard' && 'active')} aria-pressed={!!( overlay === 'hazard' )} onClick={() => setOverlay(overlay === 'hazard'     ? null : 'hazard')}     title="Combat / death hotspots">⚠ hazard</button>
        <button className={clsx('lang-btn', overlay === 'fertility' && 'active')} aria-pressed={!!( overlay === 'fertility' )} onClick={() => setOverlay(overlay === 'fertility'  ? null : 'fertility')}  title="Soil fertility">✿ fertile</button>
        <button className={clsx('lang-btn', overlay === 'structures' && 'active')} aria-pressed={!!( overlay === 'structures' )} onClick={() => setOverlay(overlay === 'structures' ? null : 'structures')} title="Building density">⌂ builds</button>
        <button className={clsx('lang-btn', overlay === 'trails' && 'active')} aria-pressed={!!( overlay === 'trails' )} onClick={() => setOverlay(overlay === 'trails'     ? null : 'trails')}     title="Food / water / path stigmergy blended">⋯ trails</button>
        <button className={clsx('lang-btn', overlay === 'age' && 'active')} aria-pressed={!!( overlay === 'age' )} onClick={() => setOverlay(overlay === 'age'        ? null : 'age')}        title="Per-tile mean age">⏳ age</button>
        <button className={clsx('lang-btn', overlay === 'threat' && 'active')} aria-pressed={!!( overlay === 'threat' )} onClick={() => setOverlay(overlay === 'threat'     ? null : 'threat')}     title="Where organisms feel fearful">🜸 threat</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">focus</div>
      <div className="more-dropdown-grid">
        <button className={clsx('lang-btn', focus === 'all' && 'active')} aria-pressed={!!( focus === 'all' )} onClick={() => setFocus('all')}>· all</button>
        <button className={clsx('lang-btn', focus === 'sick' && 'active')} aria-pressed={!!( focus === 'sick' )} onClick={() => setFocus(focus === 'sick' ? 'all' : 'sick')} title="Highlight sick organisms">🤒 sick</button>
        <button className={clsx('lang-btn', focus === 'hungry' && 'active')} aria-pressed={!!( focus === 'hungry' )} onClick={() => setFocus(focus === 'hungry' ? 'all' : 'hungry')} title="Highlight starving organisms">😫 hungry</button>
        <button className={clsx('lang-btn', focus === 'elders' && 'active')} aria-pressed={!!( focus === 'elders' )} onClick={() => setFocus(focus === 'elders' ? 'all' : 'elders')} title="Highlight elders">👴 elders</button>
        <button className={clsx('lang-btn', focus === 'builders' && 'active')} aria-pressed={!!( focus === 'builders' )} onClick={() => setFocus(focus === 'builders' ? 'all' : 'builders')} title="Highlight builders">🏗 builders</button>
        <button className={clsx('lang-btn', focus === 'thriving' && 'active')} aria-pressed={!!( focus === 'thriving' )} onClick={() => setFocus(focus === 'thriving' ? 'all' : 'thriving')} title="Highlight thriving organisms">✦ thriving</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">view</div>
      <div className="more-dropdown-grid">
        <button className={clsx('lang-btn', viewFlags.territory && 'active')} aria-pressed={!!( viewFlags.territory )} onClick={() => setViewFlag('territory', !viewFlags.territory)}>⬡ territory</button>
        <button className={clsx('lang-btn', viewFlags.names && 'active')} aria-pressed={!!( viewFlags.names )} onClick={() => setViewFlag('names',     !viewFlags.names)}>Aa names</button>
        <button className={clsx('lang-btn', viewFlags.thoughts && 'active')} aria-pressed={!!( viewFlags.thoughts )} onClick={() => setViewFlag('thoughts',  !viewFlags.thoughts)}>💭 thoughts</button>
        <button className={clsx('lang-btn', viewFlags.animals && 'active')} aria-pressed={!!( viewFlags.animals )} onClick={() => setViewFlag('animals',   !viewFlags.animals)}>🦌 animals</button>
        <button className={clsx('lang-btn', viewFlags.grid && 'active')} aria-pressed={!!( viewFlags.grid )} onClick={() => setViewFlag('grid',      !viewFlags.grid)}>⊞ grid</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">organism decorations</div>
      <div className="more-dropdown-grid">
        <button className={clsx('lang-btn', viewFlags.lineageDot && 'active')} aria-pressed={!!( viewFlags.lineageDot )} onClick={() => setViewFlag('lineageDot', !viewFlags.lineageDot)} title="Colored dot per organism showing tribe affiliation">⬤ lineage</button>
        <button className={clsx('lang-btn', viewFlags.health && 'active')} aria-pressed={!!( viewFlags.health )} onClick={() => setViewFlag('health',     !viewFlags.health)} title="Ring tint by health">♥ health</button>
        <button className={clsx('lang-btn', viewFlags.age && 'active')} aria-pressed={!!( viewFlags.age )} onClick={() => setViewFlag('age',        !viewFlags.age)} title="Age tint: child / adult / elder">⏳ age</button>
        <button className={clsx('lang-btn', viewFlags.fear && 'active')} aria-pressed={!!( viewFlags.fear )} onClick={() => setViewFlag('fear',       !viewFlags.fear)} title="Fear halo">⚠ fear</button>
        <button className={clsx('lang-btn', viewFlags.partners && 'active')} aria-pressed={!!( viewFlags.partners )} onClick={() => setViewFlag('partners',   !viewFlags.partners)} title="Bond line between partners">♥♥ pairs</button>
        <button className={clsx('lang-btn', viewFlags.pregnancy && 'active')} aria-pressed={!!( viewFlags.pregnancy )} onClick={() => setViewFlag('pregnancy',  !viewFlags.pregnancy)} title="Pregnancy marker">◯ pregnant</button>
        <button className={clsx('lang-btn', viewFlags.trails && 'active')} aria-pressed={!!( viewFlags.trails )} onClick={() => setViewFlag('trails',     !viewFlags.trails)} title="Food / water / path stigmergy">⋯ trails</button>
        <button className={clsx('lang-btn', viewFlags.structures && 'active')} aria-pressed={!!( viewFlags.structures )} onClick={() => setViewFlag('structures', !viewFlags.structures)} title="Highlight huts and campfires">⌂ builds</button>
        <button className={clsx('lang-btn', viewFlags.fertility && 'active')} aria-pressed={!!( viewFlags.fertility )} onClick={() => setViewFlag('fertility',  !viewFlags.fertility)} title="Soil fertility heat">✿ fertility</button>
        <button className={clsx('lang-btn', viewFlags.hazard && 'active')} aria-pressed={!!( viewFlags.hazard )} onClick={() => setViewFlag('hazard',     !viewFlags.hazard)} title="Hazard scars - violence and death">✶ hazard</button>
        <button className={clsx('lang-btn', viewFlags.history && 'active')} aria-pressed={!!( viewFlags.history )} onClick={() => setViewFlag('history',      !viewFlags.history)} title="Per-lineage drift over the last ~60 sim-days">↝ history</button>
        <button className={clsx('lang-btn', viewFlags.fps && 'active')} aria-pressed={!!( viewFlags.fps )} onClick={() => setViewFlag('fps',          !viewFlags.fps)} title="Frames-per-second + frame timing">⏱ perf</button>
        <button className={clsx('lang-btn', viewFlags.territoryMap && 'active')} aria-pressed={!!( viewFlags.territoryMap )} onClick={() => setViewFlag('territoryMap', !viewFlags.territoryMap)} title="3D territory overlay — lineage claims and contested zones">⬡ territory 3d</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-grid">
        <button className="lang-btn" onClick={() => { openLanguages();  closeMore() }}>⌖ lang</button>
        <button className="lang-btn" onClick={() => { openFamilyTree(); closeMore() }}>⬡ tree</button>
        <button className={clsx('lang-btn', leftOpen && 'active')} aria-pressed={!!( leftOpen )} onClick={() => { toggleLeft(); closeMore() }}>⊞ world</button>
        <button className="lang-btn" onClick={() => { openAbout(); closeMore() }} title="Build info, versions, and links">ⓘ about</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">experiments</div>
      <div className="more-dropdown-grid">
        <button
          className={clsx('lang-btn', viewFlags.threeD && 'active')} aria-pressed={!!( viewFlags.threeD )}
          onClick={() => setViewFlag('threeD', !viewFlags.threeD)}
          // Warm the lazy chunk before click so users don't stare at the
          // loading spinner for a second after pressing the button.
          onMouseEnter={() => { void import('../world/WorldView3D') }}
          onFocus={() => { void import('../world/WorldView3D') }}
          title="Free-fly 3D world. WASD + mouse. Desktop only.">
          ◈ 3d world
        </button>
        {viewFlags.threeD && (
          <button
            className={clsx('lang-btn', viewFlags.hideUI && 'active')} aria-pressed={!!( viewFlags.hideUI )}
            onClick={() => setViewFlag('hideUI', !viewFlags.hideUI)}
            title="Hide sidebars in 3D mode for immersion">
            ▤ hide ui
          </button>
        )}
        {viewFlags.threeD && (
          <button
            className={clsx('lang-btn', viewFlags.orgPov && 'active')} aria-pressed={!!( viewFlags.orgPov )}
            onClick={() => setViewFlag('orgPov', !viewFlags.orgPov)}
            title="First-person camera from the selected org's head (3D only)">
            👁 org POV
          </button>
        )}
        <button
          className={clsx('lang-btn', viewFlags.photoMode && 'active')} aria-pressed={!!( viewFlags.photoMode )}
          onClick={() => setViewFlag('photoMode', !viewFlags.photoMode)}
          title="Hide every panel for clean screenshots. Move mouse to top-left to bring the header back.">
          📷 photo mode
        </button>
        <button
          className={clsx('lang-btn', viewFlags.actionTicker && 'active')} aria-pressed={!!( viewFlags.actionTicker )}
          onClick={() => setViewFlag('actionTicker', !viewFlags.actionTicker)}
          title="Live ticker at the bottom: what each org is doing right now">
          ⋮⋮⋮ ticker
        </button>
        <button
          className={clsx('lang-btn', viewFlags.randomTour && 'active')} aria-pressed={!!( viewFlags.randomTour )}
          onClick={() => setViewFlag('randomTour', !viewFlags.randomTour)}
          title="Auto-cycle the selected org every 8 seconds. Click an org to pause.">
          🎲 tour
        </button>
        <button
          className={clsx('lang-btn', viewFlags.slowMo && 'active')} aria-pressed={!!( viewFlags.slowMo )}
          onClick={() => {
            const v = !viewFlags.slowMo
            setViewFlag('slowMo', v)
            if (v) setViewFlag('fastMo', false)
          }}
          title="0.5× client-side motion lerp for cinematic playback">
          ◐ slow-mo
        </button>
        <button
          className={clsx('lang-btn', viewFlags.fastMo && 'active')} aria-pressed={!!( viewFlags.fastMo )}
          onClick={() => {
            const v = !viewFlags.fastMo
            setViewFlag('fastMo', v)
            if (v) setViewFlag('slowMo', false)
          }}
          title="2× client-side motion lerp">
          ◑ fast-mo
        </button>
        <button
          className={clsx('lang-btn', viewFlags.colorBlind && 'active')} aria-pressed={!!( viewFlags.colorBlind )}
          onClick={() => setViewFlag('colorBlind', !viewFlags.colorBlind)}
          title="Deuteranopia-safe lineage palette (red-green swap)">
          ◓ colorblind
        </button>
      </div>
    </div>
  )
}
