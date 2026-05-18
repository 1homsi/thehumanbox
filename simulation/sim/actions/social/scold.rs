//! Action 83: scold first nearby org.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.near.first() else {
        ctx.think("grumbling");
        return 0.0;
    };
    let o = &mut ctx.sim.organisms[ki];
    o.comfort = (o.comfort - 0.04).max(0.0);
    ctx.think("scolding");
    0.001
}
