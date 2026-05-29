use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("spirit") == 0 {
        ctx.think("not in a run");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("monitor distillate temp");
    ctx.event("chore", "watched distillate temperature");
    0.03
}
