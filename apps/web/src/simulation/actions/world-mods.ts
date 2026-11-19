import { showNotice } from '../../shared/confirm'
import { t } from '../../i18n'
import type { SandboxCommand } from '../sandbox'
import { useMods, type InstalledMod } from './mod-store'
import { MOD_LIMITS } from './mods'

export interface WorldModEntry {
  raw: string
  enabled: boolean
}

type Send = (cmd: SandboxCommand) => unknown

let send: Send | null = null
let known = false
let held: string | null = null

export function worldModEntries(mods: readonly InstalledMod[]): WorldModEntry[] {
  return mods.map((m) => ({ raw: m.raw, enabled: m.enabled }))
}

export function readWorldModEntries(value: unknown): WorldModEntry[] | null {
  if (!Array.isArray(value)) return null
  return value
    .filter(
      (e): e is WorldModEntry => !!e && typeof e === 'object' && typeof (e as WorldModEntry).raw === 'string',
    )
    .slice(0, MOD_LIMITS.mods)
    .map((e) => ({ raw: e.raw, enabled: e.enabled === true }))
}

function push(): void {
  if (!send || !known) return
  const entries = worldModEntries(useMods.getState().mods)
  const text = JSON.stringify(entries)
  if (text === held) return
  held = text
  void send({ cmd: 'set_world_mods', mods: entries })
}

export function bindWorldModSender(next: Send | null): void {
  send = next
  push()
}

export function forgetWorldMods(): void {
  known = false
  held = null
}

export function receiveWorldMods(value: unknown): void {
  const entries = readWorldModEntries(value)
  if (!entries) return
  const broken = useMods.getState().adopt(entries)
  held = JSON.stringify(entries)
  known = true
  push()
  if (broken.length > 0) {
    void showNotice(
      t('settings.mods.worldModsTitle'),
      t('settings.mods.worldModsBody', { count: broken.length }),
    )
  }
}

useMods.subscribe(() => push())
