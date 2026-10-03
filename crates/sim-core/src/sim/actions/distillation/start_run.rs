use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("wash") == 0 {
        ctx.think("nothing to run");
        return 0.005;
    }
    ctx.add_energy(0.02);
    ctx.think("start run");
    ctx.event("chore", "fired up the still");
    0.04
}
