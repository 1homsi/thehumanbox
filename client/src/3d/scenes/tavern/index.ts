import { registerScene } from '../../../scenes/core/registry'
import { TavernRoom3D } from './TavernRoom3D'
import { resolveTavernScene } from '../../../2d/scenes/tavern/resolve'

export { TavernRoom3D, resolveTavernScene }

registerScene('tavern', '3d', { resolve: resolveTavernScene, Render: TavernRoom3D })
