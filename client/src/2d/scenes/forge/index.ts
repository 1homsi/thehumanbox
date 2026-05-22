import { registerScene } from '../../../scenes/core/registry'
import { ShopInterior } from './ShopInterior'
import { resolveForgeScene } from './resolve'

export { ShopInterior, resolveForgeScene }

registerScene('forge', '2d', { resolve: resolveForgeScene, Render: ShopInterior })
registerScene('bakery', '2d', { resolve: resolveForgeScene, Render: ShopInterior })
registerScene('mill', '2d', { resolve: resolveForgeScene, Render: ShopInterior })
