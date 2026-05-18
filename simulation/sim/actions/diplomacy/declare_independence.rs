
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 3 {
        ctx.think("dreaming of independence");
        return 0.0;
    }
    ctx.think("declaring independence");
    ctx.discover("independence", "declared independence");
    ctx.event("social", "declared a new way for the tribe");
    0.012
}
