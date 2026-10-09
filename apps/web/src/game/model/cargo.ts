/** The load colour of each good a caravan carries, so a cart reads as what it hauls. */
const CARGO_COLORS: Record<string, string> = {
  food: '#e2c25a',
  wood: '#7d4f27',
  stone: '#9a9ca3',
  clay: '#c47a4d',
  salt: '#f4f7f8',
  ore: '#3f4b57',
  spice: '#e8891c',
  ochre: '#b5402b',
  fur: '#9b8a78',
}

/** The colour of a caravan's load: the good's own colour, or a plain sack for anything else. */
export function cargoColorOf(cargo: string): string {
  return CARGO_COLORS[cargo] ?? '#8a6a48'
}
