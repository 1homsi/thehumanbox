import clsx from 'clsx'
import { useUIStore, useViewFlag } from '../../state/store'
import { SHORTCUT_HELP } from '../../game/model/shortcuts'
import { saveMapPicture } from '../../shared/mapPicture'
import { useWorldStore } from '../../state/worldStore'
import { Tooltip } from './Tooltip'
import { saveBlocked, saveLabel, saveShortcutLabel, type WorldActions } from './world-actions'
import { shortcutWhat } from './shortcut-text'
import { t } from '../../i18n'

/**
 * `onAction` runs whenever the dropdown closes (an action or a toggle). `worldActions` puts
 * "Find a tool" and "Save world" at the top; the phone menu has rows of its own for them.
 */
export function MoreDropdown({
  onAction,
  worldActions,
}: { onAction?: () => void; worldActions?: WorldActions } = {}) {
  const focus = useUIStore((s) => s.focus)
  const leftOpen = useUIStore((s) => s.leftOpen)
  const setFocus = useUIStore((s) => s.setFocus)
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const toggleLeft = useUIStore((s) => s.toggleLeft)
  const openLanguages = useUIStore((s) => s.openLanguages)
  const openFamilyTree = useUIStore((s) => s.openFamilyTree)
  const openAchievements = useUIStore((s) => s.openAchievements)
  const openGoals = useUIStore((s) => s.openGoals)
  const openScenarios = useUIStore((s) => s.openScenarios)
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

  const closeMore = () => {
    useUIStore.setState({ showMore: false })
    onAction?.()
  }

  const { findTool, save } = worldActions ?? {}

  return (
    <div className="more-dropdown">
      {(findTool || save) && (
        <>
          <div className="more-dropdown-actions">
            {findTool && (
              <button
                type="button"
                className="more-dropdown-action"
                onClick={() => {
                  closeMore()
                  findTool()
                }}
              >
                <span>⌕ {t('dock.more.findTool')}</span>
                <kbd>/</kbd>
              </button>
            )}
            {save && (
              <button
                type="button"
                className={clsx('more-dropdown-action', save.error && 'error', save.busy && 'busy')}
                onClick={save.onSave}
                disabled={saveBlocked(save)}
                aria-busy={save.busy}
                aria-keyshortcuts="Meta+S Control+S"
              >
                <span>{saveLabel(save)}</span>
                <kbd>{saveShortcutLabel()}</kbd>
                {save.status && (
                  <small className="more-dropdown-status" role="status">
                    {save.status}
                  </small>
                )}
              </button>
            )}
          </div>
          <div className="more-dropdown-divider" />
        </>
      )}
      <div className="more-dropdown-section">{t('dock.more.focus')}</div>
      <div className="more-dropdown-grid">
        <Tooltip tip={t('dock.more.showAllTip')}>
          <button
            className={clsx('lang-btn', focus === 'all' && 'active')}
            aria-pressed={!!(focus === 'all')}
            onClick={() => setFocus('all')}
          >
            · {t('dock.more.all')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.sickTip')}>
          <button
            className={clsx('lang-btn', focus === 'sick' && 'active')}
            aria-pressed={!!(focus === 'sick')}
            onClick={() => setFocus(focus === 'sick' ? 'all' : 'sick')}
          >
            🤒 {t('dock.more.sick')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.hungryTip')}>
          <button
            className={clsx('lang-btn', focus === 'hungry' && 'active')}
            aria-pressed={!!(focus === 'hungry')}
            onClick={() => setFocus(focus === 'hungry' ? 'all' : 'hungry')}
          >
            😫 {t('dock.more.hungry')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.eldersTip')}>
          <button
            className={clsx('lang-btn', focus === 'elders' && 'active')}
            aria-pressed={!!(focus === 'elders')}
            onClick={() => setFocus(focus === 'elders' ? 'all' : 'elders')}
          >
            👴 {t('dock.more.elders')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.buildersTip')}>
          <button
            className={clsx('lang-btn', focus === 'builders' && 'active')}
            aria-pressed={!!(focus === 'builders')}
            onClick={() => setFocus(focus === 'builders' ? 'all' : 'builders')}
          >
            🏗 {t('dock.more.builders')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.thrivingTip')}>
          <button
            className={clsx('lang-btn', focus === 'thriving' && 'active')}
            aria-pressed={!!(focus === 'thriving')}
            onClick={() => setFocus(focus === 'thriving' ? 'all' : 'thriving')}
          >
            ✦ {t('dock.more.thriving')}
          </button>
        </Tooltip>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-section">{t('dock.more.decorations')}</div>
      <div className="more-dropdown-grid">
        <Tooltip tip={t('dock.more.lineageTip')}>
          <button
            className={clsx('lang-btn', lineageDot && 'active')}
            aria-pressed={!!lineageDot}
            onClick={() => setViewFlag('lineageDot', !lineageDot)}
          >
            ⬤ {t('dock.more.lineage')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.healthTip')}>
          <button
            className={clsx('lang-btn', health && 'active')}
            aria-pressed={!!health}
            onClick={() => setViewFlag('health', !health)}
          >
            ♥ {t('dock.more.health')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.ageTip')}>
          <button
            className={clsx('lang-btn', age && 'active')}
            aria-pressed={!!age}
            onClick={() => setViewFlag('age', !age)}
          >
            ⏳ {t('dock.more.age')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.fearTip')}>
          <button
            className={clsx('lang-btn', fear && 'active')}
            aria-pressed={!!fear}
            onClick={() => setViewFlag('fear', !fear)}
          >
            ⚠ {t('dock.more.fear')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.pairsTip')}>
          <button
            className={clsx('lang-btn', partners && 'active')}
            aria-pressed={!!partners}
            onClick={() => setViewFlag('partners', !partners)}
          >
            ♥♥ {t('dock.more.pairs')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.pregnantTip')}>
          <button
            className={clsx('lang-btn', pregnancy && 'active')}
            aria-pressed={!!pregnancy}
            onClick={() => setViewFlag('pregnancy', !pregnancy)}
          >
            ◯ {t('dock.more.pregnant')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.trailsTip')}>
          <button
            className={clsx('lang-btn', trails && 'active')}
            aria-pressed={!!trails}
            onClick={() => setViewFlag('trails', !trails)}
          >
            ⋯ {t('dock.more.trails')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.buildsTip')}>
          <button
            className={clsx('lang-btn', structures && 'active')}
            aria-pressed={!!structures}
            onClick={() => setViewFlag('structures', !structures)}
          >
            ⌂ {t('dock.more.builds')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.fertilityTip')}>
          <button
            className={clsx('lang-btn', fertility && 'active')}
            aria-pressed={!!fertility}
            onClick={() => setViewFlag('fertility', !fertility)}
          >
            ✿ {t('dock.more.fertility')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.hazardTip')}>
          <button
            className={clsx('lang-btn', hazard && 'active')}
            aria-pressed={!!hazard}
            onClick={() => setViewFlag('hazard', !hazard)}
          >
            ✶ {t('dock.more.hazard')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.historyTip')}>
          <button
            className={clsx('lang-btn', history && 'active')}
            aria-pressed={!!history}
            onClick={() => setViewFlag('history', !history)}
          >
            ↝ {t('dock.more.history')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.perfTip')}>
          <button
            className={clsx('lang-btn', fps && 'active')}
            aria-pressed={!!fps}
            onClick={() => setViewFlag('fps', !fps)}
          >
            ⏱ {t('dock.more.perf')}
          </button>
        </Tooltip>
      </div>

      <div className="more-dropdown-divider" />
      <div className="more-dropdown-grid">
        <Tooltip tip={t('dock.more.langTip')}>
          <button
            className="lang-btn"
            onClick={() => {
              openLanguages()
              closeMore()
            }}
          >
            ⌖ {t('dock.more.lang')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.scenesTip')}>
          <button
            className="lang-btn"
            onClick={() => {
              openScenarios()
              closeMore()
            }}
          >
            ✦ {t('dock.more.scenes')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.featsTip')}>
          <button
            className="lang-btn"
            onClick={() => {
              openAchievements()
              closeMore()
            }}
          >
            ★ {t('dock.more.feats')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.goalsTip')}>
          <button
            className="lang-btn"
            onClick={() => {
              openGoals()
              closeMore()
            }}
          >
            ◎ {t('dock.more.goals')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.treeTip')}>
          <button
            className="lang-btn"
            onClick={() => {
              openFamilyTree()
              closeMore()
            }}
          >
            ⬡ {t('dock.more.tree')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.worldTip')}>
          <button
            className={clsx('lang-btn', leftOpen && 'active')}
            aria-pressed={!!leftOpen}
            onClick={() => {
              toggleLeft()
              closeMore()
            }}
          >
            ⊞ {t('dock.more.world')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.onBrinkTip')}>
          <button
            className={clsx('lang-btn', pauseOnPeril && 'active')}
            aria-pressed={pauseOnPeril}
            onClick={() => setPauseOnPeril(!pauseOnPeril)}
          >
            ⏸ {t('dock.more.onBrink')}
          </button>
        </Tooltip>
        <Tooltip
          tip={
            <span className="tip-card">
              <strong>{t('dock.more.keys')}</strong>
              {SHORTCUT_HELP.map(([key, what]) => (
                <span key={key}>
                  <b>{key}</b> {shortcutWhat(key, what)}
                </span>
              ))}
            </span>
          }
        >
          <button className="lang-btn">⌨ {t('dock.more.keys')}</button>
        </Tooltip>
        <Tooltip tip={t('dock.more.pictureTip')}>
          <button
            className="lang-btn"
            onClick={() => {
              void saveMapPicture(useWorldStore.getState().world?.tick)
              closeMore()
            }}
          >
            ▣ {t('dock.more.picture')}
          </button>
        </Tooltip>
        <Tooltip tip={t('dock.more.notableTip')}>
          <button
            className="lang-btn"
            onClick={() => {
              openNotable()
              closeMore()
            }}
          >
            ✦ {t('dock.more.notable')}
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
