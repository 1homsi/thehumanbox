
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 {
        ctx.think("nothing to offer");
        return 0.0;
    }
    let o = ctx.org_mut();
    o.inv_food -= 1;
    o.fear_level = (o.fear_level - 0.05).max(0.0);
    ctx.think("offering a sacrifice");
    ctx.discover("sacrifice", "offered a sacrifice");
    0.004
}
