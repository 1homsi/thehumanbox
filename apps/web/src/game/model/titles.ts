// Titles shown beside a person's name: what they are to their tribe. They
// come from the state the simulation already sends (the tribe's ruler, age,
// and the trade a person has taken up), so a title is never a separate fact.

const TRADE_TITLES: Record<string, string> = {
  healer: 'Healer',
  doctor: 'Doctor',
  hunter: 'Hunter',
  farmer: 'Farmer',
  builder: 'Builder',
  soldier: 'Soldier',
  priest: 'Priest',
  scholar: 'Scholar',
  baker: 'Baker',
  miner: 'Miner',
  merchant: 'Merchant',
  artist: 'Artist',
}

/** The titles for a living person, in the order they are shown. The dead keep no title. */
export function personTitles(org: {
  alive: boolean
  is_elder: boolean
  is_leader?: boolean
  specialty?: string
}): string[] {
  if (!org.alive) return []
  const titles: string[] = []
  if (org.is_leader) titles.push('Chief')
  if (org.is_elder) titles.push('Elder')
  if (org.specialty) {
    const trade = org.specialty.toLowerCase()
    titles.push(TRADE_TITLES[trade] ?? trade.charAt(0).toUpperCase() + trade.slice(1))
  }
  return titles
}
