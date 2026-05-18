//! Action 78: feast with kin. Either standing on Food or carrying it.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Food) && ctx.org().inv_food == 0 {
        return 0.0;
    }
    if ctx.org().inv_food > 0 {
        ctx.org_mut().inv_food -= 1;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.energy = (o.energy + 0.10).min(1.0);
    }
    let bonus = 0.006 * ctx.kin.len().min(5) as f32;
    ctx.think("sharing a feast");
    if !ctx.kin.is_empty() {
        ctx.discover("feasting", "held the first feast");
    }
    bonus
}
