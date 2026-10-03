import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, writeFileSync, accessSync, constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * macOS builds ship without a Developer ID signature (`identity: null` in
 * electron-builder.yml). Squirrel.Mac, which electron-updater uses to swap the
 * app on quit, refuses unsigned apps, so updates downloaded fine but never
 * installed and the app sat on an old version. For those builds we install
 * the downloaded zip ourselves: unpack it, wait for this process to exit,
 * swap the bundle in place, clear quarantine (as scripts/install-desktop.sh
 * does), and relaunch.
 */

let signedCache: boolean | null = null

/** True when the running app is signed by a Developer ID, which Squirrel needs. */
export function hasDeveloperIdSignature(appBundle: string): boolean {
  if (signedCache !== null) return signedCache
  const result = spawnSync('codesign', ['-dv', '--verbose=2', appBundle], { encoding: 'utf8' })
  // codesign prints its details on stderr.
  signedCache = /Authority=Developer ID Application/.test(`${result.stderr ?? ''}${result.stdout ?? ''}`)
  return signedCache
}

/** `/Applications/The Human Box.app` from the running executable path. */
export function appBundleFromExe(exePath: string): string | null {
  const macos = dirname(exePath)
  const contents = dirname(macos)
  const bundle = dirname(contents)
  return bundle.endsWith('.app') ? bundle : null
}

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

/**
 * Shell script that waits for `pid` to exit, swaps `newApp` into `appBundle`
 * (restoring the old bundle if the move fails), clears quarantine and
 * relaunches. Kept pure so the swap logic can be tested without a real app.
 */
export function buildSwapScript(pid: number, appBundle: string, newApp: string): string {
  const app = quote(appBundle)
  const backup = quote(`${appBundle}.previous`)
  const next = quote(newApp)
  return [
    '#!/bin/bash',
    'set -u',
    `for _ in $(seq 1 120); do kill -0 ${pid} 2>/dev/null || break; sleep 0.5; done`,
    `rm -rf ${backup}`,
    `if mv ${app} ${backup}; then`,
    `  if mv ${next} ${app}; then`,
    `    rm -rf ${backup}`,
    '  else',
    `    mv ${backup} ${app}`,
    '  fi',
    'fi',
    `xattr -dr com.apple.quarantine ${app} 2>/dev/null || true`,
    `open ${app}`,
    '',
  ].join('\n')
}

export interface UnsignedInstallResult {
  started: boolean
  message?: string
}

/**
 * Unpacks the downloaded update next to a temp swap script and starts the
 * script detached. The caller quits the app right after a successful start.
 */
export function startUnsignedMacInstall(zipPath: string, exePath: string, pid: number): UnsignedInstallResult {
  const appBundle = appBundleFromExe(exePath)
  if (!appBundle) return { started: false, message: 'Could not find the installed app bundle.' }
  try {
    accessSync(dirname(appBundle), constants.W_OK)
  } catch {
    return {
      started: false,
      message: `No permission to replace the app in ${dirname(appBundle)}. Reinstall it with scripts/install-desktop.sh.`,
    }
  }

  const staging = mkdtempSync(join(tmpdir(), 'thb-update-'))
  const unzip = spawnSync('ditto', ['-x', '-k', zipPath, staging], { encoding: 'utf8' })
  if (unzip.status !== 0) {
    return { started: false, message: `Could not unpack the update: ${unzip.stderr || 'ditto failed'}` }
  }
  const unpacked = readdirSync(staging).find((name) => name.endsWith('.app'))
  if (!unpacked) return { started: false, message: 'The downloaded update did not contain an app.' }

  const script = join(staging, 'swap.sh')
  writeFileSync(script, buildSwapScript(pid, appBundle, join(staging, unpacked)), { mode: 0o755 })
  const child = spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' })
  child.unref()
  return { started: true }
}
