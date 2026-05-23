use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.03);
    ctx.think("watch the birds");
    ctx.event("chore", "watched the birds pass");
    0.03
}
