use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("drink") == 0 {
        ctx.think("no drink to pour");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("etch a design");
    ctx.event("chore", "etch a design");
    0.04
}
