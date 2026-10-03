use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.02);
    ctx.add_comfort(0.01);
    ctx.think("share with sibling");
    ctx.event("chore", "shared with a sibling");
    0.04 + n as f32 * 0.01
}
