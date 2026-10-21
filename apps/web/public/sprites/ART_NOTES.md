# 2D art assets

The atlas layouts and draw code live in `src/game/render` and `src/shared`.

- `people/people.svg`: generated native pixel artwork, 1280 × 1920, from `node scripts/gen_people_sprites.mjs` in `apps/web` (Node 22.18+ for native TypeScript imports). Add `--raster` to regenerate and losslessly optimize the PNG with installed Chrome and ImageMagick, and verify every decoded RGBA byte against the SVG. The command defaults to CDP port 9786; use `--port N` if it is occupied. The generator imports layout constants from `character-visuals.ts` and colours from `art-palette.ts`.
- `people/people.png`: the SVG drawn at its natural size in Chrome, saved as PNG and then optimised losslessly (`magick in.png -strip -define png:compression-level=9 -define png:compression-filter=5 out.png`). Regenerate it whenever `people.svg` changes, and check the RGBA is unchanged (drawing the SVG and the PNG to canvases must give identical bytes). Hand-written ImageMagick rasterising of the SVG is not identical (transparent pixels turn opaque), so do not render the PNG with `magick` from the SVG. The app loads the PNG; the SVG is the generated source.

### People atlas

Each cell is 32 × 32 with transparent padding. Draw it at native size on the map: adult silhouettes are 14 px tall, teens and elders 12, children 9 and infants 6. Feet end at row 25 (exclusive). Heads and trade marks follow the age-specific height, not the top of the padded cell; held tools sit at `HUMAN_HAND_ROW`.

Every figure is built on the same body plan, counted down from the outline row above the hair (adult rows shown): hair at row 1, a three-row face with two dark eyes and ears at row 3, a chin at row 4, then shoulders at row 5 that are one pixel wider than the head on each side. Arms are one-pixel columns a tone darker than the chest, ending in skin hands at row 9. Two legs two pixels wide with a one-pixel gap run to dark feet at row 13, or a skirt or robe hem replaces the top of the legs. The toe on the facing side shows which way the person walks. Walking frames lift one foot and swing the opposite hand, and frame 2 bobs the body down a pixel. Children have big heads and short legs; elders have grey hair (some are bald), lean toward where they walk and carry a stick; infants are small swaddled figures. The silhouette gets a warm `INK` outline except under the feet, light comes from the top-left, and inner seams use the material's own shade.

Rows are `(sex * 5 + stage) * 6 + appearance`, with male/female and infant/child/teen/adult/elder order. The six appearances each pair a skin ramp with a hair colour, a hairstyle per sex, and a garment dye with one strong accent, so a crowd of one era doesn't look like clones. No runtime hue rotation is applied. Columns are `clothingEra * 8 + facing * 4 + walkFrame`. Facing 0 looks right, facing 1 looks left; both are independently shaded from the top-left. Do not mirror these cells in the map renderer.

The five clothing banks are hides/furs (pre-stone, stone, bronze, iron), tunics/robes (classical, medieval, renaissance), coats/shirts (industrial), suits/uniforms (modern, atomic, information), and light suits/spacesuits (space and later eras). Spacesuit helmets have a clear visor that shows the face, and half the appearances have the helmet off. Missing era data uses hides. `PeopleSpriteLayers` already normalizes `world.lineage_eras`; `PeopleSprites` resolves the person's lineage into a column bank at rebuild time. The animation loop only adds the facing and walking frame, with one body sprite per person and reusable typed arrays.

Clothing stays mid to light, with one strong accent per appearance, so people stand out from olive grass, ochre sand and dark roofs. The colours the shared palette lacks are defined at the top of the generator for later palette integration: six skin ramps, six hair colours and two greys, six cloth dyes with trouser tones, six hides and a fur, two suit ramps, a visor glass and seven accents (rust, teal, ochre, indigo, plum, moss, cream). Outlines, shoes, shirts and the stone-grey tones come from `art-palette.ts`.

Trade marks use the shared palette and native integer pixels, centred on the five-pixel head. Future suits keep their helmet silhouette rather than receiving a historical trade hat. Elder walking sticks are drawn into the atlas.

### Other atlases

- `fauna.png`: native 1:1 pixel-art animal atlas (`64 × 32`, eight `16 × 16` cells). See `fauna-layout.ts` for exact source rectangles and pixel grids: rabbit (`6 × 6`), deer (`12 × 12`), wild boar (`10 × 8`), small brown bird (`5 × 4`), wolf (`12 × 9`), dog (`10 × 8`), river fish (`6 × 5`), and golden bird (`5 × 4`).
- Trees, the shrub and the cactus have no image file: `vegetation-sprites.ts` holds them as pixel grids and draws the atlas from them once at startup, so the art and its crop rectangles cannot drift apart. The crowns of the oaks, birch and pines were generated (overlapping leaf clumps lit from the top-left, the clump behind darkened where the one in front overlaps it, the underside in shade, then a warm `INK` outline) and pasted in as grids; edit the grids directly. The bare tree and the cactus are drawn by hand. The tree renderer chooses the seasonal and biome variant.
- `tiny-town.png` and `tiny-creatures.png`: existing fallback atlases; their original license files remain alongside them.

## Native pixel-art rules

The vegetation grids and `fauna.png` are authored directly at `1` world pixel = `1 / TILE` of a tile (`TILE = 8`) using the shared `art-palette.ts` colours (`INK` outer outlines, `FOREST` and `GRASS` greens, `SAND` and `ROCK` hides, `FRESH_WATER` fish tones, and warm bark/autumn tones). Light comes from the top-left, with 2–3 flat tones per material and no gradients.

## Rendering rules

Keep atlas bounds and TypeScript layout constants synchronized. Draw sprites 1:1 at native pixel size with `imageSmoothingEnabled = false` and nearest-neighbor sampling, anchored at the feet (`y + size * 0.88` for vegetation, `cy + size * 0.42` for land animals). Facing follows horizontal movement and persists at rest. Characters and animals sort by ground depth without mutating simulation arrays. Public asset URLs must honor Vite's base URL so the Electron build can load them from disk.
