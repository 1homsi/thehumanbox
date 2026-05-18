
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("looking for water to sit by");
        return 0.0;
    }
    let o = ctx.org_mut();
    o.fear_level = (o.fear_level - 0.05).max(0.0);
    o.comfort = (o.comfort + 0.04).min(1.0);
    ctx.think("sitting by the water");
    0.003
}
