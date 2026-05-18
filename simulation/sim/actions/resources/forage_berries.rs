//! Action 34: forage berries on grass. 18% pick rate.

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Grass) && ctx.chance(0.18) {
        let o = ctx.org_mut();
        o.inv_food = o.inv_food.saturating_add(1);
        ctx.think("picking berries");
        ctx.discover("berry-picking", "found a berry patch");
        0.012
    } else {
        ctx.think("foraging for berries");
        0.0
    }
}
