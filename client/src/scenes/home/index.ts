import { registerScene } from '../registry'
import { HomeInterior } from './HomeInterior'
import { resolveHomeScene } from './resolve'

export { HomeInterior, resolveHomeScene }

registerScene('home', {
  resolve: resolveHomeScene,
  Render:  HomeInterior,
})
