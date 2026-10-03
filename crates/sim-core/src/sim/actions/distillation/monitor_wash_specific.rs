use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("wash") == 0 {
        ctx.think("nothing to measure");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("specific gravity");
    ctx.event("chore", "took a specific gravity reading");
    0.03
}
