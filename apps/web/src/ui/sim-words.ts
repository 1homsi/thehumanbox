// Words for the ids the simulation sends that the interface shows as plain words:
// moon phases, seasons and building kinds. Each id the table knows maps to a
// translation key. An id it does not know is shown as itself with underscores
// turned into spaces, so a new id from the simulation never breaks the interface.

import { t, type MessageKey } from '../i18n'

const MOON_PHASES = new Map<string, MessageKey>([
  ['new_moon', 'model.words.moon.newMoon'],
  ['waxing_crescent', 'model.words.moon.waxingCrescent'],
  ['first_quarter', 'model.words.moon.firstQuarter'],
  ['waxing_gibbous', 'model.words.moon.waxingGibbous'],
  ['full_moon', 'model.words.moon.fullMoon'],
  ['waning_gibbous', 'model.words.moon.waningGibbous'],
  ['last_quarter', 'model.words.moon.lastQuarter'],
  ['waning_crescent', 'model.words.moon.waningCrescent'],
])

const SEASONS = new Map<string, MessageKey>([
  ['abundance', 'model.words.season.abundance'],
  ['decline', 'model.words.season.decline'],
  ['scarcity', 'model.words.season.scarcity'],
  ['recovery', 'model.words.season.recovery'],
])

const BUILDING_KINDS = new Map<string, MessageKey>([
  ['hut', 'model.words.building.hut'],
  ['house', 'model.words.building.house'],
  ['manor', 'model.words.building.manor'],
  ['townhouse', 'model.words.building.townhouse'],
  ['apartment', 'model.words.building.apartment'],
  ['longhouse', 'model.words.building.longhouse'],
  ['well', 'model.words.building.well'],
  ['dock', 'model.words.building.dock'],
  ['marina', 'model.words.building.marina'],
  ['port', 'model.words.building.port'],
  ['shipyard', 'model.words.building.shipyard'],
  ['drydock', 'model.words.building.drydock'],
  ['saw_mill', 'model.words.building.sawMill'],
  ['quarry', 'model.words.building.quarry'],
  ['mine', 'model.words.building.mine'],
  ['smithy', 'model.words.building.smithy'],
  ['forge', 'model.words.building.forge'],
  ['mill', 'model.words.building.mill'],
  ['windmill', 'model.words.building.windmill'],
  ['watermill', 'model.words.building.watermill'],
  ['granary', 'model.words.building.granary'],
  ['silo', 'model.words.building.silo'],
  ['barn', 'model.words.building.barn'],
  ['pen', 'model.words.building.pen'],
  ['workshop', 'model.words.building.workshop'],
  ['warehouse', 'model.words.building.warehouse'],
  ['market', 'model.words.building.market'],
  ['market_stall', 'model.words.building.marketStall'],
  ['food_cart', 'model.words.building.foodCart'],
  ['tent', 'model.words.building.tent'],
  ['temple', 'model.words.building.temple'],
  ['shrine', 'model.words.building.shrine'],
  ['school', 'model.words.building.school'],
  ['library', 'model.words.building.library'],
  ['tavern', 'model.words.building.tavern'],
  ['inn', 'model.words.building.inn'],
  ['bakery', 'model.words.building.bakery'],
  ['brewery', 'model.words.building.brewery'],
  ['bridge', 'model.words.building.bridge'],
  ['wall', 'model.words.building.wall'],
  ['watchtower', 'model.words.building.watchtower'],
  ['barracks', 'model.words.building.barracks'],
  ['bank', 'model.words.building.bank'],
  ['stable', 'model.words.building.stable'],
  ['garden', 'model.words.building.garden'],
])

/** An id shown as words: underscores become spaces. */
export function idWords(id: string): string {
  return id.replace(/_/g, ' ')
}

function wordOf(table: ReadonlyMap<string, MessageKey>, id: string | null | undefined): string {
  if (!id) return ''
  const key = table.get(id)
  return key ? t(key) : idWords(id)
}

/** The moon phase as words, e.g. "waxing gibbous". */
export function moonPhaseWord(phase: string | null | undefined): string {
  return wordOf(MOON_PHASES, phase)
}

/** The simulation's season as words, e.g. "abundance". */
export function seasonWord(season: string | null | undefined): string {
  return wordOf(SEASONS, season)
}

/** A building kind as words, e.g. "market stall". */
export function buildingKindWord(kind: string | null | undefined): string {
  return wordOf(BUILDING_KINDS, kind)
}
