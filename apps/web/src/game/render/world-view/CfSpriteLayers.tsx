import { useEffect } from 'react'
import { StatsOverlay, useGame } from 'cubeforge'
import type { WorldState } from '../../../shared/types'
import type { InterpRefs } from '../../../simulation/useSimulation'
import type { ViewFlags } from '../../../state/store'
import { AnimalSpriteLayers } from '../cf/animals/AnimalSpriteLayers'
import { cfFlag } from '../cf/flags'
import { PeopleSpriteLayers } from '../cf/people/PeopleSpriteLayers'
import { cfPerf } from '../cf/people/bridge'

interface Props {
  world: WorldState
  interp?: InterpRefs
  selectedOrgId: string | null
  focus: string
  viewFlags: ViewFlags
  rendererPaused: boolean
  cameraStateRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>
}

/** Dev-only: hands the engine, the camera and the timing counters to the benchmark page. */
function Probe({ cameraStateRef }: Pick<Props, 'cameraStateRef'>) {
  const engine = useGame()
  useEffect(() => {
    const probe = { engine, camera: cameraStateRef, perf: cfPerf }
    ;(window as unknown as { __thbCf?: unknown }).__thbCf = probe
    return () => {
      if ((window as unknown as { __thbCf?: unknown }).__thbCf === probe)
        delete (window as unknown as { __thbCf?: unknown }).__thbCf
    }
  }, [engine, cameraStateRef])
  return null
}

/**
 * The cubeforge-backed pieces of the world view, each behind a `?cf=` flag
 * (see cf/flags.ts). Mount inside `<World>`. With no flag set it renders nothing.
 */
export function CfSpriteLayers(props: Props) {
  return (
    <>
      {cfFlag('people') && (
        <PeopleSpriteLayers
          world={props.world}
          interp={props.interp}
          selectedOrgId={props.selectedOrgId}
          focus={props.focus}
          viewFlags={props.viewFlags}
          rendererPaused={props.rendererPaused}
          cameraStateRef={props.cameraStateRef}
        />
      )}
      {cfFlag('animals') && (
        <AnimalSpriteLayers
          world={props.world}
          interp={props.interp}
          viewFlags={props.viewFlags}
          rendererPaused={props.rendererPaused}
        />
      )}
      {cfFlag('stats') && <StatsOverlay corner="top-right" />}
      {cfFlag('probe') && <Probe cameraStateRef={props.cameraStateRef} />}
    </>
  )
}
