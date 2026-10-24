import type { MutableRefObject } from 'react'
import { KEY_ZOOM_STEP } from './cf/input/camera-rig'
import type { MapCommand } from './camera-controls'
import { t } from '../../i18n'
import './map-controls.css'

interface Props {
  /** The same one-shot command slot the keyboard and the panels write to. */
  commandRef: MutableRefObject<MapCommand | null>
  /** Centre the camera on the selected person; absent when nobody is selected. */
  onLocate?: () => void
}

/**
 * On-screen camera controls for touch. A phone has only pinch, which is awkward one-handed
 * and impossible through a wet screen or a glove; these are the `0`, `+` and `-` keys as
 * 44px buttons. Shown on coarse pointers and on the phone breakpoint, where the wheel and
 * the keyboard do not exist.
 */
export function MapControls({ commandRef, onLocate }: Props) {
  const icon = (variant: string) => (
    <span className={`map-control-icon map-control-icon--${variant}`} aria-hidden="true" />
  )
  /** Run a request and put focus back on the map, so the keyboard keeps working after a press. */
  const press = (run: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    run()
    e.currentTarget.closest<HTMLElement>('.map2d-world')?.focus()
  }
  return (
    <div className="map-controls" data-map-ui>
      <button
        type="button"
        className="map-control-btn"
        aria-label={t('common.zoomIn')}
        onClick={press(() => {
          commandRef.current = { kind: 'zoom', factor: KEY_ZOOM_STEP }
        })}
      >
        {icon('in')}
      </button>
      <button
        type="button"
        className="map-control-btn"
        aria-label={t('common.zoomOut')}
        onClick={press(() => {
          commandRef.current = { kind: 'zoom', factor: 1 / KEY_ZOOM_STEP }
        })}
      >
        {icon('out')}
      </button>
      <button
        type="button"
        className="map-control-btn"
        aria-label={t('common.fitWorld')}
        onClick={press(() => {
          commandRef.current = { kind: 'fit' }
        })}
      >
        {icon('fit')}
      </button>
      {onLocate && (
        <button
          type="button"
          className="map-control-btn"
          aria-label={t('common.centreOnSelected')}
          onClick={press(onLocate)}
        >
          {icon('locate')}
        </button>
      )}
    </div>
  )
}
