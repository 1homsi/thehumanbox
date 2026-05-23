use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no one to host");
        return 0.02;
    }
    let n = ctx.literacy_kin(0.006);
    ctx.comfort_kin(0.02);
    ctx.add_wealth(2);
    ctx.think("host latte art class");
    ctx.event("life", "hosted a latte art class");
    0.08 + n as f32 * 0.01
}
