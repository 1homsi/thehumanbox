use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.045).max(0.0);
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            let strength = if dx == 0 && dy == 0 { 1.1 } else { 0.35 };
            ctx.sim
                .grid
                .leave_trail(ctx.ix + dx, ctx.iy + dy, TrailKind::Food, strength);
            ctx.sim.grid.restore_fertility(ctx.ix + dx, ctx.iy + dy, 0.06);
        }
    }
    ctx.think("sowing flowers between cultivated plots");
    ctx.discover(
        "pollinator_strip",
        "connected crops to persistent pollinator habitat",
    );
    ctx.event(
        "build",
        "planted a pollinator strip that improves nearby soil and forage",
    );
    0.022
}
