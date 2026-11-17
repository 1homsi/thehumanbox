import { t, type MessageKey } from '../../../i18n'

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

export function animalName(label: string): string {
  const key = ANIMAL_KEY[label]
  return key ? t(key) : label
}
