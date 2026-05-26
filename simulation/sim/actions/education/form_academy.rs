use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    if ctx.kin.len() < 3 {
        return 0.0;
    }
    if !matches!(ctx.tile, Tile::Hut) {
        return 0.0;
    }
    ctx.think("founding an institution of higher learning");
    ctx.discover("academy", "established an academy for systematic learning");
    ctx.event("build", "an academy is founded to advance the tribe's knowledge");
    0.020
}
