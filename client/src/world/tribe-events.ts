import type { SimEvent } from '../types'

export interface TribeScope {
  name: string
  /** Names of the tribe's living people. */
  members: ReadonlySet<string>
}

/** Whether an event is about the tribe or one of its living people. */
export function eventConcernsTribe(event: Pick<SimEvent, 'actor'>, scope: TribeScope): boolean {
  const actor = event.actor.replace(/^the /i, '').trim()
  return actor === scope.name || scope.members.has(event.actor)
}

/** The newest `limit` events about a tribe, newest first. */
export function tribeEvents<T extends Pick<SimEvent, 'actor'>>(
  events: readonly T[] | undefined,
  scope: TribeScope,
  keep: (e: T) => boolean,
  limit = 20,
): T[] {
  const out: T[] = []
  if (!events) return out
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const e = events[i]!
    if (keep(e) && eventConcernsTribe(e, scope)) out.push(e)
  }
  return out
}
