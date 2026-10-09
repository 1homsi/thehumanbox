import type { SandboxTool } from '../../simulation/sandbox'

/** One-line descriptions shown in dock tooltips, keyed by sandbox tool id. */
const TOOL_TIPS: Record<string, string> = {
  spawn1: 'Send one grown person. Beside a tribe they join it, as the man or woman it is missing.',
  spawn5: 'Found a new tribe: five young adults, in couples, where you click.',
  next_season:
    'Run the world on to the next season change, in quick steps. Nobody is harmed; the seasons turn as they would.',
  next_year:
    'Run the world on to the start of the next year, in quick steps. The seasons turn as they would.',
  leader:
    'Crown the grown person nearest where you click the ruler of their tribe. They keep the crown while they live, unless their tribe has no ruler to crown (a plain band) or they are still a child.',
  heal_one:
    'Heal the person nearest where you click: full health, and no infection or sickness. Only that one person.',
  name: 'Click a person to give them a name of your own. It shows everywhere their name does.',
  marry:
    'Click one grown person, then another of the other sex. If both are free to wed, they become partners and are ready for children.',
  follow:
    'Keep the camera on the person nearest where you click. Click the map again to follow someone else.',
  gift_food: 'Give the person nearest where you click a few portions of food for their pack.',
  gift_tool: 'Give the person nearest where you click a stone tool, so they can work and build.',
  teleport:
    'Pick up the person nearest where you click and set them down there. Nobody is moved onto water or rock.',
  family:
    'Found a new tribe with a family: a mother and a father who are partners, and two children, where you click.',
  heal: 'Restore the health of every person and animal in the brush area.',
  revive:
    'Raise someone who died within the last season, near where you click. Not the very old, and once per tribe per season.',
  smite: 'Strike down the nearest person or animal inside the brush area.',
  shelter: 'Build a hut on one tile.',
  road: 'Lay a road over open ground in the brush area: a dirt track, cobbled once the tribes reach the bronze age.',
  bridge:
    'Lay a bridge across the river or lake in the brush area. People and caravans cross it; the deep water beside it stays closed to them.',
  road_erase: 'Clear the roads in the brush area. Only the road goes: the ground under it stays as it is.',
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
  trade_map: 'Show or hide the trade roads, rails and caravans.',
  fertility_map: 'Show how fertile the soil is.',
  age_map: 'Colour people by age.',
  threat_map: 'Show where predators and monsters threaten people.',
  names_view: 'Show people’s names over their heads.',
  thoughts_view: 'Show what people are thinking.',
  animals_view: 'Show or hide animals on the map.',
  grid_view: 'Draw the tile grid.',
  plant_berry: 'Plant berry bushes. They fruit, get picked, and fruit again. Asleep through winter.',
  plant_mushroom: 'Scatter mushrooms in the woods. They only take root in shade and come up fast in autumn.',
  fog: 'Roll in fog: damp, grey air for a while. The ground stays wet; no lightning and no snow.',
  gale: 'A gale: the wind turns to a random quarter and blows hard, carrying rain, smoke and fire before it.',
  snow_weather:
    'Snow falls for a while. It settles on open ground, melts again on warm land, and chills anyone out in it.',
  penguin:
    'Release a penguin, or a few, on snow or tundra. They huddle together and waddle across the ice, and keep clear of people.',
  camel:
    'Release a camel, or a few, on desert or badlands. They are tough, need little food, and keep to the dry land.',
  frog: 'Release a frog, or a few, on wet ground near water, in wetland or jungle. Frogs are small game for wolves and bears.',
  whale: 'Release a whale, or a few, into deep water. They swim where the sea is and never come ashore.',
  hail: 'Hail beats down on the brush area. It flattens plantings and wild food, hurts the people under it (most at the centre), cracks roofs a little, and kills some small animals.',
  nuke: 'Drop a bomb where you click: a crater like a meteor leaves, fallout that poisons everyone across a wide ring, and blight on the plantings there. Only a tribe that has reached the Industrial age can build one.',
  eclipse:
    'The sun goes dark for a while. Everyone alive is frightened and a little awed by it, and the omen is written into the chronicle.',
  comet:
    'A comet streaks across the sky over where you click. Everyone who can see it, within the reach, is awed; the awe lasts and the omen is written into the chronicle.',
  dice: 'Roll for fate: one random event lands at a random spot. It may bless, bring rain or a gale, or be a disaster such as a tornado, a wildfire or an earthquake.',
  dawn: 'Move the clock on to the next dawn. The world keeps its season and year; the light changes at once.',
  noon: 'Move the clock on to the next noon, when the sun stands highest.',
  dusk: 'Move the clock on to the next dusk, when the light goes and the night begins.',
  midnight:
    'Move the clock on to the next middle of the night. Night is the time people walk home and sleep.',
  tornado:
    'Send a tornado tearing along a random heading from the click. It wrecks buildings, strikes down the nearest people and animals in its funnel, and uproots every planting it passes.',
  tsunami:
    'Send a wave out of the nearest sea up the coast and inland. Land it reaches floods and drains later; buildings near the shore are wrecked, people in the wave are hurt and land animals drown.',
  locusts:
    'Send a swarm of locusts flying from the click. It strips crops and wild food along its path and halves what people carry; birds and chickens feast. It does not kill, but it leaves famine.',
  long_life:
    'Give everyone in the brush area more years to live. Each blessing adds to the span the gods allot, up to a ceiling no natural birth reaches.',
  courage:
    'Drain fear out of everyone in the brush area, so they stop running from what frightened them and hold their ground.',
  wildfire:
    'Light a line of fire across the land at the click, driven by the wind. It catches burnable ground downwind and carries on through the woods; buildings in reach burn too.',
  plant_oak: 'Plant oak saplings. They grow for a long time into a broadleaf forest.',
  plant_pine: 'Plant pine saplings. Slow to grow, but they keep growing through winter and make a taiga.',
  plant_palm: 'Plant palms by the water. They take root only near it and grow into jungle.',
  sunshine:
    'A bright spell over the fields in the brush area: growing crops, orchards and flowers gain a stretch of growth and ripen sooner.',
  restore:
    'Erase your changes to the land in the brush area: water drains, fire and ash cool, and sand or snow goes back to what the biome holds. Rock and buildings stay.',
  place_house:
    'Raise a finished house on the tiles where you click, if the ground is clear of water, rock and other buildings. Nobody owns it yet, so a family nearby can move in.',
  place_library:
    'Raise a finished library where you click, if the ground is clear of water, rock and other buildings. It is unowned, so the first tribe nearby can take it.',
  demolish:
    'Pull down the buildings in the brush area, and clear the huts and campfires there to grass. The people inside stay put.',
  repair: 'Bring every damaged or ruined building in the brush area back to full condition, at once.',
  deer: 'Release a deer. Brush size releases more at once, each on ground it can use.',
  rabbit: 'Release a rabbit. Brush size releases more at once, each on ground it can use.',
  boar: 'Release a boar. Brush size releases more at once, each on ground it can use.',
  wolf: 'Release a wolf. Brush size releases more at once, each on ground it can use.',
  bird: 'Release a bird. Brush size releases more at once, each on ground it can use.',
  fish: 'Release a fish. Brush size releases more at once, each on ground it can use.',
  bear: 'Release a bear. It hunts, and attacks people when hungry. Brush size releases more at once, each on ground it can use.',
  sheep:
    'Release a sheep. Sheep graze and keep together. Brush size releases more at once, each on ground it can use.',
  cow: 'Release a cow. Slow, and a big meal for hunters. Brush size releases more at once, each on ground it can use.',
  horse: 'Release a horse. Fast and skittish. Brush size releases more at once, each on ground it can use.',
  chicken: 'Release a chicken. Brush size releases more at once, each on ground it can use.',
  fox: 'Release a fox. Shy and quick: it keeps to woods and grassland, and wolves hunt it. Brush size releases more at once, each on ground it can use.',
  dog: 'Release a dog. One beside people bonds to the nearest of them: it takes a name, follows them about and keeps them company.',
  cat: 'Release a cat. It keeps to itself, slips away from people, and lives anywhere on land. Brush size releases more at once, each on ground it can use.',
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
    case 'long_life':
    case 'love':
      return 'no one there'
    case 'courage':
      return 'no one afraid there'
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
    case 'nuke':
      return 'no tribe has reached the Industrial age yet'
    case 'eclipse':
      return 'there is no one alive to see it'
    case 'comet':
      return 'nobody is in reach to see it'
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
      return 'nothing here to change'
    case 'plant_mushroom':
      return 'mushrooms need woods or wet ground'
    case 'plant_palm':
      return 'palms need water nearby'
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
      return 'no ground they can use here, or the world is full'
    default:
      if (tool.id.startsWith('biome_')) return 'no land to paint there'
      return 'did not work here'
  }
}
