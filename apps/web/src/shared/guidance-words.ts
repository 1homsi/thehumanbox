import type { MessageKey } from '../i18n'
import type { LineageStrategy } from '../simulation/sandbox'

/** The name of each guidance strategy in words, as the civilization panel and the tribe card show it. */
export const GUIDANCE_LABEL: Record<LineageStrategy, MessageKey> = {
  hunt: 'dialogs.civ.guidance.hunt.label',
  explore: 'dialogs.civ.guidance.explore.label',
  settle: 'dialogs.civ.guidance.settle.label',
  trade: 'dialogs.civ.guidance.trade.label',
  defend: 'dialogs.civ.guidance.defend.label',
}
