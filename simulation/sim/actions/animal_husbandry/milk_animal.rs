
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_food =     ctx.org_mut().inv_food.saturating_add(1);
    ctx.think("milking the animal");
    ctx.discover("milking", "milked an animal for the first time");
    ctx.event("build", "collected milk from a domesticated animal");
    0.008
}
