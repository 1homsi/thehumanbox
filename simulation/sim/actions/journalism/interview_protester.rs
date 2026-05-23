use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("lead") == 0 {
        ctx.think("no lead to follow");
        return 0.005;
    }
    if ctx.chance(0.5) { ctx.add_good("quote", 1); }
    ctx.add_literacy(0.005);
    ctx.think("a protester");
    ctx.event("chore", "interviewed a protester");
    0.05
}
