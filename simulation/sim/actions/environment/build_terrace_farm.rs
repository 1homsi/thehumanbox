
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near || !matches!(ctx.tile, Tile::Grass) {
        ctx.think("need rocky ground to terrace");
        return 0.0;
    }
    ctx.think("cutting terraces into the hillside");
    ctx.discover("terracing", "built the first terrace farm");
    ctx.event("build", "carved terraces into a hillside for farming");
    0.010
}
