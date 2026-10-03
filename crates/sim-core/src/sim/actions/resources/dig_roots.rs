use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Grass) && ctx.chance(0.25) {
        let o = ctx.org_mut();
        o.energy = (o.energy + 0.12).min(1.0);
        ctx.think("digging up roots");
        ctx.discover("root-digging", "learned to dig roots");
        0.01
    } else {
        ctx.think("digging for roots");
        0.0
    }
}
