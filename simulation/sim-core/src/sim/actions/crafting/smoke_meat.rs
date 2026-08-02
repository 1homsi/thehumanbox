use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near
        || ctx.org().inv_food == 0
        || ctx.org().tools.get("preserved_meat").copied().unwrap_or(0) >= super::CRAFTED_GOOD_CAP
    {
        return 0.0;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().give_tool("preserved_meat");
    ctx.think("smoking meat");
    ctx.discover("preservation", "learned to preserve food");
    0.012
}
