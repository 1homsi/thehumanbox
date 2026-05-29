use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("draft") == 0 {
        ctx.think("no draft to edit");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("copy edit");
    ctx.event("chore", "copy edit");
    0.04
}
