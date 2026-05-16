import { useGLTF } from '@react-three/drei'
import type { AnimalState } from '../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { AnimatedFigure } from './AnimatedFigure'

interface Props {
  animals:  AnimalState[]
  depthMap: number[][]
  biomes:   number[][]
}

// fox.glb animations: 'Survey' (idle), 'Walk', 'Run'.
// All animal kinds (rabbit/deer/boar/bird/fish/wolf/dog) currently render
// as foxes - quick visual stand-in until we add per-kind models.
const KIND_TINT: Record<string, string> = {
  rabbit: '#cccccc',
  deer:   '#a8825a',
  boar:   '#6a5240',
  bird:   '#d4a040',
  fish:   '#88aaff',
  wolf:   '#555555',
  dog:    '#b08850',
}

// Stable per-id PRNG so foxes don't shuffle yaw frame-to-frame.
function seededYaw(id: number): number {
  const x = ((id + 1) * 9301 + 49297) % 233280
  return (x / 233280) * Math.PI * 2
}

export function Animals3D({ animals, depthMap, biomes }: Props) {
  const { scene, animations } = useGLTF('/models/fox.glb')

  if (!depthMap || !biomes) return null

  return (
    <>
      {animals.map(a => {
        const groundY = heightAt(a.x, a.y, depthMap, biomes)
        return (
          <AnimatedFigure
            key={a.id}
            scene={scene}
            animations={animations}
            position={[a.x * TILE_SCALE, groundY, a.y * TILE_SCALE]}
            rotationY={seededYaw(a.id)}
            scale={0.025}
            animation="Walk"
            color={KIND_TINT[a.kind] ?? '#aa8855'}
          />
        )
      })}
    </>
  )
}

useGLTF.preload('/models/fox.glb')
