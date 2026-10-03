import { registerScene } from '../../../scenes/core/registry'
import { TavernInterior } from './TavernInterior'
import { resolveTavernScene } from './resolve'

export { TavernInterior, resolveTavernScene }

registerScene('tavern', '2d', {
  resolve: resolveTavernScene,
  Render: TavernInterior,
})
