import { registerScene } from '../../../scenes/core/registry'
import { SettlementInterior } from './SettlementInterior'
import { resolveSettlementScene } from './resolve'

export { SettlementInterior, resolveSettlementScene }

registerScene('settlement', '2d', {
  resolve: resolveSettlementScene,
  Render: SettlementInterior,
})
