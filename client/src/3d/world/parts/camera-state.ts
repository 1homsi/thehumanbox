export interface CameraSnapshot {
  x: number
  y: number
  z: number
  dirX: number
  dirY: number
  dirZ: number
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
  teleport: { x: number; y: number; z: number } | null
  followOrgId: string | null
} = {
  teleport: null,
  followOrgId: null,
}
