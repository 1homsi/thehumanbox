use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near {
        return 0.0;
    }
    if !ctx.org().discoveries.contains("scroll_writing") {
        return 0.0;
    }
    ctx.org_mut().comfort = (ctx.org().comfort - 0.04).max(0.0);
    ctx.think("watching knowledge turn to ash");
    ctx.event("culture", "a scroll is burned, erasing preserved knowledge");
    0.003
}
