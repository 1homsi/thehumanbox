use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("no garment to serge");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("serge edge");
    ctx.event("chore", "serged an edge");
    0.03
}
