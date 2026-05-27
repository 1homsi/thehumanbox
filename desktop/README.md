# The Human Box — Desktop

A cross-platform desktop app that either:

- **Local mode (default):** runs the Rust simulation binary on the user's machine and points a bundled copy of the web client at it. Saves live in `~/Library/Application Support/TheHumanBox/worlds/` (macOS), `%APPDATA%/TheHumanBox/worlds/` (Windows), `~/.config/TheHumanBox/worlds/` (Linux).
- **Remote mode:** connects to `https://thehumanbox.com` like the web app, with bonus desktop niceties (system tray, native notifications, keyboard shortcuts, auto-update).

Users can switch modes from a settings panel.

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
  "remoteUrl": "https://api.thehumanbox.com",
  "tickMs": 100,
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

Model providers supported: `groq`, `openai`, `anthropic`, `ollama`, `llama-cpp`, `none`. The simulation reads `NARRATION_LLM_URL/KEY/MODEL` and `THINK_LLM_URL/KEY/MODEL` env vars; the Electron sim-process wrapper translates settings → env vars when spawning.

## Code signing

For the first release we ship **unsigned** on macOS and Windows. Users will see:

- macOS: "unidentified developer" / "app is damaged" — fixed with `xattr -cr "/Applications/The Human Box.app"` or right-click → Open the first time.
- Windows: SmartScreen warning — click "More info" → "Run anyway".

Add proper signing once we have certificates:
- macOS: Apple Developer ID Application cert (~$99/yr), set `CSC_LINK` + `CSC_KEY_PASSWORD` env vars during build.
- Windows: EV code-signing cert (~$300/yr).
