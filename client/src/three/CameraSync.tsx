import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cameraSnapshot } from './camera-state'

// Pushes the live R3F camera position + look direction to the
// module-level cameraSnapshot so HTML overlays (MiniMap etc.) can
// read it without needing to live inside the Canvas tree.
const tmpDir = new THREE.Vector3()

export function CameraSync() {
  const { camera } = useThree()
  useFrame(() => {
    cameraSnapshot.x = camera.position.x
    cameraSnapshot.y = camera.position.y
    cameraSnapshot.z = camera.position.z
    camera.getWorldDirection(tmpDir)
    cameraSnapshot.dirX = tmpDir.x
    cameraSnapshot.dirY = tmpDir.y
    cameraSnapshot.dirZ = tmpDir.z
  })
  return null
}
