//! Action 195: shield the first nearby kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("on guard");
        return 0.0;
    };
    let o = &mut ctx.sim.organisms[ki];
    o.health = (o.health + 0.03).min(1.0);
    o.fear_level = (o.fear_level - 0.06).max(0.0);
    ctx.think("shielding kin");
    0.005
}
