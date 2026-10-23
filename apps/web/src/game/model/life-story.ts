// A readable life story for the person card: a few plain sentences built from
// what the client already knows about someone (their parents, partner,
// children, trade, how they died) and their most telling life events. Nothing
// here is a new fact; it only puts the existing ones into words.

import { t } from '../../i18n'

/** A day in ticks, the same as DAY_LENGTH in ui/panels/org-detail/format.ts. */
const DAY_TICKS = 600

export interface StoryPerson {
  id: string
  name: string
  custom_name?: string | null
  alive: boolean
  age: number
  sex?: string
  generation: number
  parent_id?: string | null
  father_id?: string | null
  partner_id?: string | null
  children_count?: number
  specialty?: string
  death_cause?: string
  is_leader?: boolean
}

export interface StoryEvent {
  category: string
  text: string
}

/** Life-log categories that make a story's major events (the death itself is its own line). */
const MAJOR = new Set(['inheritance', 'friendship', 'loss', 'apprenticeship'])
const MAX_EVENTS = 3

function nameOf(p: StoryPerson): string {
  return p.custom_name?.trim() || p.name
}

/** The story as a list of sentences, in the order they read. */
export function lifeStory(
  org: StoryPerson,
  others: ReadonlyArray<StoryPerson>,
  events: ReadonlyArray<StoryEvent> = [],
): string[] {
  const byId = new Map(others.map((o) => [o.id, o]))
  const lines: string[] = []
  const days = Math.floor(org.age / DAY_TICKS)

  const mother = org.parent_id ? byId.get(org.parent_id) : undefined
  const father = org.father_id ? byId.get(org.father_id) : undefined
  if (mother && father) {
    lines.push(t('model.life.childOfBoth', { mother: nameOf(mother), father: nameOf(father) }))
  } else if (mother || father) {
    lines.push(t('model.life.childOfOne', { parent: nameOf((mother ?? father) as StoryPerson) }))
  }

  if (org.specialty) lines.push(t('model.life.trade', { trade: org.specialty }))
  if (org.is_leader) lines.push(t('model.life.chief'))

  if (org.partner_id) {
    const partner = byId.get(org.partner_id)
    lines.push(partner ? t('model.life.partnered', { name: nameOf(partner) }) : t('model.life.hasPartner'))
  }

  const children = org.children_count ?? 0
  if (children > 0) lines.push(t('model.life.children', { count: children }))

  for (const e of events.filter((e) => MAJOR.has(e.category)).slice(-MAX_EVENTS)) {
    lines.push(t('model.life.event', { text: `${e.text.charAt(0).toUpperCase()}${e.text.slice(1)}` }))
  }

  if (org.alive) {
    lines.push(t('model.life.living', { count: days }))
  } else if (org.death_cause) {
    lines.push(t('model.life.diedOf', { cause: org.death_cause, count: days }))
  } else {
    lines.push(t('model.life.died', { count: days }))
  }
  return lines
}
