
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.fear_level = (o.fear_level - 0.10).max(0.0);
    o.grief_ticks = o.grief_ticks.saturating_sub(4);
    o.comfort = (o.comfort + 0.05).min(1.0);
    ctx.think("deep in meditation");
    0.003
}
