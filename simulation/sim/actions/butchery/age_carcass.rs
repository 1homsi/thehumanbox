use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("meat") == 0 {
        ctx.think("nothing to age");
        return 0.005;
    }
    if ctx.chance(0.25) { ctx.add_good("meat", 1); }
    ctx.add_literacy(0.004);
    ctx.think("age carcass");
    ctx.event("chore", "aged the meat");
    0.04
}
