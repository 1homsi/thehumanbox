import type { SandboxTool } from '../../simulation/sandbox'

/** One-line descriptions shown in dock tooltips, keyed by sandbox tool id. */
const TOOL_TIPS: Record<string, string> = {
  spawn1: 'Send one grown person. Beside a tribe they join it, as the man or woman it is missing.',
  spawn5: 'Found a new tribe: five young adults, in couples, where you click.',
  heal: 'Restore the health of every person and animal in the brush area.',
  revive:
    'Raise someone who died within the last season, near where you click. Not the very old, and once per tribe per season.',
  smite: 'Strike down the nearest person or animal inside the brush area.',
  shelter: 'Build a hut on one tile.',
  campfire: 'Light a campfire on one tile.',
  grass: 'Paint grassland.',
  water: 'Paint water.',
  rock: 'Paint rock.',
  sand: 'Paint sand.',
  snow: 'Paint snow. On warm land it melts away again.',
  food: 'Scatter food for humans and animals to gather.',
  drink: 'Add fresh drinking water.',
  plant_crop:
    'Sow a field in spring or summer. It ripens into grain and regrows after it is eaten. Nothing grows in winter, and a hard winter’s frost kills unripe fields.',
  plant_orchard:
    'Plant fruit trees. Slow to grow, then they bear fruit again and again. They sleep through winter.',
  plant_sapling: 'Plant young trees that grow into a forest. Woods around a factory drink in its smoke.',
  plant_flowers: 'Plant flowers. They bloom through spring and summer, and people near them are happier.',
  territory_map: 'Show the land each tribe claims.',
  settlement_map: 'Highlight towns and buildings.',
  population_map: 'Show where people crowd together.',
  hazard_map: 'Show dangerous ground.',
  routes_map: 'Show the paths people walk most.',
  migration_map: 'Show where lineages have travelled over time.',
  fertility_map: 'Show how fertile the soil is.',
  age_map: 'Colour people by age.',
  threat_map: 'Show where predators and monsters threaten people.',
  names_view: 'Show people’s names over their heads.',
  thoughts_view: 'Show what people are thinking.',
  animals_view: 'Show or hide animals on the map.',
  grid_view: 'Draw the tile grid.',
  demolish:
    'Pull down the buildings in the brush area, and clear the huts and campfires there to grass. The people inside stay put.',
  repair: 'Bring every damaged or ruined building in the brush area back to full condition, at once.',
  deer: 'Release a deer.',
  rabbit: 'Release a rabbit.',
  boar: 'Release a boar.',
  wolf: 'Release a wolf.',
  bird: 'Release a bird.',
  fish: 'Release a fish.',
  bear: 'Release a bear. It hunts, and attacks people when hungry.',
  sheep: 'Release a sheep. Sheep graze and keep together.',
  cow: 'Release a cow. Slow, and a big meal for hunters.',
  horse: 'Release a horse. Fast and skittish.',
  chicken: 'Release a chicken.',
  fox: 'Release a fox. Shy and quick: it keeps to woods and grassland, and wolves hunt it.',
  cat: 'Release a cat. It keeps to itself, slips away from people, and lives anywhere on land.',
  rain: 'Start rain. Helps dry land recover.',
  storm: 'Summon a storm. Drains energy and can strike with lightning.',
  clear: 'Clear the skies.',
  drought_on: 'Start a drought. Water shrinks and thirst rises.',
  drought_off: 'End the drought.',
  fire: 'Set the brush area ablaze. Fire spreads to nearby flammable land; the ash it leaves grows back richer.',
  plague: 'Start an outbreak that spreads through close contact.',
  poison: 'Sicken everyone inside the brush area.',
  meteor:
    'Crash a meteor. Kills everything it hits and leaves a burning crater, with ore in its floor to mine.',
  earthquake: 'Shake the land. Cracks the ground, damages buildings and hurts people.',
  bless: 'Heal and cheer everyone in the brush area.',
  inspire: 'Teach everyone in the brush area something new and raise their literacy.',
  war: 'Turn the two tribes nearest the click against each other.',
  peace: 'Make the two tribes nearest the click friends.',
  cure: 'End every sickness across a wide area and keep people safe from it for a while.',
  harvest: 'Make the land fertile and grow food across it.',
  arm: 'Teach the adults in the brush area to make and use weapons, so they can fight back.',
  bounty: 'Fill everyone’s packs with food, wood and stone.',
  douse: 'Put out every fire in the brush area.',
  banish: 'Destroy every monster and predator in the brush area.',
  ward: 'Ward a place for a season: no raid or battle begins inside, beasts will not strike there, and no sickness spreads.',
  frenzy: 'Turn neighbours on each other. Everyone in the brush area gets hurt.',
  thunder: 'Rain lightning across the brush area. Strikes people, animals and dry grass.',
  blight: 'Rot the crops, spoil the food people carry and sour the soil for years.',
  flood:
    'Drown the land: a lake in the middle, flooded ground around it. The water drains and leaves rich silt.',
  blizzard: 'Bury the land in snow and chill everyone caught in it. The snow melts as the land warms.',
  zombie: 'Raise a zombie. Its victims rise as zombies too.',
  demon: 'Summon a demon. It scorches the ground and sets fires as it hunts.',
  dragon: 'Summon a dragon. It flies, breathes fire, and takes an army to kill.',
  alien: 'Drop an alien. It zaps people from a distance.',
  ufo: 'Send a UFO. It abducts people for a while, then leaves.',
  biome_grassland: 'Paint open meadow: grass and the odd tree.',
  biome_forest: 'Paint forest: trees, wood and plenty of food.',
  biome_jungle: 'Paint jungle: a dense canopy and the most food of any land.',
  biome_savanna: 'Paint savanna: golden grass and flat-topped acacias.',
  biome_desert: 'Paint desert: sand, cactus and little to eat.',
  biome_badlands: 'Paint badlands: red rock pillars and dust.',
  biome_wetland: 'Paint wetland: reeds, marsh and good soil.',
  biome_tundra: 'Paint tundra: cold, snowy, and hard to live on.',
  biome_taiga: 'Paint taiga: snowy pine forest.',
  love: 'Single adults pair up and feel ready for children.',
  tame: 'Turn wolves and bears into loyal dogs bonded to the nearest person.',
  meteor_shower: 'Rain several small meteors across the brush area.',
  volcano:
    'Raise a volcano: a burning crater, a rock cone and an ash apron that weathers into the richest soil. Kills anyone where it rises.',
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
      return 'the world cannot hold any more people'
    case 'smite':
    case 'heal':
    case 'poison':
    case 'bless':
    case 'inspire':
    case 'cure':
    case 'arm':
    case 'bounty':
    case 'frenzy':
    case 'love':
      return 'no one there'
    case 'tame':
      return 'no wolves or bears there'
    case 'banish':
      return 'nothing to banish'
    case 'revive':
      return 'no one who died lately lies here'
    case 'douse':
      return 'no fire there'
    case 'thunder':
      return 'the lightning hit nothing'
    case 'harvest':
    case 'blight':
    case 'flood':
    case 'blizzard':
    case 'volcano':
    case 'meteor_shower':
      return 'nothing here to change'
    case 'war':
    case 'peace':
      return 'needs two tribes nearby'
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
    case 'zombie':
    case 'demon':
    case 'dragon':
    case 'alien':
    case 'ufo':
      return 'too many creatures already'
    default:
      if (tool.id.startsWith('biome_')) return 'no land to paint there'
      return 'did not work here'
  }
}
