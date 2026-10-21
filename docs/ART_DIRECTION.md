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

## What to avoid

These are the details players recognise from WorldBox:

- saturated lime grass;
- cyan halos or blurred glow around islands;
- flat grey mountain blobs with no lit or shaded side;
- black outlines on everything;
- detailed artwork scaled down next to chunky pixels.

## Where the art lives

| Area | Files |
|---|---|
| Terrain, sea, world edge | `landscape-style.ts`, `base-parts/` (the sea chart is `sea-chart.ts`), `mountains.ts`, `model/palette.ts`, `cf/ground/` |
| Buildings | `building-painters/` (shared shading in `kit.ts`, the outline and shadow pass in `finish.ts`), `building-draw/` |
| People | `apps/web/scripts/gen_people_sprites.mjs` writes `public/sprites/people/`; `character-visuals.ts`, `cf/people/` |
| Trees and animals | `vegetation-sprites.ts` (pixel grids), `fauna-layout.ts`, `pixel-fauna.ts`, `public/sprites/fauna.png` |
| Map lettering | `settlement-labels.ts`, `cf/overlays/settlement-label-list.ts`, `cf/people/people-names.ts` |

New colours go in `art-palette.ts` once a second file needs them; a colour only one painter uses can stay local to it.
