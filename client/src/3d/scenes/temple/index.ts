import { registerScene } from '../../../scenes/core/registry'
import { TempleRoom3D } from './TempleRoom3D'
import { resolveTempleScene } from '../../../2d/scenes/temple/resolve'

export { TempleRoom3D, resolveTempleScene }

registerScene('temple', '3d', { resolve: resolveTempleScene, Render: TempleRoom3D })
