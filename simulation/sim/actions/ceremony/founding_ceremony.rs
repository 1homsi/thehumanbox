use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() != 1 {
        return 0.0;
    }
    ctx.think("marking the founding of something new");
    ctx.discover(
        "founding",
        "performed a founding ceremony for a new settlement or tradition",
    );
    ctx.event(
        "culture",
        "a founding ceremony marks the beginning of something lasting",
    );
    0.012
}
