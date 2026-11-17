import { formatNumber, hasMessage, t, type MessageKey } from '../../i18n'
import type { OrganismState, Traits } from '../../shared/types'
import { YEAR_TICKS } from './calendar'

type TraitName = keyof Traits

const TRAIT_WORDS: Record<TraitName, { high: MessageKey; low: MessageKey }> = {
  curiosity: { high: 'person.traitWord.curiosity.high', low: 'person.traitWord.curiosity.low' },
  aggression: { high: 'person.traitWord.aggression.high', low: 'person.traitWord.aggression.low' },
  fear: { high: 'person.traitWord.fear.high', low: 'person.traitWord.fear.low' },
  memory_strength: { high: 'person.traitWord.memory.high', low: 'person.traitWord.memory.low' },
  social_tendency: { high: 'person.traitWord.social.high', low: 'person.traitWord.social.low' },
  resilience: { high: 'person.traitWord.resilience.high', low: 'person.traitWord.resilience.low' },
}

const STANDOUT = 0.12

export interface TraitWord {
  trait: TraitName
  high: boolean
  word: string
}

export function standoutTraits(traits: Partial<Traits> | undefined, max = 2): TraitWord[] {
  if (!traits) return []
  return (Object.keys(TRAIT_WORDS) as TraitName[])
    .flatMap((trait) => {
      const value = traits[trait]
      if (typeof value !== 'number' || !Number.isFinite(value)) return []
      const lean = value - 0.5
      if (Math.abs(lean) < STANDOUT) return []
      return [{ trait, lean }]
    })
    .sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean))
    .slice(0, max)
    .map(({ trait, lean }) => ({
      trait,
      high: lean > 0,
      word: t(lean > 0 ? TRAIT_WORDS[trait].high : TRAIT_WORDS[trait].low),
    }))
}

export type ConditionLevel = 'good' | 'fair' | 'bad'

export interface Condition {
  level: ConditionLevel
  word: string
}

const LOW = 0.25
const FAIR = 0.5

type NeedOrg = Pick<OrganismState, 'energy' | 'hydration' | 'health' | 'infection' | 'alive'>

export function condition(org: NeedOrg): Condition {
  if (!org.alive) return { level: 'bad', word: t('person.condition.dead') }
  if (org.infection > 0.15) return { level: 'bad', word: t('person.condition.sick') }
  const needs: [number, MessageKey][] = [
    [org.health, 'person.condition.hurt'],
    [org.energy, 'person.condition.hungry'],
    [org.hydration, 'person.condition.thirsty'],
  ]
  const [value, key] = needs.reduce((worst, need) => (need[0] < worst[0] ? need : worst))
  if (value < LOW) return { level: 'bad', word: t(key) }
  if (value < FAIR) return { level: 'fair', word: t(key) }
  return { level: 'good', word: t('person.condition.well') }
}

export function needLevel(value: number): ConditionLevel {
  if (value < LOW) return 'bad'
  if (value < FAIR) return 'fair'
  return 'good'
}

type AgeOrg = Pick<OrganismState, 'age'> & { age_stage?: string }

export function ageWords(org: AgeOrg): string {
  const years = Math.floor(org.age / YEAR_TICKS)
  const span = years < 1 ? t('person.age.firstYear') : t('model.age.years', { years: formatNumber(years) })
  const stageKey = org.age_stage ? `person.status.ageStage.${org.age_stage}` : ''
  if (!stageKey || !hasMessage(stageKey)) return span
  return t('person.age.stageAndSpan', { stage: t(stageKey as MessageKey), span })
}

export function doingNow(thought: string | undefined | null): string {
  const text = (thought ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return t('person.now.idle')
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

export function tribeName(lineageId: string | undefined, names: Record<string, string> | undefined): string {
  const name = lineageId ? names?.[lineageId]?.trim() : ''
  return name || t('person.tribe.unnamed')
}

interface StoryLine {
  tick: number
  category: string
  text: string
}

const EVERYDAY = new Set(['event', 'sample', 'witnessed'])
const COORDINATES = /\s*(?:\b(?:at|toward|towards|near|to)\s+)?\(\s*-?\d+\s*,\s*-?\d+\s*\)/gi

export function storyEvents<T extends StoryLine>(
  log: ReadonlyArray<T> | undefined,
  nerd: boolean,
  max = 6,
): T[] {
  return [...(log ?? [])]
    .filter((e) => e.text && (nerd || !EVERYDAY.has(e.category)))
    .slice(-max)
    .reverse()
    .map((e) => (nerd ? e : { ...e, text: e.text.replace(COORDINATES, '').trim() }))
}
