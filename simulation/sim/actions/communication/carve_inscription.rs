//! Action 415: carve an inscription into rock.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("no stone surface to carve");
        return 0.0;
    }
    ctx.think("carefully carving words into rock");
    ctx.discover("inscription", "carved a lasting inscription to preserve knowledge");
    ctx.event("build", "carved an inscription into stone for future generations");
    0.010
}
