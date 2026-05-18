
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near && !matches!(ctx.tile, Tile::Hut) { return 0.0; }
    ctx.think("paying respects to those who came before");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.05).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.05).min(1.0);
    ctx.event("ritual", "the tribe honors the memory of their ancestors");
    0.008
}
