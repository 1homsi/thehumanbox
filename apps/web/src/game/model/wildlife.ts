import type { AnimalState } from '../../shared/types'

export interface WildlifeCount {
  label: string
  count: number
  /** Birds that have flown south for the winter. */
  away?: number
  /** Predators are a danger, not game. */
  danger?: boolean
}

const GROUPS: Array<{ label: string; kinds: readonly string[]; danger?: boolean }> = [
  { label: 'rabbits', kinds: ['rabbit'] },
  { label: 'deer', kinds: ['deer'] },
  { label: 'boar', kinds: ['boar'] },
  { label: 'birds', kinds: ['bird'] },
  { label: 'fish', kinds: ['fish'] },
  { label: 'herds', kinds: ['sheep', 'cow', 'horse', 'chicken'] },
  { label: 'foxes', kinds: ['fox'] },
  { label: 'cats', kinds: ['cat'] },
  { label: 'penguins', kinds: ['penguin'] },
  { label: 'camels', kinds: ['camel'] },
  { label: 'frogs', kinds: ['frog'] },
  { label: 'whales', kinds: ['whale'] },
  { label: 'ducks', kinds: ['duck'] },
  { label: 'bees', kinds: ['bee'] },
  { label: 'owls', kinds: ['owl'] },
  { label: 'eagles', kinds: ['eagle'] },
  { label: 'snakes', kinds: ['snake'] },
  { label: 'crocodiles', kinds: ['crocodile'], danger: true },
  { label: 'monkeys', kinds: ['monkey'] },
  { label: 'wolves', kinds: ['wolf'], danger: true },
  { label: 'goats', kinds: ['goat'] },
  { label: 'elephants', kinds: ['elephant'] },
  { label: 'bears', kinds: ['bear'], danger: true },
]

/** The living wild and herd animals by kind, empty kinds left out. */
export function wildlifeCounts(
  animals: readonly Pick<AnimalState, 'kind' | 'away'>[] | undefined,
): WildlifeCount[] {
  const out: WildlifeCount[] = []
  for (const g of GROUPS) {
    const mine = (animals ?? []).filter((a) => g.kinds.includes(a.kind))
    if (mine.length === 0) continue
    const away = mine.filter((a) => a.away).length
    out.push({
      label: g.label,
      count: mine.length - away,
      ...(away > 0 ? { away } : {}),
      ...(g.danger ? { danger: true } : {}),
    })
  }
  return out
}
