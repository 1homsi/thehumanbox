import { t, type MessageKey } from '../../../i18n'

export const AGE_STAGE_ICON: Record<string, string> = {
  infant: '👶',
  child: '🧒',
  teen: '🧑',
  adult: '🧔',
  elder: '🧓',
}

export const ERA_ICON: Record<string, string> = {
  PreStone: '🪨',
  Stone: '🛖',
  Bronze: '⚒️',
  Iron: '⚔️',
  Classical: '🏛️',
  Medieval: '🏰',
  Renaissance: '🎨',
  Industrial: '🏭',
  Modern: '⚙️',
  Information: '💻',
}

export const ASPIRATION_EMOJI: Record<string, string> = {
  seeker: '🔍',
  wanderer: '🧭',
  warrior: '⚔️',
  connector: '🤝',
  builder: '🔨',
  devout: '🕯️',
  sage: '📜',
  provider: '🌾',
  artist: '🎨',
  healer: '🌿',
}

export const ASPIRATION_TIP_KEY: Record<string, MessageKey | undefined> = {
  seeker: 'person.aspiration.tip.seeker',
  wanderer: 'person.aspiration.tip.wanderer',
  warrior: 'person.aspiration.tip.warrior',
  connector: 'person.aspiration.tip.connector',
  builder: 'person.aspiration.tip.builder',
  devout: 'person.aspiration.tip.devout',
  sage: 'person.aspiration.tip.sage',
  provider: 'person.aspiration.tip.provider',
  artist: 'person.aspiration.tip.artist',
  healer: 'person.aspiration.tip.healer',
}

export const ZODIAC_GLYPH: Record<string, string> = {
  ember: '🜂',
  wave: '🜄',
  stone: '🜃',
  root: '꙰',
  bough: 'ᛉ',
  crane: 'ᛯ',
  wolf: 'ᛯ',
  dawn: '☼',
  hearth: 'ᚦ',
  veil: 'ᛏ',
  spear: 'ᛇ',
  seed: '᛫',
}

export const ZODIAC_FLAVOR_KEY: Record<string, MessageKey | undefined> = {
  ember: 'person.zodiac.flavor.ember',
  wave: 'person.zodiac.flavor.wave',
  stone: 'person.zodiac.flavor.stone',
  root: 'person.zodiac.flavor.root',
  bough: 'person.zodiac.flavor.bough',
  crane: 'person.zodiac.flavor.crane',
  wolf: 'person.zodiac.flavor.wolf',
  dawn: 'person.zodiac.flavor.dawn',
  hearth: 'person.zodiac.flavor.hearth',
  veil: 'person.zodiac.flavor.veil',
  spear: 'person.zodiac.flavor.spear',
  seed: 'person.zodiac.flavor.seed',
}

/** The tip for an aspiration, or '' when the simulation sends one the panel does not know. */
export function aspirationTip(id: string): string {
  const key = ASPIRATION_TIP_KEY[id]
  return key ? t(key) : ''
}

/** The flavour line for a zodiac sign, or '' when the sign is unknown. */
export function zodiacFlavor(sign: string): string {
  const key = ZODIAC_FLAVOR_KEY[sign]
  return key ? t(key) : ''
}

export const TOOL_ICON: Record<string, string> = {
  StoneAxe: '🪓',
  BronzeSpear: '🔱',
  IronSword: '⚔️',
  Plow: '🚜',
  Musket: '🔫',
  Rifle: '🎯',
  Book: '📕',
  Computer: '💻',
  Bow: '🏹',
  Hammer: '🔨',
  Wheel: '☸️',
  stone_axe: '🪓',
  bronze_spear: '🔱',
  iron_sword: '⚔️',
  plow: '🚜',
  musket: '🔫',
  rifle: '🎯',
  book: '📕',
  computer: '💻',
  bow: '🏹',
  hammer: '🔨',
  wheel: '☸️',
  mash: '🌾',
  wash: '🫙',
  spirit: '🥃',
  aged_spirit: '🛢️',
  blended_spirit: '🍷',
  bottled_spirit: '🍾',
  bottle: '🍶',
  meat: '🥩',
  cuts: '🔪',
  ground: '🍖',
  sausage: '🌭',
  preserved: '🧂',
  preserved_meat: '🧂',
  pattern: '📐',
  piece: '🧵',
  garment: '👕',
  lead: '🔎',
  quote: '💬',
  herb: '🌿',
  potion: '🧪',
  salve: '🧴',
  bandage: '🩹',
  candle: '🕯️',
  basket: '🧺',
  rope: '🪢',
  net: '🥅',
  pot: '🪴',
  bread: '🍞',
  cheese: '🧀',
  fish: '🐟',
  egg: '🥚',
  honey: '🍯',
  wine: '🍷',
  ale: '🍺',
  paint: '🎨',
  scroll: '📜',
  draft: '📝',
  article: '📰',
  coffee: '☕',
  milk: '🥛',
  drink: '🍵',
  pastry: '🥐',
  stock: '📦',
  incident: '🚨',
}
