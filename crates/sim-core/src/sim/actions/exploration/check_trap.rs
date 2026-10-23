use super::super::ctx::ActionCtx;
use crate::organism::skills::{success_chance, Skill};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    // A trap catches what wanders past it.
    // A practised trapper sets the snare where the game runs.
    let level = ctx.org().skills.level(Skill::Hunting);
    let caught = ctx.chance(success_chance(0.35, level)) && ctx.catch_small_prey(3.0) > 0;
    ctx.practised(Skill::Hunting, caught);
    if caught {
        ctx.think("a trap caught something");
        0.012
    } else {
        ctx.think("checking the traps");
        0.0
    }
}
