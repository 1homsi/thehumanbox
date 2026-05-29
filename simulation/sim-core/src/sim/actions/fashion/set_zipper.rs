use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("no garment for zipper");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("set zipper");
    ctx.event("chore", "set zipper");
    0.03
}
