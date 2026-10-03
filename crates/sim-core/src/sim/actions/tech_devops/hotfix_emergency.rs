use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.04);
    ctx.add_literacy(0.01);
    ctx.add_wealth(2);
    ctx.think("hotfix emergency");
    ctx.event("life", "shipped an emergency hotfix");
    0.12 + n as f32 * 0.01
}
