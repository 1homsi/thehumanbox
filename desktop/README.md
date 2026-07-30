# The Human Box — Desktop

A cross-platform desktop app that runs the Rust simulation binary on the
user's machine and points a bundled copy of the client at its loopback API.
Saves live in `~/Library/Application Support/TheHumanBox/worlds/` (macOS),
`%APPDATA%/TheHumanBox/worlds/` (Windows), or
`~/.config/TheHumanBox/worlds/` (Linux).

## What's in this directory

- `main/` — Electron main process (Node.js side). Window creation, sim-process spawning, IPC, auto-update.
- `preload/` — `contextBridge` surface exposed to the renderer as `window.thbDesktop`.
- `resources/bin/` — the platform-native Rust simulation binary, dropped here by CI per target.
- `electron-builder.yml` — packaging config for macOS dmg/zip, Windows nsis/zip, Linux AppImage/deb.

## Building locally

```bash
# 1. Build the Rust binary into resources/bin/
cargo build --release --manifest-path ../simulation/Cargo.toml --bin simulation-rs
mkdir -p resources/bin
cp ../simulation/target/release/simulation-rs resources/bin/  # or .exe on Windows

# 2. Install + build the Electron pieces
pnpm install
pnpm run build

# 3. Run from source (no packaging)
pnpm run dev
```

## Packaging

```bash
pnpm run pack         # produces an installer/zip in out/ for the current platform
pnpm run release      # same, but pushes to GitHub Releases (needs GH_TOKEN)
```

CI builds all three platforms in matrix mode and uploads each artifact to the GitHub Release tagged for that version.

## Auto-update

The packaged app uses `electron-updater` pointed at this repo's GitHub Releases. On boot it checks for a newer version; if one exists, it downloads quietly in the background and prompts the user to restart-and-update. Users can disable this in settings.

## Settings

Stored as JSON at `app.getPath('userData') + '/settings.json'`. Schema:

```json
{
  "mode": "local",
  "tickMs": 100,
  "populationCap": 500,
  "model": {
    "provider": "none",
    "apiUrl": "",
    "apiKey": "",
    "modelName": ""
  },
  "saveLocationOverride": null,
  "autoUpdate": true
}
```

Model providers supported: `ollama`, `llama-cpp`, any custom local
OpenAI-compatible endpoint, and `none`. The
simulation reads `NARRATION_LLM_URL/KEY/MODEL` and
`THINK_LLM_URL/KEY/MODEL` env vars; the Electron sim-process wrapper
translates settings into process-local environment variables when spawning.

`none` is the default and explicitly clears inherited API keys/endpoints, so a private desktop world makes no AI network calls unless the player opts into a provider. The default 500-person capacity is the tested balanced tier; larger presets extend the scale of late-era civilizations and are marked accordingly in Settings.

Save-folder changes use the same safety model: checkpoint, take exclusive
ownership of both folders, copy into staging, switch only after the copy is
complete, and retain the old folder as a rollback backup. The desktop also
offers a portable world export and a confirmed “start new world” flow that
archives the old world instead of deleting it. Atomic data-root and PID records
prevent two app processes from writing the same local world.

## Code signing

We ship **unsigned** on macOS and Windows for now (no Apple Developer
account, no Windows EV cert yet). The CI build sets
`CSC_IDENTITY_AUTO_DISCOVERY=false` so electron-builder doesn't try to
sign at all.

What users see, and how to bypass:

- **macOS** — "app is damaged" / "unidentified developer".
  Either run the one-liner from the root README, or manually:
  ```bash
  xattr -dr com.apple.quarantine "/Applications/The Human Box.app"
  ```
- **Windows** — SmartScreen warning. Click "More info" → "Run anyway".
- **Linux** — nothing to bypass; just `chmod +x` the AppImage.

When we eventually buy certs (~$99/yr Apple, ~$300/yr Windows EV), the
flip is: add `CSC_LINK` / `CSC_KEY_PASSWORD` / `WIN_CSC_LINK` /
`WIN_CSC_KEY_PASSWORD` to repo secrets, drop the
`CSC_IDENTITY_AUTO_DISCOVERY=false` line in
`.github/workflows/desktop-release.yml`, flip `hardenedRuntime: true`
and `mac.notarize: true` in `electron-builder.yml`.
