
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    ctx.think("raising a stone to remember the fallen");
    ctx.discover("memorial_stone", "erected a permanent memorial stone");
    ctx.event("build", "a memorial stone is raised in honor of the dead");
    0.010
}
