//! Action 107: bathe in nearby water.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("looking for clean water");
        return 0.0;
    }
    let o = ctx.org_mut();
    o.infection = (o.infection * 0.85).max(0.0);
    o.comfort = (o.comfort + 0.05).min(1.0);
    ctx.think("bathing");
    0.005
}
