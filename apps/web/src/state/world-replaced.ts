import { create } from 'zustand'

interface WorldReplacedState {
  /** Counts the times the running world was swapped for another in this session (a save restored after a failed
   * read, a recovery copy, a reset). Watches that remember what they have seen start over when it changes. */
  generation: number
  bump: () => void
}

export const useWorldReplaced = create<WorldReplacedState>((set) => ({
  generation: 0,
  bump: () => set((s) => ({ generation: s.generation + 1 })),
}))
