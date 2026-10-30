import { useEffect, useState, type MutableRefObject } from 'react'
import { BUTTON_ZOOM_STEP, zoomLimitAt, type MapCommand } from './camera-controls'
import { t } from '../../i18n'
import './map-controls.css'

interface Props {
  /** The same one-shot command slot the keyboard and the panels write to. */
  commandRef: MutableRefObject<MapCommand | null>
  /** The live camera, read to grey out a zoom button at its limit. */
  cameraRef?: MutableRefObject<{ zoom: number }>
  /** The least and most the camera may zoom. */
  zoomRange?: { min: number; max: number }
  /** Centre the camera on the selected person; absent when nobody is selected. */
  onLocate?: () => void
}

/**
 * On-screen camera controls for touch. A phone has only pinch, which is awkward one-handed
 * and impossible through a wet screen or a glove; these are the `0`, `+` and `-` keys as
 * 44px buttons. Shown on coarse pointers and on the phone breakpoint, where the wheel and
 * the keyboard do not exist.
 */
export function MapControls({ commandRef, cameraRef, zoomRange, onLocate }: Props) {
  const limit = useZoomLimit(cameraRef, zoomRange)
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
        title={limit === 'max' ? t('common.zoomInLimit') : undefined}
        disabled={limit === 'max'}
        onClick={press(() => {
          commandRef.current = { kind: 'zoom', factor: BUTTON_ZOOM_STEP, smooth: true }
        })}
      >
        {icon('in')}
      </button>
      <button
        type="button"
        className="map-control-btn"
        aria-label={t('common.zoomOut')}
        title={limit === 'min' ? t('common.zoomOutLimit') : undefined}
        disabled={limit === 'min'}
        onClick={press(() => {
          commandRef.current = { kind: 'zoom', factor: 1 / BUTTON_ZOOM_STEP, smooth: true }
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

/** Which zoom limit the camera is at, if either; checked a few times a second while shown. */
function useZoomLimit(
  cameraRef: MutableRefObject<{ zoom: number }> | undefined,
  range: { min: number; max: number } | undefined,
): 'min' | 'max' | null {
  const [limit, setLimit] = useState<'min' | 'max' | null>(null)
  const min = range?.min
  const max = range?.max
  useEffect(() => {
    if (!cameraRef || min === undefined || max === undefined) return
    const check = () => setLimit(zoomLimitAt(cameraRef.current.zoom, min, max))
    check()
    const timer = window.setInterval(check, 150)
    return () => window.clearInterval(timer)
  }, [cameraRef, min, max])
  return limit
}
