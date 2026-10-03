use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.set(ix, iy, Tile::Campfire);
    *ctx.sim.grid.fire_intensity_mut(ix, iy) = 1.0;
    ctx.sim.physics.register_fire(ix, iy);
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.fear_level = (o.fear_level - 0.05).max(0.0);
    }
    ctx.think("lighting a signal fire");
    ctx.discover("signal-fires", "lit a signal fire");
    0.010
}
