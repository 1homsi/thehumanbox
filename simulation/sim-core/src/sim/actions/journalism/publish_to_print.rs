use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("article", 1) {
        ctx.think("no article to publish");
        return 0.005;
    }
    ctx.add_wealth(2);
    let n = ctx.literacy_kin(0.004);
    ctx.think("publish print");
    ctx.event("life", "published a story to the print");
    0.10 + n as f32 * 0.005
}
