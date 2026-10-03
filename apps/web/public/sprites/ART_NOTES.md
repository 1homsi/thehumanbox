# 2D art assets

The atlas layouts and draw code live in `src/2d/world`.

- `people/people.svg`: editable native pixel artwork, expanded to six appearances for each sex and life stage. Four walking frames per appearance; 128 × 1920. New outfits add ochre, teal and violet, tunic seams, belts and a satchel. The SVG retains the original age proportions.
- `fauna-v2.png`: original generated animal artwork. See `fauna-layout.ts` for measured source rectangles. All seven supported animal species are covered, with two bird appearances.
- `vegetation-v2.png`: original generated vegetation artwork: oak, pine, birch, autumn red and gold trees, bare tree, cactus, and shrub. The tree renderer chooses the seasonal and biome variant.
- `tiny-town.png` and `tiny-creatures.png`: existing fallback atlases; their original license files remain alongside them.

## Generation prompts

Both new PNG atlases use built-in image generation. Original PNGs are preserved; crop rectangles and scaling are applied only by the renderer.

Animals: transparent 4×2 atlas, rabbit, deer, wild boar, small brown bird; silver-gray wolf, tan dog with red collar, blue river fish, golden bird. Chunky pixel-art RPG sprites, all facing right, dark outlines, warm natural colors, upper-left highlights, isolated complete silhouettes. No text, grid lines, scenery, shadows, glow or interface.

Vegetation: transparent 4×2 atlas, broad green oak, dark evergreen pine, light-leaf white-trunk birch, autumn red oak; autumn golden oak, bare winter tree, desert cactus, low leafy shrub. Chunky pixel-art RPG sprites, dark outlines, three-tone leaf clusters, upper-left highlights, warm trunks, isolated complete crowns and roots. No text, grid lines, terrain, ground discs or shadows.

## Rendering rules

Keep atlas bounds and TypeScript layout constants synchronized. Preserve aspect ratios and feet anchors. Nearest-neighbor sampling is deliberate. Facing follows horizontal movement and persists at rest. Characters and animals sort by ground depth without mutating simulation arrays. Public asset URLs must honor Vite's base URL so the Electron build can load them from disk.
