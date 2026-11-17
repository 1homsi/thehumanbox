import { registerScene } from '../core/registry'
import { SettlementInterior } from './SettlementInterior'
import { resolveSettlementScene } from './resolve'

registerScene('settlement', '2d', {
  resolve: resolveSettlementScene,
  Render: SettlementInterior,
})
