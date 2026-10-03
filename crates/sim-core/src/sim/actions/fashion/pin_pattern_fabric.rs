use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("pattern") == 0 {
        ctx.think("no pattern to pin");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("pin fabric");
    ctx.event("chore", "pinned pattern to fabric");
    0.03
}
