use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        return 0.0;
    }
    ctx.think("putting what they know to the test");
    ctx.discover(
        "assessment",
        "devised a method to assess the knowledge of students",
    );
    ctx.event("culture", "a knowledge assessment is conducted among the tribe");
    0.007
}
