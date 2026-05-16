// Module-level shared snapshot of the live R3F camera so components
// rendered OUTSIDE the <Canvas> tree (HTML overlays like MiniMap)
// can still read camera position + look direction.
//
// A tiny <CameraSync> sink inside Canvas writes here each frame;
// readers just read the fields synchronously. No re-render churn.

export interface CameraSnapshot {
  x: number; y: number; z: number
  dirX: number; dirY: number; dirZ: number
}

export const cameraSnapshot: CameraSnapshot = {
  x: 0, y: 0, z: 0,
  dirX: 0, dirY: 0, dirZ: 1,
}

// External "commands" the camera should consume on its next frame.
// HTML overlays (MiniMap click, follow-org toggle) write here; the
// FlyCamera component inside Canvas reads and clears each tick.
export const cameraCommand: {
  teleport: { x: number; y: number; z: number } | null
  followOrgId: string | null
} = {
  teleport: null,
  followOrgId: null,
}
