/** Agreed xipjs layer order: terrain 0, ground overlays 10, land use 15, buildings 20, animals 30, people 40, effects 50, HUD 60. */
/**
 * Boats nobody is in and the harbour piers sit on the water, under the buildings on the shore
 * (their sails would otherwise paint over the roofs behind them), so they get their own layer at 19.
 */
export const PEOPLE_Z = { afloat: 19, soft: 39, body: 40, over: 41, emote: 41.5 } as const
export const ANIMAL_Z = { shadow: 29, body: 30, sleep: 31 } as const
