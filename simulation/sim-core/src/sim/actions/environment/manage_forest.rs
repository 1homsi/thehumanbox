use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().energy = (ctx.org().energy - 0.045).max(0.0);
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            let distance = dx.abs() + dy.abs();
            let strength = if distance == 0 { 0.55 } else { 0.16 };
            ctx.sim.grid.relieve_pressure(ctx.ix + dx, ctx.iy + dy, strength);
            ctx.sim
                .grid
                .restore_fertility(ctx.ix + dx, ctx.iy + dy, strength * 0.09);
        }
    }
    ctx.think("thinning brush and protecting young woodland");
    ctx.discover("forest_management", "began managing a forest sustainably");
    ctx.event(
        "build",
        "reduced pressure on woodland through selective clearing and replanting",
    );
    0.016
}
