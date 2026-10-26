import type { WorldState } from '../../shared/types'
import { t } from '../../i18n'
import { newPerils } from './peril-watch'

/** The changes the player can make the clock stop for while fast-forwarding. */
export const PAUSE_TRIGGERS = ['brink', 'era', 'war', 'famine', 'extinct'] as const
export type PauseTrigger = (typeof PAUSE_TRIGGERS)[number]
export type PauseOn = Record<PauseTrigger, boolean>

export const PAUSE_NOTHING: PauseOn = {
  brink: false,
  era: false,
  war: false,
  famine: false,
  extinct: false,
}

/** What the last look at the world had already seen. `null` before the first look. */
export interface ChangeWatch {
  /** Newest event tick already looked at. */
  tick: number
  /** The world's tick at the last look. A lower one means the world was replaced, e.g. the server restarted. */
  worldTick: number
  /** Tribes on the brink at the last look. */
  perils: ReadonlySet<string>
  /** Tribes on the brink from hunger at the last look, so a famine is announced once. */
  hungry: ReadonlySet<string>
  /** Tribes with living people at the last look. */
  tribes: ReadonlySet<string>
}

/** One change since the last look. `names` are tribe names; empty for changes that concern the whole world. */
export interface ChangeHit {
  trigger: PauseTrigger
  names: string[]
}

export type WatchedWorld = Pick<
  WorldState,
  'tick' | 'events' | 'tribes_in_peril' | 'lineage_sizes' | 'lineage_names'
>

/** The event kinds the sim logs for each change. */
const EVENT_TRIGGER: Record<string, PauseTrigger> = {
  era_advance: 'era',
  era: 'era',
  war_declared: 'war',
  battle_began: 'war',
}

/** Events about one tribe carry that tribe's name as their actor; world-wide ones do not. */
const NAMED_EVENTS = new Set(['era_advance', 'war_declared', 'battle_began'])

/**
 * Which changes have happened since the last look. The first look, and any look after the
 * world went back in time (a loaded save), only learns the state: loading a game never pauses
 * for things that were already true.
 */
export function watchChanges(
  watch: ChangeWatch | null,
  world: WatchedWorld,
): { hits: ChangeHit[]; watch: ChangeWatch } {
  const perilsNow = world.tribes_in_peril ?? []
  const perilIds = perilsNow.map((p) => p.lineage_id)
  const hungryIds = perilsNow.filter((p) => p.cause === 'hunger').map((p) => p.lineage_id)
  // Without a lineage list in this frame, the tribes seen last time are kept.
  const living = world.lineage_sizes
    ? new Set(world.lineage_sizes.filter((s) => s.count > 0).map((s) => s.id))
    : null
  const events = world.events ?? []

  if (!watch || world.tick < watch.worldTick) {
    const newest = events.reduce((max, e) => Math.max(max, e.tick), -1)
    return {
      hits: [],
      watch: {
        tick: newest,
        worldTick: world.tick,
        perils: new Set(perilIds),
        hungry: new Set(hungryIds),
        tribes: living ?? new Set(),
      },
    }
  }

  const hits: ChangeHit[] = []
  let tick = watch.tick
  for (const e of events) {
    if (e.tick <= watch.tick) continue
    tick = Math.max(tick, e.tick)
    const type = e.type as string
    const trigger = EVENT_TRIGGER[type]
    if (trigger) hits.push({ trigger, names: NAMED_EVENTS.has(type) ? [e.actor] : [] })
  }

  for (const p of newPerils(new Set(watch.perils), world.tribes_in_peril)) {
    hits.push({ trigger: 'brink', names: [p.tribe] })
    // A tribe on the brink from hunger is starving: that is a famine.
    if (p.cause === 'hunger') hits.push({ trigger: 'famine', names: [p.tribe] })
  }
  // A tribe that was already on the brink can turn to hunger while it stays there (the sim recomputes its cause).
  for (const p of perilsNow) {
    if (p.cause === 'hunger' && watch.perils.has(p.lineage_id) && !watch.hungry.has(p.lineage_id)) {
      hits.push({ trigger: 'famine', names: [p.tribe] })
    }
  }

  if (living) {
    for (const id of watch.tribes) {
      if (!living.has(id)) {
        hits.push({ trigger: 'extinct', names: [world.lineage_names?.[id] ?? id.slice(0, 6)] })
      }
    }
  }

  return {
    hits,
    watch: {
      tick,
      worldTick: world.tick,
      perils: new Set(perilIds),
      hungry: new Set(hungryIds),
      tribes: living ?? watch.tribes,
    },
  }
}

/** The status line's reason for one change, e.g. "Birch died out". */
export function changeReason(hit: ChangeHit): string {
  const names = hit.names.join(', ')
  switch (hit.trigger) {
    case 'brink':
      return t('model.pause.brink', { names })
    case 'era':
      return hit.names.length > 0 ? t('model.pause.era', { names }) : t('model.pause.worldEra')
    case 'war':
      return hit.names.length > 0 ? t('model.pause.warBy', { names }) : t('model.pause.war')
    case 'famine':
      return t('model.pause.famine', { names })
    case 'extinct':
      return t('model.pause.extinct', { names })
  }
}
