export interface ChronicleHeadline {
  tick: number
  text: string
}

export interface HeadlinePick {
  seenTick: number
  headline: ChronicleHeadline | null
}

// `seenTick` is null before the first world. That world's headlines are the
// saved chronicle, so they are history: remember the newest tick and announce
// nothing, or a hidden launch would notify about an old headline.
export function pickNewHeadline(
  seenTick: number | null,
  headlines: readonly ChronicleHeadline[] | undefined,
): HeadlinePick {
  const newest = headlines?.[0]
  const newestTick = Number.isFinite(newest?.tick) ? (newest?.tick ?? null) : null
  if (seenTick === null) return { seenTick: newestTick ?? 0, headline: null }
  if (!newest || newestTick === null || newestTick <= seenTick) {
    return { seenTick, headline: null }
  }
  return { seenTick: newestTick, headline: newest }
}
