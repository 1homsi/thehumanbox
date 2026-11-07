# Art direction

The map should read as **a living, hand-inked survey map**: warm, earthy and readable, in the same family as the
brown, parchment and gold interface around it. Every rule below exists to make the world look like one piece of
art, and to move it away from the bright lime-and-cyan look players compare to WorldBox.

The colours live in code in [`apps/web/src/game/render/art-palette.ts`](../apps/web/src/game/render/art-palette.ts).
This page explains them; the module is the source of truth.

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

Earthy and slightly muted, never neon. Colours come from `art-palette.ts`, not ad-hoc hex values.

- **Ocean**: deep slate-teal, not cobalt. Depth reads as **stepped bands** with a thin, slightly lighter contour line
  where one band meets the next, like soundings on a sea chart. There is **no soft glow** around coasts. A narrow
  light surf line hugs the shore.
- **Grass**: olive and sage, sliding to ochre where it is dry. Never lime.
- **Forest**: deep moss greens.
- **Sand and desert**: parchment and ochre.
- **Rock**: warm stone with a cool shadow side.
- **Snow**: off-white, with a blue-grey shade side.
- **Outlines**: the warm dark ink `INK`, not pure black. Outline the outer silhouette; inner lines are a darker tone
  of the material, not ink.

## The world's edge

The world has no visible rectangle. Past the last tile the ocean continues in the deepest band (`OCEAN.abyss`), so
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
- **Few colours per sprite.** The building finish pass merges every colour within `NEAR_TONE` of a more common one
  (`mergeNearTones` in `building-painters/finish.ts`), so hue jitter and translucent shading over a flat fill leave
  one tone, not a cloud of almost-equal ones.

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

## What to avoid

These are the details players recognise from WorldBox:

- saturated lime grass;
- cyan halos or blurred glow around islands;
- flat grey mountain blobs with no lit or shaded side;
- black outlines on everything;
- detailed artwork scaled down next to chunky pixels;
- random single-pixel speckle inside sprites or scattered over the ground;
- rings, glows and badges under or over every figure in a crowd.

## Where the art lives

| Area                     | Files                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Terrain, sea, world edge | `landscape-style.ts`, `base-parts/` (the sea chart is `sea-chart.ts`), `mountains.ts`, `model/palette.ts`, `cf/ground/`                                                              |
| Buildings                | `building-painters/` (shared shading in `kit.ts`, the outline and shadow pass in `finish.ts`), `building-draw/`                                                                      |
| People                   | `apps/web/scripts/gen_people_sprites.mjs` writes `public/sprites/people/`; `character-visuals.ts`, `cf/people/`                                                                      |
| Trees and animals        | `vegetation-sprites.ts` (pixel grids), `fauna-layout.ts`, `pixel-fauna.ts`, `public/sprites/fauna.png` (the `FAUNA_GRIDS` drawn at `FAUNA_RECTS`; regenerate it when a grid changes) |
| Fields                   | `cf/landuse/farm-tile.ts`                                                                                                                                                            |
| Ground decor, clouds     | `decorations.ts` (`paintDecorTile`, `drawClouds`), `cf/overlays/` (petals, leaves, stars)                                                                                            |
| Map lettering            | `settlement-labels.ts`, `cf/overlays/settlement-label-list.ts`, `cf/people/people-names.ts`                                                                                          |

New colours go in `art-palette.ts` once a second file needs them; a colour only one painter uses can stay local to it.
