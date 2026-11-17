import { memo } from 'react'
import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'
import { useWorldStore } from '../../../state/worldStore'
import { wildlifeCounts } from '../../../game/model/wildlife'
import { formatNumber, t } from '../../../i18n'
import { Tooltip } from '../../toolbar/Tooltip'
import { ToolSprite } from '../../toolbar/ToolSprite'
import { animalName } from './wildlife-words'
import { SectionHead } from './InfoTip'

const ANIMAL_ICON: Record<string, string> = {
  rabbits: '🐇',
  deer: '🦌',
  boar: '🐗',
  birds: '🐦',
  fish: '🐟',
  herds: '🐑',
  foxes: '🦊',
  cats: '🐈',
  penguins: '🐧',
  camels: '🐪',
  frogs: '🐸',
  whales: '🐋',
  ducks: '🦆',
  bees: '🐝',
  owls: '🦉',
  eagles: '🦅',
  snakes: '🐍',
  crocodiles: '🐊',
  monkeys: '🐒',
  wolves: '🐺',
  goats: '🐐',
  elephants: '🐘',
  lions: '🦁',
  zebras: '🦓',
  'polar bears': '🐻‍❄️',
  kangaroos: '🦘',
  bears: '🐻',
}

function WildlifeStripImpl() {
  const stamp = useWorldStore(
    useShallow((s) =>
      wildlifeCounts(s.world?.animals)
        .filter((c) => c.count > 0)
        .map((c) => `${c.label}:${c.count}:${c.danger ? 1 : 0}`),
    ),
  )
  if (stamp.length === 0) return null
  return (
    <section className="wp-wildlife">
      <SectionHead title={t('panels.world.wildlife.title')} tip={t('panels.world.wildlife.tip')} />
      <ul className="wp-animals">
        {stamp.map((row) => {
          const [label, count, danger] = row.split(':') as [string, string, string]
          const name = animalName(label)
          const tip =
            danger === '1'
              ? t('panels.wildlife.danger')
              : label === 'herds'
                ? t('panels.wildlife.herds')
                : t('panels.wildlife.game')
          return (
            <li key={label}>
              <Tooltip tip={`${name}: ${tip}`}>
                <span className={clsx('wp-animal', danger === '1' && 'danger')} tabIndex={0}>
                  <ToolSprite icon={ANIMAL_ICON[label] ?? '🐾'} size={14} />
                  <span className="wp-animal-count">{formatNumber(Number(count))}</span>
                  <span className="wp-animal-name">{name}</span>
                </span>
              </Tooltip>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export const WildlifeStrip = memo(WildlifeStripImpl)
