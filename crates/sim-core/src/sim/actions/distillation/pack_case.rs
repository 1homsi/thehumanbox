use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("bottle", 1) {
        ctx.think("no bottle to case");
        return 0.005;
    }
    ctx.add_wealth(4);
    ctx.think("pack case");
    ctx.event("life", "sold a case of spirit");
    0.10
}
