import { registerScene } from '../../../scenes/core/registry'
import { HomeInterior } from './HomeInterior'
import { resolveHomeScene } from './resolve'

export { HomeInterior, resolveHomeScene }

registerScene('home', '2d', {
  resolve: resolveHomeScene,
  Render: HomeInterior,
})
