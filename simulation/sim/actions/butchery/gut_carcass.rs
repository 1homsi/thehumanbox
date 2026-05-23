use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 {
        ctx.think("no carcass to gut");
        return 0.005;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.add_good("meat", 1);
    ctx.think("gut carcass");
    ctx.event("chore", "gutted a carcass");
    0.05
}
