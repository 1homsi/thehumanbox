import type { HeadlineInfo, StoryEntry, WorldState } from '../../shared/types'
import { eventTarget, type EventTarget } from './event-target'
import { DAY_TICKS } from './calendar'

export type ChronicleKind =
  | 'war'
  | 'peace'
  | 'rule'
  | 'uprising'
  | 'faith'
  | 'wonder'
  | 'build'
  | 'road'
  | 'ruin'
  | 'drought'
  | 'winter'
  | 'plague'
  | 'peril'
  | 'fall'
  | 'era'
  | 'sky'
  | 'festival'
  | 'generation'
  | 'elder'
  | 'death'
  | 'bond'
  | 'parting'
  | 'crime'
  | 'murder'
  | 'deed'
  | 'other'

export type ChronicleScope = 'world' | 'person'

export interface ChronicleEntry {
  key: string
  tick: number
  kind: ChronicleKind
  scope: ChronicleScope
  text: string
  lead?: string
  lineage?: string
  actor?: string
  place?: string
  raw?: string
}

export const CHRONICLE_FILTERS = ['all', 'wars', 'rulers', 'wonders', 'disasters', 'people'] as const
export type ChronicleFilter = (typeof CHRONICLE_FILTERS)[number]

const FILTER_KINDS: Record<Exclude<ChronicleFilter, 'all'>, readonly ChronicleKind[]> = {
  wars: ['war', 'peace'],
  rulers: ['rule', 'uprising', 'faith'],
  wonders: ['wonder', 'build', 'road', 'era', 'sky'],
  disasters: ['ruin', 'drought', 'winter', 'plague', 'peril', 'fall'],
  people: ['festival', 'generation', 'elder', 'death', 'bond', 'parting', 'crime', 'murder', 'deed'],
}

export function inFilter(kind: ChronicleKind, filter: ChronicleFilter): boolean {
  return filter === 'all' || FILTER_KINDS[filter].includes(kind)
}

interface Rule {
  kind: ChronicleKind
  scope: ChronicleScope
  test: RegExp
  actor?: (m: RegExpMatchArray) => string | undefined
  place?: (m: RegExpMatchArray) => string | undefined
}

