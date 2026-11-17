import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { packSave, sameBytes, saveFormat, unpackSave } from './saveContainer'
import {
  MIGRATING_PREFIX,
  migrateStoredWorlds,
  removeMigrationLeftovers,
  writeVerified,
  type WorldStore,
} from './saveMigration'
import type { SavedWorld } from './wasmDb'

const legacyWorld = new Uint8Array(
  gunzipSync(readFileSync(new URL('./fixtures/legacy-world-v7.save.gz', import.meta.url))),
)

function memoryStore(initial: Record<string, SavedWorld> = {}) {
  const records = new Map(Object.entries(initial))
  const store: WorldStore & { records: Map<string, SavedWorld>; corruptNextWrite: boolean } = {
    records,
    corruptNextWrite: false,
    async load(id) {
      return records.get(id) ?? null
    },
    async save(id, world) {
      if (store.corruptNextWrite) {
        store.corruptNextWrite = false
        records.set(id, { ...world, blob: world.blob.slice(0, 10) })
        return
      }
      records.set(id, world)
    },
    async remove(id) {
      records.delete(id)
    },
    async move(from, to, onlyIfPresent) {
      const world = records.get(from)
      if (!world) throw new Error('the world to move no longer exists')
      records.delete(from)
      if (onlyIfPresent && !records.has(to)) return false
      records.set(to, world)
      return true
    },
    async keys() {
      return [...records.keys()]
    },
  }
  return store
}

const legacyRecord = (tick: number): SavedWorld => ({ blob: legacyWorld, seed: '42', tick, savedAt: tick })

describe('save migration', () => {
  it('compresses old recovery saves and leaves them loading to the very same world', async () => {
    const store = memoryStore({
      'own:recovery:1': legacyRecord(1),
      'own:recovery:2': legacyRecord(2),
      own: legacyRecord(3),
    })
    const result = await migrateStoredWorlds(store, (key) => key.startsWith('own:recovery:'))
    expect(result).toEqual({ migrated: ['own:recovery:1', 'own:recovery:2'], failed: [] })
    for (const key of ['own:recovery:1', 'own:recovery:2']) {
      const migrated = store.records.get(key)!
      expect(saveFormat(migrated.blob)).toBe('container')
      expect(migrated.blob.byteLength).toBeLessThan(legacyWorld.byteLength / 3)
      expect(sameBytes(await unpackSave(migrated.blob), legacyWorld)).toBe(true)
      expect(migrated.seed).toBe('42')
    }
    expect(store.records.get('own')!.blob).toBe(legacyWorld)
    expect([...store.records.keys()].some((key) => key.startsWith(MIGRATING_PREFIX))).toBe(false)
  })

  it('skips saves that are already compressed', async () => {
    const packed = await packSave(legacyWorld)
    const store = memoryStore({ 'own:recovery:1': { ...legacyRecord(1), blob: packed } })
    const result = await migrateStoredWorlds(store, () => true)
    expect(result.migrated).toEqual([])
    expect(store.records.get('own:recovery:1')!.blob).toBe(packed)
  })

  it('keeps the old save when the new one does not read back the same', async () => {
    const store = memoryStore({ 'own:recovery:1': legacyRecord(1) })
    store.corruptNextWrite = true
    const result = await migrateStoredWorlds(store, () => true)
    expect(result).toEqual({ migrated: [], failed: ['own:recovery:1'] })
    expect(store.records.get('own:recovery:1')!.blob).toBe(legacyWorld)
    expect([...store.records.keys()]).toEqual(['own:recovery:1'])
  })

  it('does not bring back a recovery save deleted while it was being compressed', async () => {
    const store = memoryStore({ 'own:recovery:1': legacyRecord(1) })
    const save = store.save
    store.save = async (id, world) => {
      await save(id, world)
      if (id.startsWith(MIGRATING_PREFIX)) store.records.delete('own:recovery:1')
    }
    const result = await migrateStoredWorlds(store, () => true)
    expect(result.migrated).toEqual([])
    expect(store.records.size).toBe(0)
  })

  it('replaces a world only after the new save read back as the same bytes', async () => {
    const store = memoryStore({ own: legacyRecord(1) })
    const packed = await packSave(legacyWorld)
    await writeVerified(store, 'own', { ...legacyRecord(2), blob: packed }, legacyWorld)
    expect(store.records.get('own')!.tick).toBe(2)
    expect(store.records.get('own')!.blob).toBe(packed)

    store.corruptNextWrite = true
    await expect(
      writeVerified(store, 'own', { ...legacyRecord(3), blob: packed }, legacyWorld),
    ).rejects.toThrow('did not read back the same')
    expect(store.records.get('own')!.tick).toBe(2)
    expect([...store.records.keys()]).toEqual(['own'])
  })

  it('clears copies an interrupted migration left behind, only for this world', async () => {
    const store = memoryStore({
      own: legacyRecord(1),
      [`${MIGRATING_PREFIX}own`]: legacyRecord(2),
      [`${MIGRATING_PREFIX}own:recovery:5`]: legacyRecord(3),
      [`${MIGRATING_PREFIX}other`]: legacyRecord(4),
    })
    await removeMigrationLeftovers(store, (key) => key === 'own' || key.startsWith('own:recovery:'))
    expect([...store.records.keys()].sort()).toEqual([`${MIGRATING_PREFIX}other`, 'own'])
  })
})
