import { registerScene } from '../core/registry'
import { HomeInterior } from './HomeInterior'
import { resolveHomeScene } from './resolve'

registerScene('home', '2d', {
  resolve: resolveHomeScene,
  Render: HomeInterior,
})
