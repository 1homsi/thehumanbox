use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let home = (ctx.org().home_x.round() as i32, ctx.org().home_y.round() as i32);
    if (ctx.sx - home.0 as f32).abs() + (ctx.sy - home.1 as f32).abs() <= 12.0
        || ctx.sim.grid.detect_trail(ctx.ix, ctx.iy, TrailKind::Path, 2) <= 0.10
    {
        return 0.0;
    }
    ctx.org_mut().wander_target = Some(home);
    ctx.org_mut().fear_level = (ctx.org().fear_level - 0.08).max(0.0);
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Path, 0.45);
    ctx.think("following the marked trail home");
    0.006
}
