# Art direction

The map should read as **one piece of pixel art drawn by one hand**: clear, colourful and readable, every
sprite and every tile from the same small palette. Every rule below exists to keep it that way.

The colours live in code in [`apps/web/src/game/render/pixel-art/palette.ts`](../apps/web/src/game/render/pixel-art/palette.ts).
This page explains the rules; the modules are the source of truth.

## Drawn, not generated

Players kept saying the map "looks AI-generated". They were right about the cause: the old sprites were painted
with canvas shapes (paths, arcs, translucent overlays) by one recipe per family, then pushed through filters that
snapped them to pixels, merged near tones, tinted everything warm and extruded a side wall. However tidy the
result, it reads as processed, not drawn. The rule that replaces all of that:

**A sprite is a grid of pixels chosen one by one from one palette.**

- **One master palette.** [`pixel-art/palette.ts`](../apps/web/src/game/render/pixel-art/palette.ts) holds 46
  colours in ramps whose shades shift in hue as they darken (the Apollo palette by AdamCYounis). A sprite stores
  palette indexes, so it cannot contain a colour from outside the palette. There are no tints, blends or filters
  after drawing.
- **Whole pixels only.** [`pixel-art/art.ts`](../apps/web/src/game/render/pixel-art/art.ts) is the whole toolkit:
  set a pixel, fill a rectangle, stamp rows of letters (one letter, one pixel). No curves, no anti-aliasing, no
  scaling, no rotation.
- **Every kind has a drawing of its own.** No two building kinds share a sprite (a test checks it). Kinds of one
  family may share parts (a window, a door, a roof), as an artist's tile set does, but each has its own silhouette
  and something only it has: the bank its vault door, the fishmonger its rack of fish, the forge its fire.
- **Flat tones, placed detail.** A wall is one tone with a shaded side, a shadow under the eave and a footing. A
  brick or stone wall carries a few joints in two corners, never an all-over grid. A roof has a lit ridge, a
  course line every third row and a dark eave.
- **One ink.** The outline is the palette's darkest warm tone (`INK`), one pixel, round the whole silhouette.
  Things that lie on the ground (a pond, a plaza, a plot) are edged in a darker tone of themselves instead,
  because they are part of the land.
- **Standing things are seen from the front, lying things from above.** A house, a tower, a stadium show their
  front. A plaza, a pond, a field, a jetty are seen from above.
- **Light from the top-left.** The right side of every wall, drum and dome is in shade; cast shadows fall to the
  bottom-right as one flat translucent shape.

Buildings (`pixel-art/buildings/`) and the ground (`base-parts/ground-palette.ts`) are drawn this way. Trees,
animals and people still carry their older sprites until they are redrawn; where an older rule below
disagrees with this section, this section wins.

To look at the art, run `node bench/art-sheet.mjs --out <dir>` in `apps/web`: it writes labelled sheets of every
building kind, every home by era and the first homes by land, straight from the pixel grids (no browser, no
build), and fails if any sprite does not fit the cell the map bakes it into. Review a sheet at 4x and at 1x
before merging art; a second pair of eyes that has not seen the code is worth more than the author's.

## The three rules

### 1. One pixel size

One art pixel is one world pixel. A tile is `TILE` = 8 world pixels, and everything on the map (people, animals,
trees, buildings, icons on the map) is authored at that native size and drawn with nearest-neighbour sampling.

- No large images shrunk down to fit. A 400 px painting drawn into a 14 px box turns into soft mush next to
  crisp pixels, which is the mixed look this rule removes.
- No smooth gradients inside a sprite. Use two to four flat tones per material (light, mid, shade, and the outline).
- Rough sizes: an adult person 16 px tall, a teen or elder 14, a child 10; small animals 5 to 8 px; large animals 10 to
  14 px; trees 10 to 18 px; buildings by footprint.

### 2. One light source

Light comes from the **top-left (north-west)**, everywhere.

- Faces turned up and to the left are lit; faces turned down and to the right are in shade.
- Cast shadows fall to the **bottom-right**, as flat translucent shapes (`SHADOW`), never blurred.
- Mountains, buildings, trees, people and animals all follow it. A sprite lit from the right is a bug.

### 3. One palette

Everything on the map takes its colours from the master palette (`pixel-art/palette.ts`). The ground, sea,
rock and snow are named in [`art-palette.ts`](../apps/web/src/game/render/art-palette.ts), each one a colour of
that palette.

