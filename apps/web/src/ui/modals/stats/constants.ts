export const DAY_LENGTH = 600

export function kindIcon(kind: string): string {
  switch (kind) {
    case 'rabbit':
      return '🐇'
    case 'deer':
      return '🦌'
    case 'boar':
      return '🐗'
    case 'bird':
      return '🐦'
    case 'fish':
      return '🐟'
    case 'wolf':
      return '🐺'
    case 'dog':
      return '🐕'
    case 'bear':
      return '🐻'
    case 'sheep':
      return '🐑'
    case 'cow':
      return '🐄'
    case 'horse':
      return '🐎'
    case 'chicken':
      return '🐔'
    case 'fox':
      return '🦊'
    case 'cat':
      return '🐈'
    case 'penguin':
      return '🐧'
    case 'camel':
      return '🐪'
    case 'frog':
      return '🐸'
    case 'whale':
      return '🐋'
    case 'duck':
      return '🦆'
    case 'bee':
      return '🐝'
    case 'owl':
      return '🦉'
    case 'eagle':
      return '🦅'
    case 'zombie':
      return '🧟'
    case 'demon':
      return '👹'
    case 'dragon':
      return '🐉'
    case 'alien':
      return '👽'
    case 'ufo':
      return '🛸'
    default:
      return '🐾'
  }
}
