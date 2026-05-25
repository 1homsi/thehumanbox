use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    for dx in -1i32..=1 { for dy in -1i32..=1 {
        ctx.sim.grid.restore_fertility(ix + dx, iy + dy, 0.012);
    }}
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.03).min(1.0);
    o.joy_ticks = (o.joy_ticks + 6).min(1200);
    ctx.think(" prep_seedbed");
    ctx.event("life", " prep_seedbed");
    0.008
}