const RULES: readonly Rule[] = [
  { kind: 'war', scope: 'world', test: /^The (.+?) conquered \d+ tiles? of /, actor: (m) => m[1] },
  { kind: 'war', scope: 'world', test: /^The (.+?) declared war on the (.+?) /, actor: (m) => m[1] },
  { kind: 'peace', scope: 'world', test: /^The (.+?) went to war with the (.+?) .*?; /, actor: (m) => m[1] },
  { kind: 'war', scope: 'world', test: /^The (.+?) marched to the aid of the /, actor: (m) => m[1] },
  {
    kind: 'peace',
    scope: 'world',
    test: /^The (.+?) sent \d+ measures? of grain to the starving /,
    actor: (m) => m[1],
  },
  { kind: 'peace', scope: 'world', test: /^(.+?) and (.+?) forged an alliance/, actor: (m) => m[1] },
  { kind: 'fall', scope: 'world', test: /^The (.+?) dynasty has died out/, actor: (m) => m[1] },
  {
    kind: 'fall',
    scope: 'world',
    test: /^The last (?:\d+ )?of the (.+?) (?:was|were) taken in by the (.+?)\.?$/,
    actor: (m) => m[2],
  },
  { kind: 'uprising', scope: 'world', test: /^the poor of (.+?) rose up/i, actor: (m) => m[1] },
  { kind: 'faith', scope: 'world', test: /^A schism splits /i },
  { kind: 'wonder', scope: 'world', test: /^The (.+?) completed an? .+ a wonder of/, actor: (m) => m[1] },
  { kind: 'build', scope: 'world', test: /^The (.+?) rebuilt their /, actor: (m) => m[1] },
  {
    kind: 'road',
    scope: 'world',
    test: /^The people of (.+?) (?:built a bridge|laid a road) /,
    place: (m) => m[1],
  },
  { kind: 'ruin', scope: 'world', test: /^An? .+? of the (.+?) fell to /, actor: (m) => m[1] },
  { kind: 'drought', scope: 'world', test: /^A drought grips/i },
  { kind: 'winter', scope: 'world', test: /hard winter/i },
  {
    kind: 'plague',
    scope: 'world',
    test: /^A plague spreads .+? of (?:the )?(.+?) are /i,
    actor: (m) => m[1],
  },
  { kind: 'plague', scope: 'world', test: /^.+? spreads among the (.+?)\.?$/, actor: (m) => m[1] },
  { kind: 'peril', scope: 'world', test: /^The (.+?) are dwindling/, actor: (m) => m[1] },
  { kind: 'sky', scope: 'world', test: /eclipse stunned|night sky rippled|stars fell across the sky/i },
  { kind: 'festival', scope: 'world', test: /^the (.+?) held an? .+ — /i, actor: (m) => m[1] },
  {
    kind: 'generation',
    scope: 'world',
    test: /^The (?:first|\d+\w*) .*?(?:generation|grandchild) of (.+?) is born/i,
    actor: (m) => m[1],
  },
  { kind: 'rule', scope: 'world', test: /^(.+?) of the (.+?) [a-z].*$/, actor: (m) => m[1] },
  { kind: 'elder', scope: 'person', test: /^(.+?) became an elder/, actor: (m) => m[1] },
  { kind: 'death', scope: 'person', test: /^(.+?) is gone\. /, actor: (m) => m[1] },
  { kind: 'bond', scope: 'person', test: /^(.+?) and (.+?) pledged themselves/, actor: (m) => m[1] },
  { kind: 'parting', scope: 'person', test: /^(.+?) and (.+?) parted ways/, actor: (m) => m[1] },
  { kind: 'crime', scope: 'person', test: /^(.+?) of .+? was caught stealing/, actor: (m) => m[1] },
  { kind: 'murder', scope: 'person', test: /^(.+?) killed .+? to get away/, actor: (m) => m[1] },
]

const NOISE: readonly RegExp[] = [
  /^the moon /i,
  /^Year \d+ begins/i,
  /^the world quickens/i,
  /^leaves turn/i,
  /^frost takes the land/i,
  /^the thaw begins/i,
]

const MILESTONE = /^([a-z][a-z0-9_]+): (.+)$/

const CROWN = '\u{1F451}'

const LEAD_KINDS: ReadonlySet<ChronicleKind> = new Set(['rule', 'elder', 'death', 'crime', 'murder'])

const FEAST = /^The (.+?) (held .+)$/i

const MAX_FEAST_NAMES = 3

