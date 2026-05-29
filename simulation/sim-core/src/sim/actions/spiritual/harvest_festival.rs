use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ok = matches!(ctx.tile, Tile::Food) || ctx.org().inv_food >= 2;
    if !ok {
        ctx.think("planning a festival");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.05).min(1.0);
        o.boredom = (o.boredom - 0.08).max(0.0);
    }
    let bonus = 0.005 * ctx.kin.len().min(6) as f32;
    ctx.think("a harvest festival");
    ctx.discover("harvest-festival", "held a harvest festival");
    bonus
}
