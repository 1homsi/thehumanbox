use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("milk", 1);
    ctx.think("steam milk");
    ctx.event("chore", "steamed milk");
    0.04
}
