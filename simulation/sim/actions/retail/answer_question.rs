use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.literacy_kin(0.003);
    ctx.add_literacy(0.003);
    ctx.think("answer question");
    ctx.event("chore", "answered a customer's question");
    0.04 + n as f32 * 0.005
}
