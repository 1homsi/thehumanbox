import clsx from 'clsx'
import { useUIStore, useViewFlag } from '../stores/store'

export function MoreDropdown() {
  const overlay     = useUIStore(s => s.overlay)
  const focus       = useUIStore(s => s.focus)
  const leftOpen    = useUIStore(s => s.leftOpen)
  const setOverlay  = useUIStore(s => s.setOverlay)
  const setFocus    = useUIStore(s => s.setFocus)
  const setViewFlag = useUIStore(s => s.setViewFlag)
  const toggleLeft  = useUIStore(s => s.toggleLeft)
  const openLanguages  = useUIStore(s => s.openLanguages)
  const openFamilyTree = useUIStore(s => s.openFamilyTree)
  const openAbout      = useUIStore(s => s.openAbout)

  // Per-flag scalar subscriptions so toggling one flag doesn't re-render
  // every component that read `viewFlags` as a whole object.
  const territory    = useViewFlag('territory')
  const names        = useViewFlag('names')
  const thoughts     = useViewFlag('thoughts')
  const animals      = useViewFlag('animals')
  const grid         = useViewFlag('grid')
  const lineageDot   = useViewFlag('lineageDot')
  const health       = useViewFlag('health')
  const age          = useViewFlag('age')
  const fear         = useViewFlag('fear')
  const partners     = useViewFlag('partners')
  const pregnancy    = useViewFlag('pregnancy')
  const trails       = useViewFlag('trails')
  const structures   = useViewFlag('structures')
  const fertility    = useViewFlag('fertility')
  const hazard       = useViewFlag('hazard')
  const history      = useViewFlag('history')
  const fps          = useViewFlag('fps')
  const territoryMap = useViewFlag('territoryMap')
  const threeD       = useViewFlag('threeD')
  const hideUI       = useViewFlag('hideUI')
  const orgPov       = useViewFlag('orgPov')
  const photoMode    = useViewFlag('photoMode')
  const actionTicker = useViewFlag('actionTicker')
  const randomTour   = useViewFlag('randomTour')
  const slowMo       = useViewFlag('slowMo')
  const fastMo       = useViewFlag('fastMo')
  const colorBlind   = useViewFlag('colorBlind')

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
        <button className={clsx('lang-btn', territory && 'active')} aria-pressed={!!( territory )} onClick={() => setViewFlag('territory', !territory)}>⬡ territory</button>
        <button className={clsx('lang-btn', names && 'active')} aria-pressed={!!( names )} onClick={() => setViewFlag('names',     !names)}>Aa names</button>
        <button className={clsx('lang-btn', thoughts && 'active')} aria-pressed={!!( thoughts )} onClick={() => setViewFlag('thoughts',  !thoughts)}>💭 thoughts</button>
        <button className={clsx('lang-btn', animals && 'active')} aria-pressed={!!( animals )} onClick={() => setViewFlag('animals',   !animals)}>🦌 animals</button>
        <button className={clsx('lang-btn', grid && 'active')} aria-pressed={!!( grid )} onClick={() => setViewFlag('grid',      !grid)}>⊞ grid</button>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">organism decorations</div>
      <div className="more-dropdown-grid">
        <button className={clsx('lang-btn', lineageDot && 'active')} aria-pressed={!!( lineageDot )} onClick={() => setViewFlag('lineageDot', !lineageDot)} title="Colored dot per organism showing tribe affiliation">⬤ lineage</button>
        <button className={clsx('lang-btn', health && 'active')} aria-pressed={!!( health )} onClick={() => setViewFlag('health',     !health)} title="Ring tint by health">♥ health</button>
        <button className={clsx('lang-btn', age && 'active')} aria-pressed={!!( age )} onClick={() => setViewFlag('age',        !age)} title="Age tint: child / adult / elder">⏳ age</button>
        <button className={clsx('lang-btn', fear && 'active')} aria-pressed={!!( fear )} onClick={() => setViewFlag('fear',       !fear)} title="Fear halo">⚠ fear</button>
        <button className={clsx('lang-btn', partners && 'active')} aria-pressed={!!( partners )} onClick={() => setViewFlag('partners',   !partners)} title="Bond line between partners">♥♥ pairs</button>
        <button className={clsx('lang-btn', pregnancy && 'active')} aria-pressed={!!( pregnancy )} onClick={() => setViewFlag('pregnancy',  !pregnancy)} title="Pregnancy marker">◯ pregnant</button>
        <button className={clsx('lang-btn', trails && 'active')} aria-pressed={!!( trails )} onClick={() => setViewFlag('trails',     !trails)} title="Food / water / path stigmergy">⋯ trails</button>
        <button className={clsx('lang-btn', structures && 'active')} aria-pressed={!!( structures )} onClick={() => setViewFlag('structures', !structures)} title="Highlight huts and campfires">⌂ builds</button>
        <button className={clsx('lang-btn', fertility && 'active')} aria-pressed={!!( fertility )} onClick={() => setViewFlag('fertility',  !fertility)} title="Soil fertility heat">✿ fertility</button>
        <button className={clsx('lang-btn', hazard && 'active')} aria-pressed={!!( hazard )} onClick={() => setViewFlag('hazard',     !hazard)} title="Hazard scars - violence and death">✶ hazard</button>
        <button className={clsx('lang-btn', history && 'active')} aria-pressed={!!( history )} onClick={() => setViewFlag('history',      !history)} title="Per-lineage drift over the last ~60 sim-days">↝ history</button>
        <button className={clsx('lang-btn', fps && 'active')} aria-pressed={!!( fps )} onClick={() => setViewFlag('fps',          !fps)} title="Frames-per-second + frame timing">⏱ perf</button>
        <button className={clsx('lang-btn', territoryMap && 'active')} aria-pressed={!!( territoryMap )} onClick={() => setViewFlag('territoryMap', !territoryMap)} title="3D territory overlay - lineage claims and contested zones">⬡ territory 3d</button>
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
          className={clsx('lang-btn', threeD && 'active')} aria-pressed={!!( threeD )}
          onClick={() => setViewFlag('threeD', !threeD)}
          // Warm the lazy chunk before click so users don't stare at the
          // loading spinner for a second after pressing the button.
          onMouseEnter={() => { void import('../world/WorldView3D') }}
          onFocus={() => { void import('../world/WorldView3D') }}
          title="Free-fly 3D world. WASD + mouse. Desktop only.">
          ◈ 3d world
        </button>
        {threeD && (
          <button
            className={clsx('lang-btn', hideUI && 'active')} aria-pressed={!!( hideUI )}
            onClick={() => setViewFlag('hideUI', !hideUI)}
            title="Hide sidebars in 3D mode for immersion">
            ▤ hide ui
          </button>
        )}
        {threeD && (
          <button
            className={clsx('lang-btn', orgPov && 'active')} aria-pressed={!!( orgPov )}
            onClick={() => setViewFlag('orgPov', !orgPov)}
            title="First-person camera from the selected org's head (3D only)">
            👁 org POV
          </button>
        )}
        <button
          className={clsx('lang-btn', photoMode && 'active')} aria-pressed={!!( photoMode )}
          onClick={() => setViewFlag('photoMode', !photoMode)}
          title="Hide every panel for clean screenshots. Move mouse to top-left to bring the header back.">
          📷 photo mode
        </button>
        <button
          className={clsx('lang-btn', actionTicker && 'active')} aria-pressed={!!( actionTicker )}
          onClick={() => setViewFlag('actionTicker', !actionTicker)}
          title="Live ticker at the bottom: what each org is doing right now">
          ⋮⋮⋮ ticker
        </button>
        <button
          className={clsx('lang-btn', randomTour && 'active')} aria-pressed={!!( randomTour )}
          onClick={() => setViewFlag('randomTour', !randomTour)}
          title="Auto-cycle the selected org every 8 seconds. Click an org to pause.">
          🎲 tour
        </button>
        <button
          className={clsx('lang-btn', slowMo && 'active')} aria-pressed={!!( slowMo )}
          onClick={() => {
            const v = !slowMo
            setViewFlag('slowMo', v)
            if (v) setViewFlag('fastMo', false)
          }}
          title="0.5× client-side motion lerp for cinematic playback">
          ◐ slow-mo
        </button>
        <button
          className={clsx('lang-btn', fastMo && 'active')} aria-pressed={!!( fastMo )}
          onClick={() => {
            const v = !fastMo
            setViewFlag('fastMo', v)
            if (v) setViewFlag('slowMo', false)
          }}
          title="2× client-side motion lerp">
          ◑ fast-mo
        </button>
        <button
          className={clsx('lang-btn', colorBlind && 'active')} aria-pressed={!!( colorBlind )}
          onClick={() => setViewFlag('colorBlind', !colorBlind)}
          title="Deuteranopia-safe lineage palette (red-green swap)">
          ◓ colorblind
        </button>
      </div>
    </div>
  )
}
