// How practised a person is at their trade, in words. The simulation keeps
// practice as a number from 0 to 1 that grows with each attempt at the work
// (crates/sim-core/src/sim/actions/bonus.rs: grow_practice).

/** A word for practice on the 0 to 1 scale: the rank shown beside a trade. */
export function skillWord(practice: number): string {
  if (practice >= 0.9) return 'master'
  if (practice >= 0.6) return 'skilled'
  if (practice >= 0.25) return 'journeyman'
  return 'apprentice'
}

/** The skill as a percentage for tooltips: 0.37 becomes "37%". */
export function skillPercent(practice: number): string {
  return `${Math.round(Math.min(1, Math.max(0, practice)) * 100)}%`
}
