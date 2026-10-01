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
    default:
      return '🐾'
  }
}
