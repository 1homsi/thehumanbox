import { packSave, sameBytes, saveFormat, SaveFormatError, unpackSave } from './saveContainer'
import type { SavedWorld } from './wasmDb'

export const MIGRATING_PREFIX = 'migrating:'

export interface WorldStore {
  load(id: string): Promise<SavedWorld | null>
  save(id: string, world: SavedWorld): Promise<void>
  remove(id: string): Promise<void>
  move(from: string, to: string, onlyIfPresent: boolean): Promise<boolean>
  keys(): Promise<string[]>
}

export interface MigrationResult {
  migrated: string[]
  failed: string[]
}

export async function writeVerified(
  store: WorldStore,
  id: string,
  world: SavedWorld,
  payload: Uint8Array,
  onlyIfPresent = false,
): Promise<boolean> {
  const temp = `${MIGRATING_PREFIX}${id}`
  await store.save(temp, world)
  let stored: SavedWorld | null = null
  let readBack: Uint8Array | null
  try {
    stored = await store.load(temp)
    readBack = stored ? await unpackSave(stored.blob) : null
  } catch {
    readBack = null
  }
  const same =
    stored !== null &&
    readBack !== null &&
    stored.seed === world.seed &&
    stored.tick === world.tick &&
    sameBytes(readBack, payload)
  if (!same) {
    await store.remove(temp).catch(() => {})
    throw new SaveFormatError(`the new save of ${id} did not read back the same; the old one is kept`)
  }
  return store.move(temp, id, onlyIfPresent)
}

export async function removeMigrationLeftovers(
  store: WorldStore,
  include: (key: string) => boolean,
): Promise<void> {
  for (const key of await store.keys()) {
    if (key.startsWith(MIGRATING_PREFIX) && include(key.slice(MIGRATING_PREFIX.length))) {
      await store.remove(key)
    }
  }
}

export async function migrateStoredWorlds(
  store: WorldStore,
  include: (key: string) => boolean,
  between: () => Promise<void> = () => Promise.resolve(),
): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: [], failed: [] }
  for (const key of await store.keys()) {
    if (key.startsWith(MIGRATING_PREFIX) || !include(key)) continue
    try {
      const world = await store.load(key)
      if (!world || world.blob.byteLength === 0 || saveFormat(world.blob) === 'container') continue
      const payload = await unpackSave(world.blob)
      const packed = await packSave(payload)
      if (await writeVerified(store, key, { ...world, blob: packed }, payload, true)) {
        result.migrated.push(key)
      }
    } catch {
      result.failed.push(key)
    }
    await between()
  }
  return result
}
