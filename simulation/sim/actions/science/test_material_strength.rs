
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near && ctx.org().inv_stone == 0 { return 0.0; }
    ctx.event("build", "testing material strength through systematic experiment");
    ctx.discover("materials_science", "learned to evaluate material properties");
    0.010
}
