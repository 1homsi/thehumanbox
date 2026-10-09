const MILESTONES = [100, 250, 500, 1000, 2500, 5000]

/** The next population milestone above `population`, or undefined past the last one. */
export function nextPopulationMilestone(population: number): number | undefined {
  return MILESTONES.find((target) => target > population)
}
