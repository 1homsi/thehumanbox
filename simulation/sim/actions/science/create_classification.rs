use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("organizing knowledge into categories");
    ctx.event("build", "creating a classification system for natural phenomena");
    ctx.discover("taxonomy", "invented a system of classification");
    0.012
}
