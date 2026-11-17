import { create } from 'zustand'
import { MOD_LIMITS, parseMod, type ModInfo, type ModProblem } from './mods'
import { setModManifests } from './registry'

export const MOD_STORAGE_KEY = 'thb-mods-v1'

export interface InstalledMod {
  raw: string
  enabled: boolean
  mod: ModInfo | null
  problems: ModProblem[]
}

export type InstallResult =
  { ok: true; mod: ModInfo; replaced: boolean } | { ok: false; problems: ModProblem[]; source?: unknown }

interface ModState {
  mods: InstalledMod[]
  install: (text: string) => InstallResult
  setEnabled: (id: string, enabled: boolean) => void
  remove: (id: string) => void
  reload: () => void
}

interface Stored {
  raw: string
  enabled: boolean
}

function load(raw: string, enabled: boolean): InstalledMod {
  const parsed = parseMod(raw)
  return parsed.ok
    ? { raw, enabled, mod: parsed.mod, problems: [] }
    : { raw, enabled: false, mod: null, problems: parsed.problems }
}

function readStored(): InstalledMod[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(MOD_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value
      .filter((e): e is Stored => !!e && typeof e.raw === 'string' && typeof e.enabled === 'boolean')
      .slice(0, MOD_LIMITS.mods)
      .map((e) => load(e.raw, e.enabled))
  } catch {
    return []
  }
}

function persist(mods: readonly InstalledMod[]): void {
  try {
    const stored: Stored[] = mods.map((m) => ({ raw: m.raw, enabled: m.enabled }))
    window.localStorage.setItem(MOD_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    return
  }
}

function apply(mods: readonly InstalledMod[]): void {
  setModManifests(mods.flatMap((m) => (m.enabled && m.mod ? [m.mod.manifest] : [])))
}

function idOf(entry: InstalledMod): string | null {
  return entry.mod?.id ?? null
}

export const useMods = create<ModState>((set, get) => {
  const commit = (mods: InstalledMod[]) => {
    persist(mods)
    apply(mods)
    set({ mods })
  }
  return {
    mods: [],
    install: (text) => {
      const parsed = parseMod(text)
      if (!parsed.ok) return { ok: false, problems: parsed.problems, source: parsed.source }
      const mods = get().mods
      const at = mods.findIndex((m) => idOf(m) === parsed.mod.id)
      if (at < 0 && mods.length >= MOD_LIMITS.mods)
        return {
          ok: false,
          problems: [{ key: 'settings.mods.problems.tooManyMods', params: { most: MOD_LIMITS.mods } }],
        }
      const entry: InstalledMod = {
        raw: text,
        enabled: at < 0 ? true : mods[at].enabled,
        mod: parsed.mod,
        problems: [],
      }
      commit(at < 0 ? [...mods, entry] : mods.map((m, i) => (i === at ? entry : m)))
      return { ok: true, mod: parsed.mod, replaced: at >= 0 }
    },
    setEnabled: (id, enabled) =>
      commit(get().mods.map((m) => (idOf(m) === id && m.mod ? { ...m, enabled } : m))),
    remove: (id) => commit(get().mods.filter((m) => (m.mod ? m.mod.id !== id : m.raw !== id))),
    reload: () => {
      const mods = readStored()
      apply(mods)
      set({ mods })
    },
  }
})

useMods.getState().reload()
