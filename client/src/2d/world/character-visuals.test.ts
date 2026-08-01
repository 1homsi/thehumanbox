import { describe, expect, it } from 'vitest'
import {
  HUMAN_APPEARANCES,
  HUMAN_ATLAS_CELL,
  HUMAN_ATLAS_COLS,
  HUMAN_ATLAS_FRAMES,
  HUMAN_ATLAS_HEIGHT,
  HUMAN_ATLAS_ROWS,
  HUMAN_ATLAS_WIDTH,
  HUMAN_SEX_ORDER,
  HUMAN_STAGE_ORDER,
  deterministicAppearanceIndex,
  humanAtlasRow,
  resolveAgeStage,
  wrapHumanFrame,
  zoomDetailLevel,
} from './character-visuals'

describe('character visual atlas contract', () => {
  it('describes the generated 4 by 30 atlas', () => {
    expect(HUMAN_ATLAS_CELL).toBe(32)
    expect(HUMAN_ATLAS_FRAMES).toBe(4)
    expect(HUMAN_ATLAS_COLS).toBe(4)
    expect(HUMAN_APPEARANCES).toBe(3)
    expect(HUMAN_ATLAS_ROWS).toBe(30)
    expect(HUMAN_ATLAS_WIDTH).toBe(128)
    expect(HUMAN_ATLAS_HEIGHT).toBe(960)
  })

  it('assigns every sex, life stage, and appearance a distinct row', () => {
    const rows = new Set<number>()
    for (const sex of HUMAN_SEX_ORDER) {
      for (const stage of HUMAN_STAGE_ORDER) {
        for (let appearance = 0; appearance < HUMAN_APPEARANCES; appearance++) {
          rows.add(humanAtlasRow(sex, stage, appearance))
        }
      }
    }

    expect(rows.size).toBe(HUMAN_ATLAS_ROWS)
    expect(Math.min(...rows)).toBe(0)
    expect(Math.max(...rows)).toBe(HUMAN_ATLAS_ROWS - 1)
    expect(humanAtlasRow('male', 'infant', 0)).toBe(0)
    expect(humanAtlasRow('female', 'elder', 2)).toBe(29)
  })

  it('wraps appearance and animation frame indexes', () => {
    expect(humanAtlasRow('male', 'infant', 3)).toBe(0)
    expect(humanAtlasRow('male', 'infant', -1)).toBe(2)
    expect(wrapHumanFrame(0)).toBe(0)
    expect(wrapHumanFrame(5)).toBe(1)
    expect(wrapHumanFrame(-1)).toBe(3)
    expect(wrapHumanFrame(Number.NaN)).toBe(0)
  })

  it('chooses stable, bounded appearances from organism ids', () => {
    const ids = ['org-a', 'org-b', 'Joli', 'lineage:42', '']
    for (const id of ids) {
      const appearance = deterministicAppearanceIndex(id)
      expect(appearance).toBe(deterministicAppearanceIndex(id))
      expect(appearance).toBeGreaterThanOrEqual(0)
      expect(appearance).toBeLessThan(HUMAN_APPEARANCES)
    }
    expect(new Set(ids.map(deterministicAppearanceIndex)).size).toBeGreaterThan(1)
  })
})

describe('character age and zoom visuals', () => {
  it('prefers every declared stage, including elder', () => {
    for (const stage of HUMAN_STAGE_ORDER) {
      expect(resolveAgeStage({ age_stage: stage, age: 0, max_age: 1000 })).toBe(stage)
    }
  })

  it('matches the Rust fractional age-stage boundaries', () => {
    expect(resolveAgeStage({ age: 99, max_age: 1000 })).toBe('infant')
    expect(resolveAgeStage({ age: 100, max_age: 1000 })).toBe('child')
    expect(resolveAgeStage({ age: 249, max_age: 1000 })).toBe('child')
    expect(resolveAgeStage({ age: 250, max_age: 1000 })).toBe('teen')
    expect(resolveAgeStage({ age: 349, max_age: 1000 })).toBe('teen')
    expect(resolveAgeStage({ age: 350, max_age: 1000 })).toBe('adult')
    expect(resolveAgeStage({ age: 749, max_age: 1000 })).toBe('adult')
    expect(resolveAgeStage({ age: 750, max_age: 1000 })).toBe('elder')
  })

  it('does not confuse the appointed elder role with biological age', () => {
    expect(resolveAgeStage({ age: 500, max_age: 1000, is_elder: true })).toBe('adult')
  })

  it('defaults invalid lifespans to adult like the simulation', () => {
    expect(resolveAgeStage({})).toBe('adult')
    expect(resolveAgeStage({ age: 100, max_age: 0 })).toBe('adult')
    expect(resolveAgeStage({ age: Number.NaN, max_age: 1000 })).toBe('adult')
  })

  it('selects bounded zoom detail levels', () => {
    expect(zoomDetailLevel(0.79)).toBe('overview')
    expect(zoomDetailLevel(0.8)).toBe('standard')
    expect(zoomDetailLevel(2.19)).toBe('standard')
    expect(zoomDetailLevel(2.2)).toBe('detail')
    expect(zoomDetailLevel(Number.NaN)).toBe('standard')
  })
})
