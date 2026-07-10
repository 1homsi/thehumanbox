export interface CameraSnapshot {
  x: number
  y: number
  z: number
  dirX: number
  dirY: number
  dirZ: number
}

export interface CameraLookAt {
  x: number
  y: number
  z: number
}

export interface CameraTeleport extends CameraLookAt {
  lookAt?: CameraLookAt
}

export const cameraSnapshot: CameraSnapshot = {
  x: 0,
  y: 0,
  z: 0,
  dirX: 0,
  dirY: 0,
  dirZ: 1,
}

export const cameraCommand: {
  teleport: CameraTeleport | null
  reset: boolean
  followOrgId: string | null
  povOrgId: string | null
} = {
  teleport: null,
  reset: false,
  followOrgId: null,
  povOrgId: null,
}
