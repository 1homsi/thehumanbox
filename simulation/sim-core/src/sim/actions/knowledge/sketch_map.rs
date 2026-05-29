use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().boredom = (ctx.org().boredom - 0.05).max(0.0);
    ctx.think("sketching a map");
    ctx.discover("cartography-deep", "improved the map");
    0.003
}
