# 2D art assets

The atlas layouts and draw code live in `src/game/render` and `src/shared`.

- `people/people.svg`: generated native pixel artwork, 1280 × 1920, from `node scripts/gen_people_sprites.mjs` in `apps/web` (Node 22.18+ for native TypeScript imports). Add `--raster` to regenerate and losslessly optimize the PNG with installed Chrome and ImageMagick, and verify every decoded RGBA byte against the SVG. The command defaults to CDP port 9786; use `--port N` if it is occupied. The generator imports layout constants from `character-visuals.ts` and colours from `art-palette.ts`.
- `people/people.png`: the SVG drawn at its natural size in Chrome, saved as PNG and then optimised losslessly (`magick in.png -strip -define png:compression-level=9 -define png:compression-filter=5 out.png`). Regenerate it whenever `people.svg` changes, and check the RGBA is unchanged (drawing the SVG and the PNG to canvases must give identical bytes). Hand-written ImageMagick rasterising of the SVG is not identical (transparent pixels turn opaque), so do not render the PNG with `magick` from the SVG. The app loads the PNG; the SVG is the generated source.

### People atlas

Each cell is 32 × 32 with transparent padding. Draw it at native size on the map: adult silhouettes are 14 px tall, teens and elders 12, children 9 and infants 6. Feet end at row 25 (exclusive). Heads and trade marks follow the age-specific height, not the top of the padded cell.

Rows are `(sex * 5 + stage) * 6 + appearance`, with male/female and infant/child/teen/adult/elder order. Six authored appearances combine skin and hair variety with earthy clothes; no runtime hue rotation is applied. Columns are `clothingEra * 8 + facing * 4 + walkFrame`. Facing 0 looks right, facing 1 looks left; both are independently shaded from the top-left. Do not mirror these cells in the map renderer.

The five clothing banks are hides/furs (pre-stone, stone, bronze, iron), tunics/robes (classical, medieval, renaissance), coats/shirts (industrial), suits/uniforms (modern, atomic, information), and sleek suits/spacesuits (space and later eras). Missing era data uses hides. `PeopleSpriteLayers` already normalizes `world.lineage_eras`; `PeopleSprites` resolves the person's lineage into a column bank at rebuild time. The animation loop only adds the facing and walking frame, with one body sprite per person and reusable typed arrays.

The only new colours are these six skin ramps (lit, mid, shade), defined locally in the generator for later palette integration:

- `#d5a477`, `#b77d56`, `#81513b`
- `#a97752`, `#825538`, `#593b2c`
- `#edc6a0`, `#d4a078`, `#a27050`
- `#c48b60`, `#9e6745`, `#704732`
- `#916344`, `#70492f`, `#503528`
- `#e0b38b`, `#bd8c65`, `#8d6044`

Trade marks use the shared palette and native integer pixels. Future suits keep their helmet silhouette rather than receiving a historical trade hat. Elder walking sticks are drawn into the atlas.

### Other atlases

- `fauna-v2.png`: original generated animal artwork. See `fauna-layout.ts` for measured source rectangles. All seven supported animal species are covered, with two bird appearances.
- `vegetation-v2.png`: original generated vegetation artwork: oak, pine, birch, autumn red and gold trees, bare tree, cactus, and shrub. The tree renderer chooses the seasonal and biome variant.
- `tiny-town.png` and `tiny-creatures.png`: existing fallback atlases; their original license files remain alongside them.

## Generation prompts

Both new PNG atlases use built-in image generation. Original PNGs are preserved; crop rectangles and scaling are applied only by the renderer.

Animals: transparent 4×2 atlas, rabbit, deer, wild boar, small brown bird; silver-gray wolf, tan dog with red collar, blue river fish, golden bird. Chunky pixel-art RPG sprites, all facing right, dark outlines, warm natural colors, upper-left highlights, isolated complete silhouettes. No text, grid lines, scenery, shadows, glow or interface.

Vegetation: transparent 4×2 atlas, broad green oak, dark evergreen pine, light-leaf white-trunk birch, autumn red oak; autumn golden oak, bare winter tree, desert cactus, low leafy shrub. Chunky pixel-art RPG sprites, dark outlines, three-tone leaf clusters, upper-left highlights, warm trunks, isolated complete crowns and roots. No text, grid lines, terrain, ground discs or shadows.

## Rendering rules

Keep atlas bounds and TypeScript layout constants synchronized. Preserve aspect ratios and feet anchors. Nearest-neighbor sampling is deliberate. Facing follows horizontal movement and persists at rest. Characters and animals sort by ground depth without mutating simulation arrays. Public asset URLs must honor Vite's base URL so the Electron build can load them from disk.
