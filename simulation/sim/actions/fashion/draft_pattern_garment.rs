use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.chance(0.5) {
        ctx.add_good("pattern", 1);
    }
    ctx.add_literacy(0.004);
    ctx.think("draft pattern");
    ctx.event("chore", "drafted a pattern");
    0.04
}
