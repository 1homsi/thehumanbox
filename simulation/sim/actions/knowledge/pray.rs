//! Action 76: pray. Raises self-comfort, drops fear.
use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let o = ctx.org_mut();
    o.comfort = (o.comfort + 0.04).min(1.0);
    o.fear_level = (o.fear_level - 0.04).max(0.0);
    ctx.think("praying");
    ctx.discover("faith", "found faith");
    0.003
}
