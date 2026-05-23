use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("drink") == 0 {
        ctx.think("no drink to pour");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("pour with sauce");
    ctx.event("chore", "pour with sauce");
    0.04
}
