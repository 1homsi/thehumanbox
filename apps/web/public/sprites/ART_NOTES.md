# 2D art assets

The atlas layouts and draw code live in `src/game/render`.

- `people/people.svg`: editable native pixel artwork, expanded to six appearances for each sex and life stage. Four walking frames per appearance; 128 × 1920. New outfits add ochre, teal and violet, tunic seams, belts and a satchel. The SVG retains the original age proportions. The app loads `people/people.png`, not the SVG (a 400 KB SVG rasterised on the main thread at startup).
- `people/people.png`: the SVG drawn at its natural size in Chrome, saved as PNG and then optimised losslessly (`magick in.png -strip -define png:compression-level=9 -define png:compression-filter=5 out.png`). Regenerate it whenever `people.svg` changes, and check the RGBA is unchanged (drawing the SVG and the PNG to canvases must give identical bytes). Hand-written ImageMagick rasterising of the SVG is not identical (transparent pixels turn opaque), so do not render the PNG with `magick` from the SVG.\n- `fauna.png`: native 1:1 pixel-art animal atlas (`64 × 32`, eight `16 × 16` cells). See `fauna-layout.ts` for exact source rectangles and pixel grids: rabbit (`6 × 6`), deer (`12 × 12`), wild boar (`10 × 8`), small brown bird (`5 × 4`), wolf (`12 × 9`), dog (`10 × 8`), river fish (`6 × 5`), and golden bird (`5 × 4`).
- `vegetation.png`: native 1:1 pixel-art vegetation atlas (`100 × 40`, ten `20 × 20` cells). See `vegetation-sprites.ts` for exact source rectangles and pixel grids: broad green oak (`17 × 17`), dense dark oak (`18 × 18`), evergreen pine (`16 × 18`), dark boreal pine (`14 × 17`), white-trunk birch (`15 × 17`), autumn red oak (`17 × 17`), autumn golden oak (`17 × 17`), bare winter/dead tree (`12 × 14`), desert saguaro cactus (`8 × 10`), and low leafy shrub (`7 × 6`). The tree renderer chooses the seasonal and biome variant.
- `tiny-town.png` and `tiny-creatures.png`: existing fallback atlases; their original license files remain alongside them.

## Native pixel-art rules

Both `vegetation.png` and `fauna.png` are authored directly at `1` world pixel = `1 / TILE` of a tile (`TILE = 8`) using the shared `art-palette.ts` colours (`INK` outer outlines, `FOREST` and `GRASS` greens, `SAND` and `ROCK` hides, `FRESH_WATER` fish tones, and warm bark/autumn tones). Light comes from the top-left, with 2–3 flat tones per material and no gradients.

## Rendering rules

Keep atlas bounds and TypeScript layout constants synchronized. Draw sprites 1:1 at native pixel size with `imageSmoothingEnabled = false` and nearest-neighbor sampling, anchored at the feet (`y + size * 0.88` for vegetation, `cy + size * 0.42` for land animals). Facing follows horizontal movement and persists at rest. Characters and animals sort by ground depth without mutating simulation arrays. Public asset URLs must honor Vite's base URL so the Electron build can load them from disk.
