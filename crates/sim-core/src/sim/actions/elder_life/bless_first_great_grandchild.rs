use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no kin to bless");
        return 0.02;
    }
    let n = ctx.comfort_kin(0.04);
    ctx.add_piety(0.02);
    ctx.think("bless a great-grandchild");
    ctx.event("life", "blessed a great-grandchild");
    0.06 + n as f32 * 0.01
}
