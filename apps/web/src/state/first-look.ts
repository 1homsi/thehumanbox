import { create } from 'zustand'

/** The tribe a new world's camera opened on, so the opening that follows stays with it. */
export const useFirstLook = create<{ tribe: string | null }>(() => ({ tribe: null }))