- **Ground is a flat colour picked, not mixed.** Each biome has two tones, its ground and the tone of its
  patches (`base-parts/ground-palette.ts`); a tile is one or the other. There is no biome tint blended over a
  tile colour, no season tint, no shade of noise, and no grain under the surface marks. A season changes which
  two tones a biome uses (open grass yellows in autumn, pales in winter, frosts in a hard winter).
- **Sea**: three flat blues, deep to shallow, with a thin lighter contour where one meets the next and a light
  surf line on the shore. Three, not five: rings round every island read as a generated height map.
- **Fresh water** is lighter than the sea, so a river reads across open country.
- **Mountains keep their own look and colours.** The ranges are a sculpted relief in warm stone, lit from the
  north-west, with snow on the high core (`mountains.ts`). They hold their own colour constants so that palette
  changes elsewhere cannot reach them. Do not restyle them.
- **Fields, roads and the marks people leave** (worn earth, puddles, ore, forage) are solid palette pixels.
  Nothing on the ground is translucent.
- **Outlines**: the ink `INK`, not pure black. Outline the outer silhouette; inner lines are a darker tone of
  the material, not ink.

## The world's edge

The world has no visible rectangle. Past the last tile the ocean continues in the deepest band (`OCEAN.deep`), so
the map seems to sit in an open sea. Land can come close to the edge.

## Readable at the standard zoom (#883)

Players said the map "looks AI-generated" and that "it's impossible to know what most of the pixels mean". The
cause was not one sprite but noise: per-pixel speckle inside sprites, near-equal tones, confetti over the ground and
coloured rings under every figure. These rules keep every sprite family in one hand-made style and let the common
objects (people, huts and tents, trees, animals, fields) be told apart without hovering.

### Sprites

- **Silhouette first.** Each common object has a shape of its own that reads at zoom 1 before any detail: a tent is
  a squat cone with its poles crossing over the top (not a two-tile spike), a horse has a raised neck and long legs,
  a sheep a white fleece and a dark face, a cow white with dark patches and horns, a deer antlers and a white tail,
  a chicken a red comb, an oak a crown of round clumps, a pine stacked tiers.
- **Outline rule.** The outer silhouette is `INK`, one pixel, everywhere (people, animals, trees, buildings, tents).
  Inner lines are a darker tone of the material, never ink.
- **Flat tones, no speckle.** A material is three flat tones (lit, mid, shade) plus at most one highlight. Texture is
  either regular (roof courses, wall courses, crop rows) or clumped (leaf clumps); never random single pixels. A crown
  is a few round clumps, each lit on its top-left and darker where the clump in front overlaps it. Roof courses are
  unbroken lines; no random gaps or odd tiles.
- **Few colours per sprite.** Buildings take theirs from the master palette's ramps (four tones a material); they
  need no clean-up pass, because nothing in them is blended.

### Fields

- Field patterns repeat every two or four pixels, which divide the tile, so a field of many tiles is one field with
  rows running straight through, not a grid of stamps. Crops stand in rows on furrow lines (rows 3 and 7).
- Ripeness changes the crop's colour as a whole (gold grain, white cotton). There is no light frame round each ripe
  tile: that turned every ripe field into a yellow waffle.
- Colours come from three ramps (tilled soil, leaf, straw) plus the crop's own ripe colour.

### The ground stays quiet

- Ground decor (tufts, flowers, stones) is sparse and one tone off the ground it lies on, so it textures the land
  without reading as objects. Flowers grow in meadows, not one by one over every field.
- Weather and season particles are few and whole pixels: 40 petals or leaves at most, no rotation, no white among
  them; stars are single dim pixels in one cell in six.
- Cloud shadows are the map's one shadow colour (`SHADOW`) at low alpha, on a half-tile grid, so a cloud is a rounded
  patch of shade, not a stack of dark tile-sized blocks.

### Marks on people

At the standard zoom a person is their sprite, their shadow and what they are doing (a work pose, an emote such as
praying or trading). Tribe rings, signal rings, sickness glows and mood auras appear close up (detail zoom) or on
the selected person; fear, sickness and grief emotes, which a whole crowd shares in a raid or a plague, show close up
only. The health and age views keep their colour discs.

A person is a round head five pixels wide (hair on top, a face with two dark eyes, a narrower chin) over a body
seven wide at the shoulders, on two legs: a big readable head and a broad block of clothing, the clothing's colour
and cut (hides, robes, coats, suits, spacesuits) carrying the era. A three-wide head on a five-wide body read as a
coloured stick.

### Labels

