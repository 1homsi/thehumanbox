//! Action 325: fashion jewelry from stone or mineral.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near && !matches!(ctx.tile, crate::world::tiles::Tile::Mineral) { return 0.0; }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
    ctx.think("crafting jewelry");
    ctx.discover("jewelry", "fashioned the first piece of jewelry");
    ctx.event("build", "shaped stone into jewelry");
    0.010
}
