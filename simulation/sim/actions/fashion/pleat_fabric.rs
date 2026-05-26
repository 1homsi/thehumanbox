use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.chance(0.3) {
        ctx.add_good("pattern", 1);
    }
    ctx.add_literacy(0.003);
    ctx.think("pleat fabric");
    ctx.event("chore", "pleated fabric");
    0.03
}
