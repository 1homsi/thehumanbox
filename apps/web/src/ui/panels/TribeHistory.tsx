import { calendarAt } from '../../game/model/calendar'
import { historyRows, placeOf } from '../../game/model/tribe-history'
import { eraWord } from '../../shared/era-words'
import type { TribeChronicleRow, WorldState } from '../../shared/types'
import { useCameraFocus } from '../../state/camera-focus'
import { t, type MessageKey } from '../../i18n'

const CRAFT_KEYS: Record<string, MessageKey> = {
  woodcutting: 'panels.tribe.history.crafts.woodcutting',
  quarrying: 'panels.tribe.history.crafts.quarrying',
  foraging: 'panels.tribe.history.crafts.foraging',
  fishing: 'panels.tribe.history.crafts.fishing',
  hunting: 'panels.tribe.history.crafts.hunting',
  farming: 'panels.tribe.history.crafts.farming',
  building: 'panels.tribe.history.crafts.building',
  crafting: 'panels.tribe.history.crafts.crafting',
  healing: 'panels.tribe.history.crafts.healing',
}

/** What one line of a tribe's history says, in words. */
function lineText(row: TribeChronicleRow, world: WorldState): string {
  const other = row.other ? (world.lineage_names?.[row.other] ?? row.other.slice(0, 6)) : ''
  switch (row.kind) {
    case 'raid':
      return t('panels.tribe.history.raid', { other })
    case 'war':
      return t('panels.tribe.history.war', { other })
    case 'era':
      return t('panels.tribe.history.era', { era: eraWord(row.word) })
    case 'famine':
      return t('panels.tribe.history.famine')
    case 'arrival':
      return t('panels.tribe.history.arrival')
    case 'split':
      return t('panels.tribe.history.split', { other })
    case 'craft': {
      const key = row.word ? CRAFT_KEYS[row.word] : undefined
      return t('panels.tribe.history.craft', { craft: key ? t(key) : (row.word ?? '') })
    }
    case 'leader_died':
      return t('panels.tribe.history.leaderDied', { name: row.word ?? '' })
  }
}

/**
 * A tribe's own history on its card: its newest wars, ages, famines, arrivals, splits, crafts and lost
 * leaders. A line with a place takes the camera there when clicked.
 */
export function TribeHistory({ world, lineage }: { world: WorldState; lineage: string }) {
  const rows = historyRows(world.tribe_chronicle?.[lineage])
  return (
    <section className="tribe-history" aria-label={t('panels.tribe.history.title')}>
      <div className="tribe-history-title">{t('panels.tribe.history.title')}</div>
      {rows.length === 0 ? (
        <p className="tribe-history-empty">{t('panels.tribe.history.empty')}</p>
      ) : (
        <ol className="tribe-history-list">
          {rows.map((row, i) => {
            const place = placeOf(row)
            const label = (
              <>
                <span className="tribe-history-when">
                  {t('panels.calendar.year', { year: calendarAt(row.tick).year })}
                </span>{' '}
                <span>{lineText(row, world)}</span>
              </>
            )
            return (
              <li key={`${row.tick}-${row.kind}-${i}`}>
                {place ? (
                  <button
                    className="tribe-history-go"
                    title={t('panels.tribe.history.goTo')}
                    onClick={() =>
                      useCameraFocus.getState().focusTile(Math.round(place[0]), Math.round(place[1]))
                    }
                  >
                    {label}
                  </button>
                ) : (
                  <span className="tribe-history-plain">{label}</span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