function cleanText(text: string): string {
  return text
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function capitalize(text: string): string {
  return text ? text[0]!.toLocaleUpperCase() + text.slice(1) : text
}

export function readHeadline(headline: HeadlineInfo, index = 0): ChronicleEntry | null {
  const original = headline.text ?? ''
  const text = cleanText(original)
  const key = `h:${headline.tick}:${index}`
  if (!text || NOISE.some((re) => re.test(text))) return null
  const milestone = MILESTONE.exec(text)
  if (milestone) {
    return {
      key,
      tick: headline.tick,
      kind: 'era',
      scope: 'world',
      text: capitalize(milestone[2]!),
      raw: milestone[1],
    }
  }
  for (const rule of RULES) {
    if (rule.kind === 'rule' && !original.startsWith(CROWN)) continue
    const m = text.match(rule.test)
    if (!m) continue
    const actor = rule.actor?.(m)?.trim()
    const named = !!actor && LEAD_KINDS.has(rule.kind) && text.startsWith(`${actor} `)
    return {
      key,
      tick: headline.tick,
      kind: rule.kind,
      scope: rule.scope,
      text: named ? text.slice(actor.length + 1) : capitalize(text),
      lead: named ? actor : undefined,
      actor,
      place: rule.place?.(m)?.trim(),
    }
  }
  return { key, tick: headline.tick, kind: 'other', scope: 'world', text: capitalize(text) }
}

export function readStory(story: StoryEntry, index = 0): ChronicleEntry {
  const name = story.org_name ?? ''
  const full = cleanText(story.story ?? '')
  const rest = name && full.startsWith(name) ? full.slice(name.length).trimStart() : full
  return {
    key: `s:${story.tick}:${index}`,
    tick: story.tick,
    kind: 'deed',
    scope: 'person',
    text: rest,
    lead: name || undefined,
    lineage: story.lineage_id,
    actor: name || undefined,
  }
}

export interface Chronicle {
  history: ChronicleEntry[]
  lives: ChronicleEntry[]
}

const newestFirst = (a: ChronicleEntry, b: ChronicleEntry) => b.tick - a.tick

export function readChronicle(
  stories: readonly StoryEntry[] | undefined,
  headlines: readonly HeadlineInfo[] | undefined,
): Chronicle {
  const history: ChronicleEntry[] = []
  const lives: ChronicleEntry[] = []
  ;(headlines ?? []).forEach((h, i) => {
    const entry = readHeadline(h, i)
    if (!entry) return
    ;(entry.scope === 'world' ? history : lives).push(entry)
  })
  ;(stories ?? []).forEach((s, i) => lives.push(readStory(s, i)))
  return { history: mergeFeasts(history.sort(newestFirst)), lives: lives.sort(newestFirst) }
}

function mergeFeasts(entries: ChronicleEntry[]): ChronicleEntry[] {
  const feasts = new Map<string, { entry: ChronicleEntry; names: string[] }>()
  const out: ChronicleEntry[] = []
  for (const entry of entries) {
    const m = entry.kind === 'festival' ? FEAST.exec(entry.text) : null
    if (!m) {
      out.push(entry)
      continue
    }
    const group = `${Math.floor(entry.tick / DAY_TICKS)}|${m[2]}`
    const seen = feasts.get(group)
    if (seen) {
      seen.names.push(m[1]!)
      continue
    }
    const merged = { ...entry, text: m[2]! }
    feasts.set(group, { entry: merged, names: [m[1]!] })
    out.push(merged)
  }
  for (const { entry, names } of feasts.values()) {
    if (names.length === 1) {
      entry.text = `The ${names[0]} ${entry.text}`
      continue
    }
    const shown = names.slice(0, MAX_FEAST_NAMES).join(', ')
    const more = names.length - MAX_FEAST_NAMES
    entry.lead = more > 0 ? `${shown} +${more}` : shown
    entry.actor = undefined
  }
  return out
}

export interface ChronicleDay {
  day: number
  tick: number
  entries: ChronicleEntry[]
}

export function byDay(entries: readonly ChronicleEntry[]): ChronicleDay[] {
  const days: ChronicleDay[] = []
  for (const entry of entries) {
    const day = Math.floor(entry.tick / DAY_TICKS)
    const last = days[days.length - 1]
    if (last && last.day === day) last.entries.push(entry)
    else days.push({ day, tick: entry.tick, entries: [entry] })
  }
  return days
}

export type PeopleCounts = Partial<Record<ChronicleKind, number>>

export function peopleCounts(entries: readonly ChronicleEntry[]): PeopleCounts {
  const counts: PeopleCounts = {}
  for (const e of entries) if (e.scope === 'person') counts[e.kind] = (counts[e.kind] ?? 0) + 1
  return counts
}

export type ChronicleTarget = EventTarget | { kind: 'place'; at: { x: number; y: number } }

export function chronicleTarget(
  world: Pick<WorldState, 'lineage_names' | 'settlements' | 'organisms'>,
  entry: ChronicleEntry,
): ChronicleTarget | null {
  if (entry.place) {
    const village = world.settlements?.find((s) => s.name === entry.place)
    if (village) return { kind: 'place', at: { x: village.center[0], y: village.center[1] } }
  }
  if (!entry.actor) return null
  return eventTarget(world, { actor: entry.actor })
}
