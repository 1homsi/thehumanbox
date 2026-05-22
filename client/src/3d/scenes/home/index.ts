import { registerScene } from '../../../scenes/core/registry'
import { HomeRoom3D } from './HomeRoom3D'
import { resolveHomeScene } from './resolve'

export { HomeRoom3D, resolveHomeScene }

registerScene('home', '3d', {
  resolve: resolveHomeScene,
  Render: HomeRoom3D,
})
