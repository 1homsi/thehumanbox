import { memo } from 'react'
import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'
import { useWorldStore } from '../../state/worldStore'
import { wildlifeCounts } from '../../game/model/wildlife'
import { Tooltip } from '../toolbar/Tooltip'
import { formatNumber, t, type MessageKey } from '../../i18n'

/** The wildlife group names the interface shows in each language, by the names the game uses. */
const ANIMAL_KEY: Record<string, MessageKey> = {
  rabbits: 'panels.wildlife.animals.rabbits',
  deer: 'panels.wildlife.animals.deer',
  boar: 'panels.wildlife.animals.boar',
  birds: 'panels.wildlife.animals.birds',
  fish: 'panels.wildlife.animals.fish',
  herds: 'panels.wildlife.animals.herds',
  foxes: 'panels.wildlife.animals.foxes',
  cats: 'panels.wildlife.animals.cats',
  penguins: 'panels.wildlife.animals.penguins',
  camels: 'panels.wildlife.animals.camels',
  frogs: 'panels.wildlife.animals.frogs',
  whales: 'panels.wildlife.animals.whales',
  ducks: 'panels.wildlife.animals.ducks',
  bees: 'panels.wildlife.animals.bees',
  owls: 'panels.wildlife.animals.owls',
  eagles: 'panels.wildlife.animals.eagles',
  snakes: 'panels.wildlife.animals.snakes',
  crocodiles: 'panels.wildlife.animals.crocodiles',
  monkeys: 'panels.wildlife.animals.monkeys',
  wolves: 'panels.wildlife.animals.wolves',
  goats: 'panels.wildlife.animals.goats',
  elephants: 'panels.wildlife.animals.elephants',
  lions: 'panels.wildlife.animals.lions',
  zebras: 'panels.wildlife.animals.zebras',
  'polar bears': 'panels.wildlife.animals.polarBears',
  kangaroos: 'panels.wildlife.animals.kangaroos',
  bears: 'panels.wildlife.animals.bears',
}

/** A group's name in the active language; a name with no translation is shown as it is. */
function animalName(label: string): string {
  const key = ANIMAL_KEY[label]
  return key ? t(key) : label
}

/** What lives on the land: game to hunt, herds, and what hunts people. */
function WildlifePanelImpl() {
  // A flat string keeps the panel from re-rendering every tick.
  const stamp = useWorldStore(
    useShallow((s) =>
      wildlifeCounts(s.world?.animals).map((c) => `${c.label}:${c.count}:${c.away ?? 0}:${c.danger ? 1 : 0}`),
    ),
  )
  if (stamp.length === 0) return null
  return (
    <>
      <div className="section-title">{t('panels.wildlife.title')}</div>
      <div className="history-grid">
        {stamp.map((row) => {
          const [label, count, away, danger] = row.split(':')
          return (
            <span key={label} style={{ display: 'contents' }}>
              <Tooltip
                tip={
                  danger === '1'
                    ? t('panels.wildlife.danger')
                    : label === 'herds'
                      ? t('panels.wildlife.herds')
                      : t('panels.wildlife.game')
                }
              >
                <span
                  className={clsx('hist-label', danger === '1' && 'wildlife-danger')}
                  style={{ cursor: 'default' }}
                >
                  {animalName(label)}
                </span>
              </Tooltip>
              <span className="hist-val">
                {formatNumber(Number(count))}
                {Number(away) > 0 && (
                  <span className="wildlife-away">
                    {' '}
                    {t('panels.wildlife.away', { count: formatNumber(Number(away)) })}
                  </span>
                )}
              </span>
            </span>
          )
        })}
      </div>
    </>
  )
}

export const WildlifePanel = memo(WildlifePanelImpl)
