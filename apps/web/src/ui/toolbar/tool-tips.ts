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
  cure_tribe:
    'Cure the whole tribe of the person nearest where you click: every sick member of that tribe is cured and kept safe from the same sickness for a while, wherever they are.',
  guardian:
    'A guardian dog appears beside the person nearest where you click and bonds to them, keeping to them the way a released dog does.',
  clear_region:
    'Sweep the brush area clean: the people in it die (their kin grieve), the animals are swept away, and plantings and wild food are cleared. Buildings stay; demolish takes those.',
  merge_tribes:
    'Two clicks: a person of one tribe, then a person of another. The second tribe joins the first, everyone in it.',
  split_tribe:
    'Click a tribe where its people stand together: the ones near the click (the brush sets how many) found a new tribe of their own, with a new name.',
  mutate:
    'Change the person nearest where you click: one of their traits (curiosity, aggression, fear, memory, sociability or resilience) jumps far beyond their people. The change is written into the chronicle.',
  teach_tribe:
    'Teach the tribe of the person nearest where you click the next secret it still lacks for its age, so every grown member learns it. A tribe can be taught only now and then.',
  curse:
    'Curse the person nearest where you click: bad luck hurts them, fear grips them and sickness takes hold. Only that one person.',
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
  food_map: 'Show where food grows (green) and where food is carried along the paths (gold).',
  wealth_map: 'Show where people carry the most goods and tools. Warmer gold means more.',
  mood_map:
    'Show how people feel around each place: gold where they are content or joyful, red where they grieve, fear or are hungry.',
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
  bless_river:
    'The river blesses the land: fish gather in the water nearest the point, as many as the brush brings. Needs water within reach.',
  bless_forest:
    'A forest surges: wild food sprouts on the open ground among the trees, and the plantings there grow on. Needs woods within reach.',
  talent:
    'A rare gift for the living person nearest the point: a talent that lifts one of their traits (memory, curiosity, resilience or kindness) for good. A person keeps one talent.',
  tribe_food:
    'Every living member of the tribe nearest the click gets a portion of food, whether they are hungry or not.',
  tribe_tools:
    'Every living member of the tribe nearest the click is handed a stone tool.',
  migrate_tribe:
    'The tribe nearest the click moves to it: its people are set down around the click, at once. The brush sets how far the tribe is found.',
  trade_gift:
    'Two clicks: the tribe of the first sends food to the tribe of the second. Its people with food to spare each give a portion, and the other tribe warms toward it.',
  era_stone:
    'A family settles where you click, already knowing what the stone age knew: the stone tools and the fire. A tribe of its own, with the discoveries of that age.',
  era_bronze:
    'A family settles where you click, already knowing the stone and bronze ages: the tools, the metal and the trade that came with them.',
  era_medieval:
    'A family settles where you click, already knowing the ages up to the medieval: the castles, the crafts and the learning of that time.',
  era_modern:
    'A family settles where you click, already knowing the ages up to the modern: the railways, the factories and the science of today.',
  heat_wave:
    'A heat wave settles over the land for a while. Shore water dries to sand, people drink more and tire sooner, and crops are held back. Calling it again starts the count over.',
  monsoon:
    'Rain falls for days in a row, as heavy as the weather goes. Rivers rise and the land stays soaked; the sim does the rest.',
  cold_snap:
    'A short, hard fall of snow. Everyone out in it is chilled, and it ends sooner than a snowfall does.',
  aurora:
    'Lights dance across the night sky over the whole world. Everyone alive is awed and a little calmer, and the omen is written into the chronicle.',
  duck: 'Release a duck, or a few, on wet ground or grass. They flock together and waddle about, and keep clear of people.',
  bee: 'Release a bee, or a few, over the grass, forest or savanna. They hum over the flowers and keep clear of people.',
  owl: 'Release an owl, or a few, in the forest or taiga. They fly the woods and keep clear of people.',
  eagle:
    'Release an eagle, or a few, over the badlands, tundra or grass. They circle high over the land and keep clear of people.',
  snake:
    'Release a snake, or a few, over the sand, badlands or jungle. They slip about in the heat and keep clear of people.',
  crocodile:
    'Release a crocodile into the wetlands or jungle. Hungry ones hunt the animals there, and people who wade too close, as a bear does.',
  rain_patch:
    'A rain cloud bursts over the brush area: fires in it go out (leaving ash), and the people in it drink from the rain. The brush sets how wide the patch is.',
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

export function toolHowTo(tool: SandboxTool, brush = 0): string {
  if (tool.view) return 'click to toggle this layer'
  if (tool.mode === 'instant') return 'click to apply at once'
  return `click the world · ${toolReach(tool, brush)}[ ] brush · esc to stop`
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
  if (typeof cmd.radius === 'number') bits.push(`reaches ${Math.round(cmd.radius)} tiles`)
  if (typeof cmd.count === 'number') bits.push(`brings ${cmd.count}`)
  return bits.length ? `${bits.join(' · ')} · ` : ''
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
    case 'cure_tribe':
      return 'nobody near is sick in their tribe'
    case 'guardian':
      return 'nobody is near enough to guard'
    case 'clear_region':
      return 'nothing living or planted there to clear'
    case 'rain_patch':
      return 'no fire to put out and nobody there to drink'
    case 'merge_tribes':
      return 'pick two people of different tribes'
    case 'split_tribe':
      return 'the group needs at least two people to go and two to stay'
    case 'mutate':
    case 'curse':
      return 'nobody is near enough to change'
    case 'teach_tribe':
      return 'no one is near, or their tribe has no secret left to learn right now'
    case 'nuke':
      return 'no tribe has reached the Industrial age yet'
    case 'eclipse':
      return 'there is no one alive to see it'
    case 'aurora':
      return 'there is no one alive to see the lights'
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
