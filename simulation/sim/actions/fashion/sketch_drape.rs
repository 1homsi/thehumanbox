use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.chance(0.4) {
        ctx.add_good("pattern", 1);
    }
    ctx.add_literacy(0.004);
    ctx.think("sketch drape");
    ctx.event("chore", "sketched a drape");
    0.04
}
