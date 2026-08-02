use super::super::ctx::ActionCtx;
use super::{report_target, FIRE_RESPONSE_TICKS};
use crate::organism::organism::Organism;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((fire_x, fire_y)) = report_target(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    ctx.org_mut().directive = format!("fire_response:{fire_x}:{fire_y}");
    ctx.org_mut().directive_until = ctx.tick + FIRE_RESPONSE_TICKS;
    ctx.org_mut().wander_target = Some((fire_x, fire_y));
    ctx.org_mut().fear_level = (ctx.org().fear_level + 0.04).min(1.0);
    let memory_strength = ctx.org().traits.memory_strength;
    Organism::remember(
        &mut ctx.org_mut().danger_memory,
        fire_x,
        fire_y,
        0.80,
        memory_strength,
    );
    ctx.think("raising the alarm and carrying water toward the fire");
    ctx.event(
        "danger",
        &format!("reported a wildfire at ({fire_x},{fire_y}) and joined the response"),
    );
    0.018
}
