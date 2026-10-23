import { t, type MessageKey } from '../../i18n'
import en from '../../i18n/locales/en'
import type { SandboxTool } from '../../simulation/sandbox'

/** The dock's text for a tool, from `dock.tools` or `dock.tips`; undefined when the tool has none. */
function textFor(section: 'tools' | 'tips', id: string): string | undefined {
  const key = `dock.${section}.${id}` as MessageKey
  const text = t(key)
  // t() hands back the key itself when no text exists for it.
  return text === key ? undefined : text
}

/** The tool's name in the active language. */
export function toolName(tool: SandboxTool): string {
  return textFor('tools', tool.id) ?? tool.label
}

/** One-line description shown in dock tooltips. */
export function toolTip(tool: SandboxTool): string {
  return textFor('tips', tool.id) ?? toolName(tool)
}

/** The English description, so search finds a tool by its English tip whatever the language. */
export function englishTip(tool: SandboxTool): string {
  const tips: Record<string, string | undefined> = en.dock.tips
  return tips[tool.id] ?? tool.label
}

export function toolHowTo(tool: SandboxTool, brush = 0): string {
  if (tool.view) return t('dock.how.toggleLayer')
  if (tool.mode === 'instant') return t('dock.how.applyAtOnce')
  return t('dock.how.howTo', { reach: toolReach(tool, brush) })
}

/**
 * What a point tool reaches at this brush size: its radius in tiles, and how many it brings when
 * it has a count (animals, people). Read from the command the tool builds, so it follows the
 * tool's own rule. Empty for tools that take no brush.
 */
export function toolReach(tool: SandboxTool, brush: number): string {
  if (!tool.build) return ''
  const cmd = tool.build(0, 0, brush) as { radius?: number; count?: number }
  const bits: string[] = []
  if (typeof cmd.radius === 'number') bits.push(t('dock.how.reachTiles', { tiles: Math.round(cmd.radius) }))
  // One animal per click is the norm and not worth saying; only a tool that brings several does.
  if (typeof cmd.count === 'number' && cmd.count > 1) bits.push(t('dock.how.brings', { count: cmd.count }))
  return bits.length ? `${bits.join(' · ')} · ` : ''
}

/** Why a tool did nothing when the simulation rejects it. */
export function toolFailure(tool: SandboxTool): string {
  switch (tool.id) {
    case 'spawn1':
    case 'spawn5':
      return t('dock.failures.noRoom')
    case 'smite':
    case 'heal':
    case 'poison':
    case 'bless':
    case 'inspire':
    case 'cure':
    case 'arm':
    case 'bounty':
    case 'frenzy':
    case 'long_life':
    case 'love':
      return t('dock.failures.noOneThere')
    case 'courage':
      return t('dock.failures.noOneAfraid')
    case 'tame':
      return t('dock.failures.noWolves')
    case 'banish':
      return t('dock.failures.nothingToBanish')
    case 'boat':
      return t('dock.failures.needsWater')
    case 'revive':
      return t('dock.failures.noRecentDead')
    case 'douse':
      return t('dock.failures.noFire')
    case 'thunder':
      return t('dock.failures.lightningMissed')
    case 'cure_tribe':
      return t('dock.failures.noSickKin')
    case 'guardian':
      return t('dock.failures.nobodyToGuard')
    case 'clear_region':
      return t('dock.failures.nothingToClear')
    case 'rain_patch':
      return t('dock.failures.noFireToDrink')
    case 'merge_tribes':
      return t('dock.failures.pickTwoTribes')
    case 'split_tribe':
      return t('dock.failures.needTwoPeople')
    case 'mutate':
    case 'curse':
      return t('dock.failures.nobodyToChange')
    case 'teach_tribe':
      return t('dock.failures.noSecretLeft')
    case 'nuke':
      return t('dock.failures.noIndustrial')
    case 'eclipse':
      return t('dock.failures.noOneToSeeEclipse')
    case 'aurora':
      return t('dock.failures.noOneToSeeLights')
    case 'comet':
      return t('dock.failures.nobodyInReach')
    case 'hail':
    case 'harvest':
    case 'restore':
    case 'sunshine':
    case 'tornado':
    case 'tsunami':
    case 'locusts':
    case 'wildfire':
    case 'blight':
    case 'flood':
    case 'blizzard':
    case 'volcano':
    case 'meteor_shower':
      return t('dock.failures.nothingToChange')
    case 'plant_mushroom':
      return t('dock.failures.mushroomsNeed')
    case 'plant_palm':
      return t('dock.failures.palmsNeed')
    case 'frost':
      return t('dock.failures.noWaterToFreeze')
    case 'war':
    case 'peace':
      return t('dock.failures.twoTribesNearby')
    case 'deer':
    case 'rabbit':
    case 'boar':
    case 'wolf':
    case 'bird':
    case 'fish':
    case 'bear':
    case 'sheep':
    case 'cow':
    case 'horse':
    case 'chicken':
    case 'fox':
    case 'cat':
    case 'penguin':
    case 'camel':
    case 'frog':
    case 'whale':
    case 'dog':
    case 'zombie':
    case 'demon':
    case 'dragon':
    case 'alien':
    case 'ufo':
      return t('dock.failures.noGround')
    default:
      if (tool.id.startsWith('biome_')) return t('dock.failures.noLand')
      return t('dock.failures.didNotWork')
  }
}
