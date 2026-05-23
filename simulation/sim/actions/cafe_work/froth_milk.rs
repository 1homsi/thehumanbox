use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("milk", 1);
    ctx.think("froth milk");
    ctx.event("chore", "frothed milk");
    0.04
}
