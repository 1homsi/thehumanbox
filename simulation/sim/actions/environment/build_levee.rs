
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || ctx.org().inv_stone == 0 {
        ctx.think("need water and stone to build a levee");
        return 0.0;
    }
    ctx.org_mut().inv_stone -= 1;
    ctx.think("stacking stones along the bank");
    ctx.discover("levee", "built a levee to hold back floodwaters");
    ctx.event("build", "raised a stone levee to protect the settlement from floods");
    0.012
}
