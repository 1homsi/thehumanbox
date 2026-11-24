# Shipping on Steam

The desktop app (`apps/desktop`, Electron) has a Steam flavour. It is the same app with three differences:

- it never updates itself (Steam does that), and the update settings are hidden;
- it starts Steamworks: if it was not launched from Steam it asks Steam to launch it, and it turns the overlay on;
- it tells Steam when the player earns one of the game's achievements.

The download from the website is unchanged.

## What you need from Steamworks

1. A Steamworks account with the app fee paid. This gives you the **app id**.
2. One **depot** per platform (Windows, macOS, Linux). Each has a depot id.
3. A Steamworks login allowed to upload builds. Use a separate build account, not your personal one, with Steam Guard set up.
4. The Steamworks SDK, for its uploader (`sdk/tools/ContentBuilder/builder_osx/steamcmd.sh` on a Mac). The SDK is not in this repository and must not be committed: its licence does not allow redistribution. After unzipping, make the uploader runnable: `chmod +x sdk/tools/ContentBuilder/builder_osx/steamcmd*`.

## Build

```sh
cd apps/desktop
STEAM_APP_ID=<app id> pnpm run pack:steam
```

This writes an unpacked app to `apps/desktop/out/steam/` (`mac-arm64/` on an Apple silicon Mac, `mac/` on an Intel one, `win-unpacked/` or `linux-unpacked/`, for the platform you build on). No installer is made: Steam installs the folder as it is.

The simulation binary must be in `apps/desktop/resources/bin/` first, exactly as for the normal build (see `apps/desktop/README.md`).

To try the flavour from source, without packaging:

```sh
THB_DISTRIBUTION=steam THB_STEAM_APP_ID=480 pnpm run dev
```

480 is Valve's public test app ("Spacewar"). With Steam running and signed in, the overlay opens with Shift+Tab. Without Steam the game logs `running without Steam` and starts anyway.

## Upload

```sh
cd apps/desktop
export STEAMCMD=/path/to/sdk/tools/ContentBuilder/builder_osx/steamcmd.sh
export STEAM_APP_ID=<app id> STEAM_USERNAME=<build account>
STEAM_DEPOT_ID=<macOS depot id> steam/upload.sh mac
```

Use `win` or `linux` with that platform's depot id for the others. Add `STEAM_PREVIEW=1` to check a build without uploading anything.

An upload never reaches players by itself. The build appears under **SteamPipe → Builds**, and you set it live on a branch there. Keep a `beta` branch for testing before `default`.

## Set up in the Steamworks dashboard

### Launch options

| Platform | Executable |
|---|---|
| Windows | `The Human Box.exe` |
| macOS | `The Human Box.app` |
| Linux | `thehumanbox-desktop` |

Check each name against the unpacked folder before saving.

### Steam Cloud (Auto-Cloud)

Saves live in the app's own data folder, so Auto-Cloud can sync them with no code:

| Platform | Root | Subdirectory | Pattern |
|---|---|---|---|
| Windows | `WinAppDataRoaming` | `TheHumanBox/worlds` | `*` (recursive) |
| macOS | `MacAppSupport` | `TheHumanBox/worlds` | `*` (recursive) |
| Linux | `LinuxXdgConfigHome` | `TheHumanBox/worlds` | `*` (recursive) |

A grown world's save is tens of megabytes, so set the quota with room for several (1 GB and 1,000 files is a reasonable start).

This is not tested yet. The folder also holds recovery copies and a lock file, and a player who moved their save folder in the settings is outside these paths. Test a save made on one machine loading on another before turning Cloud on for players.

### Achievements

Create these with exactly these API names. The game sends the name when the goal is first met.

| API name | In the game |
|---|---|
| `FULL_YEAR` | full-year |
| `HUNDRED_SOULS` | hundred-souls |
| `VILLAGE` | village |
| `THREE_TRIBES` | three-tribes |
| `GRANDCHILDREN` | grandchildren |
| `RULER` | ruler |
| `ELDER` | elder |
| `TOOLMAKERS` | toolmakers |

The names come from `apps/web/src/game/model/achievements.ts`: the id in capitals with `_` for `-`. A new achievement there needs a matching one in Steamworks.

## Not done yet

- Only the macOS pack has been run, and only as far as checking what is inside the package. The Windows and Linux packs have not been built.
- Nothing has been run through the real Steam client: the overlay, the relaunch through Steam and an achievement unlocking are covered by tests with a stand-in library only.
- The macOS build is unsigned and not notarized.
- Steam Deck has not been checked.
- CI does not build or upload the Steam flavour.
