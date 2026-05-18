//! Action 416: publish a decree. Elder only; reduces boredom for all kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        ctx.think("not yet respected enough to decree");
        return 0.0;
    }
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.05).max(0.0);
    }
    ctx.think("declaring a new rule for the group");
    ctx.event("governance", "published a decree that clarified the rules of the community");
    0.010
}
