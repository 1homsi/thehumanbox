use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Ash) {
        ctx.think("no burned land to restore here");
        return 0.0;
    }
    ctx.think("sowing seeds in the ash-rich soil");
    ctx.discover(
        "land_restoration",
        "restored burned land by replanting and nurturing regrowth",
    );
    ctx.event(
        "build",
        "began restoring fire-scarred land by replanting vegetation",
    );
    0.010
}
