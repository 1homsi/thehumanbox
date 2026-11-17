import { registerScene } from '../core/registry'
import { TempleInterior } from './TempleInterior'
import { resolveTempleScene } from './resolve'

registerScene('temple', '2d', {
  resolve: resolveTempleScene,
  Render: TempleInterior,
})
