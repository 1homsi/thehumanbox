pub mod build_earthworks;
pub mod build_levee;
pub mod build_terrace_farm;
pub mod clean_water_source;
pub mod control_burn;
pub mod dig_pond;
pub mod drain_swamp;
pub mod manage_forest;
pub mod mark_dangerous_area;
pub mod plant_grove;
pub mod plant_windbreak;
pub mod reclaim_land;
pub mod remove_obstacles;
pub mod restore_burned_land;
pub mod stabilize_slope;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        371 => plant_windbreak::apply(ctx),
        372 => build_terrace_farm::apply(ctx),
        373 => drain_swamp::apply(ctx),
        374 => build_levee::apply(ctx),
        375 => manage_forest::apply(ctx),
        376 => control_burn::apply(ctx),
        377 => reclaim_land::apply(ctx),
        378 => stabilize_slope::apply(ctx),
        379 => plant_grove::apply(ctx),
        380 => dig_pond::apply(ctx),
        381 => remove_obstacles::apply(ctx),
        382 => clean_water_source::apply(ctx),
        383 => mark_dangerous_area::apply(ctx),
        384 => restore_burned_land::apply(ctx),
        385 => build_earthworks::apply(ctx),
        _ => 0.0,
    }
}
