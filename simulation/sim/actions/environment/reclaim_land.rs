
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Ash) {
        ctx.think("no scorched ground to reclaim here");
        return 0.0;
    }
    ctx.think("clearing ash and turning soil");
    ctx.discover("land_reclamation", "reclaimed burned land and made it fertile again");
    ctx.event("build", "worked ash-covered ground back into productive farmland");
    0.010
}
