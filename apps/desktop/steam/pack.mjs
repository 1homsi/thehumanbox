import { spawnSync } from 'node:child_process'

const appId = (process.env.STEAM_APP_ID ?? '').trim()
if (!/^[1-9]\d{0,9}$/.test(appId)) {
  console.error('set STEAM_APP_ID to the app id from Steamworks (480 is Valve\'s test app)')
  process.exit(2)
}

const result = spawnSync(
  'electron-builder',
  ['--dir', '--config', 'electron-builder.steam.yml', `--config.extraMetadata.steamAppId=${appId}`, '--publish', 'never', ...process.argv.slice(2)],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
process.exit(result.status ?? 1)
