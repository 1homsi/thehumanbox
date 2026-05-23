use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("meat") == 0 {
        ctx.think("nothing to wet-age");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("wet age");
    ctx.event("chore", "wet-aged the meat");
    0.04
}
