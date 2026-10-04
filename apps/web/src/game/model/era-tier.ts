/**
 * Architectural tiers, from the owning tribe's era. Homes are drawn in their
 * tribe's current style, so a town visibly modernises as it advances: huts
 * become cottages, stone houses, timber, brick, apartments, glass towers.
 */
export const ERA_TIERS: Record<string, number> = {
  pre_stone: 0,
  stone: 0,
  bronze: 1,
  iron: 1,
  classical: 2,
  medieval: 3,
  renaissance: 4,
  industrial: 5,
  modern: 6,
  information: 6,
  atomic: 6,
  space: 7,
  digital: 7,
  quantum: 7,
  solar: 7,
}
/** Tier for an era name; eras past Solar are all the far future. */
export function eraTier(era: string | undefined | null): number {
  if (!era) return 0
  return ERA_TIERS[era.toLowerCase().replace(/[-\s]/g, '_')] ?? 8
}
