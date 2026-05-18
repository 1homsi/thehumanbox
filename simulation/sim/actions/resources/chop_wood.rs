//! Action 27: chop wood. Standing on grass with a 50% chance per
//! attempt. Carry-cap gated so a loaded-up org doesn't keep chopping.

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Grass)
        && ctx.org().carry_room() > 0
        && ctx.chance(0.5)
    {
        let o = ctx.org_mut();
        o.inv_wood = o.inv_wood.saturating_add(1);
        ctx.think("chopping wood");
        ctx.discover("woodcutting", "learned to fell wood");
        0.010
    } else {
        ctx.think("gathering timber");
        0.0
    }
}