At the standard zoom the map shows settlement names, and the selected or followed person's name. Everyone else's
name fades in only close up (from zoom 2.1, `NAMES_FROM_ZOOM`), in a small 7 px face, so names never cover the map.

### Villages

- **One hut per 2x2 block.** The simulation marks every occupied tile as a hut, and huts packed side by side drew
  their roofs into one another. The renderer draws one hut in the middle of each 2x2 block of hut tiles, so ground
  shows round every house. A village of ten or more huts gets its meeting hall: a longhouse painted and finished
  like every other building (no hand-drawn icon, no glowing square).
- **The ground light under a hut is for the night only.**
- **Roof colour says whose a home is.** A tribe's homes carry one of four roofs (terracotta tile, blue slate,
  moss, golden straw: `TRIBE_ROOF_TINTS` in `building-painters/tribe-palette.ts`), from its first huts to its last
  villas, so two tribes' villages differ across the map. Other buildings keep the roof their drawing gives them.
- **Shops are read by what stands outside.** Each trade has a signboard with its picture and puts its goods in
  the street (hams on hooks, a dummy in a dress, a red pillar box), and trades are built to different plans: a
  gabled front, an open stall, a tall jettied house, a long front under the eaves, a modern box.
- **Homes change with every era and stay the size of their plot.** Each era has three or four forms (see
  `pixel-art/buildings/homes.ts`). A hut on a two-tile plot is still a small home in the space age (a capsule, a
  house under a grass roof), not a tower; the towers belong to the kinds that were always tall.

### Homes follow the land

Up to the village age homes are built the land's way (`pixel-art/buildings/homes-early.ts`), so villages on different
land look different: round houses (a daub drum under a cone of thatch) on grassland and savanna, flat-roofed
mud-brick houses with a white dome behind a low courtyard wall in the desert and badlands, long low turf halls in
the taiga, igloos on the tundra, stilt houses over the marsh, longhouses in forest and jungle.

### Ground

- A speck of one biome (one or two cells) inside a field of another is painted as its surroundings
  (`paintedBiome` in `base-parts/tile-paint.ts`), so the ground is not a patchwork of 8-pixel squares.
- Ice is frozen water: the river's colour under a frost, not a pale grey square.

## What to avoid

These read as generated, or as someone else's game:

- a tint, a blend or a noise shade over the ground: every tile a slightly different colour;
- blurred glow around islands, or more than three rings of depth;
- flat grey mountain blobs with no lit or shaded side;
- pure black outlines;
- detailed artwork scaled down next to chunky pixels;
- random single-pixel speckle inside sprites or scattered over the ground;
- rings, glows and badges under or over every figure in a crowd;
- anything drawn with canvas paths, arcs, gradients or alpha and then "pixelated";
- one body reused for several kinds with only the colours changed;
- a texture filled over a whole surface (a brick grid on every wall);
- a filter over finished art (a warm tint, tone merging, an automatic side wall).

## Where the art lives

| Area                     | Files                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Terrain, sea, world edge | `landscape-style.ts`, `base-parts/` (the sea chart is `sea-chart.ts`), `mountains.ts`, `model/palette.ts`, `cf/ground/`                                                              |
| Buildings                | `pixel-art/buildings/` (one file a family; parts in `kit.ts`, shapes in `shapes.ts`, snow and cracks in `wear.ts`), baked by `building-painters/sprite.ts`; sites and ruins in `building-draw/` |
| People                   | `apps/web/scripts/gen_people_sprites.mjs` writes `public/sprites/people/`; `character-visuals.ts`, `cf/people/`                                                                      |
| Trees and animals        | `vegetation-sprites.ts` (pixel grids), `fauna-layout.ts`, `pixel-fauna.ts`, `public/sprites/fauna.png` (the `FAUNA_GRIDS` drawn at `FAUNA_RECTS`; regenerate it when a grid changes) |
| Fields                   | `cf/landuse/farm-tile.ts`                                                                                                                                                            |
| Ground decor, clouds     | `decorations.ts` (`paintDecorTile`, `drawClouds`), `cf/overlays/` (petals, leaves, stars)                                                                                            |
| Map lettering            | `settlement-labels.ts`, `cf/overlays/settlement-label-list.ts`, `cf/people/people-names.ts`                                                                                          |

Drawn sprites use only the master palette (`pixel-art/palette.ts`); a new material is a new ramp of four of its
colours, never a new hex. For the families not yet redrawn, new colours go in `art-palette.ts` once a second file
needs them.
