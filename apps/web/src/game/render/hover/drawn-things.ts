import type { DrawnThings } from '../../model/map-things'
import { caravanDrawnAt } from '../base-parts/trade-network'
import { treeKindAt } from '../tree-index'

/** What the renderer last drew and where, for the map's hover cards to read (see `DrawnThings`). */
export const DRAWN_THINGS: DrawnThings = { caravanAt: caravanDrawnAt, treeAt: treeKindAt }
