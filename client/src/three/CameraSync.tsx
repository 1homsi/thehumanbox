import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { cameraSnapshot } from './camera-state'

const tmpDir = new Vector3()

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
