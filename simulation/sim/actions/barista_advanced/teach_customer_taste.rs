use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no one to teach");
        return 0.02;
    }
    let n = ctx.literacy_kin(0.005);
    ctx.think("teach taste");
    ctx.event("chore", "taught a customer to taste");
    0.05 + n as f32 * 0.01
}
