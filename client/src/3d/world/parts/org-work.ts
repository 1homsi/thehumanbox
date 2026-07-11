export type OrgAccessory = 'none' | 'spear' | 'staff' | 'hammer' | 'hoe' | 'axe' | 'pickaxe' | 'rod'

export function toolFromThought(thought: string): OrgAccessory | null {
  const t = thought.toLowerCase()
  if (t.includes('chop') || t.includes('timber') || t.includes('sapling') || t.includes('wood')) return 'axe'
  if (t.includes('mining') || t.includes('ore') || t.includes('quarry') || t.includes('stone'))
    return 'pickaxe'
  if (t.includes('fish')) return 'rod'
  if (t.includes('harvest') || t.includes('planting') || t.includes('irrigat') || t.includes('sowing'))
    return 'hoe'
  if (t.includes('build') || t.includes('construct') || t.includes('raising') || t.includes('repair'))
    return 'hammer'
  return null
}

export function workAnimFromThought(thought: string): 'Chop' | 'Fish' | 'Forage' | null {
  const t = thought.toLowerCase()
  if (t.includes('fishing') || t.includes('to fish')) return 'Fish'
  if (
    t.includes('chop') ||
    t.includes('gathering wood') ||
    t.includes('gathering stone') ||
    t.includes('timber') ||
    t.includes('mining') ||
    t.includes('quarry') ||
    t.includes('harvest') ||
    t.includes('digging') ||
    t.includes('build') ||
    t.includes('construct')
  )
    return 'Chop'
  if (
    t.includes('forag') ||
    t.includes('gather') ||
    t.includes('picking') ||
    t.includes('berr') ||
    t.includes('plucking')
  )
    return 'Forage'
  return null
}
