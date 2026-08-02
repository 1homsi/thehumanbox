# Firewatch-inspired 3D world design QA

**Source visual truth**

- Firewatch art-direction references opened during research: https://www.firewatchgame.com/media/, https://www.pcgamer.com/firewatch-gallery-a-colorful-tour-of-shoshone-national-forest/, and https://gdcvault.com/play/1022295/The-Art-of
- Existing Human Box 3D capture: `/tmp/thehumanbox-firewatch-design-qa/thehumanbox-3d-before.png`
- Normalized source capture: `/tmp/thehumanbox-firewatch-design-qa/thehumanbox-3d-before-normalized.png`

**Rendered implementation**

- Local production preview: `http://127.0.0.1:5174/?3d=1&tod=0.70`
- Browser-rendered implementation screenshot: `/tmp/thehumanbox-firewatch-design-qa/thehumanbox-3d-final-rebuilt.jpg`
- Same-input comparison: `/tmp/thehumanbox-firewatch-design-qa/before-after-comparison.png`

**Capture normalization**

- CSS viewport: 1280 x 720.
- Device scale factor: 1.
- Source pixels: 1440 x 900, center-cropped and normalized to 1280 x 720.
- Implementation pixels: 1280 x 720 (the final rebuilt JPEG was captured at the same CSS viewport and density as the PNG comparison capture).
- State: local WASM world, 3D mode, clear weather, golden hour forced with `tod=0.70`, onboarding dismissed for the final implementation capture.

**Full-view comparison evidence**

The combined before/after image was opened and reviewed as one 2560 x 720 comparison. The implementation now uses a warm graphic sky, three atmospheric ridge layers, darker readable forest silhouettes, a lower scenic camera, matte water, and simplified low-poly terrain. The former white repeating mountain wall and cold specular water no longer dominate the scene. The result follows the Firewatch references' broad principles—bold authored color, readable silhouettes, and depth through layered value/color—without copying game assets.

No focused region comparison was needed: the requested changes concern world-scale composition, atmosphere, terrain, and silhouette. Those surfaces are clearly readable in the normalized full-view comparison; the persistent HUD itself was not the subject of this pass.

**Required fidelity surfaces**

- Fonts and typography: unchanged intentionally; the request targeted the rendered world and the existing compact game HUD remains legible.
- Spacing and layout rhythm: the default camera was lowered and moved closer so terrain, horizon, and sky form distinct bands instead of an aerial map view.
- Colors and visual tokens: a single time-of-day/weather palette now drives sky, fog, lighting, exposure, clouds, and ridge colors. Golden hour has warm orange/peach light with dark green-brown foreground silhouettes.
- Image quality and asset fidelity: no Firewatch assets were copied or approximated with raster placeholders. Existing procedural 3D assets were reshaped and recolored; terrain and water noise were reduced to improve the low-poly painterly read.
- Copy and content: unchanged; no new visible app copy was required.

**Comparison history**

1. Initial pass — blocked.
   - [P1] The repeating white cone range read as a bright sawtooth wall and flattened the horizon.
   - [P2] The aerial camera made the world read as a technical map rather than a scenic landscape.
   - [P2] Cold water sparkle and high-frequency terrain texture fought the desired graphic style.
   - Fixes: replaced cone mountains with continuous procedural ridge rings, lowered the camera, reduced terrain bump/texture influence, reduced water sparkle/foam, and introduced a shared authored atmosphere palette.
   - Evidence: `/tmp/thehumanbox-firewatch-design-qa/thehumanbox-3d-after-pass1.png`.
2. Golden-hour refinement — blocked.
   - [P2] Early ridges remained too tall/dark and the sky was not warm enough to separate the layers.
   - Fixes: lowered ridge amplitude, strengthened the peach/orange golden-hour sky, tuned fog/exposure, deepened foreground forest color, and made cloud color follow the atmosphere.
   - Evidence: `/tmp/thehumanbox-firewatch-design-qa/thehumanbox-3d-golden-pass2.png`.
3. Final production pass — passed.
   - No actionable P0/P1/P2 visual differences remain for the requested art-direction pass.
   - Pointer lock was additionally scoped to the 3D canvas so HUD clicks do not request mouse capture.
- Evidence: `/tmp/thehumanbox-firewatch-design-qa/thehumanbox-3d-final-rebuilt.jpg` and `/tmp/thehumanbox-firewatch-design-qa/before-after-comparison.png`.

**Primary interactions tested**

- Loaded the production preview directly into 3D mode.
- Dismissed onboarding and verified the full world view.
- Verified the bottom tool bar and minimap remain visible over the new scene.
- Checked pointer-lock targeting after constraining it to the canvas.

**Console check**

- No new product errors appeared after the rebuilt production render or after opening the Settings HUD control. The two pointer-lock errors retained in the browser log predate the rebuilt bundle; no new pointer-lock error was emitted after the canvas-only fix.
- One upstream Three.js `Clock` deprecation warning remains and is unrelated to this visual pass.

**Findings**

- No remaining P0/P1/P2 design findings for this scope.
- [P3] Future biome-specific prop variety could strengthen close-range identity, but it is not required for this atmospheric world pass.

**Implementation checklist**

- [x] Shared time-of-day and weather palette.
- [x] Layered procedural ridge silhouettes.
- [x] Scenic default camera framing.
- [x] Warmer low-poly biome/tree palette.
- [x] Reduced terrain and water visual noise.
- [x] Canvas-only pointer lock.
- [x] Browser-rendered production evidence and normalized comparison.

final result: passed
