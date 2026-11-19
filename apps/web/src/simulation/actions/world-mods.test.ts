import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOD_STORAGE_KEY, useMods } from './mod-store'
import { bindWorldModSender, forgetWorldMods, readWorldModEntries, receiveWorldMods } from './world-mods'
import { showNotice } from '../../shared/confirm'
import type { SandboxCommand } from '../sandbox'

vi.mock('../../shared/confirm', () => ({ showNotice: vi.fn(() => Promise.resolve()) }))

const SAMPLE = readFileSync(new URL('../../../public/mods/example-firestorm.json', import.meta.url), 'utf8')
const stored = new Map<string, string>()

beforeEach(() => {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  })
  forgetWorldMods()
  vi.mocked(showNotice).mockClear()
})

afterEach(() => {
  bindWorldModSender(null)
  for (const entry of useMods.getState().mods) useMods.getState().remove(entry.mod?.id ?? entry.raw)
  stored.delete(MOD_STORAGE_KEY)
  vi.unstubAllGlobals()
})

function sender() {
  const sent: SandboxCommand[] = []
  bindWorldModSender((cmd) => sent.push(cmd))
  return sent
}

describe("a world's mods travel with its save", () => {
  it('installs the mods a loaded world carries, switched on or off as it saved them', () => {
    const sent = sender()
    receiveWorldMods([{ raw: SAMPLE, enabled: false }])
    expect(useMods.getState().mods.map((m) => [m.mod?.id, m.enabled])).toEqual([['firestorm', false]])
    expect(sent).toEqual([])
    expect(showNotice).not.toHaveBeenCalled()
  })

  it('waits to hear what the world holds before writing the browser mods into it', () => {
    const sent = sender()
    useMods.getState().install(SAMPLE)
    expect(sent).toEqual([])
    receiveWorldMods([])
    expect(sent).toEqual([{ cmd: 'set_world_mods', mods: [{ raw: SAMPLE, enabled: true }] }])
    useMods.getState().setEnabled('firestorm', false)
    expect(sent.at(-1)).toEqual({ cmd: 'set_world_mods', mods: [{ raw: SAMPLE, enabled: false }] })
    useMods.getState().remove('firestorm')
    expect(sent.at(-1)).toEqual({ cmd: 'set_world_mods', mods: [] })
    expect(sent).toHaveLength(3)
  })

  it('keeps the installed copy of a mod the world also carries, and sends nothing when they agree', () => {
    useMods.getState().install(SAMPLE)
    const sent = sender()
    receiveWorldMods([{ raw: SAMPLE, enabled: true }])
    expect(useMods.getState().mods).toHaveLength(1)
    expect(sent).toEqual([])
  })

  it('lists a world mod that no longer passes the checks switched off, and says so', () => {
    sender()
    receiveWorldMods([{ raw: '{"version": 1, "id": "broken"', enabled: true }])
    const [entry] = useMods.getState().mods
    expect(entry.mod).toBeNull()
    expect(entry.enabled).toBe(false)
    expect(entry.problems.length).toBeGreaterThan(0)
    expect(showNotice).toHaveBeenCalledOnce()
  })

  it('reads only well-formed entries from a frame', () => {
    expect(readWorldModEntries(undefined)).toBeNull()
    expect(readWorldModEntries([{ raw: 'a', enabled: 1 }, { enabled: true }, null, 'x'])).toEqual([
      { raw: 'a', enabled: false },
    ])
  })
})
