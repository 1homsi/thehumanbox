use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("drink") == 0 {
        ctx.think("no drink to pour");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("pour a layered design");
    ctx.event("chore", "pour a layered design");
    0.04
}
