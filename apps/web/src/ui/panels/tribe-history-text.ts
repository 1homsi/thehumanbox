import { causeText } from '../../game/model/tribe-end'
import { eraWord } from '../../shared/era-words'
import type { TribeChronicleRow, WorldState } from '../../shared/types'
import { knownTribeName } from '../../state/worldStore'
import { t, type MessageKey } from '../../i18n'

const CRAFT_KEYS: Record<string, MessageKey> = {
  woodcutting: 'panels.tribe.history.crafts.woodcutting',
  quarrying: 'panels.tribe.history.crafts.quarrying',
  foraging: 'panels.tribe.history.crafts.foraging',
  fishing: 'panels.tribe.history.crafts.fishing',
  hunting: 'panels.tribe.history.crafts.hunting',
  farming: 'panels.tribe.history.crafts.farming',
  building: 'panels.tribe.history.crafts.building',
  crafting: 'panels.tribe.history.crafts.crafting',
  healing: 'panels.tribe.history.crafts.healing',
}

/** What one line of a tribe's history says, in words. */
export function lineText(row: TribeChronicleRow, world: WorldState): string {
  const other = row.other ? (knownTribeName(world.lineage_names, row.other) ?? row.other.slice(0, 6)) : ''
  switch (row.kind) {
    case 'extinct':
      return row.word
        ? t('panels.tribe.history.extinctCause', { cause: causeText(row.word) })
        : t('panels.tribe.history.extinct')
    case 'raid':
      return t('panels.tribe.history.raid', { other })
    case 'war':
      return t('panels.tribe.history.war', { other })
    case 'era':
      return t('panels.tribe.history.era', { era: eraWord(row.word) })
    case 'famine':
      return t('panels.tribe.history.famine')
    case 'arrival':
      return t('panels.tribe.history.arrival')
    case 'split':
      return t('panels.tribe.history.split', { other })
    case 'craft': {
      const key = row.word ? CRAFT_KEYS[row.word] : undefined
      return t('panels.tribe.history.craft', { craft: key ? t(key) : (row.word ?? '') })
    }
    case 'leader_died':
      return t('panels.tribe.history.leaderDied', { name: row.word ?? '' })
  }
}
