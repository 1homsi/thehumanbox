use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("aged_spirit") == 0 {
        ctx.think("no barrel to rack");
        return 0.005;
    }
    ctx.add_literacy(0.005);
    ctx.think("rack barrel");
    ctx.event("chore", "racked a barrel");
    0.04
}
