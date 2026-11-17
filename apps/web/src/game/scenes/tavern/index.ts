import { registerScene } from '../core/registry'
import { TavernInterior } from './TavernInterior'
import { resolveTavernScene } from './resolve'

registerScene('tavern', '2d', {
  resolve: resolveTavernScene,
  Render: TavernInterior,
})
