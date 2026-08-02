use super::super::ctx::ActionCtx;
use crate::organism::animal::AnimalKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let target = ctx
        .sim
        .animals
        .iter()
        .enumerate()
        .filter(|(_, animal)| animal.alive && matches!(animal.kind, AnimalKind::Deer | AnimalKind::Boar))
        .filter(|(_, animal)| (animal.x - ctx.sx).abs() + (animal.y - ctx.sy).abs() <= 6.0)
        .min_by(|left, right| left.1.id.cmp(&right.1.id))
        .map(|(index, _)| index);
    let Some(target) = target else {
        ctx.think("looking for a herd");
        return 0.0;
    };
    let (home_x, home_y) = (ctx.org().home_x, ctx.org().home_y);
    let animal = &ctx.sim.animals[target];
    let next_x = animal.x + (home_x - animal.x).signum();
    let next_y = animal.y + (home_y - animal.y).signum();
    if !ctx.sim.grid.get(next_x as i32, next_y as i32).walkable() {
        return 0.0;
    }
    ctx.sim.animals[target].x = next_x;
    ctx.sim.animals[target].y = next_y;
    ctx.org_mut().energy = (ctx.org().energy - 0.025).max(0.0);
    ctx.think("guiding a herd toward home");
    ctx.discover("herding", "began herding animals");
    0.010
}
