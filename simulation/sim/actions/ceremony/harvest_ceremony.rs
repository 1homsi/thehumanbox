//! Action 523: harvest ceremony in autumn with food; all kin comfort +0.06; emit "ritual".
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick < 6000 || season_tick >= 9000 { return 0.0; }
    if !matches!(ctx.tile, Tile::Food) && ctx.org().inv_food == 0 { return 0.0; }
    ctx.think("giving thanks for the abundance of the harvest");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.06).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.06).min(1.0);
    ctx.event("ritual", "the tribe holds a harvest ceremony to celebrate the bounty");
    0.010
}
