
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("need a stone surface to write on");
        return 0.0;
    }
    ctx.think("scratching symbols into stone");
    ctx.discover("writing_system", "developed the first written symbols");
    ctx.event("build", "scratched the first writing system into stone");
    0.020
}
