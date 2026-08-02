use super::super::ctx::ActionCtx;
use super::overhaul_target;
use crate::organism::organism::Organism;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((fire_x, fire_y)) = overhaul_target(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    *ctx.sim.grid.fire_intensity_mut(fire_x, fire_y) = 0.0;
    let memory_strength = ctx.org().traits.memory_strength;
    Organism::remember(
        &mut ctx.org_mut().danger_memory,
        fire_x,
        fire_y,
        0.92,
        memory_strength,
    );
    ctx.org_mut().energy = (ctx.org().energy - 0.018).max(0.0);
    ctx.org_mut().directive.clear();
    ctx.org_mut().directive_until = 0;
    ctx.org_mut().wander_target = None;
    ctx.think("checking the ash for hidden embers");
    ctx.event(
        "danger",
        &format!("overhauled the burned ground at ({fire_x},{fire_y})"),
    );
    0.014
}
