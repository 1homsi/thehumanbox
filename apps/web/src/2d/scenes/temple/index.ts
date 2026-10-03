import { registerScene } from '../../../scenes/core/registry'
import { TempleInterior } from './TempleInterior'
import { resolveTempleScene } from './resolve'

export { TempleInterior, resolveTempleScene }

registerScene('temple', '2d', {
  resolve: resolveTempleScene,
  Render: TempleInterior,
})
