use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("planning escape routes");
    ctx.event("warfare", "mapping out a tactical retreat route");
    ctx.discover("tactical_retreat", "mastered the art of strategic withdrawal");
    0.010
}
