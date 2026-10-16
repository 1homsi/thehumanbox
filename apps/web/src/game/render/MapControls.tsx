import type { MutableRefObject } from 'react'
import { KEY_ZOOM_STEP } from './cf/input/camera-rig'
import type { MapCommand } from './camera-controls'
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
 * 44px buttons. Hidden on fine pointers, where the wheel, the keyboard and the HUD cover it.
 */
export function MapControls({ commandRef, onLocate }: Props) {
  const icon = (variant: string) => <span className={`map-control-icon map-control-icon--${variant}`} />
  return (
    <div className="map-controls" data-map-ui>
      <button
        type="button"
        className="map-control-btn"
        aria-label="Zoom in"
        onClick={() => {
          commandRef.current = { kind: 'zoom', factor: KEY_ZOOM_STEP }
        }}
      >
        {icon('in')}
      </button>
      <button
        type="button"
        className="map-control-btn"
        aria-label="Zoom out"
        onClick={() => {
          commandRef.current = { kind: 'zoom', factor: 1 / KEY_ZOOM_STEP }
        }}
      >
        {icon('out')}
      </button>
      <button
        type="button"
        className="map-control-btn"
        aria-label="Fit world"
        onClick={() => {
          commandRef.current = { kind: 'fit' }
        }}
      >
        {icon('fit')}
      </button>
      {onLocate && (
        <button type="button" className="map-control-btn" aria-label="Centre on selected" onClick={onLocate}>
          {icon('locate')}
        </button>
      )}
    </div>
  )
}
