use super::super::ctx::ActionCtx;
use crate::organism::animal::AnimalKind;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    let trail = ctx.sim.grid.trail_at(ix, iy, TrailKind::Food);
    let marker = ctx.sim.grid.structure_at(ix, iy);
    if ctx.org().carry_room() == 0 || !(0.65..=2.20).contains(&trail) || !(0.015..=0.08).contains(&marker) {
        return 0.0;
    }
    let prey = ctx
        .sim
        .animals
        .iter()
        .enumerate()
        .filter(|(_, animal)| animal.alive && matches!(animal.kind, AnimalKind::Rabbit | AnimalKind::Bird))
        .filter(|(_, animal)| (animal.x - ctx.sx).abs() + (animal.y - ctx.sy).abs() <= 8.0)
        .min_by(|left, right| {
            let left_distance = (left.1.x - ctx.sx).abs() + (left.1.y - ctx.sy).abs();
            let right_distance = (right.1.x - ctx.sx).abs() + (right.1.y - ctx.sy).abs();
            left_distance
                .total_cmp(&right_distance)
                .then_with(|| left.1.id.cmp(&right.1.id))
        })
        .map(|(index, _)| index);
    let caught = prey.is_some_and(|index| ctx.sim.animals[index].energy < 0.25)
        || (prey.is_some() && ctx.chance(0.62));

    // A checked trap is spent whether or not it caught anything. This makes
    // every yield trace back to one paid placement instead of an infinite
    // reusable food-trail marker.
    ctx.sim.grid.food_trail[ctx.fidx] = 0.20;
    *ctx.sim.grid.structure_at_mut(ix, iy) = 0.0;
    ctx.sim.active_structure_tiles.remove(&(ix, iy));
    if caught {
        ctx.sim.animals[prey.expect("caught trap prey disappeared before commit")].alive = false;
        ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(1);
        ctx.think("a trap caught something");
        0.018
    } else {
        ctx.think("resetting an empty trap");
        -0.002
    }
}
