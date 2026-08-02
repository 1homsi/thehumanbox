use super::super::ctx::ActionCtx;
use super::suppression_target;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((fire_x, fire_y)) = suppression_target(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    let intensity = ctx.sim.grid.fire_intensity(fire_x, fire_y).max(0.25);
    ctx.org_mut().inv_water -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.055).max(0.0);
    let equipment = if ctx.org().has_tool("clothing") { 0.45 } else { 1.0 };
    let exposure = 0.045 * intensity * equipment * (1.0 - ctx.org().traits.resilience * 0.45);
    ctx.org_mut().health = (ctx.org().health - exposure.max(0.006)).max(0.0);
    ctx.org_mut().fear_level = (ctx.org().fear_level + 0.025 * intensity).min(1.0);
    ctx.sim.grid.set(fire_x, fire_y, Tile::Ash);
    *ctx.sim.grid.fire_intensity_mut(fire_x, fire_y) = 0.0;
    ctx.org_mut().wander_target = Some((fire_x, fire_y));
    ctx.org_mut().discover("firefighting");
    ctx.think("smothering the flames with carried water");
    ctx.event(
        "danger",
        &format!("extinguished a wildfire front at ({fire_x},{fire_y})"),
    );
    0.055 - exposure
}
