//! Action 386: express grief. Triggers when kin are low on health.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let grieving = ctx.kin.iter().any(|&ki| ctx.sim.organisms[ki].health < 0.3);
    if !grieving {
        ctx.think("holding feelings inside");
        return 0.0;
    }
    let o = ctx.org_mut();
    o.comfort = (o.comfort - 0.05).max(0.0);
    o.health  = (o.health  + 0.02).min(1.0);
    ctx.think("weeping openly");
    ctx.event("social", "expressed grief over a suffering companion");
    0.005
}
