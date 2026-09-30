import type { SandboxTool } from '../simulation/sandbox'

/** One-line descriptions shown in dock tooltips, keyed by sandbox tool id. */
const TOOL_TIPS: Record<string, string> = {
  spawn1: 'Place one new human where you click.',
  spawn5: 'Place a small tribe of five humans where you click.',
  heal: 'Restore the health of everyone in the brush area.',
  smite: 'Strike down the nearest human inside the brush area.',
  shelter: 'Build a hut on one tile.',
  campfire: 'Light a campfire on one tile.',
  grass: 'Paint grassland.',
  water: 'Paint water.',
  rock: 'Paint rock.',
  sand: 'Paint sand.',
  snow: 'Paint snow.',
  food: 'Scatter food for humans and animals to gather.',
  drink: 'Add fresh drinking water.',
  territory_map: 'Show the land each tribe claims.',
  settlement_map: 'Highlight towns and buildings.',
  population_map: 'Show where people crowd together.',
  hazard_map: 'Show dangerous ground.',
  routes_map: 'Show the paths people walk most.',
  migration_map: 'Show where lineages have travelled over time.',
  deer: 'Release a deer.',
  rabbit: 'Release a rabbit.',
  boar: 'Release a boar.',
  wolf: 'Release a wolf.',
  bird: 'Release a bird.',
  fish: 'Release a fish.',
  rain: 'Start rain. Helps dry land recover.',
  storm: 'Summon a storm. Drains energy and can strike with lightning.',
  clear: 'Clear the skies.',
  drought_on: 'Start a drought. Water shrinks and thirst rises.',
  drought_off: 'End the drought.',
  fire: 'Set the brush area ablaze. Fire spreads to nearby flammable land.',
  plague: 'Start an outbreak that spreads through close contact.',
}

export function toolTip(tool: SandboxTool): string {
  return TOOL_TIPS[tool.id] ?? tool.label
}

export function toolHowTo(tool: SandboxTool): string {
  if (tool.view) return 'click to toggle this layer'
  if (tool.mode === 'instant') return 'click to apply at once'
  return 'click the world · [ ] brush · esc to stop'
}

/** Why a tool did nothing when the simulation rejects it. */
export function toolFailure(tool: SandboxTool): string {
  switch (tool.id) {
    case 'spawn1':
    case 'spawn5':
      return 'the world is full, no room for more people'
    case 'smite':
    case 'heal':
      return 'no one there'
    case 'deer':
    case 'rabbit':
    case 'boar':
    case 'wolf':
    case 'bird':
    case 'fish':
      return 'too many animals already'
    default:
      return 'did not work here'
  }
}
