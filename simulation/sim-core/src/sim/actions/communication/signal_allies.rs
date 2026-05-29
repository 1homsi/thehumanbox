use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near {
        ctx.think("no signal fire to communicate with");
        return 0.0;
    }
    ctx.think("feeding the signal fire");
    ctx.discover("signaling", "used fire to signal allies across great distances");
    ctx.event("social", "sent a fire signal to allied groups");
    0.010
}
